// SNE Studio — Editor Foto (cahaya, warna, efek, detail, putar, looks) di panel kanan.
// Non-destruktif: nilai disimpan di slot.adj / pip.adj lalu "dipanggang" ke kanvas cache
// yang dipakai mesin render utama lewat SNEFx.imageFor(). Semua olah piksel memakai
// ImageData (bukan ctx.filter) supaya hasilnya sama di Safari/iPhone.
// Dimuat setelah <script> utama dan photo-import.js.
(function () {
  const SMALL = !!(window.SNEImport && SNEImport.IS_SMALL_DEVICE);
  const BAKE_EDGE = SMALL ? 2048 : 3200; // sisi terpanjang hasil edit yang dipakai kanvas & export
  const LIVE_EDGE = SMALL ? 800 : 1080; // pratinjau realtime foto yang sedang diedit

  // [kunci, label, min] — maks selalu 100
  const GROUPS = [
    { id: "light", label: "Cahaya", params: [["exposure", "Pencahayaan", -100], ["contrast", "Kontras", -100], ["highlights", "Highlight", -100], ["shadows", "Bayangan", -100], ["whites", "Putih", -100], ["blacks", "Hitam", -100]] },
    { id: "color", label: "Warna", params: [["temp", "Suhu", -100], ["tint", "Rona", -100], ["vibrance", "Vibrance", -100], ["saturation", "Saturasi", -100]] },
    { id: "fx", label: "Efek", params: [["clarity", "Kejernihan", -100], ["dehaze", "Hapus Kabut", -100], ["fade", "Pudar", 0], ["vignette", "Vinyet", -100], ["grain", "Bintik Film", 0]] },
    { id: "detail", label: "Detail", params: [["sharpen", "Ketajaman", 0], ["structure", "Struktur", -100]] }
  ];
  const PIXEL_KEYS = GROUPS.flatMap((g) => g.params.map((p) => p[0]));
  const GEOM_KEYS = ["rot", "flipH", "flipV", "straighten"];
  const LABELS = Object.fromEntries(GROUPS.flatMap((g) => g.params.map((p) => [p[0], p[1]])));
  LABELS.straighten = "Luruskan";

  const LOOKS = [
    ["asli", "Asli", {}],
    ["cerah", "Cerah", { exposure: 18, contrast: 8, shadows: 20, vibrance: 20 }],
    ["senja", "Senja", { temp: 28, tint: 6, contrast: 10, highlights: -15, vibrance: 15, fade: 10 }],
    ["sejuk", "Sejuk", { temp: -25, contrast: 12, shadows: 10, vibrance: 10 }],
    ["vivid", "Vivid", { contrast: 20, vibrance: 45, saturation: 10, clarity: 20, sharpen: 25 }],
    ["kuliner", "Kuliner", { exposure: 8, contrast: 12, temp: 12, vibrance: 35, structure: 20, sharpen: 20 }],
    ["potret", "Potret", { exposure: 8, shadows: 18, structure: -25, vibrance: 12, temp: 6 }],
    ["drama", "Drama", { highlights: -55, shadows: 55, clarity: 35, structure: 25, vibrance: 20 }],
    ["sinema", "Sinema", { contrast: 18, highlights: -25, shadows: 15, temp: -10, tint: 8, vibrance: 15, vignette: 25 }],
    ["moody", "Moody", { exposure: -12, contrast: 25, highlights: -30, shadows: -10, saturation: -25, temp: -8, vignette: 35, clarity: 15 }],
    ["film", "Film", { fade: 40, contrast: -8, temp: 10, grain: 35, saturation: -15, vignette: 20 }],
    ["matte", "Matte", { fade: 55, blacks: 15, contrast: 10, saturation: -10 }],
    ["mono", "Mono", { saturation: -100, contrast: 25, clarity: 20 }],
    ["monopudar", "Mono Pudar", { saturation: -100, fade: 35, contrast: -5, grain: 25 }]
  ];

  // ===========================================================================
  // MESIN OLAH PIKSEL
  // ===========================================================================
  const hasPixelEdits = (a) => !!a && PIXEL_KEYS.some((k) => a[k]);
  const hasGeometry = (a) => !!a && GEOM_KEYS.some((k) => a[k]);
  const isNeutral = (a) => !hasPixelEdits(a) && !hasGeometry(a);
  const geometryOf = (a) => Object.fromEntries(GEOM_KEYS.filter((k) => a && a[k]).map((k) => [k, a[k]]));

  function drawGeometry(img, a, maxEdge) {
    const rot = ((((a && a.rot) || 0) % 360) + 360) % 360;
    const swap = rot === 90 || rot === 270;
    const bw = swap ? img.height : img.width;
    const bh = swap ? img.width : img.height;
    const scale = Math.min(1, maxEdge / Math.max(bw, bh));
    const w = Math.max(1, Math.round(bw * scale));
    const h = Math.max(1, Math.round(bh * scale));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = "high";
    x.translate(w / 2, h / 2);
    const ang = (((a && a.straighten) || 0) * Math.PI) / 180;
    if (ang) {
      // Perbesar secukupnya supaya sudut kosong akibat rotasi tertutup
      const co = Math.abs(Math.cos(ang)), si = Math.abs(Math.sin(ang));
      const k = Math.max(co + (si * h) / w, co + (si * w) / h);
      x.rotate(ang);
      x.scale(k, k);
    }
    x.rotate((rot * Math.PI) / 180);
    x.scale(a && a.flipH ? -1 : 1, a && a.flipV ? -1 : 1);
    const dw = swap ? h : w, dh = swap ? w : h;
    x.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    return c;
  }

  // Kurva tone gabungan per kanal (suhu/rona masuk sebagai gain sebelum kurva)
  function buildLuts(a) {
    const v = (k) => (a[k] || 0) / 100;
    const ex = Math.pow(2, v("exposure") * 1.6);
    const t = v("temp"), ti = v("tint");
    let gr = 1 + 0.2 * t + 0.06 * ti, gg = 1 - 0.14 * ti, gb = 1 - 0.22 * t + 0.06 * ti;
    const norm = 1 / (0.299 * gr + 0.587 * gg + 0.114 * gb);
    gr *= norm; gg *= norm; gb *= norm;
    const c = v("contrast"), hi = v("highlights"), sh = v("shadows"), wh = v("whites"), bl = v("blacks"), fd = v("fade"), dz = v("dehaze");
    const cf = c >= 0 ? 1 + c * 1.1 : 1 + c * 0.75;

    const tone = (x) => {
      x *= ex;
      if (x > 0.8 && ex > 1) x = 0.8 + 0.2 * Math.tanh((x - 0.8) / 0.2); // highlight tidak langsung gosong
      if (x > 1) x = 1;
      const inv = 1 - x;
      x += sh * 0.3 * x * inv * inv * 6.75 + hi * 0.3 * x * x * inv * 6.75 + wh * 0.2 * x * x * x + bl * 0.2 * inv * inv * inv;
      if (dz > 0) x = (x - dz * 0.1) / (1 - dz * 0.1);
      else if (dz < 0) x += -dz * 0.3 * (0.85 - x);
      x = (x - 0.5) * cf + 0.5;
      if (fd) {
        const i2 = 1 - Math.min(1, Math.max(0, x));
        x += fd * 0.2 * i2 * i2;
        x = (x - 0.5) * (1 - fd * 0.15) + 0.5;
      }
      return x < 0 ? 0 : x > 1 ? 1 : x;
    };
    const mk = (g) => {
      const lut = new Uint8ClampedArray(256);
      for (let i = 0; i < 256; i++) lut[i] = Math.round(255 * tone((i / 255) * g));
      return lut;
    };
    return [mk(gr), mk(gg), mk(gb)];
  }

  function blurH(src, dst, w, h, r) {
    for (let y = 0; y < h; y++) {
      const o = y * w;
      let sum = 0, cnt = 0;
      for (let x = 0; x <= Math.min(r, w - 1); x++) { sum += src[o + x]; cnt++; }
      for (let x = 0; x < w; x++) {
        dst[o + x] = sum / cnt;
        const add = x + r + 1, rem = x - r;
        if (add < w) { sum += src[o + add]; cnt++; }
        if (rem >= 0) { sum -= src[o + rem]; cnt--; }
      }
    }
  }
  function blurV(src, dst, w, h, r) {
    const sum = new Float32Array(w);
    let cnt = 0;
    for (let y = 0; y <= Math.min(r, h - 1); y++) {
      const o = y * w;
      for (let x = 0; x < w; x++) sum[x] += src[o + x];
      cnt++;
    }
    for (let y = 0; y < h; y++) {
      const o = y * w, inv = 1 / cnt;
      for (let x = 0; x < w; x++) dst[o + x] = sum[x] * inv;
      const add = y + r + 1, rem = y - r;
      if (add < h) { const oa = add * w; for (let x = 0; x < w; x++) sum[x] += src[oa + x]; cnt++; }
      if (rem >= 0) { const or = rem * w; for (let x = 0; x < w; x++) sum[x] -= src[or + x]; cnt--; }
    }
  }
  // Dua kali box blur ≈ gaussian, biaya tetap berapa pun radiusnya
  function blur(src, out, tmp, w, h, r) {
    blurH(src, tmp, w, h, r); blurV(tmp, out, w, h, r);
    blurH(out, tmp, w, h, r); blurV(tmp, out, w, h, r);
  }

  function applyPixels(ctx, w, h, a) {
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    const n = w * h;
    const [lr, lg, lb] = buildLuts(a);
    const sat = (a.saturation || 0) / 100, vib = (a.vibrance || 0) / 100, dz = (a.dehaze || 0) / 100;
    const satK = (1 + sat) * (1 + Math.max(0, dz) * 0.25);
    const sharpen = (a.sharpen || 0) / 100, structure = (a.structure || 0) / 100, clarity = (a.clarity || 0) / 100;
    const needDetail = sharpen || structure || clarity;
    const L = needDetail ? new Float32Array(n) : null;

    for (let p = 0, i = 0; p < n; p++, i += 4) {
      let r = lr[d[i]], g = lg[d[i + 1]], b = lb[d[i + 2]];
      if (satK !== 1 || vib) {
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        let k = satK;
        if (vib) {
          const mx = r > g ? (r > b ? r : b) : g > b ? g : b;
          const mn = r < g ? (r < b ? r : b) : g < b ? g : b;
          k *= 1 + vib * (1 - (mx - mn) / 255); // warna yang sudah pekat tidak ikut dipompa
        }
        r = l + (r - l) * k; g = l + (g - l) * k; b = l + (b - l) * k;
      }
      d[i] = r; d[i + 1] = g; d[i + 2] = b;
      if (L) L[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    }

    if (needDetail) {
      const edge = Math.max(w, h);
      const B = new Float32Array(n), tmp = new Float32Array(n), delta = new Float32Array(n);
      if (sharpen) {
        blur(L, B, tmp, w, h, Math.max(1, Math.round(edge / 900)));
        const k = sharpen * 1.6;
        for (let p = 0; p < n; p++) delta[p] += (L[p] - B[p]) * k;
      }
      if (structure) {
        blur(L, B, tmp, w, h, Math.max(2, Math.round(edge / 160)));
        const k = structure * 0.9;
        for (let p = 0; p < n; p++) delta[p] += (L[p] - B[p]) * k;
      }
      if (clarity) {
        blur(L, B, tmp, w, h, Math.max(4, Math.round(edge / 36)));
        const k = clarity * 0.7;
        for (let p = 0; p < n; p++) {
          const m = L[p] / 127.5 - 1; // kontras lokal hanya di midtone
          delta[p] += (L[p] - B[p]) * k * (1 - m * m);
        }
      }
      for (let p = 0, i = 0; p < n; p++, i += 4) {
        const dl = delta[p];
        d[i] += dl; d[i + 1] += dl; d[i + 2] += dl;
      }
    }

    const vig = (a.vignette || 0) / 100, grain = (a.grain || 0) / 100;
    if (vig || grain) {
      const cx = (w - 1) / 2, cy = (h - 1) / 2, invD2 = 1 / (cx * cx + cy * cy || 1);
      const cell = Math.max(1, Math.round(Math.max(w, h) / 1100)); // butir tetap terlihat di resolusi tinggi
      const gAmp = grain * 46;
      for (let y = 0, i = 0; y < h; y++) {
        const dy2 = (y - cy) * (y - cy), gy = Math.imul((y / cell) | 0, 668265263);
        for (let x = 0; x < w; x++, i += 4) {
          if (vig) {
            let t = (((x - cx) * (x - cx) + dy2) * invD2 - 0.12) / 0.88;
            if (t > 0) {
              t = t * t * (3 - 2 * t);
              if (vig > 0) {
                const k = 1 - vig * 0.8 * t;
                d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
              } else {
                const k = -vig * 0.7 * t;
                d[i] += (255 - d[i]) * k; d[i + 1] += (255 - d[i + 1]) * k; d[i + 2] += (255 - d[i + 2]) * k;
              }
            }
          }
          if (grain) {
            let hs = Math.imul(Math.imul((x / cell) | 0, 374761393) ^ gy, 1274126177);
            hs ^= hs >>> 15;
            const nz = ((hs & 1023) / 1023 - 0.5) * gAmp;
            d[i] += nz; d[i + 1] += nz; d[i + 2] += nz;
          }
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  // Gambar + penyesuaian -> kanvas baru (tidak pernah memperbesar melebihi sumber)
  function process(img, a, maxEdge) {
    const c = drawGeometry(img, a, maxEdge);
    if (hasPixelEdits(a)) applyPixels(c.getContext("2d"), c.width, c.height, a);
    return c;
  }

  // Dipanggil mesin render utama untuk tiap slot/PIP. Cache dibuat ulang hanya bila foto atau adj berganti.
  function imageFor(obj) {
    const img = obj && obj.img;
    if (!img) return null;
    if (obj.adj && obj._adjSrc !== (obj.origSrc || obj.src)) { // fotonya sudah diganti: edit lama tidak berlaku
      obj.adj = null;
      obj._fx = null;
    }
    // Foto yang sedang diedit di panel: pratinjau ringan supaya slider terasa instan
    if (session && session.obj === obj && !window.SNEFx.fullRes) {
      if (session.img !== img) { // fotonya berganti di tengah sesi (hapus BG, HD, ganti foto)
        session.img = img;
        session.prevSrc = process(img, {}, LIVE_EDGE);
        session.live = null;
      }
      if (!obj.adj) return img;
      const L = session.live;
      if (!L || L.adj !== obj.adj || L.compare !== session.compare) {
        session.live = { adj: obj.adj, compare: session.compare, canvas: process(session.prevSrc, session.compare ? geometryOf(obj.adj) : obj.adj, LIVE_EDGE) };
      }
      return session.live.canvas;
    }
    if (!obj.adj) return img;
    if (!obj._fx || obj._fx.img !== img || obj._fx.adj !== obj.adj) {
      obj._fx = { img, adj: obj.adj, canvas: process(img, obj.adj, BAKE_EDGE) };
    }
    return obj._fx.canvas;
  }

  // Uji cepat mesin piksel, jalankan dari konsol browser: SNEFx.selfCheck()
  function selfCheck() {
    const c = document.createElement("canvas");
    c.width = 8;
    c.height = 4;
    const x = c.getContext("2d");
    x.fillStyle = "rgb(100,120,140)";
    x.fillRect(0, 0, 8, 4);
    const px = (cv) => Array.from(cv.getContext("2d").getImageData(2, 2, 1, 1).data.slice(0, 3));
    const same = px(process(c, {}, 8)), bright = px(process(c, { exposure: 50 }, 8)), mono = px(process(c, { saturation: -100 }, 8)), rot = process(c, { rot: 90 }, 8);
    const checks = {
      "tanpa edit = identik": same.join() === "100,120,140",
      "exposure + lebih terang": bright[0] > 100 && bright[2] > 140,
      "saturasi -100 = abu-abu": Math.abs(mono[0] - mono[2]) <= 1,
      "putar 90 menukar sisi": rot.width === 4 && rot.height === 8
    };
    Object.entries(checks).forEach(([name, ok]) => console.assert(ok, "SNEFx gagal: " + name));
    return Object.values(checks).every(Boolean);
  }

  // fullRes = true dipasang mesin export supaya foto yang sedang diedit ikut dirender resolusi penuh
  window.SNEFx = { process, imageFor, isNeutral, selfCheck, LOOKS, BAKE_EDGE, fullRes: false };

  // ===========================================================================
  // PANEL "EDIT FOTO" DI INSPECTOR KANAN (di HP: lembar bawah)
  // Tidak ada halaman/modal terpisah: hasil langsung terlihat di kanvas utama.
  // Selama panel aktif, foto yang diedit memakai pratinjau ringan (LIVE_EDGE);
  // resolusi penuh dipanggang saat sesi berakhir atau saat export (SNEFx.fullRes).
  // ===========================================================================
  const pane = document.getElementById("inspPanePhoto");
  const $ = (id) => document.getElementById(id);
  let session = null; // { obj, kind: "slot"|"pip", idx?, key, label, img, prevSrc, live, compare }
  let paneActive = false, pendingTarget = null, activeTab = "looks", rafId = 0, chipSig = "";

  const style = document.createElement("style");
  style.textContent = `
  .pe-chip{position:relative;width:46px;height:46px;border-radius:12px;overflow:hidden;border:2px solid var(--border-control);flex-shrink:0;padding:0;background:var(--surface-high);cursor:pointer}
  .pe-chip img{width:100%;height:100%;object-fit:cover;display:block}
  .pe-chip.on{border-color:var(--primary);box-shadow:0 0 0 2px var(--primary-light)}
  .pe-chip span{position:absolute;left:3px;bottom:1px;font-size:10px;font-weight:800;color:#fff;text-shadow:0 0 3px #000,0 0 3px #000}
  .pe-chip i{position:absolute;right:3px;top:3px;width:8px;height:8px;border-radius:50%;background:var(--primary);border:1.5px solid #fff}
  .pe-look{border:2px solid transparent;background:var(--surface-low);border-radius:12px;padding:3px 3px 5px;color:var(--ink-secondary);font-size:11px;font-weight:700;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0}
  .pe-look canvas{width:100%;aspect-ratio:1;border-radius:9px;display:block}
  .pe-look.on{border-color:var(--primary);color:var(--primary)}
  .pe-row label{cursor:pointer}
  #peHist{image-rendering:auto}`;
  document.head.appendChild(style);

  pane.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="min-w-0">
        <h2 class="text-sm font-bold text-[#171717]">Edit Foto</h2>
        <p id="peTarget" class="text-xs text-[#737373] truncate">Ketuk foto di kanvas untuk memilih</p>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <button type="button" id="peCompare" class="sne-btn-secondary h-8 px-2.5 text-xs" title="Tahan untuk melihat foto sebelum diedit">Asli</button>
        <button type="button" id="peReset" class="sne-btn-secondary h-8 px-2.5 text-xs" title="Hapus semua edit foto ini">Reset</button>
      </div>
    </div>
    <div id="peTargets" class="flex gap-1.5 overflow-x-auto pb-1" aria-label="Pilih foto yang diedit"></div>
    <div id="peEditor" class="space-y-3">
      <canvas id="peHist" width="256" height="56" class="hidden lg:block w-full h-12 rounded-xl border border-[#E7E7E4] bg-[#F7F7F5]" aria-hidden="true"></canvas>
      <div id="peTabs" class="sne-segmented grid grid-cols-6 gap-1" role="tablist"></div>
      <div id="peBody" class="space-y-2.5"></div>
      <div class="pt-3 border-t border-[#E7E7E4] grid grid-cols-2 gap-1.5">
        <button type="button" id="peReplace" class="sne-btn-secondary py-2 text-xs">Ganti Foto</button>
        <button type="button" id="peSaveGallery" class="sne-btn-secondary py-2 text-xs" title="Simpan hasil edit sebagai foto baru di Galeri">Simpan ke Galeri</button>
        <button type="button" id="peRemoveBg" class="sne-btn-secondary py-2 text-xs">Hapus Background</button>
        <button type="button" id="peEnhance" class="sne-btn-secondary py-2 text-xs">HD &amp; Halus</button>
      </div>
    </div>`;

  const TABS = [["looks", "Looks"], ...GROUPS.map((g) => [g.id, g.label]), ["geo", "Putar"]];
  $("peTabs").innerHTML = TABS.map(([id, label]) => `<button type="button" role="tab" data-tab="${id}" class="sne-seg-item py-1.5 text-[11px] text-center">${label}</button>`).join("");
  $("peTabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (b) { activeTab = b.getAttribute("data-tab"); renderBody(); }
  });

  const adjOf = () => (session && session.obj.adj) || {};

  function paramMeta(key) {
    if (key === "straighten") return { min: -30, max: 30, unit: "°" };
    for (const g of GROUPS) for (const p of g.params) if (p[0] === key) return { min: p[2], max: 100, unit: "" };
    return null;
  }
  const fmt = (key, v) => (v > 0 && paramMeta(key).min < 0 ? "+" : "") + v + paramMeta(key).unit;

  function drawHistogram() {
    if (!session) return;
    const src = session.live && session.obj.adj ? session.live.canvas : session.prevSrc;
    const hc = $("peHist"), hx = hc.getContext("2d");
    const data = src.getContext("2d").getImageData(0, 0, src.width, src.height).data;
    const bins = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
    for (let i = 0; i < data.length; i += 32) { bins[0][data[i]]++; bins[1][data[i + 1]]++; bins[2][data[i + 2]]++; }
    let peak = 1;
    for (let c = 0; c < 3; c++) for (let i = 2; i < 254; i++) if (bins[c][i] > peak) peak = bins[c][i];
    hx.globalCompositeOperation = "source-over";
    hx.clearRect(0, 0, hc.width, hc.height);
    hx.globalCompositeOperation = "multiply";
    ["#f2777a", "#6cc47f", "#6aa9ee"].forEach((col, c) => {
      hx.fillStyle = col;
      hx.beginPath();
      hx.moveTo(0, hc.height);
      for (let i = 0; i < 256; i++) hx.lineTo(i, hc.height - Math.min(1, bins[c][i] / peak) * (hc.height - 4));
      hx.lineTo(255, hc.height);
      hx.fill();
    });
  }

  function schedule() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      renderCanvas();
      drawHistogram();
    });
  }

  // Satu-satunya jalan mengubah edit foto: objek adj selalu diganti baru (jadi kunci cache)
  function setAdj(next, done) {
    if (!session) return;
    const o = session.obj;
    o.adj = isNeutral(next) ? null : next;
    o._adjSrc = o.origSrc || o.src;
    schedule();
    if (done) commit();
  }
  function commit() {
    pushHistorySnapshot();
    renderTargets();
  }

  function setValue(key, val, done) {
    const m = paramMeta(key);
    val = Math.max(m.min, Math.min(m.max, Math.round(val)));
    const next = { ...adjOf() };
    if (val) next[key] = val; else delete next[key];
    if (PIXEL_KEYS.includes(key)) delete next.look;
    const row = $("peBody").querySelector(`[data-key="${key}"]`);
    if (row) {
      row.querySelector("output").textContent = fmt(key, val);
      const input = row.querySelector("input");
      if (+input.value !== val) input.value = val;
    }
    setAdj(next, done);
  }

  function rowHtml(key) {
    const m = paramMeta(key), v = adjOf()[key] || 0;
    return `<div class="pe-row" data-key="${key}">
      <div class="flex justify-between text-xs mb-1">
        <label for="pe_${key}" class="font-semibold text-[#525252]" title="Klik ganda untuk reset">${LABELS[key]}</label>
        <output class="tabular-nums font-bold text-[#171717]">${fmt(key, v)}</output>
      </div>
      <input type="range" id="pe_${key}" min="${m.min}" max="${m.max}" step="1" value="${v}" class="w-full" />
    </div>`;
  }

  function renderBody() {
    const body = $("peBody");
    $("peTabs").querySelectorAll("[data-tab]").forEach((b) => {
      const on = b.getAttribute("data-tab") === activeTab;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    if (!session) { body.innerHTML = ""; return; }

    if (activeTab === "looks") {
      body.innerHTML = `<div class="grid grid-cols-4 lg:grid-cols-3 gap-1.5"></div>`;
      const grid = body.firstChild;
      const a = adjOf();
      const thumbSrc = process(session.prevSrc, geometryOf(a), 132);
      const current = a.look || (hasPixelEdits(a) ? "" : "asli");
      LOOKS.forEach(([id, name, vals]) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pe-look" + (id === current ? " on" : "");
        const th = process(thumbSrc, vals, 132);
        const sq = document.createElement("canvas"); // potong tengah jadi persegi supaya grid rapi
        const s = Math.min(th.width, th.height);
        sq.width = sq.height = s;
        sq.getContext("2d").drawImage(th, (th.width - s) / 2, (th.height - s) / 2, s, s, 0, 0, s, s);
        btn.append(sq, name);
        btn.addEventListener("click", () => {
          grid.querySelectorAll(".pe-look").forEach((b) => b.classList.toggle("on", b === btn));
          setAdj({ ...geometryOf(adjOf()), ...vals, ...(id === "asli" ? {} : { look: id }) }, true);
        });
        grid.appendChild(btn);
      });
      return;
    }

    if (activeTab === "geo") {
      body.innerHTML = `<div class="grid grid-cols-2 gap-1.5">
          <button type="button" class="sne-btn-secondary py-2 text-xs" data-geo="l">⟲ Putar kiri</button>
          <button type="button" class="sne-btn-secondary py-2 text-xs" data-geo="r">⟳ Putar kanan</button>
          <button type="button" class="sne-btn-secondary py-2 text-xs" data-geo="h">⇋ Balik horizontal</button>
          <button type="button" class="sne-btn-secondary py-2 text-xs" data-geo="v">⇅ Balik vertikal</button>
        </div>${rowHtml("straighten")}
        <p class="text-[11px] text-[#737373] leading-snug">Zoom &amp; posisi: cubit dua jari atau roda mouse di foto, lalu geser fotonya.</p>`;
      body.querySelectorAll("[data-geo]").forEach((b) => b.addEventListener("click", () => {
        const a = { ...adjOf() }, g = b.getAttribute("data-geo");
        if (g === "l" || g === "r") {
          const rot = ((a.rot || 0) + (g === "r" ? 90 : 270)) % 360;
          if (rot) a.rot = rot; else delete a.rot;
        } else {
          const k = g === "h" ? "flipH" : "flipV";
          if (a[k]) delete a[k]; else a[k] = true;
        }
        setAdj(a, true);
      }));
    } else {
      body.innerHTML = GROUPS.find((g) => g.id === activeTab).params.map((p) => rowHtml(p[0])).join("");
    }

    body.querySelectorAll(".pe-row").forEach((row) => {
      const key = row.getAttribute("data-key"), input = row.querySelector("input");
      input.addEventListener("input", () => setValue(key, +input.value, false));
      input.addEventListener("change", commit);
      row.querySelector("label").addEventListener("dblclick", (e) => { e.preventDefault(); setValue(key, 0, true); });
    });
  }

  // Deretan foto yang bisa diedit (slot aktif + stiker PIP). Dibangun ulang hanya bila ada yang berubah.
  function renderTargets() {
    const count = getEffectiveSlots().length;
    const items = [];
    for (let i = 0; i < count; i++) {
      const s = state.slots[i];
      if (s && s.img) items.push({ t: "slot:" + i, src: s.src, n: String(i + 1), title: `Foto Slot #${i + 1}`, edited: !!s.adj });
    }
    state.pipPhotos.forEach((p, i) => { if (p.img) items.push({ t: "pip:" + p.id, src: p.src, n: "P" + (i + 1), title: `Stiker PIP ${i + 1}`, edited: !!p.adj }); });
    const sig = items.map((it) => it.t + it.src.length + it.src.slice(-12) + it.edited).join("|") + "@" + (session ? session.key : "");
    if (sig === chipSig) return;
    chipSig = sig;
    $("peTargets").innerHTML = items.map((it) =>
      `<button type="button" class="pe-chip${session && session.key === it.t ? " on" : ""}" data-t="${it.t}" title="${it.title}"><img src="${it.src}" alt="${it.title}" /><span>${it.n}</span>${it.edited ? "<i></i>" : ""}</button>`).join("");
  }
  $("peTargets").addEventListener("click", (e) => {
    const b = e.target.closest("[data-t]");
    if (!b) return;
    const [kind, id] = b.getAttribute("data-t").split(/:(.+)/);
    if (kind === "slot") openSlot(+id); else openPip(id);
  });

  function resolve(t) {
    if (t && t.kind === "pip") {
      const p = state.pipPhotos.find((x) => x.id === t.id);
      if (p && p.img) return { obj: p, kind: "pip", key: "pip:" + p.id, label: "Stiker PIP" };
    }
    const count = getEffectiveSlots().length;
    const idx = Math.max(0, Math.min((t && t.kind === "slot" ? t.idx : state.selectedSlotIndex) || 0, count - 1));
    const s = state.slots[idx];
    return s && s.img ? { obj: s, kind: "slot", idx, key: "slot:" + idx, label: `Foto Slot #${idx + 1}` } : null;
  }

  function startSession(target) {
    const r = resolve(target);
    const previous = session && session.obj;
    if (!r) session = null;
    else if (!session || session.obj !== r.obj) session = { ...r, img: r.obj.img, prevSrc: process(r.obj.img, {}, LIVE_EDGE), live: null, compare: false };
    else Object.assign(session, r);
    const isSlot = !!session && session.kind === "slot";
    $("peTarget").textContent = session ? `${session.label} · ketuk foto lain untuk pindah` : "Belum ada foto. Unggah foto dulu.";
    $("peEditor").classList.toggle("hidden", !session);
    ["peReplace", "peRemoveBg", "peEnhance"].forEach((id) => $(id).classList.toggle("hidden", !isSlot));
    renderTargets();
    renderBody();
    if (previous !== (session && session.obj)) schedule();
    else drawHistogram();
  }

  // Dipanggil showInspectorPane() di index.html saat tab Edit Foto ditampilkan / ditinggalkan
  function activate() {
    paneActive = true;
    startSession(pendingTarget || (session ? (session.kind === "pip" ? { kind: "pip", id: session.obj.id } : { kind: "slot", idx: state.selectedSlotIndex || 0 }) : null));
    pendingTarget = null;
  }
  function deactivate() {
    if (!paneActive) return;
    paneActive = false;
    if (session) {
      session = null;
      setTimeout(renderCanvas, 60); // panggang resolusi penuh setelah panel berganti
    }
  }
  // Dipanggil syncAllUI(): slot terpilih / foto / undo bisa berubah dari tempat lain
  function sync() {
    if (!paneActive) return;
    const want = session && session.kind === "pip" && state.pipPhotos.includes(session.obj)
      ? { kind: "pip", id: session.obj.id }
      : { kind: "slot", idx: state.selectedSlotIndex || 0 };
    const r = resolve(want);
    if (!r || !session || r.obj !== session.obj) return startSession(want);
    Object.assign(session, r);
    renderTargets();
    $("peTarget").textContent = `${session.label} · ketuk foto lain untuk pindah`;
    if (activeTab === "looks") {
      const cur = adjOf().look || (hasPixelEdits(adjOf()) ? "" : "asli");
      $("peBody").querySelectorAll(".pe-look").forEach((b, i) => b.classList.toggle("on", LOOKS[i][0] === cur));
    } else {
      $("peBody").querySelectorAll(".pe-row").forEach((row) => {
        const key = row.getAttribute("data-key"), v = adjOf()[key] || 0;
        row.querySelector("input").value = v;
        row.querySelector("output").textContent = fmt(key, v);
      });
    }
  }

  const showPhotoPane = () => (isMobileLayout() ? setMobileView("photo") : showInspectorPane("photo"));

  function openSlot(idx) {
    const slot = state.slots[idx];
    if (!slot || !slot.img) return showToast("Slot ini belum berisi foto");
    state.selectedSlotIndex = idx;
    const lbl = $("canvaActiveSlotLabel");
    if (lbl) lbl.textContent = `Mengedit: Foto Slot #${idx + 1}`;
    pendingTarget = { kind: "slot", idx };
    showPhotoPane();
  }
  function openPip(id) {
    pendingTarget = { kind: "pip", id };
    showPhotoPane();
  }
  // "Edit" di Galeri: pasang foto ke slot aktif lalu buka panel editnya
  async function editGalleryItem(itemId) {
    const item = state.galleryItems.find((g) => g.id === itemId);
    const img = item && (await loadImage(item.src));
    const idx = Math.min(state.selectedSlotIndex || 0, getEffectiveSlots().length - 1);
    if (!img || !state.slots[idx]) return;
    Object.assign(state.slots[idx], { src: item.src, origSrc: item.src, img, zoom: 1.0, panX: 0, panY: 0, isUserUploaded: true });
    pushHistorySnapshot();
    syncAllUI();
    renderCanvas();
    openSlot(idx);
    showToast(`Foto dipasang di Slot #${idx + 1}. Atur di panel Edit Foto.`);
  }

  // ----- Tombol panel --------------------------------------------------------
  const cmp = (on) => () => {
    if (!session || session.compare === on) return;
    session.compare = on;
    $("peCompare").classList.toggle("active", on);
    schedule();
  };
  $("peCompare").addEventListener("pointerdown", cmp(true));
  ["pointerup", "pointerleave", "pointercancel", "blur"].forEach((ev) => $("peCompare").addEventListener(ev, cmp(false)));
  $("peCompare").addEventListener("click", (e) => { if (e.detail === 0 && session) cmp(!session.compare)(); }); // keyboard: toggle

  $("peReset").addEventListener("click", () => {
    if (!session) return;
    setAdj({}, true);
    renderBody();
    showToast(`${session.label}: semua edit dihapus`);
  });
  const slotTool = (btnId) => () => {
    if (!session || session.kind !== "slot") return;
    state.selectedSlotIndex = session.idx;
    $(btnId).click();
  };
  $("peReplace").addEventListener("click", slotTool("singleSlotPhotoInput"));
  $("peRemoveBg").addEventListener("click", slotTool("btnCanvaRemoveBg"));
  $("peEnhance").addEventListener("click", slotTool("btnCanvaEnhanceHd"));
  $("peSaveGallery").addEventListener("click", () => {
    if (!session) return;
    const o = session.obj;
    const out = process(o.img, o.adj || {}, (window.SNEImport && SNEImport.MAX_EDGE) || BAKE_EDGE);
    const url = String(o.src).startsWith("data:image/png") ? out.toDataURL("image/png") : out.toDataURL("image/jpeg", 0.95);
    addPhotoToStudioGallery(url, `${session.label} (edit)`);
    showToast("Hasil edit disimpan ke Galeri");
  });

  window.SNEEditor = { activate, deactivate, sync, openSlot, openPip, editGalleryItem, isActive: () => paneActive };

  // ===========================================================================
  // KETUK DI KANVAS: foto -> panel Edit Foto, teks -> panel Teks, ketuk ganda teks -> ketik
  // Hanya ketukan singkat tanpa geser; menggeser tetap berarti pan/drag seperti biasa.
  // ===========================================================================
  let tap = null, lastTextTap = { id: null, t: 0 };
  canvas.addEventListener("pointerdown", (e) => {
    tap = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
  });
  canvas.addEventListener("pointerup", (e) => {
    if (!tap || !e.isPrimary) return;
    const now = performance.now();
    const moved = Math.hypot(e.clientX - tap.x, e.clientY - tap.y), dt = now - tap.t;
    tap = null;
    if (moved > 6 || dt > 400) return;
    const { x, y } = getCanvasCoords(e);
    if (checkActiveLayerHandleHit(x, y)) return;
    const layer = state.interactionMode === "text" ? findHitLayer(x, y) : null;
    if (layer) {
      // dblclick bawaan tidak muncul di layar sentuh, jadi ketuk ganda dideteksi di sini
      const isDouble = e.pointerType !== "mouse" && lastTextTap.id === layer.id && now - lastTextTap.t < 380;
      lastTextTap = { id: layer.id, t: now };
      if (isDouble) beginTextEdit(layer);
      else if (!isMobileLayout()) showInspectorPane("text");
      else if (document.body.dataset.mobView === "photo") setMobileView("right");
      return;
    }
    const pip = findHitPipPhoto(x, y);
    if (pip) return openPip(pip.id);
    openSlot(findHitSlotIndex(x, y));
  });
  canvas.addEventListener("pointercancel", () => { tap = null; });
})();
