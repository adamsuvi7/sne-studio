// SNE Studio — Editor Foto (cahaya, warna, efek, detail, putar, looks).
// Non-destruktif: nilai disimpan di slot.adj / pip.adj lalu "dipanggang" ke kanvas cache
// yang dipakai mesin render utama lewat SNEFx.imageFor(). Semua olah piksel memakai
// ImageData (bukan ctx.filter) supaya hasilnya sama di Safari/iPhone.
// Dimuat setelah <script> utama dan photo-import.js.
(function () {
  const SMALL = !!(window.SNEImport && SNEImport.IS_SMALL_DEVICE);
  const BAKE_EDGE = SMALL ? 2048 : 3200; // sisi terpanjang hasil edit yang dipakai kanvas & export
  const PREVIEW_EDGE = SMALL ? 640 : 900; // pratinjau realtime di editor

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
    if (!img || !obj.adj) return img || null;
    if (obj._adjSrc !== (obj.origSrc || obj.src)) { // fotonya sudah diganti: edit lama tidak berlaku
      obj.adj = null;
      obj._fx = null;
      return img;
    }
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

  window.SNEFx = { process, imageFor, isNeutral, selfCheck, LOOKS, BAKE_EDGE };

  // ===========================================================================
  // UI EDITOR
  // ===========================================================================
  const CSS = `
  .pe-root{position:fixed;inset:0;z-index:70;display:flex;flex-direction:column;background:#0f0f11;color:#f4f4f2;font-family:'Plus Jakarta Sans',Arial,sans-serif;-webkit-user-select:none;user-select:none}
  .pe-root[hidden]{display:none}
  .pe-stage{flex:1;min-height:0;display:flex;flex-direction:column}
  .pe-top{display:flex;align-items:center;gap:6px;padding:8px 10px;background:#17171a;border-bottom:1px solid #2a2a2f}
  .pe-title{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.25;padding:0 4px}
  .pe-title b{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .pe-title span{font-size:11px;color:#9a9aa3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .pe-btn{border:1px solid #34343a;background:#222226;color:#f4f4f2;border-radius:10px;padding:7px 11px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;touch-action:manipulation}
  .pe-btn:hover{background:#2c2c31}
  .pe-btn:focus-visible,.pe-tab:focus-visible,.pe-look:focus-visible{outline:2px solid #fda29b;outline-offset:1px}
  .pe-btn.pe-primary{background:#B42318;border-color:#B42318}
  .pe-btn.pe-primary:hover{background:#9F1F16}
  .pe-btn.pe-on{background:#f4f4f2;color:#17171a}
  .pe-view{flex:1;min-height:0;position:relative;display:flex;align-items:center;justify-content:center;padding:10px;touch-action:none;cursor:ew-resize;overflow:hidden}
  .pe-view canvas{max-width:100%;max-height:100%;border-radius:6px;box-shadow:0 8px 40px rgba(0,0,0,.55);background:repeating-conic-gradient(#2a2a2f 0 25%,#1c1c20 0 50%) 0 0/16px 16px}
  .pe-hud{position:absolute;top:14px;left:50%;transform:translateX(-50%);min-width:190px;background:rgba(15,15,17,.86);border:1px solid #3a3a41;border-radius:12px;padding:8px 12px;font-size:12px;font-weight:700;display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 14px;opacity:0;transition:opacity .18s;pointer-events:none}
  .pe-hud.pe-show{opacity:1}
  .pe-hud-bar{flex-basis:100%;height:4px;border-radius:4px;background:#34343a;position:relative;overflow:hidden}
  .pe-hud-bar i{position:absolute;top:0;bottom:0;background:#fda29b}
  .pe-badge{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);background:rgba(15,15,17,.86);border-radius:999px;padding:4px 12px;font-size:11px;font-weight:700;pointer-events:none}
  .pe-panel{background:#17171a;border-top:1px solid #2a2a2f;display:flex;flex-direction:column;max-height:46vh;min-height:0}
  .pe-hist{width:100%;height:44px;flex-shrink:0;display:block;background:#101012;border-bottom:1px solid #2a2a2f}
  .pe-tabs{display:flex;flex-shrink:0;gap:4px;padding:8px 10px 0;overflow-x:auto;scrollbar-width:none}
  .pe-tab{flex:1 0 auto;border:0;background:transparent;color:#9a9aa3;font-size:12px;font-weight:700;padding:7px 10px;border-radius:9px;cursor:pointer;touch-action:manipulation}
  .pe-tab.pe-on{background:#2c2c31;color:#fff}
  .pe-body{padding:10px 12px 14px;overflow-y:auto;min-height:0;display:flex;flex-direction:column;gap:9px}
  .pe-row{border-radius:10px;padding:6px 8px;border:1px solid transparent}
  .pe-row.pe-on{border-color:#3a3a41;background:#1f1f23}
  .pe-row-head{display:flex;justify-content:space-between;font-size:12px;font-weight:600;margin-bottom:3px;cursor:pointer}
  .pe-row-head output{font-variant-numeric:tabular-nums;color:#fda29b;font-weight:700}
  .pe-row input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:6px;margin:10px 0 8px;border-radius:6px;background:#3a3a41;cursor:pointer}
  .pe-row input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;border-radius:50%;background:#f4f4f2;border:0;box-shadow:0 1px 4px rgba(0,0,0,.6)}
  .pe-row input[type=range]::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:#f4f4f2;border:0;box-shadow:0 1px 4px rgba(0,0,0,.6)}
  .pe-row.pe-on input[type=range]::-webkit-slider-thumb{background:#fda29b}
  .pe-row.pe-on input[type=range]::-moz-range-thumb{background:#fda29b}
  .pe-looks{display:grid;grid-auto-flow:column;grid-auto-columns:78px;gap:8px;overflow-x:auto;padding-bottom:4px}
  .pe-look{border:2px solid transparent;background:#222226;border-radius:10px;padding:3px 3px 5px;color:#d6d6d2;font-size:11px;font-weight:700;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px}
  .pe-look canvas{width:68px;height:68px;object-fit:cover;border-radius:7px;display:block}
  .pe-look.pe-on{border-color:#f97066;color:#fff}
  .pe-geo{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
  .pe-hint{font-size:11px;color:#9a9aa3;line-height:1.4}
  @media (max-width:520px){.pe-title span{display:none}.pe-btn{padding:7px 9px}}
  @media (min-width:1024px){
    .pe-root{flex-direction:row}
    .pe-panel{width:340px;max-height:none;border-top:0;border-left:1px solid #2a2a2f}
    .pe-hist{height:84px}
    .pe-looks{grid-auto-flow:row;grid-template-columns:repeat(3,1fr);grid-auto-columns:auto;overflow:visible}
    .pe-look canvas{width:100%;height:auto;aspect-ratio:1}
  }
  @media (prefers-reduced-motion:reduce){.pe-hud{transition:none}}`;

  let root = null, els = {};
  let session = null; // { title, img, prevSrc, adj, onApply }
  let activeTab = "looks", activeKey = "exposure", showOriginal = false, rafId = 0, hudTimer = 0;

  function build() {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    root = document.createElement("div");
    root.className = "pe-root";
    root.hidden = true;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Editor foto");
    root.innerHTML = `
      <div class="pe-stage">
        <div class="pe-top">
          <button type="button" class="pe-btn" data-pe="cancel" aria-label="Batal dan tutup editor">✕ Batal</button>
          <div class="pe-title"><b data-pe="title"></b><span>Geser di foto: ↔ atur nilai · ↕ ganti alat · klik ganda nama alat untuk reset</span></div>
          <button type="button" class="pe-btn" data-pe="compare" title="Tahan untuk melihat foto sebelum diedit">◐ Asli</button>
          <button type="button" class="pe-btn" data-pe="reset" title="Kembalikan semua pengaturan">↺ Reset</button>
          <button type="button" class="pe-btn pe-primary" data-pe="apply">✓ Terapkan</button>
        </div>
        <div class="pe-view" data-pe="view">
          <canvas data-pe="canvas"></canvas>
          <div class="pe-hud" data-pe="hud"><span data-pe="hudName"></span><span data-pe="hudVal"></span><div class="pe-hud-bar"><i data-pe="hudFill"></i></div></div>
          <div class="pe-badge" data-pe="badge" hidden>Foto asli</div>
        </div>
      </div>
      <div class="pe-panel">
        <canvas class="pe-hist" data-pe="hist" width="256" height="84" aria-hidden="true"></canvas>
        <div class="pe-tabs" data-pe="tabs" role="tablist"></div>
        <div class="pe-body" data-pe="body"></div>
      </div>`;
    document.body.appendChild(root);
    root.querySelectorAll("[data-pe]").forEach((el) => (els[el.getAttribute("data-pe")] = el));

    const tabs = [["looks", "Looks"], ...GROUPS.map((g) => [g.id, g.label]), ["geo", "Putar"]];
    els.tabs.innerHTML = tabs.map(([id, label]) => `<button type="button" class="pe-tab" role="tab" data-tab="${id}">${label}</button>`).join("");
    els.tabs.addEventListener("click", (e) => {
      const b = e.target.closest("[data-tab]");
      if (b) setTab(b.getAttribute("data-tab"));
    });

    els.cancel.addEventListener("click", close);
    els.apply.addEventListener("click", apply);
    els.reset.addEventListener("click", () => {
      session.adj = {};
      renderBody();
      schedule();
    });
    const cmp = (on) => () => {
      if (!session || showOriginal === on) return;
      showOriginal = on;
      els.compare.classList.toggle("pe-on", on);
      els.badge.hidden = !on;
      schedule();
    };
    els.compare.addEventListener("pointerdown", cmp(true));
    ["pointerup", "pointerleave", "pointercancel", "blur"].forEach((ev) => els.compare.addEventListener(ev, cmp(false)));
    // Keyboard (klik tanpa pointer): jadi tombol toggle
    els.compare.addEventListener("click", (e) => { if (e.detail === 0) cmp(!showOriginal)(); });

    bindSwipe();

    // Tangkap tombol lebih dulu supaya pintasan kanvas utama (Delete, panah, dll.) tidak ikut jalan
    window.addEventListener("keydown", (e) => {
      if (!session) return;
      e.stopImmediatePropagation();
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "Enter" && e.target.tagName !== "BUTTON") { e.preventDefault(); apply(); }
    }, true);
  }

  function paramMeta(key) {
    if (key === "straighten") return { min: -30, max: 30, unit: "°" };
    for (const g of GROUPS) for (const p of g.params) if (p[0] === key) return { min: p[2], max: 100, unit: "" };
    return null;
  }
  const fmt = (key, v) => (v > 0 && paramMeta(key).min < 0 ? "+" : "") + v + paramMeta(key).unit;

  function rowHtml(key) {
    const m = paramMeta(key), v = session.adj[key] || 0;
    return `<div class="pe-row${key === activeKey ? " pe-on" : ""}" data-key="${key}">
      <label class="pe-row-head" for="pe_${key}" title="Klik ganda untuk reset"><span>${LABELS[key]}</span><output>${fmt(key, v)}</output></label>
      <input type="range" id="pe_${key}" min="${m.min}" max="${m.max}" step="1" value="${v}" />
    </div>`;
  }

  function setValue(key, val, fromSlider) {
    const m = paramMeta(key);
    val = Math.max(m.min, Math.min(m.max, Math.round(val)));
    if (val) session.adj[key] = val; else delete session.adj[key];
    if (PIXEL_KEYS.includes(key)) delete session.adj.look;
    const row = els.body.querySelector(`[data-key="${key}"]`);
    if (row) {
      row.querySelector("output").textContent = fmt(key, val);
      if (!fromSlider) row.querySelector("input").value = val;
    }
    schedule();
    return val;
  }

  function setActiveKey(key) {
    activeKey = key;
    els.body.querySelectorAll(".pe-row").forEach((r) => r.classList.toggle("pe-on", r.getAttribute("data-key") === key));
  }

  function renderBody() {
    const body = els.body;
    if (activeTab === "looks") {
      body.innerHTML = `<div class="pe-looks"></div><p class="pe-hint">Pilih look sebagai titik awal, lalu sempurnakan di tab Cahaya, Warna, Efek, dan Detail.</p>`;
      const grid = body.firstChild;
      const thumbSrc = process(session.prevSrc, geometryOf(session.adj), 150);
      const current = session.adj.look || (hasPixelEdits(session.adj) ? "" : "asli");
      LOOKS.forEach(([id, name, vals]) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pe-look" + (id === current ? " pe-on" : "");
        const th = process(thumbSrc, vals, 150);
        // potong tengah jadi persegi supaya grid rapi
        const sq = document.createElement("canvas");
        const s = Math.min(th.width, th.height);
        sq.width = sq.height = s;
        sq.getContext("2d").drawImage(th, (th.width - s) / 2, (th.height - s) / 2, s, s, 0, 0, s, s);
        btn.append(sq, name);
        btn.addEventListener("click", () => {
          session.adj = { ...geometryOf(session.adj), ...vals, ...(id === "asli" ? {} : { look: id }) };
          grid.querySelectorAll(".pe-look").forEach((b) => b.classList.toggle("pe-on", b === btn));
          schedule();
        });
        grid.appendChild(btn);
      });
    } else if (activeTab === "geo") {
      body.innerHTML = `<div class="pe-geo">
          <button type="button" class="pe-btn" data-geo="l">⟲ Putar kiri 90°</button>
          <button type="button" class="pe-btn" data-geo="r">⟳ Putar kanan 90°</button>
          <button type="button" class="pe-btn" data-geo="h">⇋ Balik horizontal</button>
          <button type="button" class="pe-btn" data-geo="v">⇅ Balik vertikal</button>
        </div>${rowHtml("straighten")}`;
      body.querySelectorAll("[data-geo]").forEach((b) => b.addEventListener("click", () => {
        const a = session.adj, g = b.getAttribute("data-geo");
        if (g === "l" || g === "r") {
          const rot = (((a.rot || 0) + (g === "r" ? 90 : 270)) % 360);
          if (rot) a.rot = rot; else delete a.rot;
        } else {
          const k = g === "h" ? "flipH" : "flipV";
          if (a[k]) delete a[k]; else a[k] = true;
        }
        schedule();
      }));
      setActiveKey("straighten");
    } else {
      const grp = GROUPS.find((g) => g.id === activeTab);
      if (!grp.params.some((p) => p[0] === activeKey)) activeKey = grp.params[0][0];
      body.innerHTML = grp.params.map((p) => rowHtml(p[0])).join("");
    }
    body.querySelectorAll(".pe-row").forEach((row) => {
      const key = row.getAttribute("data-key"), input = row.querySelector("input");
      input.addEventListener("input", () => { setActiveKey(key); setValue(key, +input.value, true); });
      input.addEventListener("pointerdown", () => setActiveKey(key));
      input.addEventListener("focus", () => setActiveKey(key));
      row.querySelector(".pe-row-head").addEventListener("dblclick", (e) => { e.preventDefault(); setValue(key, 0); });
    });
  }

  function setTab(id) {
    activeTab = id;
    els.tabs.querySelectorAll(".pe-tab").forEach((b) => {
      const on = b.getAttribute("data-tab") === id;
      b.classList.toggle("pe-on", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    renderBody();
  }

  function showHud(key, val) {
    const m = paramMeta(key);
    els.hudName.textContent = LABELS[key];
    els.hudVal.textContent = fmt(key, val);
    const zero = ((0 - m.min) / (m.max - m.min)) * 100, pos = ((val - m.min) / (m.max - m.min)) * 100;
    els.hudFill.style.left = Math.min(zero, pos) + "%";
    els.hudFill.style.width = Math.abs(pos - zero) + "%";
    els.hud.classList.add("pe-show");
    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => els.hud.classList.remove("pe-show"), 900);
  }

  // Gestur di foto: geser horizontal = ubah nilai alat aktif, geser vertikal = pindah alat
  function bindSwipe() {
    let g = null;
    const keysOfTab = () => (activeTab === "geo" ? ["straighten"] : (GROUPS.find((x) => x.id === activeTab) || GROUPS[0]).params.map((p) => p[0]));
    els.view.addEventListener("pointerdown", (e) => {
      if (!session || !e.isPrimary) return;
      if (activeTab === "looks") setTab("light");
      g = { x: e.clientX, y: e.clientY, axis: null, start: session.adj[activeKey] || 0, idx: keysOfTab().indexOf(activeKey) };
      els.view.setPointerCapture(e.pointerId);
      showHud(activeKey, g.start);
    });
    els.view.addEventListener("pointermove", (e) => {
      if (!g) return;
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (!g.axis) {
        if (Math.hypot(dx, dy) < 8) return;
        g.axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
      }
      if (g.axis === "x") {
        const m = paramMeta(activeKey);
        const val = setValue(activeKey, g.start + (dx / Math.max(200, els.view.clientWidth)) * (m.max - m.min) * 1.1);
        showHud(activeKey, val);
      } else {
        const keys = keysOfTab();
        const idx = Math.max(0, Math.min(keys.length - 1, g.idx + Math.round(dy / 38)));
        if (keys[idx] !== activeKey) {
          setActiveKey(keys[idx]);
          els.body.querySelector(".pe-row.pe-on")?.scrollIntoView({ block: "nearest" });
        }
        showHud(activeKey, session.adj[activeKey] || 0);
      }
    });
    const end = () => { g = null; };
    els.view.addEventListener("pointerup", end);
    els.view.addEventListener("pointercancel", end);
  }

  function drawHistogram(src) {
    const hc = els.hist, hx = hc.getContext("2d");
    const data = src.getContext("2d").getImageData(0, 0, src.width, src.height).data;
    const bins = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
    for (let i = 0; i < data.length; i += 16) { bins[0][data[i]]++; bins[1][data[i + 1]]++; bins[2][data[i + 2]]++; }
    let peak = 1;
    for (let c = 0; c < 3; c++) for (let i = 2; i < 254; i++) if (bins[c][i] > peak) peak = bins[c][i];
    hx.globalCompositeOperation = "source-over";
    hx.clearRect(0, 0, hc.width, hc.height);
    hx.globalCompositeOperation = "screen";
    ["#e5484d", "#46a758", "#3e8ee6"].forEach((col, c) => {
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
      if (!session) return;
      const out = process(session.prevSrc, showOriginal ? {} : session.adj, PREVIEW_EDGE);
      const cv = els.canvas;
      if (cv.width !== out.width || cv.height !== out.height) { cv.width = out.width; cv.height = out.height; }
      const cx = cv.getContext("2d");
      cx.clearRect(0, 0, cv.width, cv.height);
      cx.drawImage(out, 0, 0);
      drawHistogram(out);
    });
  }

  function open(opts) {
    if (!opts.img) return showToast("Foto belum siap diedit");
    if (!root) build();
    session = { title: opts.title, img: opts.img, adj: { ...(opts.adj || {}) }, onApply: opts.onApply, prevSrc: process(opts.img, {}, PREVIEW_EDGE), opener: document.activeElement };
    els.title.textContent = opts.title;
    showOriginal = false;
    els.badge.hidden = true;
    root.hidden = false;
    setTab("looks");
    schedule();
    els.apply.focus({ preventScroll: true });
  }

  function close() {
    if (!session) return;
    const opener = session.opener;
    session = null;
    root.hidden = true;
    if (opener && opener.focus) opener.focus({ preventScroll: true });
  }

  function apply() {
    if (!session) return;
    const { adj, onApply } = session;
    const result = isNeutral(adj) ? null : { ...adj };
    close();
    showToast("Menerapkan hasil edit…");
    // beri kesempatan toast tampil sebelum proses resolusi penuh
    setTimeout(() => onApply(result), 30);
  }

  // ----- Target yang bisa diedit -------------------------------------------
  const currentAdj = (obj) => (obj.adj && obj._adjSrc === (obj.origSrc || obj.src) ? obj.adj : null);

  function openSlot(idx) {
    const slot = state.slots[idx];
    if (!slot || !slot.img) return showToast("Slot ini belum berisi foto");
    state.selectedSlotIndex = idx;
    const lbl = document.getElementById("canvaActiveSlotLabel");
    if (lbl) lbl.textContent = `Mengedit: Foto Slot #${idx + 1}`;
    open({
      title: `Edit Foto · Slot #${idx + 1}`,
      img: slot.img,
      adj: currentAdj(slot),
      onApply: (adj) => {
        slot.adj = adj;
        slot._adjSrc = slot.origSrc || slot.src;
        renderCanvas();
        pushHistorySnapshot();
        renderPhotoSlotsManager();
        showToast(adj ? `Edit Foto Slot #${idx + 1} diterapkan` : `Foto Slot #${idx + 1} kembali tanpa edit`);
      }
    });
  }

  function openPip(id) {
    const pip = state.pipPhotos.find((p) => p.id === id);
    if (!pip || !pip.img) return;
    open({
      title: "Edit Foto · Stiker PIP",
      img: pip.img,
      adj: currentAdj(pip),
      onApply: (adj) => {
        pip.adj = adj;
        pip._adjSrc = pip.origSrc || pip.src;
        renderCanvas();
        showToast(adj ? "Edit foto PIP diterapkan" : "Foto PIP kembali tanpa edit");
      }
    });
  }

  // Foto Galeri: hasil edit dipanggang jadi gambar baru; aslinya disimpan supaya bisa diedit ulang
  async function openGallery(itemId) {
    const item = state.galleryItems.find((g) => g.id === itemId);
    if (!item) return;
    const srcUrl = item.origSrc || item.src;
    const img = await loadImage(srcUrl);
    open({
      title: `Edit Foto Galeri · ${item.label || "Foto"}`,
      img,
      adj: item.adj,
      onApply: (adj) => {
        if (adj) {
          const maxEdge = (window.SNEImport && SNEImport.MAX_EDGE) || BAKE_EDGE;
          const out = process(img, adj, maxEdge);
          item.origSrc = srcUrl;
          item.adj = adj;
          item.src = srcUrl.startsWith("data:image/png") ? out.toDataURL("image/png") : out.toDataURL("image/jpeg", 0.95);
        } else {
          item.src = srcUrl;
          item.adj = null;
        }
        renderStudioGalleryGrid();
        showToast(adj ? "Foto Galeri diperbarui. Klik Pakai untuk memasangnya." : "Foto Galeri kembali ke asli");
      }
    });
  }

  window.SNEEditor = { open, openSlot, openPip, openGallery, isOpen: () => !!session };

  // ===========================================================================
  // KETUK FOTO DI KANVAS -> LANGSUNG BUKA EDITOR
  // Hanya ketukan singkat tanpa geser; menggeser tetap berarti pan/drag seperti biasa.
  // ===========================================================================
  let tap = null;
  canvas.addEventListener("pointerdown", (e) => {
    tap = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
  });
  canvas.addEventListener("pointerup", (e) => {
    if (!tap || !e.isPrimary) return;
    const moved = Math.hypot(e.clientX - tap.x, e.clientY - tap.y), dt = performance.now() - tap.t;
    tap = null;
    if (moved > 6 || dt > 400) return;
    const { x, y } = getCanvasCoords(e);
    if (findHitLayer(x, y) || checkActiveLayerHandleHit(x, y)) return; // itu teks, bukan foto
    const pip = findHitPipPhoto(x, y);
    if (pip) return openPip(pip.id);
    openSlot(findHitSlotIndex(x, y));
  });
  canvas.addEventListener("pointercancel", () => { tap = null; });
})();
