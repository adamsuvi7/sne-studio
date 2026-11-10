// SNE Studio — Kloning tipografi otomatis dari gambar referensi.
// 1) OCR (tesseract.js, dimuat saat pertama dipakai) membaca teks + kotak posisinya.
// 2) Tiap baris: warna diambil dari pikselnya, ukuran dari lebarnya, dan font dipilih
//    dari daftar kandidat dengan membandingkan bentuk huruf (bukan identifikasi pasti).
// 3) Hasilnya jadi layer teks biasa, bisa diedit seperti template lain.
// Dimuat setelah <script> utama; memakai global: state, cloneLayersWithIds, syncAllUI, dst.
(function () {
  const LIB_OCR = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  const OCR_EDGE = 1920; // sisi terpanjang gambar yang dibaca; gambar kecil diperbesar agar huruf terbaca
  const MAX_LAYERS = 16;
  const GW = 64, GH = 16; // kisi pembanding bentuk huruf

  // Kandidat font (semuanya sudah ada di daftar font bawaan), mewakili tiap gaya
  const CANDIDATES = [
    "Playfair Display", "Cormorant Garamond", "Cinzel", "Bodoni Moda", "DM Serif Display", "Abril Fatface", "Libre Baskerville", "Lora", "Merriweather", "Prata",
    "Great Vibes", "Alex Brush", "Sacramento", "Pacifico", "Dancing Script", "Caveat", "Satisfy", "Kaushan Script", "Allura", "Pinyon Script", "Permanent Marker", "Lobster", "Yellowtail", "Shadows Into Light", "Homemade Apple",
    "Shrikhand", "Fredoka", "Righteous", "Titan One", "Bungee", "Alfa Slab One", "Luckiest Guy", "Bangers", "Carter One", "Berkshire Swash", "Lilita One", "Staatliches",
    "Montserrat", "Plus Jakarta Sans", "Oswald", "Bebas Neue", "Anton", "Archivo Black", "Poppins", "Inter", "Barlow Condensed", "League Spartan", "Outfit", "Syne", "Josefin Sans", "Questrial", "Poiret One",
    "Space Mono", "Courier Prime", "Special Elite", "VT323", "IBM Plex Mono"
  ];
  const WEIGHTS = ["400", "700"];

  const LAYER_BASE = {
    fontStyle: "normal", underline: false, uppercase: false, color2: "#F97316", gradientEnabled: false, gradientDir: "vertical",
    opacity: 100, align: "center", letterSpacing: 0, lineHeight: 1.1, rotation: 0, tiltX: 0, tiltY: 0, curve: 0,
    strokeWidth: 0, strokeColor: "#000000", extrudeDepth: 0, extrudeColor: "#1E1B4B", shadowBlur: 4, shadowColor: "#000000",
    fadeMask: 0, blendMode: "source-over", locked: false, decor: "none",
    bgPill: false, bgPillColor: "#FFFFFF", bgPillStyle: "solid", bgPillPad: 14, bgPillRadius: 20
  };

  let workerPromise = null, fontsReady = null, last = null, busy = false;
  const report = [];

  const setStatus = (msg) => {
    const el = document.getElementById("refCloneStatus");
    if (el) el.textContent = msg;
  };

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = url;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Gagal memuat " + url));
      document.head.appendChild(s);
    });
  }

  function getWorker() {
    if (!workerPromise) {
      workerPromise = (async () => {
        if (!window.Tesseract) await loadScript(LIB_OCR);
        return window.Tesseract.createWorker(["eng", "ind"], 1, {
          logger: (m) => {
            if (m.status !== "recognizing text") setStatus("Menyiapkan pembaca teks (unduh sekali ±10 MB)…");
          }
        });
      })().catch((e) => { workerPromise = null; throw e; });
    }
    return workerPromise;
  }

  function loadCandidateFonts() {
    if (!fontsReady) {
      fontsReady = Promise.all(CANDIDATES.flatMap((f) => WEIGHTS.map((w) => document.fonts.load(`${w} 40px "${f}"`).catch(() => {}))));
    }
    return fontsReady;
  }

  // Hanya piksel paling terang yang jadi "tinta" hitam di atas putih.
  // Teks story umumnya putih/terang di atas foto; bentuk ini jauh lebih mudah dibaca OCR
  // daripada foto aslinya, termasuk di foto yang cerah.
  function lightTextCopy(src) {
    const c = document.createElement("canvas");
    c.width = src.width;
    c.height = src.height;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(src, 0, 0);
    const id = x.getImageData(0, 0, c.width, c.height), d = id.data;
    const hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) hist[(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0]++;
    let acc = 0, p90 = 255;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= (d.length / 4) * 0.9) { p90 = v; break; } }
    const thr = Math.max(190, Math.min(244, p90 + 8)); // di atas latar paling terang, tapi tidak membuang putih gading
    for (let i = 0; i < d.length; i += 4) {
      d[i] = d[i + 1] = d[i + 2] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] >= thr ? 0 : 255;
    }
    x.putImageData(id, 0, 0);
    return c;
  }

  const alnum = (t) => (t.match(/[A-Za-z0-9À-ÿ]/g) || []).length;

  // Baris OCR -> { text, conf, x0, y0, x1, y1 } hanya dari kata yang cukup yakin.
  // k = skala gambar yang dibaca; koordinat dikembalikan ke ukuran dasar (W×H).
  function cleanLines(lines, W, H, k) {
    const out = [];
    for (const ln of lines || []) {
      const words = (ln.words || []).filter((w) => w.confidence >= 55 && alnum(w.text) >= Math.min(2, w.text.length));
      if (!words.length) continue;
      const text = words.map((w) => w.text).join(" ").replace(/\s+/g, " ").trim();
      if (alnum(text) < 3 || alnum(text) / text.replace(/\s/g, "").length < 0.6) continue;
      const lineConf = words.reduce((a, x) => a + x.confidence, 0) / words.length;
      // Makin pendek teksnya makin tinggi keyakinan yang diminta (tekstur foto sering "terbaca" 2-3 huruf)
      const an = alnum(text);
      if (!((an >= 6 && lineConf >= 60) || (an >= 4 && lineConf >= 75) || lineConf >= 88)) continue;
      const b = { x0: Math.min(...words.map((w) => w.bbox.x0)) / k, y0: Math.min(...words.map((w) => w.bbox.y0)) / k, x1: Math.max(...words.map((w) => w.bbox.x1)) / k, y1: Math.max(...words.map((w) => w.bbox.y1)) / k };
      const w = b.x1 - b.x0, h = b.y1 - b.y0;
      if (h < H * 0.011 || h > H * 0.4 || w < h * 0.9) continue;
      const conf = words.reduce((a, x) => a + x.confidence, 0) / words.length;
      out.push({ text, conf, rank: conf * Math.sqrt(alnum(text)), ...b }); // baris utuh menang atas potongan
    }
    return out;
  }

  // Bagian kotak terkecil yang tertutup kotak lain (1 = sepenuhnya di dalam)
  const overlap = (a, b) => {
    const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)), iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
    return (ix * iy) / (Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0)) || 1);
  };

  function scaledCopy(src, k) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(src.width * k));
    c.height = Math.max(1, Math.round(src.height * k));
    const x = c.getContext("2d");
    x.imageSmoothingQuality = "high";
    x.drawImage(src, 0, 0, c.width, c.height);
    return c;
  }

  // Piksel mask (0/1) dalam kotak rapat -> kisi GW×GH berisi cakupan 0..1
  function toGrid(mask, w, x0, y0, x1, y1) {
    const tw = x1 - x0 + 1, th = y1 - y0 + 1;
    const grid = new Float32Array(GW * GH), cell = (tw / GW) * (th / GH);
    for (let y = y0; y <= y1; y++) {
      const gy = Math.min(GH - 1, (((y - y0) / th) * GH) | 0) * GW;
      for (let x = x0; x <= x1; x++) if (mask[y * w + x]) grid[gy + Math.min(GW - 1, (((x - x0) / tw) * GW) | 0)]++;
    }
    for (let i = 0; i < grid.length; i++) grid[i] = Math.min(1, grid[i] / cell);
    return { grid, aspect: tw / th };
  }

  function tightBox(mask, w, h) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return x1 < 0 ? null : [x0, y0, x1, y1];
  }

  const median = (arr) => { const s = Array.from(arr).sort((a, b) => a - b); return s[s.length >> 1]; };

  // Pisahkan huruf dari latar di dalam kotak baris: latar = warna tepi kotak, huruf = yang paling beda
  function analyzeLine(ctx, ln, W, H) {
    const pad = Math.round((ln.y1 - ln.y0) * 0.12);
    const x0 = Math.max(0, Math.round(ln.x0) - pad), y0 = Math.max(0, Math.round(ln.y0) - pad);
    const w = Math.min(W, Math.round(ln.x1) + pad) - x0, h = Math.min(H, Math.round(ln.y1) + pad) - y0;
    if (w < 8 || h < 6) return null;
    const d = ctx.getImageData(x0, y0, w, h).data, total = w * h;
    const br = [], bg = [], bb = [];
    const edge = (x, y) => { const i = (y * w + x) * 4; br.push(d[i]); bg.push(d[i + 1]); bb.push(d[i + 2]); };
    for (let x = 0; x < w; x += 2) { edge(x, 0); edge(x, h - 1); }
    for (let y = 0; y < h; y += 2) { edge(0, y); edge(w - 1, y); }

    // 2-means pada warna: pusat awal latar = median tepi kotak, pusat awal huruf = piksel paling beda.
    // Lebih tahan foto ramai daripada ambang tunggal, karena latar yang bervariasi tetap satu kelompok.
    let cb = [median(br), median(bg), median(bb)], cf = cb, far = -1;
    for (let i = 0; i < d.length; i += 16) {
      const q = (d[i] - cb[0]) ** 2 + (d[i + 1] - cb[1]) ** 2 + (d[i + 2] - cb[2]) ** 2;
      if (q > far) { far = q; cf = [d[i], d[i + 1], d[i + 2]]; }
    }
    const mask = new Uint8Array(total);
    let n = 0;
    for (let iter = 0; iter < 6; iter++) {
      const sb = [0, 0, 0], sf = [0, 0, 0];
      n = 0;
      for (let p = 0, i = 0; p < total; p++, i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const isF = (r - cf[0]) ** 2 + (g - cf[1]) ** 2 + (b - cf[2]) ** 2 < (r - cb[0]) ** 2 + (g - cb[1]) ** 2 + (b - cb[2]) ** 2;
        mask[p] = isF ? 1 : 0;
        const s = isF ? sf : sb;
        s[0] += r; s[1] += g; s[2] += b;
        if (isF) n++;
      }
      if (!n || n === total) return null;
      cf = sf.map((v) => v / n);
      cb = sb.map((v) => v / (total - n));
    }
    if (n > total * 0.55) { // huruf selalu lebih sedikit daripada latar: kelompoknya tertukar
      for (let p = 0; p < total; p++) mask[p] ^= 1;
      [cf, cb] = [cb, cf];
      n = total - n;
    }
    const sep = Math.hypot(cf[0] - cb[0], cf[1] - cb[1], cf[2] - cb[2]);
    if (sep < 45 || n < 12) return null; // kontras terlalu rendah untuk dipercaya

    // Warna huruf dari inti huruf saja (tepi anti-alias bercampur latar)
    let r = 0, g = 0, b = 0, core = 0;
    const coreR2 = (sep * 0.4) ** 2;
    for (let p = 0, i = 0; p < total; p++, i += 4) {
      if (!mask[p] || (d[i] - cf[0]) ** 2 + (d[i + 1] - cf[1]) ** 2 + (d[i + 2] - cf[2]) ** 2 > coreR2) continue;
      r += d[i]; g += d[i + 1]; b += d[i + 2]; core++;
    }
    const rgb = core ? [r / core, g / core, b / core] : cf;
    const box = tightBox(mask, w, h);
    if (!box) return null;
    const hex = "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
    return { ...toGrid(mask, w, ...box), color: hex, inkW: box[2] - box[0] + 1, inkH: box[3] - box[1] + 1, inkCx: x0 + (box[0] + box[2]) / 2, inkCy: y0 + (box[1] + box[3]) / 2 };
  }

  const probe = document.createElement("canvas");
  const pctx = probe.getContext("2d", { willReadFrequently: true });

  // Gambar teks dengan font kandidat -> kisi bentuk + rasio lebar/tinggi tinta
  function renderShape(text, font, weight) {
    const fs = 56;
    pctx.font = `${weight} ${fs}px "${font}"`;
    const w = Math.min(2400, Math.ceil(pctx.measureText(text).width) + 40), h = fs * 2;
    probe.width = w;
    probe.height = h;
    pctx.fillStyle = "#000";
    pctx.fillRect(0, 0, w, h);
    pctx.font = `${weight} ${fs}px "${font}"`;
    pctx.fillStyle = "#fff";
    pctx.textBaseline = "alphabetic";
    pctx.fillText(text, 20, fs * 1.35);
    const d = pctx.getImageData(0, 0, w, h).data, mask = new Uint8Array(w * h);
    for (let p = 0, i = 0; p < mask.length; p++, i += 4) mask[p] = d[i] > 110 ? 1 : 0;
    const box = tightBox(mask, w, h);
    return box ? toGrid(mask, w, ...box) : null;
  }

  function matchFont(text, shape) {
    let best = { font: "Montserrat", weight: "700", score: -1 };
    for (const font of CANDIDATES) {
      for (const weight of WEIGHTS) {
        const cand = renderShape(text, font, weight);
        if (!cand) continue;
        let diff = 0, uni = 0;
        for (let i = 0; i < cand.grid.length; i++) {
          diff += Math.abs(cand.grid[i] - shape.grid[i]);
          uni += Math.max(cand.grid[i], shape.grid[i]);
        }
        // kemiripan pola tinta × kemiripan proporsi (font sempit vs lebar)
        const score = (1 - diff / (uni || 1)) * Math.exp(-1.5 * Math.abs(Math.log(cand.aspect / shape.aspect)));
        if (score > best.score) best = { font, weight, score };
      }
    }
    return best;
  }

  async function detect(img) {
    // Ukuran dasar: gambar yang sudah cukup besar dibaca apa adanya (resample kecil justru merusak huruf)
    const longEdge = Math.max(img.width, img.height);
    const scale = longEdge >= 1400 && longEdge <= 2400 ? 1 : OCR_EDGE / longEdge;
    const W = Math.round(img.width * scale), H = Math.round(img.height * scale);
    const src = document.createElement("canvas");
    src.width = W;
    src.height = H;
    const sctx = src.getContext("2d", { willReadFrequently: true });
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(img, 0, 0, W, H);

    const worker = await getWorker();
    await worker.setParameters({ tessedit_pageseg_mode: "11" }); // teks tersebar (poster/foto)
    // OCR sangat peka ukuran huruf: baca di beberapa skala + versi terbalik, ambil bacaan paling yakin per baris
    const light = lightTextCopy(src);
    const passes = [[src, 1], [light, 1], [scaledCopy(light, 0.5), 0.5], [scaledCopy(src, 0.6), 0.6], [scaledCopy(src, 0.35), 0.35]];
    const found = [];
    for (let i = 0; i < passes.length; i++) {
      setStatus(`Membaca teks di gambar… (${i + 1}/${passes.length})`);
      const [cv, k] = passes[i];
      for (const ln of cleanLines((await worker.recognize(cv)).data.lines, W, H, k)) {
        const dup = found.findIndex((f) => overlap(f, ln) > 0.5);
        if (dup < 0) found.push(ln);
        else if (ln.rank > found[dup].rank) found[dup] = ln;
      }
    }
    if (!found.length) return [];

    setStatus("Mencocokkan font & warna…");
    await loadCandidateFonts();

    // Gambar referensi menutupi kanvas (cover), sama seperti bayangan referensi di kanvas utama
    const cw = state.canvasWidth, ch = state.canvasHeight;
    const cover = Math.max(cw / W, ch / H), ox = (cw - W * cover) / 2, oy = (ch - H * cover) / 2;
    const unit = cw / 1080; // layer.fontSize dihitung pada lebar dasar 1080

    const items = [];
    report.length = 0;
    for (const ln of found.sort((a, b) => (b.y1 - b.y0) - (a.y1 - a.y0)).slice(0, MAX_LAYERS * 2)) {
      let shape = analyzeLine(sctx, ln, W, H);
      report.push({ text: ln.text, conf: Math.round(ln.conf), box: [ln.x0, ln.y0, ln.x1, ln.y1].map(Math.round), kept: !!shape });
      // Huruf tak terpisah dari latar tapi bacaannya sangat yakin: teks tetap dikloning dengan font & warna aman
      if (!shape && ln.conf >= 85) shape = { grid: null, color: "#FFFFFF", inkW: ln.x1 - ln.x0, inkCx: (ln.x0 + ln.x1) / 2, inkCy: (ln.y0 + ln.y1) / 2 };
      if (!shape) continue;
      const m = shape.grid ? matchFont(ln.text, shape) : { font: "Montserrat", weight: "700" };
      pctx.font = `${m.weight} 100px "${m.font}"`;
      const w100 = pctx.measureText(ln.text).width || 1;
      const sizePx = (100 * shape.inkW * cover) / w100; // ukuran font di piksel kanvas agar lebarnya sama
      const x = (ox + shape.inkCx * cover) / cw, y = (oy + shape.inkCy * cover) / ch;
      if (x < 0.02 || x > 0.98 || y < 0.02 || y > 0.98) continue;
      items.push({ text: ln.text, font: m.font, weight: m.weight, color: shape.color, sizePx, x, y, top: oy + ln.y0 * cover, bottom: oy + ln.y1 * cover, conf: ln.conf });
    }
    items.sort((a, b) => a.y - b.y);

    // Baris berurutan yang rata tengah, sama font & ukurannya -> satu layer multi-baris
    const groups = [];
    for (const it of items) {
      const g = groups[groups.length - 1], prev = g && g[g.length - 1];
      const h = it.bottom - it.top;
      if (prev && prev.font === it.font && prev.weight === it.weight && Math.abs(prev.x - it.x) < 0.04 && it.sizePx / prev.sizePx > 0.8 && it.sizePx / prev.sizePx < 1.25 && it.top - prev.bottom < h * 0.8) g.push(it);
      else groups.push([it]);
    }

    return groups.slice(0, MAX_LAYERS).map((g, i) => {
      const sizePx = g.reduce((a, it) => a + it.sizePx, 0) / g.length;
      const pitch = g.length > 1 ? (g[g.length - 1].y - g[0].y) * ch / (g.length - 1) : 0;
      return {
        ...LAYER_BASE,
        role: `Teks Referensi ${i + 1}`,
        text: g.map((it) => it.text).join("\n"),
        x: g.reduce((a, it) => a + it.x, 0) / g.length,
        y: (g[0].y + g[g.length - 1].y) / 2,
        fontFamily: g[0].font,
        fontWeight: g[0].weight,
        fontSize: Math.max(10, Math.min(280, Math.round(sizePx / unit))),
        lineHeight: pitch ? Math.max(0.8, Math.min(2.2, +(pitch / sizePx).toFixed(2))) : 1.1,
        color: g[0].color
      };
    });
  }

  // img = gambar referensi, tpl = entri REFERENCE_TEMPLATES yang layernya akan diganti
  async function run(img, tpl) {
    if (busy) return showToast("Kloning teks masih berjalan…");
    busy = true;
    last = { img, tpl };
    try {
      setStatus("Menyiapkan pembaca teks…");
      const layers = await detect(img);
      if (!layers.length) {
        setStatus("Tidak ada teks yang terbaca jelas. Teks contoh tetap dipakai.");
        return showToast("Teks di referensi tidak terbaca. Atur manual lewat teks contoh.");
      }
      tpl.layers = layers;
      if (state.activeTemplateId === tpl.id) {
        state.layers = cloneLayersWithIds(layers);
        state.selectedLayerId = state.layers[0].id;
        // Bayangan referensi dimatikan supaya teks hasil kloning tidak bertumpuk dengan teks aslinya
        state.refGhostOpacity = 0;
        const slider = document.getElementById("sliderRefGhostOpacity"), val = document.getElementById("valRefGhostOpacity");
        if (slider) slider.value = 0;
        if (val) val.textContent = "0%";
        pushHistorySnapshot();
        syncAllUI();
        renderCanvas();
      }
      setStatus(`${layers.length} teks dikloning. Font = yang paling mirip dari ${CANDIDATES.length} kandidat; periksa & sesuaikan.`);
      showToast(`${layers.length} teks dari referensi dikloning jadi template. Tahan "Lihat Contoh Asli" untuk membandingkan.`);
    } catch (e) {
      console.error(e);
      setStatus("Gagal membaca teks (mesin OCR butuh internet). Coba Kloning Ulang.");
    } finally {
      busy = false;
    }
  }

  const btn = document.getElementById("btnRefAutoClone");
  if (btn) btn.addEventListener("click", () => (last ? run(last.img, last.tpl) : showToast("Unggah gambar referensi dulu")));

  // report = baris yang terbaca pada kloning terakhir (kept:false = ditolak karena kontras/bentuk), untuk diagnosa di konsol
  window.SNERefClone = { run, detect, report };
})();
