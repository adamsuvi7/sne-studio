// SNE Video — tipografi Studio Foto untuk video.
// Renderer lapisan teks di-port dari renderAllLayers() index.html (huruf berjarak, teks melengkung, 3D extrude,
// pill solid/outline/frosted/pin lokasi, dekor bintang/matahari/kurung, gradasi, garis bawah) supaya template
// tampil sama persis dengan di Studio Foto. Satuan lapisan sama: x,y = pecahan kanvas; fontSize dll. = piksel pada lebar 1080.
(function () {
  "use strict";

  function roundRectPath(ctx, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }
  function star4(ctx, cx, cy, radius, fill, stroke, strokeW) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 === 0 ? radius : radius * 0.26, a = (i * Math.PI) / 4;
      i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (strokeW > 0) { ctx.lineWidth = strokeW; ctx.strokeStyle = stroke; ctx.stroke(); }
    ctx.restore();
  }
  function popSun(ctx, cx, cy, r) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI * 2) / 12;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85);
      ctx.quadraticCurveTo(Math.cos(a - 0.15) * r * 1.25, Math.sin(a - 0.15) * r * 1.25, Math.cos(a + 0.12) * r * 1.55, Math.sin(a + 0.12) * r * 1.55);
      ctx.lineWidth = r * 0.22; ctx.strokeStyle = "#050505"; ctx.stroke();
      ctx.lineWidth = r * 0.09; ctx.strokeStyle = "#7DD3FC"; ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.88, 0, Math.PI * 2);
    ctx.fillStyle = "#7DD3FC"; ctx.fill();
    ctx.lineWidth = r * 0.22; ctx.strokeStyle = "#050505"; ctx.stroke();
    ctx.restore();
  }
  function decorations(ctx, L, boxW, boxH, k) {
    if (!L.decor || L.decor === "none") return;
    if (L.decor === "sparkles") {
      [[0.52, -0.36, 32], [0.62, -0.14, 16], [-0.46, 0.38, 24]].forEach(([dx, dy, s]) =>
        star4(ctx, boxW * dx, boxH * dy, s * k, "#FACC15", "#000000", L.strokeWidth > 0 ? 3 * k : 0));
    } else if (L.decor === "sunburst") {
      popSun(ctx, boxW * 0.34, -boxH * 0.25, 52 * k);
      popSun(ctx, -boxW * 0.36, boxH * 0.25, 48 * k);
    } else if (L.decor === "brackets") {
      const bw = boxW * 0.6 + 24 * k, bh = boxH * 0.6 + 18 * k, len = 18 * k;
      ctx.save();
      ctx.strokeStyle = L.color || "#FFFFFF";
      ctx.lineWidth = 3 * k;
      ctx.beginPath();
      ctx.moveTo(-bw, -bh + len); ctx.lineTo(-bw, -bh); ctx.lineTo(-bw + len, -bh);
      ctx.moveTo(bw - len, -bh); ctx.lineTo(bw, -bh); ctx.lineTo(bw, -bh + len);
      ctx.moveTo(-bw, bh - len); ctx.lineTo(-bw, bh); ctx.lineTo(-bw + len, bh);
      ctx.moveTo(bw - len, bh); ctx.lineTo(bw, bh); ctx.lineTo(bw, bh - len);
      ctx.stroke();
      ctx.restore();
    }
  }
  function measureSpaced(ctx, str, sp) {
    if (!str) return 0;
    const ch = Array.from(str);
    let t = 0;
    ch.forEach((c) => { t += ctx.measureText(c).width; });
    return t + (ch.length > 1 ? sp * (ch.length - 1) : 0);
  }
  function drawSpaced(ctx, str, x, y, sp, stroke) {
    const ch = Array.from(str);
    if (sp === 0 && ch.length) { stroke ? ctx.strokeText(str, x, y) : ctx.fillText(str, x, y); return; }
    const w = measureSpaced(ctx, str, sp);
    let cx = ctx.textAlign === "left" ? x : ctx.textAlign === "right" ? x - w : x - w / 2;
    const prev = ctx.textAlign;
    ctx.textAlign = "left";
    ch.forEach((c) => { stroke ? ctx.strokeText(c, cx, y) : ctx.fillText(c, cx, y); cx += ctx.measureText(c).width + sp; });
    ctx.textAlign = prev;
  }
  function drawCurved(ctx, str, curve, fs, sp, stroke) {
    const ch = Array.from(str);
    if (!ch.length) return;
    const cw = ch.map((c) => ctx.measureText(c).width + sp);
    const arc = Math.max(1, cw.reduce((a, b) => a + b, 0));
    const total = Math.max(0.08, (Math.abs(curve) / 100) * Math.PI * 0.78);
    const R = Math.max(fs * 1.6, arc / total);
    ctx.save();
    const prev = ctx.textAlign;
    ctx.textAlign = "center";
    const up = curve > 0;
    ctx.translate(0, up ? R : -R);
    let a = up ? -total / 2 : total / 2;
    ch.forEach((c, i) => {
      const da = (cw[i] / arc) * total;
      ctx.save();
      ctx.rotate(up ? a + da / 2 : a - da / 2);
      stroke ? ctx.strokeText(c, 0, up ? -R : R) : ctx.fillText(c, 0, up ? -R : R);
      ctx.restore();
      a += up ? da : -da;
    });
    ctx.textAlign = prev;
    ctx.restore();
  }

  // Gambar satu lapisan. ctx sudah di-translate ke (x,y) lapisan dan diputar. k = skala (lebar kanvas / 1080).
  // chars (0..1) untuk animasi mesin ketik. Hasil: kotak batas lokal {cx, cy, w, h}.
  function drawLayer(ctx, L, k, chars = 1) {
    let str = L.uppercase ? (L.text || "").toUpperCase() : L.text || "";
    if (chars < 1) str = Array.from(str).slice(0, Math.floor(Array.from(str).length * chars)).join("");
    const lines = str.split("\n");
    const fs = Math.max(1, Math.round((L.fontSize || 40) * k));
    const sp = (L.letterSpacing || 0) * k, strokeW = (L.strokeWidth || 0) * k, shadowB = (L.shadowBlur || 0) * k, extr = (L.extrudeDepth || 0) * k;
    ctx.font = `${L.fontStyle || "normal"} ${L.fontWeight || "700"} ${fs}px "${L.fontFamily || "Plus Jakarta Sans"}", sans-serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = L.align || "center";
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    let maxW = 0;
    const widths = lines.map((ln) => { const w = measureSpaced(ctx, ln, sp); if (w > maxW) maxW = w; return w; });
    const step = fs * (L.lineHeight || 1.1), totalH = step * lines.length;
    let ox = L.align === "left" ? maxW / 2 : L.align === "right" ? -maxW / 2 : 0;
    const box = { cx: ox, cy: 0, w: Math.max(40 * k, maxW + 46 * k), h: Math.max(30 * k, totalH + 36 * k) };
    const pin = L.bgPill && L.bgPillStyle === "locpin";

    if (L.bgPill) {
      const padX = (L.bgPillPad || 14) * 1.65 * k, padY = (L.bgPillPad || 14) * 0.85 * k;
      const extraPin = pin ? fs * 1.15 : 0;
      const pw = maxW + padX * 2 + extraPin, ph = totalH + padY * 2;
      let px = -pw / 2;
      if (L.align === "left") px = -padX;
      else if (L.align === "right") px = -maxW - padX - extraPin;
      const py = -ph / 2;
      ctx.save();
      if (shadowB > 0) { ctx.shadowColor = "rgba(0,0,0,0.38)"; ctx.shadowBlur = shadowB; ctx.shadowOffsetY = 4 * k; }
      roundRectPath(ctx, px, py, pw, ph, (L.bgPillRadius ?? 20) * k);
      if (L.bgPillStyle === "frosted") {
        ctx.fillStyle = "rgba(255,255,255,0.26)"; ctx.fill();
        ctx.lineWidth = 1.5 * k; ctx.strokeStyle = "rgba(255,255,255,0.45)"; ctx.stroke();
      } else if (L.bgPillStyle === "outline") {
        ctx.lineWidth = 2.5 * k; ctx.strokeStyle = L.bgPillColor || "#FFFFFF"; ctx.stroke();
      } else { ctx.fillStyle = L.bgPillColor || "#FFFFFF"; ctx.fill(); }
      ctx.restore();
      if (pin) {
        const pinX = px + padX * 0.95, r = fs * 0.34;
        ctx.save();
        ctx.fillStyle = "#EC4899";
        ctx.beginPath(); ctx.arc(pinX, -r * 0.25, r, Math.PI, 0, false); ctx.lineTo(pinX, r * 1.35); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath(); ctx.arc(pinX, -r * 0.25, r * 0.38, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      box.cx = px + pw / 2; box.w = Math.max(box.w, pw + 12 * k); box.h = Math.max(box.h, ph + 12 * k);
    }
    if (L.decor === "sunburst") decorations(ctx, L, maxW, totalH, k);
    if (shadowB > 0 && !L.bgPill) { ctx.shadowColor = L.shadowColor || "#000000"; ctx.shadowBlur = shadowB; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 4 * k; }
    else ctx.shadowBlur = 0;
    ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.miterLimit = 2;
    const tx = pin ? fs * 0.45 : 0;
    let fill = L.color || "#FFFFFF";
    if (L.gradientEnabled) {
      let g = [0, -totalH / 2, 0, totalH / 2];
      if (L.gradientDir === "horizontal") g = [-maxW / 2, 0, maxW / 2, 0];
      else if (L.gradientDir === "diagonal") g = [-maxW / 2, -totalH / 2, maxW / 2, totalH / 2];
      const gr = ctx.createLinearGradient(g[0], g[1], g[2], g[3]);
      gr.addColorStop(0, L.color || "#FFFFFF");
      gr.addColorStop(1, L.color2 || "#F97316");
      fill = gr;
    }
    if (L.curve && Math.abs(L.curve) > 2) {
      const one = lines.join(" ");
      if (strokeW > 0) { ctx.lineWidth = strokeW; ctx.strokeStyle = L.strokeColor || "#000000"; drawCurved(ctx, one, L.curve, fs, sp, true); }
      ctx.fillStyle = fill;
      drawCurved(ctx, one, L.curve, fs, sp, false);
      const arcW = measureSpaced(ctx, one, sp);
      box.cx = 0; box.w = Math.max(box.w, Math.min(arcW, fs * 12) + 46 * k); box.h = Math.max(box.h, fs * 2 + Math.abs(L.curve) / 100 * arcW * 0.35);
    } else {
      const y0 = -((lines.length - 1) * step) / 2;
      if (extr > 0) {
        ctx.save();
        ctx.shadowBlur = 0;
        ctx.fillStyle = L.extrudeColor || "#1E1B4B";
        const n = Math.min(24, Math.max(2, Math.round(extr)));
        for (let s = n; s >= 1; s--) {
          const o = (s / n) * extr * 0.75;
          lines.forEach((ln, i) => drawSpaced(ctx, ln, tx + o, y0 + i * step + o, sp, false));
        }
        ctx.restore();
      }
      if (strokeW > 0) {
        ctx.save();
        ctx.lineWidth = strokeW;
        ctx.strokeStyle = L.strokeColor || "#000000";
        lines.forEach((ln, i) => drawSpaced(ctx, ln, tx, y0 + i * step, sp, true));
        ctx.restore();
      }
      ctx.save();
      if (strokeW > 0 || extr > 0) { ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }
      ctx.fillStyle = fill;
      lines.forEach((ln, i) => {
        const ly = y0 + i * step;
        drawSpaced(ctx, ln, tx, ly, sp, false);
        if (L.underline) {
          const lw = widths[i];
          const ux = L.align === "left" ? tx : L.align === "right" ? tx - lw : tx - lw / 2;
          ctx.fillRect(ux, ly + fs * 0.48, lw, Math.max(2, fs * 0.07));
        }
      });
      ctx.restore();
    }
    if (L.decor === "sparkles" || L.decor === "brackets") decorations(ctx, L, maxW, totalH, k);
    ctx.shadowBlur = 0;
    return box;
  }

  // ---------- template baru khusus video ----------
  const B = { fontStyle: "normal", underline: false, uppercase: false, opacity: 100, align: "center", letterSpacing: 0, lineHeight: 1.05, rotation: 0, curve: 0, strokeWidth: 0, strokeColor: "#000000", shadowBlur: 10, shadowColor: "#000000", decor: "none", bgPill: false, bgPillColor: "#FFFFFF", bgPillStyle: "solid", bgPillPad: 12, bgPillRadius: 18 };
  const L = (o) => Object.assign({}, B, o);
  const T = (id, name, sub, cat, layers) => ({ id, name, sub, cat, layers: layers.map(L) });
  const EXTRA = [
    T("v-vlog", "Judul Vlog", "Judul tebal + tanggal", "Vlog", [
      L({ role: "Hari", text: "DAY 01", x: 0.5, y: 0.36, fontFamily: "Montserrat", fontSize: 30, fontWeight: "800", letterSpacing: 8, color: "#FFFFFF", bgPill: true, bgPillColor: "#B42318", bgPillPad: 10, bgPillRadius: 30, shadowBlur: 0 }),
      L({ role: "Judul", text: "Weekend\nin Bandung", x: 0.5, y: 0.45, fontFamily: "Playfair Display", fontSize: 104, fontWeight: "900", fontStyle: "italic", color: "#FFFFFF", lineHeight: 0.95, shadowBlur: 22 }),
      L({ role: "Tanggal", text: "12 · 11 · 2026", x: 0.5, y: 0.56, fontFamily: "Plus Jakarta Sans", fontSize: 26, fontWeight: "600", letterSpacing: 4, color: "#F5F5F4", shadowBlur: 10 })
    ]),
    T("v-lower", "Lower Third", "Nama + peran di bawah", "Bisnis", [
      L({ role: "Nama", text: "Rina Putri", x: 0.08, y: 0.80, align: "left", fontFamily: "Montserrat", fontSize: 54, fontWeight: "800", color: "#171717", bgPill: true, bgPillColor: "#FFFFFF", bgPillPad: 12, bgPillRadius: 10, shadowBlur: 12 }),
      L({ role: "Peran", text: "FOUNDER · SNE STUDIO", x: 0.08, y: 0.845, align: "left", fontFamily: "Plus Jakarta Sans", fontSize: 24, fontWeight: "800", letterSpacing: 3, color: "#FFFFFF", bgPill: true, bgPillColor: "#B42318", bgPillPad: 8, bgPillRadius: 8, shadowBlur: 0 })
    ]),
    T("v-quote", "Kutipan", "Tanda kutip besar + serif", "Kutipan", [
      L({ role: "Tanda kutip", text: "“", x: 0.5, y: 0.34, fontFamily: "Playfair Display", fontSize: 220, fontWeight: "900", color: "#FACC15", shadowBlur: 0 }),
      L({ role: "Kutipan", text: "Pelan-pelan saja,\nyang penting\nsampai.", x: 0.5, y: 0.47, fontFamily: "Playfair Display", fontSize: 70, fontWeight: "700", fontStyle: "italic", color: "#FFFFFF", lineHeight: 1.12, shadowBlur: 18 }),
      L({ role: "Penulis", text: "— catatan perjalanan", x: 0.5, y: 0.6, fontFamily: "Plus Jakarta Sans", fontSize: 26, fontWeight: "600", color: "#E7E5E4", letterSpacing: 1 })
    ]),
    T("v-sale", "Promo Diskon", "Angka 3D + label", "Promo", [
      L({ role: "Label", text: "FLASH SALE", x: 0.5, y: 0.33, fontFamily: "Montserrat", fontSize: 40, fontWeight: "900", letterSpacing: 6, color: "#171717", bgPill: true, bgPillColor: "#FACC15", bgPillPad: 12, bgPillRadius: 12, shadowBlur: 0 }),
      L({ role: "Diskon", text: "50%", x: 0.5, y: 0.45, fontFamily: "Archivo Black", fontSize: 260, fontWeight: "400", color: "#FFFFFF", extrudeDepth: 22, extrudeColor: "#B42318", shadowBlur: 0, decor: "sparkles", strokeWidth: 0 }),
      L({ role: "Keterangan", text: "hanya hari ini · stok terbatas", x: 0.5, y: 0.58, fontFamily: "Plus Jakarta Sans", fontSize: 30, fontWeight: "700", color: "#FFFFFF", shadowBlur: 12 })
    ]),
    T("v-soon", "Segera Hadir", "Teaser peluncuran", "Promo", [
      L({ role: "Atas", text: "COMING", x: 0.5, y: 0.43, fontFamily: "Bebas Neue", fontSize: 170, fontWeight: "400", letterSpacing: 14, color: "#FFFFFF", shadowBlur: 16 }),
      L({ role: "Bawah", text: "soon", x: 0.5, y: 0.51, fontFamily: "Great Vibes", fontSize: 150, fontWeight: "400", color: "#FACC15", shadowBlur: 18, rotation: -6 }),
      L({ role: "Tanggal", text: "01.12.2026", x: 0.5, y: 0.6, fontFamily: "Montserrat", fontSize: 28, fontWeight: "700", letterSpacing: 6, color: "#FFFFFF", bgPill: true, bgPillStyle: "outline", bgPillColor: "#FFFFFF", bgPillPad: 10, bgPillRadius: 30, shadowBlur: 0 })
    ]),
    T("v-recipe", "Resep", "Judul + daftar bahan", "Kuliner", [
      L({ role: "Judul", text: "Nasi Goreng\nKampung", x: 0.08, y: 0.2, align: "left", fontFamily: "Lobster", fontSize: 92, fontWeight: "400", color: "#FFFFFF", lineHeight: 1, shadowBlur: 18 }),
      L({ role: "Bahan", text: "• 2 piring nasi\n• 3 siung bawang\n• 1 butir telur\n• kecap & cabai", x: 0.08, y: 0.36, align: "left", fontFamily: "Plus Jakarta Sans", fontSize: 32, fontWeight: "700", color: "#FFFFFF", lineHeight: 1.35, bgPill: true, bgPillStyle: "frosted", bgPillPad: 16, bgPillRadius: 22, shadowBlur: 0 }),
      L({ role: "Waktu", text: "15 MENIT", x: 0.92, y: 0.2, align: "right", fontFamily: "Montserrat", fontSize: 26, fontWeight: "800", color: "#171717", bgPill: true, bgPillColor: "#FACC15", bgPillPad: 8, bgPillRadius: 30, shadowBlur: 0 })
    ]),
    T("v-travel", "Travel Diary", "Script + pin lokasi", "Vlog", [
      L({ role: "Judul", text: "Hello, Bali", x: 0.5, y: 0.2, fontFamily: "Sacramento", fontSize: 150, fontWeight: "400", color: "#FFFFFF", shadowBlur: 20 }),
      L({ role: "Lokasi", text: "Uluwatu, Bali", x: 0.5, y: 0.275, fontFamily: "Plus Jakarta Sans", fontSize: 28, fontWeight: "700", color: "#171717", bgPill: true, bgPillStyle: "locpin", bgPillColor: "#FFFFFF", bgPillPad: 10, bgPillRadius: 30, shadowBlur: 10 })
    ]),
    T("v-review", "Review Produk", "Bintang + nama produk", "Promo", [
      L({ role: "Bintang", text: "★★★★★", x: 0.5, y: 0.66, fontFamily: "Plus Jakarta Sans", fontSize: 64, fontWeight: "800", color: "#FACC15", letterSpacing: 6, shadowBlur: 10 }),
      L({ role: "Produk", text: "Serum Glow 30ml", x: 0.5, y: 0.725, fontFamily: "Montserrat", fontSize: 50, fontWeight: "900", color: "#FFFFFF", shadowBlur: 16 }),
      L({ role: "Ulasan", text: "\"Kulit lebih cerah dalam 7 hari\"", x: 0.5, y: 0.775, fontFamily: "Plus Jakarta Sans", fontSize: 28, fontWeight: "600", fontStyle: "italic", color: "#F5F5F4", shadowBlur: 10 })
    ]),
    T("v-ba", "Before / After", "Label perbandingan", "Tutorial", [
      L({ role: "Sebelum", text: "BEFORE", x: 0.25, y: 0.08, fontFamily: "Montserrat", fontSize: 38, fontWeight: "900", letterSpacing: 4, color: "#FFFFFF", bgPill: true, bgPillColor: "#171717", bgPillPad: 10, bgPillRadius: 10, shadowBlur: 0 }),
      L({ role: "Sesudah", text: "AFTER", x: 0.75, y: 0.08, fontFamily: "Montserrat", fontSize: 38, fontWeight: "900", letterSpacing: 4, color: "#FFFFFF", bgPill: true, bgPillColor: "#B42318", bgPillPad: 10, bgPillRadius: 10, shadowBlur: 0 })
    ]),
    T("v-neon", "Neon Malam", "Cahaya neon menyala", "Gaya", [
      L({ role: "Neon", text: "Open\nLate", x: 0.5, y: 0.45, fontFamily: "Yellowtail", fontSize: 170, fontWeight: "400", color: "#FDF2F8", shadowColor: "#EC4899", shadowBlur: 46, lineHeight: 0.95 }),
      L({ role: "Sub", text: "EVERY FRIDAY", x: 0.5, y: 0.585, fontFamily: "Righteous", fontSize: 40, fontWeight: "400", letterSpacing: 10, color: "#E0F2FE", shadowColor: "#38BDF8", shadowBlur: 34 })
    ]),
    T("v-step", "Langkah Tutorial", "STEP + instruksi", "Tutorial", [
      L({ role: "Langkah", text: "STEP 1", x: 0.08, y: 0.12, align: "left", fontFamily: "Montserrat", fontSize: 34, fontWeight: "900", letterSpacing: 3, color: "#FFFFFF", bgPill: true, bgPillColor: "#B42318", bgPillPad: 10, bgPillRadius: 12, shadowBlur: 0 }),
      L({ role: "Instruksi", text: "Bersihkan wajah\ndengan air hangat", x: 0.08, y: 0.19, align: "left", fontFamily: "Plus Jakarta Sans", fontSize: 50, fontWeight: "800", color: "#FFFFFF", lineHeight: 1.1, shadowBlur: 18 })
    ]),
    T("v-bday", "Ulang Tahun", "Ucapan + bintang", "Momen", [
      L({ role: "Ucapan", text: "Happy\nBirthday!", x: 0.5, y: 0.42, fontFamily: "Fredoka", fontSize: 140, fontWeight: "700", color: "#FFFFFF", strokeWidth: 10, strokeColor: "#EC4899", extrudeDepth: 10, extrudeColor: "#9D174D", lineHeight: 0.95, decor: "sparkles", shadowBlur: 0 }),
      L({ role: "Nama", text: "untuk Nadia ♡", x: 0.5, y: 0.555, fontFamily: "Caveat", fontSize: 70, fontWeight: "700", color: "#FFFFFF", shadowBlur: 14 })
    ]),
    T("v-follow", "Ajakan Follow", "CTA akhir video", "Bisnis", [
      L({ role: "Ajakan", text: "Jangan lupa", x: 0.5, y: 0.8, fontFamily: "Caveat", fontSize: 64, fontWeight: "700", color: "#FFFFFF", shadowBlur: 14 }),
      L({ role: "Akun", text: "FOLLOW @snestudio", x: 0.5, y: 0.86, fontFamily: "Montserrat", fontSize: 44, fontWeight: "900", letterSpacing: 2, color: "#FFFFFF", bgPill: true, bgPillStyle: "outline", bgPillColor: "#FFFFFF", bgPillPad: 14, bgPillRadius: 40, shadowBlur: 10 })
    ]),
    T("v-news", "Breaking News", "Label merah + judul", "Bisnis", [
      L({ role: "Label", text: "BREAKING", x: 0.06, y: 0.72, align: "left", fontFamily: "Oswald", fontSize: 40, fontWeight: "700", letterSpacing: 4, color: "#FFFFFF", bgPill: true, bgPillColor: "#DC2626", bgPillPad: 8, bgPillRadius: 4, shadowBlur: 0 }),
      L({ role: "Judul", text: "Kafe baru buka di Blok M,\nantrean sampai sore", x: 0.06, y: 0.79, align: "left", fontFamily: "Oswald", fontSize: 50, fontWeight: "700", color: "#171717", lineHeight: 1.1, bgPill: true, bgPillColor: "#FFFFFF", bgPillPad: 12, bgPillRadius: 4, shadowBlur: 0 })
    ]),
    T("v-date", "Tanggal Minimal", "Hari & tanggal", "Gaya", [
      L({ role: "Hari", text: "Kamis", x: 0.5, y: 0.12, fontFamily: "Cinzel", fontSize: 44, fontWeight: "700", letterSpacing: 10, color: "#FFFFFF", shadowBlur: 10 }),
      L({ role: "Tanggal", text: "12", x: 0.5, y: 0.19, fontFamily: "Playfair Display", fontSize: 130, fontWeight: "900", color: "#FFFFFF", shadowBlur: 16 }),
      L({ role: "Bulan", text: "NOVEMBER 2026", x: 0.5, y: 0.255, fontFamily: "Plus Jakarta Sans", fontSize: 24, fontWeight: "700", letterSpacing: 8, color: "#E7E5E4", underline: true })
    ]),
    T("v-motiv", "Motivasi", "Kata besar bertumpuk", "Kutipan", [
      L({ role: "Baris 1", text: "JUST", x: 0.5, y: 0.37, fontFamily: "Anton", fontSize: 170, fontWeight: "400", color: "#FFFFFF", shadowBlur: 12, letterSpacing: 4 }),
      L({ role: "Baris 2", text: "KEEP", x: 0.5, y: 0.46, fontFamily: "Anton", fontSize: 170, fontWeight: "400", color: "transparent", strokeWidth: 5, strokeColor: "#FFFFFF", shadowBlur: 0, letterSpacing: 4 }),
      L({ role: "Baris 3", text: "GOING", x: 0.5, y: 0.55, fontFamily: "Anton", fontSize: 170, fontWeight: "400", color: "#FACC15", shadowBlur: 12, letterSpacing: 4 })
    ]),
    T("v-arch", "Judul Melengkung", "Teks melengkung + sub", "Gaya", [
      L({ role: "Lengkung", text: "SUMMER TRIP 2026", x: 0.5, y: 0.3, fontFamily: "Shrikhand", fontSize: 76, fontWeight: "400", color: "#FDE68A", curve: 55, strokeWidth: 6, strokeColor: "#7C2D12", shadowBlur: 0 }),
      L({ role: "Sub", text: "pantai · matahari · teman", x: 0.5, y: 0.37, fontFamily: "Plus Jakarta Sans", fontSize: 30, fontWeight: "700", color: "#FFFFFF", shadowBlur: 12 })
    ]),
    T("v-pod", "Podcast", "Judul episode + tamu", "Bisnis", [
      L({ role: "Episode", text: "EPS. 12", x: 0.5, y: 0.1, fontFamily: "Syne", fontSize: 30, fontWeight: "800", letterSpacing: 6, color: "#171717", bgPill: true, bgPillColor: "#A7F3D0", bgPillPad: 10, bgPillRadius: 30, shadowBlur: 0 }),
      L({ role: "Judul", text: "Ngobrolin\nBisnis Kecil", x: 0.5, y: 0.18, fontFamily: "Syne", fontSize: 84, fontWeight: "800", color: "#FFFFFF", lineHeight: 0.98, shadowBlur: 16 }),
      L({ role: "Tamu", text: "bersama @tamu_kita", x: 0.5, y: 0.26, fontFamily: "Plus Jakarta Sans", fontSize: 28, fontWeight: "600", color: "#E7E5E4", decor: "brackets", shadowBlur: 8 })
    ])
  ];
  // Teks satu lapis bergaya Studio Foto (titik awal untuk membuat sendiri)
  const BLANK = T("v-blank", "Teks Studio", "1 lapis, semua efek", "Dasar", [
    L({ role: "Teks", text: "Ketik teksmu", x: 0.5, y: 0.5, fontFamily: "Montserrat", fontSize: 80, fontWeight: "800", color: "#FFFFFF", shadowBlur: 14 })
  ]);

  function all() {
    const photo = window.SNE_PHOTO_TEMPLATES || [];
    return [BLANK, ...EXTRA, ...photo];
  }
  function fontsOf(tpl) { return [...new Set(tpl.layers.map((l) => l.fontFamily || "Plus Jakarta Sans"))]; }

  // Gambar mini template (tanpa foto) untuk kartu pilihan
  function thumb(tpl, w, h) {
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#3a3a37"); g.addColorStop(1, "#1c1c1b");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const k = Math.min(w / 1080, h / 1350);
    tpl.layers.forEach((l) => {
      ctx.save();
      ctx.globalAlpha = (l.opacity ?? 100) / 100;
      ctx.translate(l.x * w, l.y * h);
      if (l.rotation) ctx.rotate((l.rotation * Math.PI) / 180);
      drawLayer(ctx, l, k);
      ctx.restore();
    });
    return cv;
  }

  window.SNETypo = { drawLayer, all, fontsOf, thumb, BLANK, layerDefaults: B };
})();
