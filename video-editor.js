// SNE Video — editor video di browser (halaman video.html).
// Semua diproses di perangkat: tidak ada unggahan ke server.
// Struktur: P (proyek: klip + trek) -> renderFrame() menggambar satu frame pada waktu t.
// Pratinjau memutar elemen <video>/<audio> per klip (disinkronkan ke jam utama);
// ekspor (video-export.js) memakai renderFrame() + prepareFrame() frame demi frame dan renderAudio() offline.
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const fmtT = (s) => {
    s = Math.max(0, s || 0);
    const m = Math.floor(s / 60);
    return String(m).padStart(2, "0") + ":" + (s - m * 60).toFixed(1).padStart(4, "0");
  };
  const easeOut = (p) => 1 - Math.pow(1 - p, 3);
  const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const backOut = (p) => 1 + 2.7 * Math.pow(p - 1, 3) + 1.7 * Math.pow(p - 1, 2);
  const MIN_DUR = 0.1;
  const PAD = 14; // jarak kiri timeline (px)

  let toastTimer = 0;
  function showToast(msg, ms = 2800) {
    const el = $("vToast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), ms);
  }
  window.showToast = showToast; // photo-import.js memakainya

  // ======================================================================
  // 1. KATALOG: rasio, font, filter, efek, transisi, animasi, suara
  // ======================================================================
  const ASPECTS = { "9:16": [1080, 1920], "4:5": [1080, 1350], "1:1": [1080, 1080], "3:4": [1080, 1440], "16:9": [1920, 1080] };

  // [nama, bobot yang diminta ke Google Fonts (null = hanya 400)]
  const FONTS = [
    ["Plus Jakarta Sans", "400;700;800"], ["Montserrat", "400;700;900"], ["Poppins", "400;700;900"], ["Inter", "400;700;900"],
    ["Bebas Neue", null], ["Anton", null], ["Oswald", "400;700"], ["Archivo Black", null], ["Bangers", null], ["Luckiest Guy", null],
    ["Righteous", null], ["Lobster", null], ["Pacifico", null], ["Dancing Script", "400;700"], ["Great Vibes", null], ["Satisfy", null],
    ["Caveat", "400;700"], ["Permanent Marker", null], ["Shadows Into Light", null], ["Playfair Display", "400;700;900"],
    ["DM Serif Display", null], ["Abril Fatface", null], ["Cinzel", "400;700;900"], ["Lora", "400;700"], ["Merriweather", "400;700;900"],
    ["Space Grotesk", "400;700"], ["Syne", "400;700;800"], ["Unbounded", "400;700;900"], ["Rubik", "400;700;900"], ["Nunito", "400;700;900"],
    ["Quicksand", "400;700"], ["Comfortaa", "400;700"], ["Fredoka", "400;700"], ["Baloo 2", "400;700;800"], ["Black Ops One", null],
    ["Press Start 2P", null], ["VT323", null], ["Monoton", null], ["Bungee", null], ["Russo One", null], ["Teko", "400;700"],
    ["Kanit", "400;700;900"], ["Barlow Condensed", "400;700;900"], ["Alfa Slab One", null], ["Sacramento", null], ["Kaushan Script", null],
    ["Yellowtail", null], ["Amatic SC", "400;700"], ["Gloria Hallelujah", null], ["Rock Salt", null], ["Special Elite", null],
    ["Courier Prime", "400;700"], ["Roboto", "400;700;900"], ["Open Sans", "400;700;800"], ["Lexend", "400;700;900"], ["Outfit", "400;700;900"],
    ["Sora", "400;700;800"], ["Manrope", "400;700;800"], ["Bricolage Grotesque", "400;700;800"], ["Chakra Petch", "400;700"]
  ];
  const fontLoads = new Map();
  function loadFont(name) {
    if (fontLoads.has(name)) return fontLoads.get(name);
    const def = FONTS.find((f) => f[0] === name);
    const fam = encodeURIComponent(name).replace(/%20/g, "+");
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${fam}${def && def[1] ? ":wght@" + def[1] : ""}&display=swap`;
    const p = new Promise((resolve) => {
      link.onload = () => {
        Promise.all([document.fonts.load(`400 40px "${name}"`), document.fonts.load(`700 40px "${name}"`)])
          .catch(() => {}).then(() => { requestRender(); resolve(); });
      };
      link.onerror = () => resolve();
    });
    document.head.appendChild(link);
    fontLoads.set(name, p);
    return p;
  }

  // Filter warna: b=kecerahan, c=kontras, s=saturasi, h=hue (derajat), sep, gray, tint=[r,g,b,alpha] (soft-light)
  const LOOKS = [
    ["none", "Asli", {}],
    ["vivid", "Hidup", { s: 0.35, c: 0.1 }],
    ["warm", "Hangat", { s: 0.08, tint: [255, 140, 50, 0.22] }],
    ["cool", "Sejuk", { tint: [50, 130, 255, 0.22] }],
    ["golden", "Golden Hour", { b: 0.03, s: 0.15, tint: [255, 170, 40, 0.28] }],
    ["teal", "Sinematik", { c: 0.14, s: 0.05, tint: [0, 120, 140, 0.24] }],
    ["film", "Film", { c: 0.06, s: -0.12, sep: 0.12, tint: [30, 90, 80, 0.12] }],
    ["vintage", "Vintage", { c: -0.05, s: -0.15, sep: 0.35, tint: [255, 200, 120, 0.14] }],
    ["fade", "Pudar", { b: 0.05, c: -0.2, s: -0.2 }],
    ["pastel", "Pastel", { b: 0.06, c: -0.1, tint: [255, 170, 200, 0.2] }],
    ["moody", "Moody", { b: -0.1, c: 0.22, s: -0.28 }],
    ["bw", "Hitam Putih", { gray: 1, c: 0.15 }],
    ["noir", "Noir", { gray: 1, c: 0.4, b: -0.08 }],
    ["retro", "Retro", { sep: 0.2, h: -10, s: 0.2, tint: [255, 80, 120, 0.1] }],
    ["neon", "Neon", { s: 0.5, c: 0.15, tint: [140, 60, 255, 0.18] }],
    ["food", "Kuliner", { s: 0.28, b: 0.04, tint: [255, 140, 40, 0.1] }],
    ["glow", "Wajah Cerah", { b: 0.09, c: -0.06, s: 0.05, tint: [255, 190, 180, 0.12] }],
    ["night", "Malam", { b: -0.05, s: -0.1, tint: [40, 60, 160, 0.24] }],
    ["sunset", "Senja", { s: 0.2, c: 0.05, tint: [255, 90, 60, 0.22] }],
    ["forest", "Hutan", { s: 0.1, h: 8, tint: [40, 140, 60, 0.18] }]
  ];
  const LOOK_MAP = Object.fromEntries(LOOKS.map((l) => [l[0], l]));

  const EFFECTS = [
    ["none", "Tanpa Efek"], ["shake", "Getar"], ["glitch", "Glitch"], ["rgb", "RGB Split"], ["flash", "Kilat"],
    ["strobe", "Strobo"], ["pulse", "Denyut"], ["kenburns", "Zoom Lambat"], ["vhs", "VHS"], ["mirror", "Cermin"],
    ["dream", "Kabur Mimpi"], ["leak", "Bocor Cahaya"], ["snow", "Salju"], ["bars", "Bar Sinematik"], ["grainfx", "Film Lama"], ["zoomblur", "Zoom Kejut"]
  ];
  const TRANSITIONS = [
    ["none", "Tanpa"], ["fade", "Larut"], ["black", "Hitam"], ["white", "Kilat Putih"], ["slideL", "Geser Kiri"], ["slideR", "Geser Kanan"],
    ["slideU", "Geser Atas"], ["push", "Dorong"], ["zoomIn", "Zoom Masuk"], ["zoomOut", "Zoom Keluar"], ["wipe", "Sapu"],
    ["circle", "Lingkaran"], ["blur", "Kabur"], ["spin", "Putar"], ["glitchT", "Glitch"]
  ];
  const ANIM_IN = [["none", "Tanpa"], ["fade", "Muncul"], ["zoomIn", "Membesar"], ["zoomOut", "Mengecil"], ["slideL", "Dari Kiri"], ["slideR", "Dari Kanan"], ["slideU", "Dari Bawah"], ["slideD", "Dari Atas"], ["spin", "Berputar"], ["pop", "Melenting"], ["blur", "Fokus"], ["typewriter", "Ketik"]];
  const ANIM_OUT = [["none", "Tanpa"], ["fade", "Hilang"], ["zoomIn", "Membesar"], ["zoomOut", "Mengecil"], ["slideL", "Ke Kiri"], ["slideR", "Ke Kanan"], ["slideU", "Ke Atas"], ["slideD", "Ke Bawah"], ["spin", "Berputar"], ["pop", "Menciut"], ["blur", "Kabur"]];
  const ANIM_LOOP = [["none", "Tanpa"], ["breathe", "Napas"], ["swing", "Ayun"], ["float", "Melayang"], ["shake", "Getar"], ["pulse", "Denyut"], ["rotate", "Berputar"]];
  const VOICES = [["none", "Asli"], ["clear", "Vokal Jernih"], ["echo", "Gema"], ["reverb", "Aula"], ["radio", "Radio"], ["phone", "Telepon"], ["megaphone", "Megafon"], ["underwater", "Bawah Air"], ["robot", "Robot"], ["bass", "Bass Kuat"]];
  const BLENDS = [["source-over", "Normal"], ["screen", "Layar"], ["multiply", "Kali"], ["overlay", "Overlay"], ["lighten", "Terangkan"], ["darken", "Gelapkan"], ["difference", "Selisih"], ["soft-light", "Cahaya Lembut"]];

  const TEXT_STYLES = [
    { n: "Polos", font: "Montserrat", weight: 800, color: "#FFFFFF", stroke: 0, shadow: 12 },
    { n: "Garis Tebal", font: "Bebas Neue", weight: 400, color: "#FFFFFF", stroke: 6, strokeColor: "#000000", size: 130 },
    { n: "Subtitle", font: "Plus Jakarta Sans", weight: 800, color: "#FFFFFF", stroke: 5, strokeColor: "#000000", size: 64, y: 0.78 },
    { n: "Karaoke", font: "Montserrat", weight: 900, color: "#FFFFFF", hl: "#FFD24A", stroke: 6, strokeColor: "#000000", size: 70, y: 0.75 },
    { n: "Kotak Putih", font: "Poppins", weight: 700, color: "#111111", bgOn: true, bgColor: "#FFFFFF", size: 64 },
    { n: "Kotak Merah", font: "Poppins", weight: 800, color: "#FFFFFF", bgOn: true, bgColor: "#B42318", size: 64 },
    { n: "Neon", font: "Monoton", weight: 400, color: "#FF4FD8", shadow: 40, shadowColor: "#FF4FD8", size: 110 },
    { n: "Tulisan Tangan", font: "Great Vibes", weight: 400, color: "#FFFFFF", shadow: 14, size: 140 },
    { n: "Gradasi", font: "Unbounded", weight: 900, color: "#FFD24A", color2: "#FF4F6D", size: 96 },
    { n: "Komik", font: "Bangers", weight: 400, color: "#FFE600", stroke: 7, strokeColor: "#111111", size: 120 },
    { n: "Elegan", font: "Playfair Display", weight: 700, color: "#FFFFFF", italic: true, size: 96, spacing: 2 },
    { n: "Retro", font: "Press Start 2P", weight: 400, color: "#7CFF6B", shadow: 0, stroke: 4, strokeColor: "#002200", size: 52 }
  ];
  const EMOJIS = "😀😂🥰😍😎🤩🥳😭😱🤯👍👏🙏💪🔥✨⭐💯❤️💖💔💥💫🎉🎂🎵🎶📍☕🍜🌸🌈☀️🌙⚡❄️🌊🏖️✈️📸🎬💡💰🛒✅❌⚠️👉👀".match(/\p{Extended_Pictographic}(️)?/gu) || [];

  // ======================================================================
  // 2. STATE PROYEK
  // ======================================================================
  function emptyProject() {
    return { v: 1, aspect: "9:16", w: 1080, h: 1920, bg: { type: "blur", color: "#000000" }, tracks: [{ id: "main", kind: "main" }], clips: [], markers: [] };
  }
  let P = emptyProject();
  const media = new Map(); // id -> {id, kind, name, blob, url, duration, w, h, thumb, peaks, hasAudio, alpha, img}
  let selId = null;
  let T = 0;
  let playing = false, playT0 = 0, playW0 = 0;
  const history = [];
  let hIdx = -1;

  const clipById = (id) => P.clips.find((c) => c.id === id);
  const trackOf = (c) => P.tracks.find((t) => t.id === c.track);
  const kindOfTrack = (id) => (P.tracks.find((t) => t.id === id) || {}).kind;
  const isMain = (c) => c.track === "main";
  const isVisual = (c) => c.type === "video" || c.type === "image";
  const hasSound = (c) => c.type === "audio" || (c.type === "video" && (media.get(c.mediaId) || {}).hasAudio !== false);
  const end = (c) => c.start + c.dur;
  const projectDur = () => P.clips.reduce((m, c) => Math.max(m, end(c)), 0);
  const mainClips = () => P.clips.filter(isMain).sort((a, b) => a.start - b.start);

  function newClip(type, mediaId, track, start, dur, extra = {}) {
    return Object.assign({
      id: uid("c"), type, mediaId, track, start, dur, in: 0, speed: 1, reverse: false, keepPitch: true,
      volume: 1, mute: false, fadeIn: 0, fadeOut: 0, voice: "none", denoise: false,
      x: 0.5, y: 0.5, scale: 1, rot: 0, opacity: 1, flipH: false, flipV: false, fit: "cover", blend: "source-over",
      adj: { bright: 0, contrast: 0, sat: 0, temp: 0, tint: 0, hue: 0, blur: 0, vignette: 0, grain: 0 },
      look: "none", lookAmt: 1, fx: "none", fxAmt: 0.7,
      animIn: "none", animInDur: 0.5, animOut: "none", animOutDur: 0.5, loop: "none",
      trans: "none", transDur: 0.6,
      chroma: null
    }, extra);
  }
  function newTextClip(start, style = TEXT_STYLES[0], text = "Ketik teksmu") {
    const s = Object.assign({ size: 96, y: 0.5 }, style);
    return newClip("text", null, null, start, 3, {
      text, font: s.font, weight: s.weight || 700, italic: !!s.italic, size: s.size, color: s.color, color2: s.color2 || "",
      stroke: s.stroke || 0, strokeColor: s.strokeColor || "#000000", shadow: s.shadow ?? 10, shadowColor: s.shadowColor || "rgba(0,0,0,0.6)",
      bgOn: !!s.bgOn, bgColor: s.bgColor || "#000000", bgAlpha: 1, bgPad: 0.28, bgRadius: 0.3, align: "center", spacing: s.spacing || 0, lineH: 1.15,
      boxW: 0.86, hl: s.hl || "", y: s.y, fit: "none"
    });
  }

  // ---------- trek ----------
  function ensureTrack(kind, start, dur, excludeId) {
    const free = P.tracks.filter((t) => t.kind === kind).find((t) =>
      !P.clips.some((c) => c.track === t.id && c.id !== excludeId && c.start < start + dur - 1e-6 && end(c) > start + 1e-6));
    if (free) return free.id;
    const t = { id: uid("t"), kind };
    const mainIdx = P.tracks.findIndex((x) => x.kind === "main");
    if (kind === "audio") P.tracks.push(t);
    else if (kind === "text") P.tracks.unshift(t);
    else {
      const firstOverlay = P.tracks.findIndex((x) => x.kind === "overlay");
      P.tracks.splice(firstOverlay >= 0 ? firstOverlay : mainIdx, 0, t);
    }
    return t.id;
  }
  function normalize() {
    if (!P.tracks.some((t) => t.id === "main")) P.tracks.push({ id: "main", kind: "main" });
    // trek utama magnetis: klip berurutan tanpa celah
    let t = 0;
    mainClips().forEach((c) => { c.start = t; t += c.dur; c.trans = c.trans || "none"; });
    const first = mainClips()[0];
    if (first) first.trans = "none";
    P.tracks = P.tracks.filter((tr) => tr.kind === "main" || P.clips.some((c) => c.track === tr.id));
    P.clips.forEach((c) => { if (!P.tracks.some((tr) => tr.id === c.track)) c.track = ensureTrack(c.type === "text" ? "text" : c.type === "audio" ? "audio" : "overlay", c.start, c.dur, c.id); });
  }

  // ---------- waktu sumber ----------
  function mediaDur(c) {
    const m = media.get(c.mediaId);
    return m && (c.type === "video" || c.type === "audio") ? m.duration || 0 : Infinity;
  }
  function srcTime(c, t) {
    const local = clamp(t - c.start, 0, c.dur);
    const s = c.reverse ? c.in + (c.dur - local) * c.speed : c.in + local * c.speed;
    const md = mediaDur(c);
    return clamp(s, 0, isFinite(md) ? Math.max(0, md - 0.04) : s);
  }
  function maxDur(c) {
    const md = mediaDur(c);
    return isFinite(md) ? Math.max(MIN_DUR, (md - c.in) / c.speed) : 3600;
  }
  // Rentang waktu sebuah klip utama terlihat (transisi memperpanjang ke klip tetangga)
  function transDurAt(b) {
    const mains = mainClips();
    const i = mains.indexOf(b);
    if (i <= 0 || !b.trans || b.trans === "none") return 0;
    return Math.min(b.transDur || 0.6, mains[i - 1].dur * 0.9, b.dur * 0.9);
  }
  function visibleRange(c) {
    if (!isMain(c)) return [c.start, end(c)];
    const mains = mainClips();
    const i = mains.indexOf(c);
    const pre = transDurAt(c) / 2;
    const next = mains[i + 1];
    const post = next ? transDurAt(next) / 2 : 0;
    return [c.start - pre, end(c) + post];
  }

  // ======================================================================
  // 3. MEDIA: impor, thumbnail, gelombang suara, elemen pemutar per klip
  // ======================================================================
  function probeVideo(url) {
    return new Promise((resolve) => {
      const v = document.createElement("video");
      v.preload = "auto";
      v.muted = true;
      v.playsInline = true;
      v.src = url;
      let done = false;
      const fail = () => { if (!done) { done = true; resolve(null); } };
      v.onerror = fail;
      setTimeout(fail, 20000);
      v.onloadedmetadata = () => {
        let dur = v.duration;
        const finish = () => {
          const c = document.createElement("canvas");
          const sc = 200 / Math.max(1, v.videoWidth);
          c.width = Math.max(1, Math.round(v.videoWidth * sc));
          c.height = Math.max(1, Math.round(v.videoHeight * sc));
          let thumb = "";
          try { c.getContext("2d").drawImage(v, 0, 0, c.width, c.height); thumb = c.toDataURL("image/jpeg", 0.7); } catch (e) {}
          done = true;
          resolve({ duration: dur, w: v.videoWidth, h: v.videoHeight, thumb }); // ada/tidaknya suara diketahui saat decode (computePeaks)
          v.removeAttribute("src");
          v.load();
        };
        if (!isFinite(dur)) { // beberapa WebM tanpa durasi: lompat ke ujung untuk membacanya
          v.currentTime = 1e7;
          v.ontimeupdate = () => { v.ontimeupdate = null; dur = v.duration; v.currentTime = Math.min(0.5, dur / 3); v.onseeked = finish; };
          return;
        }
        if (!v.videoWidth) { fail(); return; }
        v.currentTime = Math.min(Math.max(0.05, dur * 0.1), 1.5);
        v.onseeked = finish;
      };
    });
  }

  // AudioBuffer ter-decode per media (48 kHz) untuk ekspor, subtitle, ketukan, gelombang
  const decoded = new Map();
  function decodeMedia(id, mm) {
    if (decoded.has(id)) return decoded.get(id);
    const m = mm || media.get(id);
    const p = (async () => {
      if (!m || !m.blob || m.kind === "image") return null;
      if (m.blob.size > 700 * 1024 * 1024) return null;
      try {
        const ab = await m.blob.arrayBuffer();
        const ac = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, 1, 48000);
        return await new Promise((res, rej) => {
          const r = ac.decodeAudioData(ab, res, rej);
          if (r && r.then) r.then(res, rej);
        });
      } catch (e) {
        return null;
      }
    })();
    decoded.set(id, p);
    return p;
  }
  async function computePeaks(m) {
    const buf = await decodeMedia(m.id, m);
    // gagal decode = tidak ada trek suara ATAU codec tak didukung decoder; suara pratinjau tetap dibiarkan
    if (!buf) { m.audioUnreadable = true; return; }
    m.hasAudio = true;
    const rate = 50, n = Math.ceil(buf.duration * rate), step = Math.floor(buf.sampleRate / rate);
    const peaks = new Float32Array(n);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      let mx = 0;
      for (let j = i * step, e = Math.min(ch.length, j + step); j < e; j += 4) { const v = Math.abs(ch[j]); if (v > mx) mx = v; }
      peaks[i] = mx;
    }
    m.peaks = peaks;
    if (!m.duration || !isFinite(m.duration)) m.duration = buf.duration;
    store.saveMedia(m);
    renderTimeline();
  }

  function loadImg(url) {
    return new Promise((resolve) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => resolve(null);
      i.src = url;
    });
  }
  function imgHasAlpha(img) {
    try {
      const c = document.createElement("canvas");
      c.width = 48; c.height = 48;
      const x = c.getContext("2d");
      x.drawImage(img, 0, 0, 48, 48);
      const d = x.getImageData(0, 0, 48, 48).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
    } catch (e) {}
    return false;
  }

  function sniffKind(file) {
    const t = (file.type || "").toLowerCase(), n = (file.name || "").toLowerCase();
    if (t.startsWith("video/") || /\.(mp4|mov|m4v|webm|mkv|3gp)$/.test(n)) return "video";
    if (t.startsWith("audio/") || /\.(mp3|m4a|wav|aac|ogg|opus|flac)$/.test(n)) return "audio";
    if (t.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp|gif|avif|bmp|tiff?)$/.test(n)) return "image";
    return "";
  }

  async function importFile(file, forceKind) {
    const kind = forceKind || sniffKind(file);
    const name = (file.name || "Media").replace(/\.[^.]+$/, "");
    const m = { id: uid("m"), kind, name, blob: file, url: "", duration: 0, w: 0, h: 0, thumb: "", hasAudio: undefined };
    if (kind === "image") {
      let blob = file;
      if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type) && window.SNEImport) {
        const dataUrl = await SNEImport.fileToDataURL(file);
        if (!dataUrl) return null;
        blob = await (await fetch(dataUrl)).blob();
      }
      m.blob = blob;
      m.url = URL.createObjectURL(blob);
      const img = await loadImg(m.url);
      if (!img) { showToast(`Foto "${name}" tidak bisa dibuka`); return null; }
      m.img = img; m.w = img.naturalWidth; m.h = img.naturalHeight; m.duration = 0; m.alpha = imgHasAlpha(img);
      const c = document.createElement("canvas"), sc = 200 / Math.max(m.w, m.h);
      c.width = Math.round(m.w * sc); c.height = Math.round(m.h * sc);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      m.thumb = c.toDataURL(m.alpha ? "image/png" : "image/jpeg", 0.75);
    } else if (kind === "video") {
      m.url = URL.createObjectURL(file);
      const info = await probeVideo(m.url);
      if (!info) {
        // Video tanpa gambar yang bisa dibaca: mungkin hanya audio (mis. .m4a bertipe video/mp4) atau HEVC yang tak didukung
        const a = await probeAudio(m.url);
        if (a) { m.kind = "audio"; m.duration = a; computePeaks(m); }
        else {
          URL.revokeObjectURL(m.url);
          showToast(`Video "${name}" tidak bisa diputar browser ini. Video HEVC iPhone (.MOV) bisa diputar di Safari; di Chrome ubah dulu ke H.264 / pilih "Paling Kompatibel" di Pengaturan Kamera iPhone.`, 7000);
          return null;
        }
      } else Object.assign(m, info);
      if (m.kind === "video") computePeaks(m);
    } else if (kind === "audio") {
      m.url = URL.createObjectURL(file);
      const d = await probeAudio(m.url);
      if (!d) { showToast(`Audio "${name}" tidak bisa diputar browser ini`); return null; }
      m.duration = d;
      computePeaks(m);
    } else {
      showToast(`Format "${file.name}" tidak dikenali`);
      return null;
    }
    media.set(m.id, m);
    store.saveMedia(m);
    return m;
  }
  function probeAudio(url) {
    return new Promise((resolve) => {
      const a = document.createElement("audio");
      a.preload = "metadata";
      a.src = url;
      a.onloadedmetadata = () => {
        if (isFinite(a.duration)) return resolve(a.duration);
        a.currentTime = 1e7;
        a.ontimeupdate = () => { a.ontimeupdate = null; resolve(isFinite(a.duration) ? a.duration : 0); };
      };
      a.onerror = () => resolve(0);
      setTimeout(() => resolve(0), 15000);
    });
  }

  async function importFiles(files, opts = {}) {
    const list = Array.from(files || []);
    if (!list.length) return;
    showToast(list.length > 1 ? `Mengimpor ${list.length} file…` : "Mengimpor…", 1500);
    const added = [];
    for (const f of list) {
      const m = await importFile(f, opts.kind);
      if (m) added.push(m);
    }
    renderMediaBin();
    if (!added.length) return;
    // Proyek kosong: langsung susun di timeline seperti aplikasi edit di HP
    if (opts.place || !P.clips.length) {
      added.forEach((m) => addMediaToTimeline(m.id, m.kind === "audio" ? "audio" : "main", true));
      commit();
      setT(T);
    }
    showToast(`${added.length} media siap. Ketuk untuk menaruh di timeline.`);
  }

  // Elemen pemutar per klip (klip hasil potong dari video yang sama tetap bisa tampil bersamaan saat transisi)
  const els = new Map();
  function clipEl(c) {
    let el = els.get(c.id);
    const m = media.get(c.mediaId);
    if (!m) return null;
    if (el && el._mediaId === c.mediaId) return el;
    if (el) dropEl(c.id);
    el = document.createElement(c.type === "audio" ? "audio" : "video");
    el.preload = "auto";
    el.playsInline = true;
    el.setAttribute("playsinline", "");
    el.crossOrigin = "anonymous";
    el.src = m.url;
    el._mediaId = c.mediaId;
    el.addEventListener("seeked", requestRender);
    el.addEventListener("loadeddata", requestRender);
    els.set(c.id, el);
    return el;
  }
  function dropEl(id) {
    const el = els.get(id);
    if (!el) return;
    try { el.pause(); if (el._src) el._src.disconnect(); } catch (e) {}
    el.removeAttribute("src");
    el.load();
    els.delete(id);
  }
  function gcEls() {
    for (const id of els.keys()) if (!clipById(id)) dropEl(id);
  }

  // ======================================================================
  // 4. AUDIO: rantai efek suara (dipakai pratinjau & render offline)
  // ======================================================================
  let actx = null, master = null;
  function audioCtx() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC({ latencyHint: "interactive" });
      master = actx.createGain();
      master.connect(actx.destination);
    }
    if (actx.state === "suspended") actx.resume().catch(() => {});
    return actx;
  }
  const impulseCache = new WeakMap();
  function impulse(ac, secs = 2.2) {
    let byCtx = impulseCache.get(ac);
    if (byCtx) return byCtx;
    const len = Math.floor(ac.sampleRate * secs), b = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let seed = 1234 + ch * 77;
      for (let i = 0; i < len; i++) {
        seed = (seed * 16807) % 2147483647;
        d[i] = ((seed / 2147483647) * 2 - 1) * Math.pow(1 - i / len, 3.2);
      }
    }
    impulseCache.set(ac, b);
    return b;
  }
  function shaper(ac, amount) {
    const ws = ac.createWaveShaper(), n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x)); }
    ws.curve = curve;
    return ws;
  }
  function biquad(ac, type, f, q = 0.7, g = 0) {
    const b = ac.createBiquadFilter();
    b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = g;
    return b;
  }
  // input -> [pengurang bising] -> [efek suara] -> output
  function buildVoiceChain(ac, input, c) {
    let node = input;
    const chain = (...nodes) => { nodes.forEach((n) => { node.connect(n); node = n; }); };
    if (c.denoise) {
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -30; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.2;
      chain(biquad(ac, "highpass", 90), biquad(ac, "lowpass", 9000), biquad(ac, "peaking", 3000, 1, 2), comp);
    }
    const v = c.voice || "none";
    if (v === "clear") chain(biquad(ac, "highpass", 100), biquad(ac, "peaking", 3200, 0.9, 5), biquad(ac, "highshelf", 9000, 0.7, 3));
    else if (v === "radio") chain(biquad(ac, "bandpass", 1700, 0.8), shaper(ac, 8));
    else if (v === "phone") chain(biquad(ac, "highpass", 450), biquad(ac, "lowpass", 3300));
    else if (v === "megaphone") chain(biquad(ac, "highpass", 650), biquad(ac, "lowpass", 3000), shaper(ac, 30), biquad(ac, "peaking", 1800, 1, 6));
    else if (v === "underwater") chain(biquad(ac, "lowpass", 480, 1.4));
    else if (v === "bass") chain(biquad(ac, "lowshelf", 140, 0.7, 10));
    else if (v === "echo" || v === "reverb") {
      const dry = ac.createGain(), wet = ac.createGain(), out = ac.createGain();
      node.connect(dry); dry.connect(out);
      if (v === "echo") {
        const d = ac.createDelay(2), fb = ac.createGain();
        d.delayTime.value = 0.28; fb.gain.value = 0.38; wet.gain.value = 0.55;
        node.connect(d); d.connect(fb); fb.connect(d); d.connect(wet);
      } else {
        const conv = ac.createConvolver();
        conv.buffer = impulse(ac);
        wet.gain.value = 0.6; dry.gain.value = 0.8;
        node.connect(conv); conv.connect(wet);
      }
      wet.connect(out);
      node = out;
    } else if (v === "robot") {
      const ring = ac.createGain(), osc = ac.createOscillator();
      ring.gain.value = 0;
      osc.frequency.value = 55;
      osc.connect(ring.gain);
      osc.start(0);
      chain(ring, biquad(ac, "peaking", 1000, 1, 4));
    }
    return node;
  }
  function fadeGain(c, local) {
    let f = 1;
    if (c.fadeIn > 0) f = Math.min(f, local / c.fadeIn);
    if (c.fadeOut > 0) f = Math.min(f, (c.dur - local) / c.fadeOut);
    return clamp(f, 0, 1);
  }
  function wireEl(el, c) {
    const ac = audioCtx();
    if (!ac) return null;
    if (!el._src) {
      try { el._src = ac.createMediaElementSource(el); } catch (e) { return null; }
      el._gain = ac.createGain();
      el._gain.connect(master);
    }
    const sig = (c.voice || "none") + "|" + !!c.denoise;
    if (el._sig !== sig) {
      try { el._src.disconnect(); } catch (e) {}
      buildVoiceChain(ac, el._src, c).connect(el._gain);
      el._sig = sig;
    }
    return el._gain;
  }

  // Peregangan waktu WSOLA: kecepatan berubah tanpa mengubah nada (dipakai saat ekspor)
  function timeStretch(chans, sr, rate) {
    const N = 2048, Hs = N / 4, tol = 384;
    const inLen = chans[0].length, outLen = Math.max(1, Math.floor(inLen / rate));
    const win = new Float32Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
    const out = chans.map(() => new Float32Array(outLen + N));
    const norm = new Float32Array(outLen + N);
    const mono = chans[0];
    let prevPos = 0;
    for (let o = 0; o < outLen; o += Hs) {
      const ideal = Math.round(o * rate);
      let best = ideal;
      if (o > 0) {
        // cari geseran yang paling menyambung dengan potongan sebelumnya
        const ref = prevPos + Hs;
        let bestScore = -Infinity;
        for (let d = -tol; d <= tol; d += 8) {
          const p = ideal + d;
          if (p < 0 || p + N >= inLen) continue;
          let s = 0;
          for (let k = 0; k < Hs; k += 4) s += mono[ref + k] * mono[p + k];
          if (s > bestScore) { bestScore = s; best = p; }
        }
      }
      best = clamp(best, 0, Math.max(0, inLen - N - 1));
      for (let ch = 0; ch < chans.length; ch++) {
        const src = chans[ch], dst = out[ch];
        for (let k = 0; k < N; k++) dst[o + k] += (src[best + k] || 0) * win[k];
      }
      for (let k = 0; k < N; k++) norm[o + k] += win[k];
      prevPos = best;
    }
    for (let ch = 0; ch < out.length; ch++) {
      const d = out[ch];
      for (let i = 0; i < outLen; i++) d[i] = norm[i] > 1e-3 ? d[i] / norm[i] : 0;
    }
    return out.map((d) => d.subarray(0, outLen));
  }

  // Mixdown seluruh timeline [t0, t1) secara offline -> AudioBuffer (untuk ekspor & subtitle otomatis)
  async function renderAudio(sr = 48000, channels = 2, t0 = 0, t1 = projectDur(), onProgress) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const len = Math.max(1, Math.ceil((t1 - t0) * sr));
    const oac = new OAC(channels, len, sr);
    const list = P.clips.filter((c) => hasSound(c) && !c.mute && c.volume > 0 && c.start < t1 && end(c) > t0);
    let any = false;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      onProgress && onProgress(i / list.length);
      const buf = await decodeMedia(c.mediaId);
      if (!buf) continue;
      const skip = Math.max(0, t0 - c.start);
      const playDur = Math.min(c.dur - skip, t1 - Math.max(c.start, t0));
      if (playDur <= 0.01) continue;
      // potongan sumber milik klip -> diolah (mundur / regang) -> buffer siap putar kecepatan 1
      const s0 = Math.floor(clamp(c.in, 0, buf.duration) * buf.sampleRate);
      const s1 = Math.floor(clamp(c.in + c.dur * c.speed, 0, buf.duration) * buf.sampleRate);
      if (s1 - s0 < 32) continue;
      let chans = [];
      for (let ch = 0; ch < buf.numberOfChannels; ch++) chans.push(buf.getChannelData(ch).slice(s0, s1));
      if (c.reverse) chans.forEach((d) => d.reverse());
      let rate = c.speed;
      if (Math.abs(c.speed - 1) > 0.01 && c.keepPitch !== false) { chans = timeStretch(chans, buf.sampleRate, c.speed); rate = 1; }
      const seg = oac.createBuffer(chans.length, chans[0].length, buf.sampleRate);
      chans.forEach((d, ch) => seg.copyToChannel ? seg.copyToChannel(d, ch) : seg.getChannelData(ch).set(d));
      const src = oac.createBufferSource();
      src.buffer = seg;
      src.playbackRate.value = rate;
      const g = oac.createGain();
      buildVoiceChain(oac, src, c).connect(g);
      g.connect(oac.destination);
      const when = Math.max(0, c.start - t0);
      // selubung volume (fade) dicuplik 100x/detik
      const n = Math.max(2, Math.ceil(playDur * 100));
      const curve = new Float32Array(n);
      for (let k = 0; k < n; k++) curve[k] = c.volume * fadeGain(c, skip + (k / (n - 1)) * playDur);
      g.gain.setValueAtTime(curve[0], when);
      try { g.gain.setValueCurveAtTime(curve, when, playDur); } catch (e) { g.gain.value = c.volume; }
      // posisi di buffer: detik timeline x laju putar (buffer hasil regang sudah sepanjang durasi klip)
      src.start(when, skip * rate, playDur * rate);
      any = true;
    }
    if (!any) return null;
    return await oac.startRendering();
  }

  // ======================================================================
  // 5. RENDERER: satu frame pada waktu t
  // ======================================================================
  const FILTER_OK = (() => {
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 2;
      const x = c.getContext("2d");
      if (!("filter" in x)) return false;
      x.filter = "invert(1)";
      x.fillStyle = "#000";
      x.fillRect(0, 0, 2, 2);
      return x.getImageData(0, 0, 1, 1).data[0] > 200;
    } catch (e) { return false; }
  })();
  const LS_OK = (() => { try { return "letterSpacing" in document.createElement("canvas").getContext("2d"); } catch (e) { return false; } })();

  function scratch(key, W, H) {
    const c = scratch[key] || (scratch[key] = document.createElement("canvas"));
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const x = c.getContext("2d");
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalAlpha = 1;
    x.globalCompositeOperation = "source-over";
    if (FILTER_OK) x.filter = "none";
    x.clearRect(0, 0, W, H);
    return [c, x];
  }

  let grainTile = null;
  function grain() {
    if (grainTile) return grainTile;
    grainTile = document.createElement("canvas");
    grainTile.width = grainTile.height = 160;
    const x = grainTile.getContext("2d"), id = x.createImageData(160, 160);
    for (let i = 0; i < id.data.length; i += 4) {
      const v = Math.random() * 255;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
      id.data[i + 3] = 255;
    }
    x.putImageData(id, 0, 0);
    return grainTile;
  }
  // Pseudo-acak deterministik (supaya ekspor = pratinjau)
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

  function animState(c, t) {
    const st = { a: 1, s: 1, dx: 0, dy: 0, r: 0, blur: 0, chars: 1 };
    const local = t - c.start;
    const apply = (type, p, out) => {
      const e = easeOut(p);
      switch (type) {
        case "fade": st.a *= e; break;
        case "zoomIn": st.s *= out ? 1 + (1 - e) * 0.4 : 0.6 + 0.4 * e; st.a *= e; break;
        case "zoomOut": st.s *= out ? 1 - (1 - e) * 0.4 : 1.4 - 0.4 * e; st.a *= e; break;
        case "slideL": st.dx += -(1 - e) * 0.6; st.a *= Math.min(1, e * 1.5); break;
        case "slideR": st.dx += (1 - e) * 0.6; st.a *= Math.min(1, e * 1.5); break;
        case "slideU": st.dy += (out ? -1 : 1) * (1 - e) * 0.35; st.a *= Math.min(1, e * 1.5); break;
        case "slideD": st.dy += (out ? 1 : -1) * (1 - e) * 0.35; st.a *= Math.min(1, e * 1.5); break;
        case "spin": st.r += (1 - e) * (out ? Math.PI : -Math.PI); st.s *= 0.5 + 0.5 * e; st.a *= e; break;
        case "pop": st.s *= Math.max(0, backOut(p)); st.a *= Math.min(1, p * 3); break;
        case "blur": st.blur += (1 - e) * 24; st.a *= e; break;
        case "typewriter": st.chars = p; break;
      }
    };
    if (c.animIn !== "none" && c.animInDur > 0) apply(c.animIn, clamp(local / c.animInDur, 0, 1), false);
    if (c.animOut !== "none" && c.animOutDur > 0) apply(c.animOut, clamp((c.dur - local) / c.animOutDur, 0, 1), true);
    switch (c.loop) {
      case "breathe": st.s *= 1 + 0.04 * Math.sin((2 * Math.PI * local) / 2); break;
      case "swing": st.r += 0.08 * Math.sin((2 * Math.PI * local) / 1.6); break;
      case "float": st.dy += 0.012 * Math.sin((2 * Math.PI * local) / 2.4); break;
      case "shake": st.dx += 0.006 * Math.sin(local * 57); st.dy += 0.005 * Math.cos(local * 43); break;
      case "pulse": st.s *= 1 + 0.07 * Math.max(0, Math.sin(2 * Math.PI * local * 2)); break;
      case "rotate": st.r += local * Math.PI * 0.5; break;
    }
    return st;
  }

  // Gabungan filter warna + penyesuaian -> string ctx.filter
  function colorParams(c) {
    const L = (LOOK_MAP[c.look] || LOOKS[0])[2], k = c.lookAmt ?? 1, a = c.adj || {};
    return {
      b: (L.b || 0) * k + (a.bright || 0) / 250,
      c: (L.c || 0) * k + (a.contrast || 0) / 150,
      s: (L.s || 0) * k + (a.sat || 0) / 100,
      h: (L.h || 0) * k + (a.hue || 0),
      sep: (L.sep || 0) * k,
      gray: (L.gray || 0) * k,
      tint: L.tint ? [L.tint[0], L.tint[1], L.tint[2], L.tint[3] * k] : null,
      temp: (a.temp || 0) / 100,
      tintAdj: (a.tint || 0) / 100,
      blur: a.blur || 0,
      vignette: (a.vignette || 0) / 100,
      grain: (a.grain || 0) / 100
    };
  }
  function filterString(cp, extraBlur, k) {
    const f = [];
    if (cp.b) f.push(`brightness(${(1 + cp.b).toFixed(3)})`);
    if (cp.c) f.push(`contrast(${Math.max(0, 1 + cp.c).toFixed(3)})`);
    if (cp.s) f.push(`saturate(${Math.max(0, 1 + cp.s).toFixed(3)})`);
    if (cp.h) f.push(`hue-rotate(${cp.h.toFixed(1)}deg)`);
    if (cp.sep) f.push(`sepia(${cp.sep.toFixed(3)})`);
    if (cp.gray) f.push(`grayscale(${cp.gray.toFixed(3)})`);
    const bl = (cp.blur + extraBlur) * k;
    if (bl > 0.2) f.push(`blur(${bl.toFixed(1)}px)`);
    return f.length ? f.join(" ") : "none";
  }

  // Latar blur murah & seragam di semua browser: kecilkan lalu besarkan lagi
  function drawBlurCover(ctx, src, sw, sh, W, H) {
    const [c1, x1] = scratch("blurA", 40, Math.max(8, Math.round((40 * H) / W)));
    const sc = Math.max(c1.width / sw, c1.height / sh);
    x1.drawImage(src, (c1.width - sw * sc) / 2, (c1.height - sh * sc) / 2, sw * sc, sh * sc);
    const [c2, x2] = scratch("blurB", 160, Math.max(16, Math.round((160 * H) / W)));
    x2.imageSmoothingQuality = "high";
    x2.drawImage(c1, 0, 0, c2.width, c2.height);
    ctx.save();
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(c2, 0, 0, W, H);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // Hapus latar hijau (chroma key)
  function chromaKey(src, sw, sh, ck) {
    const sc = Math.min(1, 720 / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * sc)), h = Math.max(1, Math.round(sh * sc));
    const [c, x] = scratch("chroma", w, h);
    x.drawImage(src, 0, 0, w, h);
    const id = x.getImageData(0, 0, w, h), d = id.data;
    const kr = parseInt(ck.color.slice(1, 3), 16), kg = parseInt(ck.color.slice(3, 5), 16), kb = parseInt(ck.color.slice(5, 7), 16);
    const tol = ck.tol * 2.2, soft = Math.max(1, ck.soft * 2.2);
    const greenish = kg > kr && kg > kb, blueish = kb > kr && kb > kg;
    for (let i = 0; i < d.length; i += 4) {
      const dr = d[i] - kr, dg = d[i + 1] - kg, db = d[i + 2] - kb;
      const dist = Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11) * 1.6;
      if (dist < tol) d[i + 3] = 0;
      else if (dist < tol + soft) d[i + 3] = Math.round(d[i + 3] * ((dist - tol) / soft));
      // buang pantulan warna latar di tepi subjek
      if (greenish && d[i + 1] > Math.max(d[i], d[i + 2])) d[i + 1] = Math.max(d[i], d[i + 2]);
      if (blueish && d[i + 2] > Math.max(d[i], d[i + 1])) d[i + 2] = Math.max(d[i], d[i + 1]);
    }
    x.putImageData(id, 0, 0);
    return c;
  }

  function sourceOf(c) {
    const m = media.get(c.mediaId);
    if (!m) return null;
    if (c.type === "image") return m.img && m.img.complete ? { src: m.img, w: m.img.naturalWidth, h: m.img.naturalHeight } : null;
    const el = clipEl(c);
    if (!el || el.readyState < 2 || !el.videoWidth) return null;
    return { src: el, w: el.videoWidth, h: el.videoHeight };
  }

  const boundsOf = new WeakMap(); // klip -> {cx, cy, w, h, r} dalam piksel kanvas pratinjau

  function drawVisual(ctx, c, t, W, H, main) {
    const so = sourceOf(c);
    if (!so) return;
    const k = W / P.w;
    const an = animState(c, t);
    const local = t - c.start;
    const fxA = c.fxAmt ?? 0.7;
    let { src } = so;
    const { w: sw, h: sh } = so;
    if (main && P.bg.type === "blur") drawBlurCover(ctx, src, sw, sh, W, H);
    else if (main) { ctx.fillStyle = P.bg.color || "#000"; ctx.fillRect(0, 0, W, H); }

    let sc = c.fit === "contain" ? Math.min(W / sw, H / sh) : Math.max(W / sw, H / sh);
    sc *= c.scale * an.s;
    // efek gerak
    let ex = 0, ey = 0, extraBlur = an.blur;
    if (c.fx === "shake") { ex = (hash(Math.floor(t * 24)) - 0.5) * 0.04 * fxA * W; ey = (hash(Math.floor(t * 24) + 7) - 0.5) * 0.04 * fxA * H; }
    if (c.fx === "pulse") sc *= 1 + 0.08 * fxA * Math.pow(Math.max(0, Math.sin(Math.PI * 2 * local * 1.5)), 4);
    if (c.fx === "kenburns") sc *= 1 + 0.18 * fxA * clamp(local / Math.max(0.1, c.dur), 0, 1);
    if (c.fx === "zoomblur") { const ph = (local % 1.2) / 1.2; sc *= 1 + 0.25 * fxA * Math.pow(1 - ph, 6); extraBlur += 10 * fxA * Math.pow(1 - ph, 6); }
    if (c.fx === "dream") extraBlur += 3 * fxA;
    const dw = sw * sc, dh = sh * sc;
    const cx = c.x * W + an.dx * W + ex, cy = c.y * H + an.dy * H + ey;
    const rot = (c.rot * Math.PI) / 180 + an.r;
    boundsOf.set(c, { cx, cy, w: dw, h: dh, r: rot });

    if (c.chroma && c.chroma.on) src = chromaKey(src, sw, sh, c.chroma);
    const m = media.get(c.mediaId) || {};
    const isolate = !main && (m.alpha || (c.chroma && c.chroma.on));
    // klip transparan digambar di lapisan sendiri supaya warna/vinyet tidak mewarnai latar di belakangnya
    let tctx = ctx, layer = null;
    if (isolate) { const [lc, lx] = scratch("iso", W, H); layer = lc; tctx = lx; }
    const cp = colorParams(c);
    tctx.save();
    if (!isolate) {
      tctx.globalAlpha = clamp(c.opacity * an.a, 0, 1);
      if (!main && c.blend && c.blend !== "source-over") tctx.globalCompositeOperation = c.blend;
    }
    tctx.translate(cx, cy);
    tctx.rotate(rot);
    tctx.scale(c.flipH ? -1 : 1, c.flipV ? -1 : 1);
    if (FILTER_OK) tctx.filter = filterString(cp, extraBlur, k);
    const x0 = -dw / 2, y0 = -dh / 2;
    if (c.fx === "mirror") {
      tctx.drawImage(src, 0, 0, sw / 2, sh, x0, y0, dw / 2, dh);
      tctx.save(); tctx.scale(-1, 1); tctx.drawImage(src, 0, 0, sw / 2, sh, x0, y0, dw / 2, dh); tctx.restore();
    } else if (c.fx === "glitch" && hash(Math.floor(t * 12)) < 0.55 * fxA + 0.15) {
      const bands = 9;
      for (let b = 0; b < bands; b++) {
        const off = (hash(Math.floor(t * 30) * 13 + b) - 0.5) * 0.12 * fxA * dw;
        tctx.drawImage(src, 0, (sh * b) / bands, sw, sh / bands, x0 + off, y0 + (dh * b) / bands, dw, dh / bands + 1);
      }
    } else tctx.drawImage(src, x0, y0, dw, dh);
    if (FILTER_OK) tctx.filter = "none";
    // lapisan di atas foto, dibatasi bidang foto
    tctx.beginPath();
    tctx.rect(x0, y0, dw, dh);
    tctx.clip();
    if (isolate) tctx.globalCompositeOperation = "source-atop";
    const blendFill = (mode, color) => { const g = tctx.globalCompositeOperation; tctx.globalCompositeOperation = isolate ? "source-atop" : mode; tctx.fillStyle = color; tctx.fillRect(x0, y0, dw, dh); tctx.globalCompositeOperation = g; };
    if (!FILTER_OK) {
      if (cp.b > 0) blendFill("lighter", `rgba(255,255,255,${(cp.b * 0.5).toFixed(3)})`);
      if (cp.b < 0) blendFill("source-over", `rgba(0,0,0,${(-cp.b * 0.8).toFixed(3)})`);
      if (cp.gray > 0 || cp.s < 0) blendFill("saturation", `rgba(128,128,128,${Math.min(1, cp.gray + Math.max(0, -cp.s)).toFixed(3)})`);
    }
    if (cp.tint) blendFill("soft-light", `rgba(${cp.tint[0]},${cp.tint[1]},${cp.tint[2]},${cp.tint[3].toFixed(3)})`);
    if (cp.temp) blendFill("soft-light", cp.temp > 0 ? `rgba(255,140,40,${(cp.temp * 0.45).toFixed(3)})` : `rgba(40,120,255,${(-cp.temp * 0.45).toFixed(3)})`);
    if (cp.tintAdj) blendFill("soft-light", cp.tintAdj > 0 ? `rgba(230,60,200,${(cp.tintAdj * 0.35).toFixed(3)})` : `rgba(60,220,90,${(-cp.tintAdj * 0.35).toFixed(3)})`);
    // efek di atas gambar
    if (c.fx === "rgb") {
      tctx.globalCompositeOperation = isolate ? "source-atop" : "screen";
      tctx.globalAlpha = 0.45 * fxA;
      tctx.drawImage(src, x0 + 10 * k * fxA * 2, y0, dw, dh);
      tctx.drawImage(src, x0 - 10 * k * fxA * 2, y0, dw, dh);
      tctx.globalAlpha = 1;
      blendFill("multiply", "rgba(255,240,255,1)");
    }
    if (c.fx === "flash") { const ph = (local % 0.9) / 0.9; blendFill("lighter", `rgba(255,255,255,${(Math.pow(1 - ph, 8) * 0.8 * fxA).toFixed(3)})`); }
    if (c.fx === "strobe" && Math.floor(t * 10) % 2 === 0) blendFill("source-over", `rgba(255,255,255,${(0.55 * fxA).toFixed(3)})`);
    if (c.fx === "dream") blendFill("screen", `rgba(255,220,240,${(0.22 * fxA).toFixed(3)})`);
    if (c.fx === "leak") {
      const gx = x0 + dw * (0.5 + 0.5 * Math.sin(local * 0.9)), g = tctx.createRadialGradient(gx, y0 + dh * 0.2, 0, gx, y0 + dh * 0.2, dw * 0.9);
      g.addColorStop(0, `rgba(255,140,40,${(0.65 * fxA).toFixed(3)})`); g.addColorStop(0.5, `rgba(255,60,90,${(0.25 * fxA).toFixed(3)})`); g.addColorStop(1, "rgba(0,0,0,0)");
      const op = tctx.globalCompositeOperation; tctx.globalCompositeOperation = isolate ? "source-atop" : "screen"; tctx.fillStyle = g; tctx.fillRect(x0, y0, dw, dh); tctx.globalCompositeOperation = op;
    }
    if (c.fx === "vhs") {
      tctx.fillStyle = `rgba(0,0,0,${(0.22 * fxA).toFixed(3)})`;
      const step = Math.max(2, Math.round(4 * k * 2));
      for (let yy = y0; yy < y0 + dh; yy += step) tctx.fillRect(x0, yy, dw, step / 2);
      const band = (hash(Math.floor(t * 8)) * dh) + y0;
      tctx.fillStyle = `rgba(255,255,255,${(0.12 * fxA).toFixed(3)})`;
      tctx.fillRect(x0, band, dw, 18 * k * 2);
      blendFill("soft-light", `rgba(255,60,200,${(0.12 * fxA).toFixed(3)})`);
    }
    if (c.fx === "snow") {
      tctx.fillStyle = "rgba(255,255,255,0.9)";
      const n = Math.round(80 * fxA);
      for (let i = 0; i < n; i++) {
        const sp = 0.08 + hash(i) * 0.12, px = x0 + ((hash(i + 3) + Math.sin(local * 0.8 + i) * 0.02) % 1) * dw;
        const py = y0 + (((hash(i + 9) + local * sp) % 1) * dh), r = (2 + hash(i + 5) * 5) * k * 2;
        tctx.beginPath(); tctx.arc(px, py, r, 0, Math.PI * 2); tctx.fill();
      }
    }
    if (c.fx === "grainfx" || cp.grain > 0) {
      const amt = (c.fx === "grainfx" ? 0.35 * fxA : 0) + cp.grain * 0.5;
      const op = tctx.globalCompositeOperation;
      tctx.globalCompositeOperation = isolate ? "source-atop" : "overlay";
      tctx.globalAlpha = clamp(amt, 0, 1);
      const pat = tctx.createPattern(grain(), "repeat");
      const ox = hash(Math.floor(t * 24)) * 160, oy = hash(Math.floor(t * 24) + 1) * 160;
      tctx.translate(ox, oy); tctx.fillStyle = pat; tctx.fillRect(x0 - ox, y0 - oy, dw, dh); tctx.translate(-ox, -oy);
      tctx.globalAlpha = 1; tctx.globalCompositeOperation = op;
      if (c.fx === "grainfx") blendFill("soft-light", `rgba(200,150,80,${(0.25 * fxA).toFixed(3)})`);
    }
    if (cp.vignette > 0) {
      const g = tctx.createRadialGradient(0, 0, Math.min(dw, dh) * 0.25, 0, 0, Math.hypot(dw, dh) * 0.55);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, `rgba(0,0,0,${(cp.vignette * 0.85).toFixed(3)})`);
      tctx.fillStyle = g;
      tctx.fillRect(x0, y0, dw, dh);
    }
    if (c.fx === "bars") {
      tctx.fillStyle = "#000";
      const bh = Math.min(dh, H) * 0.11 * (0.4 + fxA);
      tctx.setTransform(1, 0, 0, 1, 0, 0);
      tctx.fillRect(0, 0, W, bh); tctx.fillRect(0, H - bh, W, bh);
    }
    tctx.restore();
    if (layer) {
      ctx.save();
      ctx.globalAlpha = clamp(c.opacity * an.a, 0, 1);
      if (c.blend && c.blend !== "source-over") ctx.globalCompositeOperation = c.blend;
      ctx.drawImage(layer, 0, 0);
      ctx.restore();
    }
  }

  // ---------- teks ----------
  function wrapLines(ctx, text, maxW) {
    const out = [];
    String(text).split("\n").forEach((para) => {
      const words = para.split(/(\s+)/);
      let line = "";
      words.forEach((w) => {
        const test = line + w;
        if (line && ctx.measureText(test.trimEnd()).width > maxW && w.trim()) { out.push(line.trimEnd()); line = w.trimStart(); }
        else line = test;
      });
      out.push(line.trimEnd());
    });
    return out;
  }
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function hexA(hex, a) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
    return `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;
  }
  function drawText(ctx, c, t, W, H) {
    if (!c.text) return;
    loadFont(c.font);
    const k = W / P.w;
    const an = animState(c, t);
    const fs = Math.max(1, c.size * k);
    ctx.save();
    ctx.font = `${c.italic ? "italic " : ""}${c.weight || 700} ${fs}px "${c.font}", "Plus Jakarta Sans", sans-serif`;
    if (LS_OK) ctx.letterSpacing = `${(c.spacing || 0) * k}px`;
    let lines = wrapLines(ctx, c.text, c.boxW * W);
    if (an.chars < 1) {
      let left = Math.floor(an.chars * lines.join("").length);
      lines = lines.map((l) => { const s = l.slice(0, Math.max(0, left)); left -= l.length; return s; });
    }
    const lh = fs * (c.lineH || 1.15);
    const widths = lines.map((l) => ctx.measureText(l).width);
    const blockW = Math.max(1, ...widths), blockH = lh * lines.length;
    const cx = c.x * W + an.dx * W, cy = c.y * H + an.dy * H;
    const rot = (c.rot * Math.PI) / 180 + an.r;
    const pad = (c.bgOn ? c.bgPad * fs : 0) + fs * 0.1;
    boundsOf.set(c, { cx, cy, w: (blockW + pad * 2) * c.scale * an.s, h: (blockH + pad) * c.scale * an.s, r: rot });
    ctx.globalAlpha = clamp(c.opacity * an.a, 0, 1);
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.scale(c.scale * an.s, c.scale * an.s);
    if (FILTER_OK && an.blur > 0.2) ctx.filter = `blur(${(an.blur * k).toFixed(1)}px)`;
    ctx.textBaseline = "middle";
    const lineX = (w) => (c.align === "left" ? -blockW / 2 : c.align === "right" ? blockW / 2 - w : -w / 2);
    // latar per baris
    if (c.bgOn) {
      ctx.fillStyle = hexA(c.bgColor, c.bgAlpha ?? 1);
      lines.forEach((l, i) => {
        if (!l) return;
        const y = -blockH / 2 + i * lh;
        roundRect(ctx, lineX(widths[i]) - c.bgPad * fs, y - fs * 0.02, widths[i] + c.bgPad * fs * 2, lh + fs * 0.04, c.bgRadius * fs);
        ctx.fill();
      });
    }
    let fill = c.color;
    if (c.color2) {
      const g = ctx.createLinearGradient(0, -blockH / 2, 0, blockH / 2);
      g.addColorStop(0, c.color); g.addColorStop(1, c.color2);
      fill = g;
    }
    // kata yang sedang diucapkan (gaya karaoke)
    let hlWord = -1;
    if (c.hl) {
      const total = lines.join(" ").split(/\s+/).filter(Boolean).length;
      hlWord = Math.min(total - 1, Math.floor(clamp((t - c.start) / Math.max(0.1, c.dur), 0, 0.999) * total));
    }
    let wordIdx = 0;
    lines.forEach((l, i) => {
      const y = -blockH / 2 + i * lh + lh / 2;
      const x = lineX(widths[i]);
      const parts = c.hl ? l.split(/(\s+)/) : [l];
      let px = x;
      parts.forEach((part) => {
        if (!part) return;
        const w = ctx.measureText(part).width;
        const isWord = part.trim().length > 0;
        const on = c.hl && isWord && wordIdx === hlWord;
        if (c.shadow > 0) { ctx.shadowColor = c.shadowColor; ctx.shadowBlur = c.shadow * k; ctx.shadowOffsetY = c.shadow * k * 0.25; }
        if (c.stroke > 0) {
          ctx.lineJoin = "round";
          ctx.miterLimit = 2;
          ctx.lineWidth = c.stroke * k * 2;
          ctx.strokeStyle = c.strokeColor;
          ctx.textAlign = "left";
          ctx.strokeText(part, px, y);
          ctx.shadowColor = "transparent";
        }
        ctx.fillStyle = on ? c.hl : fill;
        ctx.textAlign = "left";
        if (on) { ctx.save(); ctx.translate(px + w / 2, y); ctx.scale(1.08, 1.08); ctx.fillText(part, -w / 2, 0); ctx.restore(); }
        else ctx.fillText(part, px, y);
        ctx.shadowColor = "transparent";
        if (isWord) wordIdx++;
        px += w;
      });
    });
    ctx.restore();
  }

  // ---------- transisi ----------
  function drawTransition(ctx, A, B, p, t, W, H) {
    const type = B.trans;
    p = easeInOut(clamp(p, 0, 1));
    const [la, xa] = scratch("trA", W, H);
    const [lb, xb] = scratch("trB", W, H);
    xa.fillStyle = xb.fillStyle = "#000";
    xa.fillRect(0, 0, W, H); xb.fillRect(0, 0, W, H);
    drawVisual(xa, A, Math.min(t, end(A) - 1e-3), W, H, true);
    drawVisual(xb, B, Math.max(t, B.start), W, H, true);
    const draw = (img, a = 1, dx = 0, dy = 0, s = 1, r = 0, blur = 0) => {
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(W / 2 + dx, H / 2 + dy);
      ctx.rotate(r);
      ctx.scale(s, s);
      if (FILTER_OK && blur > 0.2) ctx.filter = `blur(${blur}px)`;
      ctx.drawImage(img, -W / 2, -H / 2, W, H);
      ctx.restore();
    };
    const k = W / P.w;
    switch (type) {
      case "black": case "white":
        draw(p < 0.5 ? la : lb);
        ctx.fillStyle = type === "black" ? `rgba(0,0,0,${1 - Math.abs(p - 0.5) * 2})` : `rgba(255,255,255,${1 - Math.abs(p - 0.5) * 2})`;
        ctx.fillRect(0, 0, W, H);
        break;
      case "slideL": draw(la); draw(lb, 1, (1 - p) * W); break;
      case "slideR": draw(la); draw(lb, 1, -(1 - p) * W); break;
      case "slideU": draw(la); draw(lb, 1, 0, (1 - p) * H); break;
      case "push": draw(la, 1, -p * W); draw(lb, 1, (1 - p) * W); break;
      case "zoomIn": draw(la, 1 - p, 0, 0, 1 + p * 0.6); draw(lb, p, 0, 0, 0.85 + 0.15 * p); break;
      case "zoomOut": draw(la, 1 - p, 0, 0, 1 - p * 0.3); draw(lb, p, 0, 0, 1.3 - 0.3 * p); break;
      case "wipe":
        draw(la);
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, p * W, H); ctx.clip(); draw(lb); ctx.restore();
        break;
      case "circle":
        draw(la);
        ctx.save(); ctx.beginPath(); ctx.arc(W / 2, H / 2, p * Math.hypot(W, H) / 2, 0, Math.PI * 2); ctx.clip(); draw(lb); ctx.restore();
        break;
      case "blur": draw(la, 1, 0, 0, 1, 0, p * 30 * k); draw(lb, p, 0, 0, 1, 0, (1 - p) * 30 * k); break;
      case "spin": draw(la, 1 - p, 0, 0, 1 - p * 0.5, p * Math.PI); draw(lb, p, 0, 0, 0.5 + p * 0.5, (p - 1) * Math.PI); break;
      case "glitchT": {
        const img = p < 0.5 ? la : lb, amp = Math.sin(p * Math.PI);
        for (let b = 0; b < 12; b++) {
          const off = (hash(Math.floor(t * 30) * 7 + b) - 0.5) * 0.25 * amp * W;
          ctx.drawImage(img, 0, (H * b) / 12, W, H / 12, off, (H * b) / 12, W, H / 12 + 1);
        }
        break;
      }
      default: draw(la); draw(lb, p);
    }
  }

  function drawMain(ctx, t, W, H) {
    const mains = mainClips();
    const i = mains.findIndex((c) => t >= c.start && t < end(c));
    if (i < 0) return;
    const c = mains[i], next = mains[i + 1];
    const dn = next ? transDurAt(next) : 0;
    if (next && dn > 0 && t >= next.start - dn / 2) return drawTransition(ctx, c, next, (t - (next.start - dn / 2)) / dn, t, W, H);
    const dc = transDurAt(c);
    if (dc > 0 && t < c.start + dc / 2) return drawTransition(ctx, mains[i - 1], c, (t - (c.start - dc / 2)) / dc, t, W, H);
    drawVisual(ctx, c, t, W, H, true);
  }

  // Satu frame utuh (dipakai pratinjau dan ekspor)
  function renderFrame(ctx, t, W, H, opts = {}) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    drawMain(ctx, t, W, H);
    // trek lain: dari bawah (dekat trek utama) ke atas
    const order = P.tracks.slice().reverse().filter((tr) => tr.kind === "overlay" || tr.kind === "text");
    order.forEach((tr) => {
      P.clips.forEach((c) => {
        if (c.track !== tr.id || t < c.start || t >= end(c)) return;
        if (c.type === "text") drawText(ctx, c, t, W, H);
        else drawVisual(ctx, c, t, W, H, false);
      });
    });
    ctx.restore();
    if (opts.preview) drawSelection(ctx, t);
  }

  // ======================================================================
  // 6. PRATINJAU: kanvas, seleksi, sentuhan
  // ======================================================================
  const canvas = $("vCanvas");
  const vctx = canvas.getContext("2d");
  let renderQueued = false;
  function requestRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      if (!playing) drawPreview();
    });
  }
  function drawPreview() {
    renderFrame(vctx, T, canvas.width, canvas.height, { preview: true });
  }
  function fitCanvas() {
    const box = $("vFitBox");
    const cs = getComputedStyle(box);
    const bw = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const bh = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (bw < 10 || bh < 10) return;
    const ar = P.w / P.h;
    let w = bw, h = bw / ar;
    if (h > bh) { h = bh; w = bh * ar; }
    canvas.style.width = Math.floor(w) + "px";
    canvas.style.height = Math.floor(h) + "px";
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const iw = Math.round(Math.min(P.w, w * dpr)), ih = Math.round((iw * P.h) / P.w);
    if (canvas.width !== iw || canvas.height !== ih) { canvas.width = iw; canvas.height = ih; }
    requestRender();
  }
  new ResizeObserver(fitCanvas).observe($("vFitBox"));

  let guides = null;
  function drawSelection(ctx) {
    const c = clipById(selId);
    if (guides) {
      ctx.save();
      ctx.strokeStyle = "rgba(255,210,74,0.9)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 5]);
      if (guides.x) { ctx.beginPath(); ctx.moveTo(canvas.width / 2, 0); ctx.lineTo(canvas.width / 2, canvas.height); ctx.stroke(); }
      if (guides.y) { ctx.beginPath(); ctx.moveTo(0, canvas.height / 2); ctx.lineTo(canvas.width, canvas.height / 2); ctx.stroke(); }
      ctx.restore();
    }
    if (!c || c.type === "audio" || T < c.start || T >= end(c)) return;
    const b = boundsOf.get(c);
    if (!b) return;
    const dpr = canvas.width / canvas.clientWidth;
    ctx.save();
    ctx.translate(b.cx, b.cy);
    ctx.rotate(b.r);
    ctx.strokeStyle = "#FFD24A";
    ctx.lineWidth = 2 * dpr;
    ctx.setLineDash([7 * dpr, 5 * dpr]);
    ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
    ctx.setLineDash([]);
    ctx.fillStyle = "#FFD24A";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.arc(b.w / 2, b.h / 2, 10 * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  function canvasPt(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * canvas.width, y: ((e.clientY - r.top) / r.height) * canvas.height };
  }
  function toLocal(b, x, y) {
    const dx = x - b.cx, dy = y - b.cy, cs = Math.cos(-b.r), sn = Math.sin(-b.r);
    return { x: dx * cs - dy * sn, y: dx * sn + dy * cs };
  }
  function hitTest(x, y) {
    const order = P.tracks.filter((tr) => tr.kind !== "audio");
    for (const tr of order) { // teks paling atas dulu
      const list = P.clips.filter((c) => c.track === tr.id && T >= c.start && T < end(c));
      for (const c of list.reverse()) {
        const b = boundsOf.get(c);
        if (!b) continue;
        const l = toLocal(b, x, y);
        if (Math.abs(l.x) <= b.w / 2 && Math.abs(l.y) <= b.h / 2) return c;
      }
    }
    return null;
  }
  const ptrs = new Map();
  let cdrag = null;
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    const p = canvasPt(e);
    ptrs.set(e.pointerId, p);
    const sel = clipById(selId);
    if (ptrs.size === 2 && sel && sel.type !== "audio") {
      const [a, b] = [...ptrs.values()];
      cdrag = { mode: "pinch", c: sel, d0: Math.hypot(b.x - a.x, b.y - a.y), a0: Math.atan2(b.y - a.y, b.x - a.x), s0: sel.scale, r0: sel.rot, moved: true };
      return;
    }
    // pegangan sudut: ubah ukuran + putar
    if (sel && sel.type !== "audio" && T >= sel.start && T < end(sel)) {
      const b = boundsOf.get(sel);
      if (b) {
        const l = toLocal(b, p.x, p.y), dpr = canvas.width / canvas.clientWidth;
        if (Math.hypot(l.x - b.w / 2, l.y - b.h / 2) < 22 * dpr) {
          cdrag = { mode: "handle", c: sel, d0: Math.hypot(p.x - b.cx, p.y - b.cy), a0: Math.atan2(p.y - b.cy, p.x - b.cx), s0: sel.scale, r0: sel.rot, moved: false };
          return;
        }
      }
    }
    const hit = hitTest(p.x, p.y);
    if (hit) {
      if (hit.id !== selId) select(hit.id);
      cdrag = { mode: "move", c: hit, px: p.x, py: p.y, x0: hit.x, y0: hit.y, moved: false };
    } else {
      select(null);
      cdrag = null;
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const p = canvasPt(e);
    ptrs.set(e.pointerId, p);
    if (!cdrag) return;
    const c = cdrag.c;
    if (cdrag.mode === "move") {
      const dx = p.x - cdrag.px, dy = p.y - cdrag.py;
      if (!cdrag.moved && Math.hypot(dx, dy) < 4) return;
      cdrag.moved = true;
      let nx = cdrag.x0 + dx / canvas.width, ny = cdrag.y0 + dy / canvas.height;
      guides = { x: Math.abs(nx - 0.5) < 0.012, y: Math.abs(ny - 0.5) < 0.012 };
      if (guides.x) nx = 0.5;
      if (guides.y) ny = 0.5;
      c.x = nx; c.y = ny;
    } else if (cdrag.mode === "handle") {
      const b = boundsOf.get(c);
      if (!b) return;
      cdrag.moved = true;
      const d = Math.hypot(p.x - b.cx, p.y - b.cy), a = Math.atan2(p.y - b.cy, p.x - b.cx);
      c.scale = clamp(cdrag.s0 * (d / Math.max(1, cdrag.d0)), 0.05, 12);
      let r = cdrag.r0 + ((a - cdrag.a0) * 180) / Math.PI;
      for (const snap of [-180, -90, 0, 90, 180]) if (Math.abs(r - snap) < 3) r = snap;
      c.rot = Math.round(r * 10) / 10;
    } else if (cdrag.mode === "pinch" && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      c.scale = clamp(cdrag.s0 * (Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, cdrag.d0)), 0.05, 12);
      c.rot = Math.round((cdrag.r0 + ((Math.atan2(b.y - a.y, b.x - a.x) - cdrag.a0) * 180) / Math.PI) * 10) / 10;
    }
    requestRender();
    syncInspectorValues();
  });
  const endCanvasDrag = (e) => {
    ptrs.delete(e.pointerId);
    if (cdrag && cdrag.moved && ptrs.size === 0) commit();
    if (ptrs.size === 0) cdrag = null;
    guides = null;
    requestRender();
  };
  canvas.addEventListener("pointerup", endCanvasDrag);
  canvas.addEventListener("pointercancel", endCanvasDrag);
  canvas.addEventListener("dblclick", () => {
    const c = clipById(selId);
    if (c && c.type === "text") openInspector(true);
  });
  canvas.addEventListener("wheel", (e) => {
    const c = clipById(selId);
    if (!c || c.type === "audio") return;
    e.preventDefault();
    c.scale = clamp(c.scale * Math.exp(-e.deltaY * 0.0015), 0.05, 12);
    requestRender();
    syncInspectorValues();
    clearTimeout(canvas._wheelT);
    canvas._wheelT = setTimeout(commit, 350);
  }, { passive: false });

  // ======================================================================
  // 7. PEMUTARAN: jam utama + sinkron elemen media
  // ======================================================================
  function syncMedia(isPlaying) {
    P.clips.forEach((c) => {
      if (c.type !== "video" && c.type !== "audio") return;
      const [vs, ve] = visibleRange(c);
      const el = clipEl(c);
      if (!el) return;
      const active = T >= vs && T < ve;
      if (!active) {
        if (!el.paused) el.pause();
        // siapkan klip berikutnya supaya tidak berkedip hitam saat gilirannya tiba
        if (T < vs && vs - T < 1.5 && el._preT !== vs && !el.seeking && el.readyState >= 1) {
          el._preT = vs;
          el.currentTime = srcTime(c, vs);
        }
        if (el._gain) el._gain.gain.value = 0;
        return;
      }
      el._preT = null;
      const desired = srcTime(c, T);
      const audible = isPlaying && hasSound(c) && !c.mute && !c.reverse && T >= c.start && T < end(c);
      const g = isPlaying ? wireEl(el, c) : el._gain;
      if (g) g.gain.value = audible ? c.volume * fadeGain(c, T - c.start) : 0;
      else el.volume = audible ? clamp(c.volume * fadeGain(c, T - c.start), 0, 1) : 0;
      if (isPlaying && !c.reverse && T >= c.start - 0.05) {
        if (el.playbackRate !== c.speed) el.playbackRate = clamp(c.speed, 0.0625, 16);
        if ("preservesPitch" in el) el.preservesPitch = c.keepPitch !== false;
        if (el.paused) {
          el.currentTime = desired;
          const pr = el.play();
          if (pr && pr.catch) pr.catch(() => {});
        } else if (Math.abs(el.currentTime - desired) > 0.3) el.currentTime = desired;
      } else {
        if (!el.paused) el.pause();
        if (!el.seeking && Math.abs(el.currentTime - desired) > 0.02) el.currentTime = desired;
      }
    });
  }

  let rafId = 0;
  function loop(now) {
    if (!playing) return;
    T = playT0 + (now - playW0) / 1000;
    const D = playEnd ?? projectDur();
    if (T >= D) {
      T = D;
      pause();
      if (realtime) realtime.done();
      return;
    }
    syncMedia(true);
    if (realtime) realtime.frame(T);
    else drawPreview();
    updateClock();
    rafId = requestAnimationFrame(loop);
  }
  let playEnd = null, realtime = null;
  function play() {
    const D = projectDur();
    if (!D) return showToast("Timeline masih kosong. Impor video atau foto dulu.");
    if (T >= D - 0.02) T = 0;
    audioCtx();
    // iOS: buka kunci semua elemen media dalam satu sentuhan
    P.clips.forEach((c) => {
      if (c.type !== "video" && c.type !== "audio") return;
      const el = clipEl(c);
      if (!el) return;
      wireEl(el, c);
      if (el._gain) el._gain.gain.value = 0;
      if (!el._unlocked) {
        el._unlocked = true;
        const [vs, ve] = visibleRange(c);
        if (!(T >= vs && T < ve)) { const pr = el.play(); if (pr && pr.then) pr.then(() => { if (!(T >= visibleRange(c)[0] && T < visibleRange(c)[1]) || !playing) el.pause(); }).catch(() => {}); }
      }
    });
    playing = true;
    playT0 = T;
    playW0 = performance.now();
    playEnd = null;
    setPlayIcon();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }
  function pause() {
    playing = false;
    cancelAnimationFrame(rafId);
    els.forEach((el) => { if (!el.paused) el.pause(); });
    setPlayIcon();
    syncMedia(false);
    requestRender();
    updateClock();
  }
  function setPlayIcon() {
    $("vPlayIcon").innerHTML = playing ? '<path d="M7 5h4v14H7zm6 0h4v14h-4z"/>' : '<path d="M8 5v14l11-7z"/>';
    $("vPlay").setAttribute("aria-label", playing ? "Jeda" : "Putar");
  }
  function setT(t) {
    T = clamp(t, 0, Math.max(0, projectDur()));
    if (playing) { playT0 = T; playW0 = performance.now(); }
    syncMedia(playing);
    requestRender();
    updateClock();
  }

  // Ekspor real-time (cadangan untuk browser tanpa WebCodecs): putar timeline sambil merekam
  function startRealtime(a, b, onFrame) {
    return new Promise((resolve) => {
      pause();
      audioCtx();
      T = a;
      realtime = { frame: onFrame, done: () => { realtime = null; resolve(); } };
      play();
      playT0 = a;
      playEnd = b;
    });
  }
  function stopRealtime() {
    if (realtime) { const r = realtime; realtime = null; pause(); r.done && r.done(); }
  }

  // Ekspor frame-demi-frame: tunggu semua video aktif berada di frame yang tepat
  function seekEl(el, time) {
    return new Promise((resolve) => {
      if (el.readyState >= 2 && Math.abs(el.currentTime - time) < 0.001 && !el.seeking) return resolve();
      let done = false;
      const fin = () => { if (done) return; done = true; el.removeEventListener("seeked", fin); clearTimeout(to); resolve(); };
      const to = setTimeout(fin, 5000);
      el.addEventListener("seeked", fin);
      el.currentTime = time;
    });
  }
  async function prepareFrame(t) {
    const jobs = [];
    P.clips.forEach((c) => {
      if (c.type !== "video") return;
      const [vs, ve] = visibleRange(c);
      if (t < vs || t >= ve) return;
      const el = clipEl(c);
      if (!el) return;
      if (!el.paused) el.pause();
      const tt = srcTime(c, clamp(t, c.start, end(c) - 1e-3));
      jobs.push((async () => {
        if (el.readyState < 1) await new Promise((r) => { el.addEventListener("loadedmetadata", r, { once: true }); setTimeout(r, 8000); });
        await seekEl(el, tt);
        if (el.readyState < 2) await new Promise((r) => { el.addEventListener("loadeddata", r, { once: true }); setTimeout(r, 3000); });
      })());
    });
    await Promise.all(jobs);
  }

  // ======================================================================
  // 8. AKSI EDIT
  // ======================================================================
  function select(id) {
    selId = id;
    renderTimelineSel();
    renderInspector();
    requestRender();
  }
  function addMediaToTimeline(mediaId, where = "main", silent = false) {
    const m = media.get(mediaId);
    if (!m) return;
    const dur = m.kind === "image" ? 3 : m.duration || 3;
    let c;
    if (m.kind === "audio") {
      c = newClip("audio", mediaId, null, T, dur);
      c.track = ensureTrack("audio", c.start, c.dur);
    } else if (where === "overlay") {
      c = newClip(m.kind, mediaId, null, T, Math.min(dur, Math.max(3, projectDur() - T) || dur), { fit: "contain", scale: 0.55 });
      if (m.kind === "video") c.dur = Math.min(dur, c.dur);
      c.track = ensureTrack("overlay", c.start, c.dur);
    } else {
      c = newClip(m.kind, mediaId, "main", 0, dur);
      // sisipkan setelah klip utama yang sedang di bawah playhead
      const mains = mainClips();
      const under = silent ? null : mains.find((x) => T >= x.start && T < end(x)); // impor massal: berurutan di belakang
      c.start = under ? end(under) - 0.0001 : projectDur();
      if (under && T - under.start < under.dur / 2) c.start = under.start - 0.0001;
    }
    P.clips.push(c);
    normalize();
    if (!silent) {
      selId = c.id;
      commit();
      if (where !== "main" || m.kind === "audio") setT(c.start);
      showToast(m.kind === "audio" ? "Audio ditambahkan" : where === "overlay" ? "Ditambahkan sebagai overlay (gambar di atas gambar)" : "Klip ditambahkan ke trek utama");
    }
    return c;
  }
  function addText(style, text) {
    const c = newTextClip(T, style, text);
    c.track = ensureTrack("text", c.start, c.dur);
    P.clips.push(c);
    loadFont(c.font);
    selId = c.id;
    commit();
    openInspector(true);
    setTimeout(() => { const ta = $("vInspector").querySelector("textarea"); if (ta && !matchMedia("(max-width:1023px)").matches) { ta.focus(); ta.select(); } }, 50);
    return c;
  }
  function splitAt(c, t) {
    if (!c || t <= c.start + 0.05 || t >= end(c) - 0.05) return null;
    const leftDur = t - c.start, rightDur = c.dur - leftDur;
    const r = JSON.parse(JSON.stringify(c));
    r.id = uid("c");
    r.start = t;
    r.dur = rightDur;
    if (c.reverse) { r.in = c.in; c.in = c.in + rightDur * c.speed; }
    else r.in = c.in + leftDur * c.speed;
    c.dur = leftDur;
    r.trans = "none"; r.animIn = "none"; r.fadeIn = 0;
    c.animOut = "none"; c.fadeOut = 0;
    P.clips.push(r);
    return r;
  }
  function doSplit() {
    let c = clipById(selId);
    if (!c || T <= c.start || T >= end(c)) c = mainClips().find((x) => T > x.start && T < end(x));
    if (!c) return showToast("Taruh playhead di tengah klip untuk memotong");
    const r = splitAt(c, T);
    if (!r) return showToast("Terlalu dekat dengan tepi klip");
    normalize();
    selId = r.id;
    commit();
    showToast("Klip dipotong");
  }
  function doDelete() {
    const c = clipById(selId);
    if (!c) return showToast("Pilih klip dulu");
    P.clips = P.clips.filter((x) => x.id !== c.id);
    selId = null;
    normalize();
    commit();
    setT(Math.min(T, projectDur()));
    showToast("Klip dihapus (Ctrl+Z untuk membatalkan)");
  }
  function doDuplicate() {
    const c = clipById(selId);
    if (!c) return showToast("Pilih klip dulu");
    const d = JSON.parse(JSON.stringify(c));
    d.id = uid("c");
    d.start = end(c) - (isMain(c) ? 0.0001 : 0);
    if (!isMain(c)) d.track = ensureTrack(kindOfTrack(c.track), d.start, d.dur);
    P.clips.push(d);
    normalize();
    selId = d.id;
    commit();
    showToast("Klip diduplikat");
  }
  async function doFreeze() {
    const c = clipById(selId) || mainClips().find((x) => T >= x.start && T < end(x));
    if (!c || c.type !== "video" || T < c.start || T >= end(c)) return showToast("Pilih klip video dan taruh playhead di frame yang ingin dibekukan");
    const el = clipEl(c);
    await seekEl(el, srcTime(c, T));
    const cv = document.createElement("canvas");
    cv.width = el.videoWidth; cv.height = el.videoHeight;
    cv.getContext("2d").drawImage(el, 0, 0);
    const blob = await new Promise((r) => cv.toBlob(r, "image/jpeg", 0.95));
    const m = await importFile(new File([blob], `Frame beku ${fmtT(T)}.jpg`, { type: "image/jpeg" }), "image");
    if (!m) return;
    renderMediaBin();
    const r = splitAt(c, T) || null;
    const f = newClip("image", m.id, c.track, T - 0.0001, 3, { x: c.x, y: c.y, scale: c.scale, rot: c.rot, fit: c.fit, adj: { ...c.adj }, look: c.look, lookAmt: c.lookAmt });
    if (!isMain(c)) { f.start = T; f.track = ensureTrack("overlay", f.start, f.dur); }
    P.clips.push(f);
    if (r && !isMain(c)) r.start += 3;
    normalize();
    selId = f.id;
    commit();
    showToast("Frame dibekukan 3 detik");
  }
  function extractAudio() {
    const c = clipById(selId);
    if (!c || c.type !== "video") return showToast("Pilih klip video dulu");
    if ((media.get(c.mediaId) || {}).hasAudio === false) return showToast("Video ini tidak punya suara");
    const a = newClip("audio", c.mediaId, null, c.start, c.dur, { in: c.in, speed: c.speed, reverse: c.reverse, keepPitch: c.keepPitch, volume: c.volume, fadeIn: c.fadeIn, fadeOut: c.fadeOut, voice: c.voice, denoise: c.denoise });
    a.track = ensureTrack("audio", a.start, a.dur);
    c.mute = true;
    P.clips.push(a);
    selId = a.id;
    commit();
    showToast("Audio dipisahkan ke trek audio. Suara di klip video dimatikan.");
  }
  function setSpeed(c, s) {
    s = clamp(s, 0.1, 10);
    const window = c.dur * c.speed;
    c.speed = s;
    c.dur = Math.max(MIN_DUR, window / s);
    normalize();
  }
  function addMarker(t = T) {
    if (P.markers.some((m) => Math.abs(m - t) < 0.05)) return;
    P.markers.push(Math.round(t * 1000) / 1000);
    P.markers.sort((a, b) => a - b);
    commit();
  }
  async function autoBeats() {
    const c = clipById(selId);
    const target = c && hasSound(c) ? c : P.clips.find((x) => x.type === "audio");
    if (!target) return showToast("Pilih klip audio/musik dulu");
    showToast("Mendeteksi ketukan…");
    const buf = await decodeMedia(target.mediaId);
    if (!buf) return showToast("Audio tidak bisa dibaca");
    const sr = buf.sampleRate, hop = 512, d = buf.getChannelData(0);
    const n = Math.floor(d.length / hop);
    const env = new Float32Array(n);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      let e = 0;
      for (let j = i * hop; j < (i + 1) * hop; j++) { lp += 0.15 * (d[j] - lp); e += lp * lp; } // energi frekuensi rendah (kick)
      env[i] = Math.sqrt(e / hop);
    }
    const flux = new Float32Array(n);
    for (let i = 1; i < n; i++) flux[i] = Math.max(0, env[i] - env[i - 1]);
    const beats = [];
    const win = Math.round((0.5 * sr) / hop), minGap = 0.28;
    for (let i = 1; i < n - 1; i++) {
      let mean = 0;
      const a = Math.max(0, i - win), b = Math.min(n, i + win);
      for (let j = a; j < b; j++) mean += flux[j];
      mean /= b - a;
      if (flux[i] > mean * 2.2 && flux[i] > flux[i - 1] && flux[i] >= flux[i + 1]) {
        const s = (i * hop) / sr;
        if (!beats.length || s - beats[beats.length - 1] > minGap) beats.push(s);
      }
    }
    let added = 0;
    beats.forEach((s) => {
      if (s < target.in || s > target.in + target.dur * target.speed) return;
      const tl = target.start + (target.reverse ? target.dur - (s - target.in) / target.speed : (s - target.in) / target.speed);
      if (!P.markers.some((m) => Math.abs(m - tl) < 0.05)) { P.markers.push(Math.round(tl * 1000) / 1000); added++; }
    });
    P.markers.sort((a, b) => a - b);
    commit();
    showToast(added ? `${added} ketukan ditandai. Klip akan menempel ke ketukan saat digeser.` : "Tidak ada ketukan jelas yang terdeteksi");
  }

  // Rekam sulih suara sambil memutar timeline
  let rec = null;
  async function toggleRecord() {
    if (rec) { rec.stop(); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { return showToast("Mikrofon tidak diizinkan"); }
    const mime = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || "";
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks = [], t0 = T;
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      rec = null;
      pause();
      $("vRecLabel").textContent = "Rekam Sulih Suara";
      $("vRecDot").classList.remove("animate-pulse");
      const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
      const n = [...media.values()].filter((m) => /^Sulih Suara/.test(m.name)).length + 1;
      const m = await importFile(new File([blob], `Sulih Suara ${n}.${/mp4/.test(blob.type) ? "m4a" : "webm"}`, { type: blob.type }), "audio");
      if (!m) return;
      const buf = await decodeMedia(m.id);
      if (buf) m.duration = buf.duration;
      renderMediaBin();
      const c = newClip("audio", m.id, null, t0, m.duration || 1);
      c.track = ensureTrack("audio", c.start, c.dur);
      P.clips.push(c);
      selId = c.id;
      commit();
      showToast("Sulih suara ditambahkan");
    };
    mr.start(250);
    rec = mr;
    $("vRecLabel").textContent = "Berhenti Merekam";
    $("vRecDot").classList.add("animate-pulse");
    if (projectDur() > 0) play();
    showToast("Merekam… timeline diputar supaya kamu bisa menyesuaikan suara");
  }

  // ======================================================================
  // 9. RIWAYAT & PENYIMPANAN OTOMATIS
  // ======================================================================
  function commit() {
    normalize();
    const snap = JSON.stringify(P);
    if (history[hIdx] !== snap) {
      history.splice(hIdx + 1);
      history.push(snap);
      if (history.length > 80) history.shift();
      hIdx = history.length - 1;
    }
    afterChange();
    store.saveProjectSoon();
  }
  function restore(snap) {
    P = JSON.parse(snap);
    if (selId && !clipById(selId)) selId = null;
    afterChange();
    store.saveProjectSoon();
  }
  function afterChange() {
    gcEls();
    renderTimeline();
    renderInspector();
    $("vUndo").disabled = hIdx <= 0;
    $("vRedo").disabled = hIdx >= history.length - 1;
    $("vAspect").value = P.aspect;
    fitCanvas();
    syncMedia(playing);
    updateClock();
    requestRender();
  }
  function undo() { if (hIdx > 0) { hIdx--; restore(history[hIdx]); } }
  function redo() { if (hIdx < history.length - 1) { hIdx++; restore(history[hIdx]); } }

  const store = (() => {
    let dbp = null, saveT = 0;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      const r = indexedDB.open("sne-video", 1);
      r.onupgradeneeded = () => { r.result.createObjectStore("media", { keyPath: "id" }); r.result.createObjectStore("kv"); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
    const tx = async (store, mode, fn) => {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction(store, mode), q = fn(t.objectStore(store));
        t.oncomplete = () => res(q && q.result);
        t.onerror = t.onabort = () => rej(t.error);
      });
    };
    let warned = false;
    const warn = (e) => { console.warn(e); if (!warned) { warned = true; showToast("Penyimpanan browser penuh/diblokir: proyek tidak tersimpan otomatis"); } };
    return {
      saveMedia(m) {
        const row = { id: m.id, kind: m.kind, name: m.name, blob: m.blob, duration: m.duration, w: m.w, h: m.h, thumb: m.thumb, peaks: m.peaks || null, hasAudio: m.hasAudio, alpha: !!m.alpha };
        tx("media", "readwrite", (s) => s.put(row)).catch(warn);
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      },
      removeMedia(id) { tx("media", "readwrite", (s) => s.delete(id)).catch(() => {}); },
      saveProjectSoon() {
        clearTimeout(saveT);
        saveT = setTimeout(() => tx("kv", "readwrite", (s) => s.put(JSON.stringify(P), "project")).then(() => {
          $("vProjInfo").textContent = `Tersimpan otomatis · ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`;
        }).catch(warn), 700);
      },
      async load() {
        try {
          const rows = (await tx("media", "readonly", (s) => s.getAll())) || [];
          for (const r of rows) {
            if (!r.blob) continue;
            const m = { ...r, url: URL.createObjectURL(r.blob) };
            if (m.kind === "image") m.img = await loadImg(m.url);
            media.set(m.id, m);
            if (m.kind !== "image" && !m.peaks) computePeaks(m);
          }
          const pj = await tx("kv", "readonly", (s) => s.get("project"));
          return pj || null;
        } catch (e) {
          console.warn(e);
          return null;
        }
      }
    };
  })();

  // ======================================================================
  // 10. TIMELINE (DOM)
  // ======================================================================
  const tl = $("vTl"), rows = $("vRows"), inner = $("vTlInner"), ruler = $("vRuler"), playhead = $("vPlayhead");
  let pps = 60;
  const ROW_H = { main: 60, overlay: 46, text: 32, audio: 40 };
  const zoomToPps = (v) => 6 * Math.pow(2, (v / 100) * 7);
  pps = zoomToPps(+$("vZoom").value);
  const tx = (t) => PAD + t * pps;

  function renderTimeline() {
    const D = projectDur();
    inner.style.width = Math.max(tl.clientWidth, tx(D) + Math.max(240, tl.clientWidth * 0.6)) + "px";
    let html = "";
    P.tracks.forEach((tr) => {
      const h = ROW_H[tr.kind] || 44;
      html += `<div class="vrow ${tr.kind}" data-track="${tr.id}" data-kind="${tr.kind}" style="height:${h}px">`;
      P.clips.filter((c) => c.track === tr.id).forEach((c) => {
        const m = media.get(c.mediaId);
        const kind = c.type === "text" ? "text" : c.type === "audio" ? "audio" : tr.kind === "main" ? "main" : "overlay";
        let style = `left:${tx(c.start)}px;width:${Math.max(6, c.dur * pps)}px;`;
        if (m && m.thumb && c.type !== "audio") style += `background-image:url(${m.thumb});`;
        const label = c.type === "text" ? esc(c.text.replace(/\n/g, " ")) : esc(m ? m.name : "Media hilang");
        const badges = [];
        if (c.speed !== 1) badges.push(`${+c.speed.toFixed(2)}x`);
        if (c.reverse) badges.push("⟲");
        if (c.mute && c.type === "video") badges.push("🔇");
        if (c.look !== "none" && c.type !== "audio" && c.type !== "text") badges.push("🎨");
        if (c.fx !== "none" && c.type !== "audio" && c.type !== "text") badges.push("✨");
        html += `<div class="vclip k-${kind}${c.id === selId ? " sel" : ""}" data-clip="${c.id}" style="${style}">` +
          (c.type === "audio" ? `<canvas class="wave" style="position:absolute;inset:0;width:100%;height:100%"></canvas>` : "") +
          `<span class="lbl">${label}</span>${badges.length ? `<span class="badge">${badges.join(" ")} · ${c.dur.toFixed(1)}s</span>` : `<span class="badge">${c.dur.toFixed(1)}s</span>`}` +
          `<span class="hl" data-trim="l"></span><span class="hr" data-trim="r"></span></div>`;
      });
      if (tr.kind === "main") {
        mainClips().forEach((c, i) => {
          if (i === 0) return;
          html += `<div class="vtrans${c.trans !== "none" ? " on" : ""}" data-trans="${c.id}" style="left:${tx(c.start)}px" title="Transisi: ${esc((TRANSITIONS.find((x) => x[0] === c.trans) || ["", "Tanpa"])[1])}"><svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M4 12h16M14 6l6 6-6 6"/></svg></div>`;
        });
        if (!P.clips.some(isMain)) html += `<div class="absolute inset-y-2 flex items-center text-[11px] text-[#737373] font-semibold" style="left:${PAD + 6}px">Trek utama — impor video/foto lalu ketuk untuk menaruhnya di sini</div>`;
      }
      html += "</div>";
    });
    rows.innerHTML = html;
    P.markers.forEach((mk) => { const d = document.createElement("div"); d.className = "vmarker"; d.style.left = tx(mk) + "px"; rows.appendChild(d); });
    rows.querySelectorAll(".vclip").forEach((el) => {
      const c = clipById(el.dataset.clip);
      const cv = el.querySelector("canvas.wave");
      if (cv && c) drawWave(cv, c, el);
    });
    updatePlayhead();
    drawRuler();
  }
  function drawWave(cv, c, el) {
    const m = media.get(c.mediaId);
    const w = Math.min(4000, Math.max(6, Math.round(c.dur * pps))), h = (el.clientHeight || 32) - 4;
    cv.width = w; cv.height = h;
    const x = cv.getContext("2d");
    if (!m || !m.peaks) return;
    x.fillStyle = "rgba(255,255,255,0.75)";
    for (let i = 0; i < w; i++) {
      const tLocal = (i / w) * c.dur;
      const s = c.reverse ? c.in + (c.dur - tLocal) * c.speed : c.in + tLocal * c.speed;
      const v = m.peaks[Math.floor(s * 50)] || 0;
      const vh = Math.max(1, v * h * 0.9 * Math.min(2, c.volume));
      x.fillRect(i, (h - vh) / 2 + 2, 1, vh);
    }
  }
  function renderTimelineSel() {
    rows.querySelectorAll(".vclip").forEach((el) => el.classList.toggle("sel", el.dataset.clip === selId));
  }
  function updatePlayhead() {
    playhead.style.left = tx(T) - 1 + "px";
    drawRuler();
  }
  function drawRuler() {
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = tl.clientWidth;
    if (ruler.width !== Math.round(W * dpr)) { ruler.width = Math.round(W * dpr); ruler.style.width = W + "px"; }
    const x = ruler.getContext("2d");
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, W, 24);
    x.fillStyle = "#FAFAF8";
    x.fillRect(0, 0, W, 24);
    const sl = tl.scrollLeft;
    const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    const major = steps.find((s) => s * pps >= 70) || 600;
    const minor = major / 5;
    const t0 = Math.max(0, (sl - PAD) / pps), t1 = (sl + W - PAD) / pps;
    x.font = "600 10px 'Plus Jakarta Sans', sans-serif";
    x.textBaseline = "top";
    for (let t = Math.floor(t0 / minor) * minor; t <= t1; t += minor) {
      const px = tx(t) - sl;
      const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
      x.fillStyle = isMajor ? "#737373" : "#C9C9C4";
      x.fillRect(Math.round(px), isMajor ? 12 : 17, 1, isMajor ? 12 : 7);
      if (isMajor) {
        const m = Math.floor(t / 60), s = t - m * 60;
        x.fillText(major < 1 ? `${m}:${s.toFixed(1).padStart(4, "0")}` : `${m}:${String(Math.round(s)).padStart(2, "0")}`, Math.round(px) + 3, 2);
      }
    }
    x.fillStyle = "#F59E0B";
    P.markers.forEach((mk) => { const px = tx(mk) - sl; if (px > -5 && px < W + 5) { x.beginPath(); x.arc(px, 20, 3, 0, Math.PI * 2); x.fill(); } });
    const ph = tx(T) - sl;
    x.fillStyle = "#B42318";
    x.fillRect(ph - 1, 0, 2, 24);
  }
  tl.addEventListener("scroll", drawRuler, { passive: true });
  new ResizeObserver(() => renderTimeline()).observe(tl);

  function autoScroll() {
    const px = tx(T);
    if (px < tl.scrollLeft + 30 || px > tl.scrollLeft + tl.clientWidth - 40) tl.scrollLeft = Math.max(0, px - tl.clientWidth * 0.3);
  }
  function updateClock() {
    $("vTime").textContent = `${fmtT(T)} / ${fmtT(projectDur())}`;
    updatePlayhead();
    if (playing) autoScroll();
  }

  // ---------- interaksi timeline ----------
  function snapPoints(excl) {
    const pts = [0, T, ...P.markers];
    P.clips.forEach((c) => { if (c.id !== excl) pts.push(c.start, end(c)); });
    return pts;
  }
  const snapOn = () => $("vSnap").getAttribute("aria-pressed") === "true";
  function snap(t, excl, extra = []) {
    if (!snapOn()) return { t, s: null };
    const th = 9 / pps;
    let best = null, bd = th;
    for (const p of snapPoints(excl).concat(extra)) { const d = Math.abs(p - t); if (d < bd) { bd = d; best = p; } }
    return best === null ? { t, s: null } : { t: best, s: best };
  }
  function showSnap(t) {
    const sl = $("vSnapLine");
    if (t === null || t === undefined) { sl.style.display = "none"; return; }
    sl.style.display = "block";
    sl.style.left = tx(t) + "px";
  }
  const tptrs = new Map();
  let td = null;
  const tlTime = (e) => (e.clientX - tl.getBoundingClientRect().left + tl.scrollLeft - PAD) / pps;
  tl.addEventListener("pointerdown", (e) => {
    if (e.button > 0) return;
    tptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    tl.setPointerCapture(e.pointerId);
    if (tptrs.size === 2) { // cubit untuk zoom
      const [a, b] = [...tptrs.values()];
      clearTimeout(td && td.lp);
      td = { mode: "pinch", d0: Math.abs(a.x - b.x), z0: +$("vZoom").value, tAt: tlTime({ clientX: (a.x + b.x) / 2 }) };
      return;
    }
    const touch = e.pointerType !== "mouse";
    const onRuler = e.target === ruler || e.clientY - tl.getBoundingClientRect().top < 24;
    const clipEl = e.target.closest(".vclip");
    const trans = e.target.closest(".vtrans");
    if (trans) {
      select(trans.dataset.trans);
      openLeftTab("trans");
      td = null;
      return;
    }
    if (onRuler) {
      if (playing) pause();
      td = { mode: "scrub" };
      setT(tlTime(e));
      return;
    }
    if (clipEl) {
      const c = clipById(clipEl.dataset.clip);
      if (!c) return;
      const trim = e.target.dataset.trim;
      const base = { c, el: clipEl, x0: e.clientX, y0: e.clientY, sl0: tl.scrollLeft, orig: { start: c.start, dur: c.dur, in: c.in, track: c.track }, moved: false };
      if (trim) {
        if (playing) pause();
        td = { ...base, mode: "trim-" + trim };
        return;
      }
      if (c.id !== selId) select(c.id);
      td = { ...base, mode: touch ? "pending" : "move-wait" };
      if (touch) td.lp = setTimeout(() => { if (td && td.mode === "pending") { td.mode = "move"; clipEl.classList.add("drag"); if (navigator.vibrate) navigator.vibrate(12); } }, 320);
      return;
    }
    td = { mode: touch ? "pan" : "seek", x0: e.clientX, y0: e.clientY, sl0: tl.scrollLeft, st0: tl.scrollTop, moved: false, t: tlTime(e) };
  });
  tl.addEventListener("pointermove", (e) => {
    if (!tptrs.has(e.pointerId)) return;
    tptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!td) return;
    if (td.mode === "pinch" && tptrs.size >= 2) {
      const [a, b] = [...tptrs.values()];
      const z = clamp(td.z0 + Math.log2(Math.max(10, Math.abs(a.x - b.x)) / Math.max(10, td.d0)) * (100 / 7), 0, 100);
      setZoom(z, td.tAt, (a.x + b.x) / 2);
      return;
    }
    const dx = e.clientX - td.x0, dy = e.clientY - td.y0;
    if (td.mode === "scrub") { setT(tlTime(e)); return; }
    if (td.mode === "pending") {
      if (Math.hypot(dx, dy) > 8) { clearTimeout(td.lp); td = { mode: "pan", x0: td.x0, y0: td.y0, sl0: td.sl0, st0: tl.scrollTop, moved: true }; }
      return;
    }
    if (td.mode === "pan") { td.moved = td.moved || Math.hypot(dx, dy) > 6; tl.scrollLeft = td.sl0 - dx; tl.scrollTop = td.st0 - dy; return; }
    if (td.mode === "seek") { if (Math.hypot(dx, dy) > 4) { td.mode = "scrub"; if (playing) pause(); } return; }
    if (td.mode === "move-wait") { if (Math.hypot(dx, dy) < 4) return; td.mode = "move"; td.el.classList.add("drag"); }
    const c = td.c, dt = (dx + tl.scrollLeft - td.sl0) / pps;
    td.moved = true;
    if (td.mode === "move") {
      let ns = Math.max(0, td.orig.start + dt);
      const a = snap(ns, c.id), b = snap(ns + c.dur, c.id);
      let s = null;
      if (a.s !== null && (b.s === null || Math.abs(a.t - ns) <= Math.abs(b.t - (ns + c.dur)))) { ns = a.t; s = a.s; }
      else if (b.s !== null) { ns = b.t - c.dur; s = b.s; }
      td.ns = Math.max(0, ns);
      showSnap(s);
      td.el.style.left = tx(td.ns) + "px";
      // baris tujuan di bawah jari
      const row = rowAt(e.clientY);
      rows.querySelectorAll(".vrow.drop").forEach((r) => r.classList.remove("drop"));
      td.row = null;
      if (row && compatible(c, row.dataset.kind)) {
        td.row = row.dataset.track;
        if (row.dataset.track !== c.track) row.classList.add("drop");
      }
      edgeScroll(e);
    } else if (td.mode === "trim-r") {
      let nd = clamp(td.orig.dur + dt, MIN_DUR, c.type === "image" || c.type === "text" ? 3600 : maxDur({ ...c, dur: td.orig.dur }));
      const s = snap(c.start + nd, c.id);
      if (s.s !== null && s.t - c.start >= MIN_DUR) nd = Math.min(s.t - c.start, c.type === "image" || c.type === "text" ? 3600 : maxDur(c));
      showSnap(s.s);
      c.dur = nd;
      td.el.style.width = nd * pps + "px";
      requestRender();
      edgeScroll(e);
    } else if (td.mode === "trim-l") {
      const o = td.orig;
      let d = dt;
      if (c.type === "video" || c.type === "audio") d = Math.max(d, c.reverse ? -(mediaDur(c) - (o.in + o.dur * c.speed)) / c.speed : -o.in / c.speed);
      d = Math.min(d, o.dur - MIN_DUR);
      if (!isMain(c)) {
        d = Math.max(d, -o.start);
        const s = snap(o.start + d, c.id);
        if (s.s !== null) d = clamp(s.t - o.start, c.type === "video" || c.type === "audio" ? -o.in / c.speed : -o.start, o.dur - MIN_DUR);
        showSnap(s.s);
        c.start = o.start + d;
      }
      c.dur = o.dur - d;
      if (c.type === "video" || c.type === "audio") c.in = Math.max(0, o.in + (c.reverse ? 0 : d * c.speed));
      td.el.style.left = tx(c.start) + "px";
      td.el.style.width = c.dur * pps + "px";
      setT(clamp(T, 0, 1e9));
    }
  });
  function rowAt(y) {
    for (const r of rows.children) {
      if (!r.classList.contains("vrow")) continue;
      const b = r.getBoundingClientRect();
      if (y >= b.top && y < b.bottom) return r;
    }
    return null;
  }
  const compatible = (c, kind) => (c.type === "text" ? kind === "text" : c.type === "audio" ? kind === "audio" : kind === "main" || kind === "overlay");
  function edgeScroll(e) {
    const r = tl.getBoundingClientRect();
    if (e.clientX > r.right - 40) tl.scrollLeft += 12;
    else if (e.clientX < r.left + 40) tl.scrollLeft -= 12;
  }
  const endTl = (e) => {
    tptrs.delete(e.pointerId);
    showSnap(null);
    rows.querySelectorAll(".vrow.drop").forEach((r) => r.classList.remove("drop"));
    if (!td) return;
    clearTimeout(td.lp);
    const d = td;
    if (tptrs.size === 0) td = null;
    if (d.mode === "pinch") { if (tptrs.size === 0) td = null; return; }
    if (d.mode === "seek" || (d.mode === "pan" && !d.moved)) { select(null); setT(tlTime(e)); return; }
    if (d.mode === "pending") return; // ketukan biasa: klip sudah terpilih
    if (d.mode === "move" && d.moved) {
      const c = d.c;
      const target = d.row || c.track;
      const ns = d.ns ?? c.start;
      const tk = kindOfTrack(target);
      if (tk === "main") {
        c.track = "main";
        c.start = ns + (ns > d.orig.start ? 0.0001 : -0.0001);
        if (c.type !== "text" && c.fit === "contain" && d.orig.track !== "main") { c.fit = "cover"; c.scale = 1; c.x = 0.5; c.y = 0.5; }
      } else {
        c.start = ns;
        if (d.orig.track === "main" && tk === "overlay") { c.fit = "contain"; if (c.scale >= 1) c.scale = 0.55; c.trans = "none"; }
        c.track = target;
        const clash = P.clips.some((x) => x.id !== c.id && x.track === c.track && x.start < end(c) - 1e-6 && end(x) > c.start + 1e-6);
        if (clash) c.track = ensureTrack(tk, c.start, c.dur, c.id);
      }
      commit();
      return;
    }
    if ((d.mode === "trim-l" || d.mode === "trim-r") && d.moved) { commit(); return; }
    if (d.mode === "move-wait" || d.mode === "move") renderTimeline();
  };
  tl.addEventListener("pointerup", endTl);
  tl.addEventListener("pointercancel", endTl);
  tl.addEventListener("wheel", (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom(clamp(+$("vZoom").value - e.deltaY * 0.08, 0, 100), tlTime(e), e.clientX);
    } else if (!e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX) && tl.scrollHeight <= tl.clientHeight + 2) {
      e.preventDefault();
      tl.scrollLeft += e.deltaY;
    }
  }, { passive: false });
  function setZoom(v, tAt = T, clientX) {
    $("vZoom").value = v;
    pps = zoomToPps(v);
    renderTimeline();
    const left = tl.getBoundingClientRect().left;
    tl.scrollLeft = tx(tAt) - ((clientX ?? left + tl.clientWidth / 2) - left);
    drawRuler();
  }
  $("vZoom").addEventListener("input", (e) => setZoom(+e.target.value));

  // ======================================================================
  // 11. PANEL KIRI
  // ======================================================================
  function openLeftTab(tab) {
    document.querySelectorAll("[data-vtab]").forEach((b) => b.classList.toggle("active", b.dataset.vtab === tab));
    document.querySelectorAll("[data-vpane]").forEach((p) => p.classList.toggle("hidden", p.dataset.vpane !== tab));
    if (matchMedia("(max-width:1023px)").matches) setSheet("left");
    if (tab === "filter") renderLookGrid();
    if (tab === "fx") renderFxGrid();
    if (tab === "trans") renderTransGrid();
    if (tab === "canvas") renderCanvasPane();
    document.querySelectorAll("[data-mob]").forEach((b) => b.classList.toggle("active", b.dataset.mob === tab || (b.dataset.mob === "media" && tab === "canvas")));
  }
  function setSheet(which) {
    document.body.dataset.sheet = which || "";
    if (!which) document.querySelectorAll("[data-mob]").forEach((b) => b.classList.remove("active"));
    setTimeout(fitCanvas, 240);
  }
  document.querySelectorAll("[data-vtab]").forEach((b) => b.addEventListener("click", () => openLeftTab(b.dataset.vtab)));
  document.querySelectorAll("[data-close-sheet]").forEach((b) => b.addEventListener("click", () => setSheet("")));
  document.querySelectorAll("[data-mob]").forEach((b) => b.addEventListener("click", () => {
    const tab = b.dataset.mob;
    const isOpen = b.classList.contains("active");
    if (isOpen) return setSheet("");
    if (tab === "edit") { openInspector(true); document.querySelectorAll("[data-mob]").forEach((x) => x.classList.toggle("active", x === b)); }
    else openLeftTab(tab);
  }));
  function openInspector(force) {
    if (matchMedia("(max-width:1023px)").matches && force) setSheet("right");
  }

  function renderMediaBin() {
    const grid = $("vMediaGrid");
    const list = [...media.values()].filter((m) => !m.hidden).reverse();
    $("vMediaEmpty").classList.toggle("hidden", list.length > 0);
    grid.innerHTML = list.map((m) => `
      <div class="vmedia" data-media="${m.id}" style="${m.thumb ? `background-image:url(${m.thumb})` : m.kind === "audio" ? "background:linear-gradient(135deg,#177245,#0b3d25)" : ""}" title="${esc(m.name)}">
        <span class="kind">${m.kind === "video" ? "Video" : m.kind === "image" ? "Foto" : "Audio"}</span>
        ${m.kind === "audio" ? `<span class="absolute inset-0 flex items-center justify-center text-white text-[11px] font-bold px-2 text-center">${esc(m.name)}</span>` : ""}
        ${m.duration ? `<span class="dur">${fmtT(m.duration)}</span>` : ""}
        <div class="acts">
          <button type="button" data-add="${m.id}" title="Taruh di trek utama / audio">+ ${m.kind === "audio" ? "Audio" : "Utama"}</button>
          ${m.kind !== "audio" ? `<button type="button" data-ovl="${m.id}" title="Gambar di atas gambar">Overlay</button>` : ""}
          <button type="button" data-delm="${m.id}" title="Hapus media" aria-label="Hapus media">✕</button>
        </div>
      </div>`).join("");
  }
  $("vMediaGrid").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    const card = e.target.closest("[data-media]");
    if (!card) return;
    const id = card.dataset.media;
    if (b && b.dataset.delm) {
      const used = P.clips.filter((c) => c.mediaId === id).length;
      if (used && !confirm(`Media ini dipakai ${used} klip. Hapus media beserta klipnya?`)) return;
      P.clips = P.clips.filter((c) => c.mediaId !== id);
      const m = media.get(id);
      if (m) m.hidden = true; // tetap di memori supaya Urungkan masih bisa menampilkannya
      store.removeMedia(id);
      commit();
      renderMediaBin();
      return;
    }
    if (b && b.dataset.ovl) return addMediaToTimeline(id, "overlay");
    addMediaToTimeline(id, "main");
  });
  $("vImportBtn").addEventListener("click", () => $("vFileMedia").click());
  $("vFileMedia").addEventListener("change", (e) => { importFiles(e.target.files); e.target.value = ""; });
  $("vImportAudio").addEventListener("click", () => $("vFileAudio").click());
  $("vFileAudio").addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    for (const f of files) {
      const m = await importFile(f, "audio");
      if (m) { renderMediaBin(); addMediaToTimeline(m.id, "audio"); }
    }
  });
  // seret & lepas file ke mana saja
  let dragDepth = 0;
  window.addEventListener("dragenter", (e) => { if ([...(e.dataTransfer?.types || [])].includes("Files")) { dragDepth++; document.body.classList.add("dragging"); } });
  window.addEventListener("dragleave", () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) document.body.classList.remove("dragging"); });
  window.addEventListener("dragover", (e) => { if ([...(e.dataTransfer?.types || [])].includes("Files")) e.preventDefault(); });
  window.addEventListener("drop", (e) => {
    dragDepth = 0;
    document.body.classList.remove("dragging");
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    importFiles(e.dataTransfer.files, { place: true });
  });

  // Teks
  $("vAddText").addEventListener("click", () => addText(TEXT_STYLES[0]));
  $("vTextStyles").innerHTML = TEXT_STYLES.map((s, i) => {
    loadFont(s.font);
    const st = `font-family:'${s.font}';font-weight:${s.weight};color:${s.color};${s.italic ? "font-style:italic;" : ""}${s.stroke ? `-webkit-text-stroke:${Math.min(2, s.stroke / 3)}px ${s.strokeColor};paint-order:stroke fill;` : ""}${s.bgOn ? `background:${s.bgColor};padding:0 6px;border-radius:6px;` : ""}${s.shadow > 20 ? `text-shadow:0 0 10px ${s.shadowColor};` : ""}${s.color2 ? `background:linear-gradient(${s.color},${s.color2});-webkit-background-clip:text;color:transparent;` : ""}`;
    return `<button type="button" class="vgrid-btn" data-style="${i}" style="background:#2b2b29"><span style="${st};font-size:19px;line-height:1.1">Aa</span><span style="color:#d6d6d2">${esc(s.n)}</span></button>`;
  }).join("");
  $("vTextStyles").addEventListener("click", (e) => {
    const b = e.target.closest("[data-style]");
    if (!b) return;
    const s = TEXT_STYLES[+b.dataset.style];
    const c = clipById(selId);
    if (c && c.type === "text") { // ganti gaya teks terpilih
      const fresh = newTextClip(c.start, s, c.text);
      ["font", "weight", "italic", "size", "color", "color2", "stroke", "strokeColor", "shadow", "shadowColor", "bgOn", "bgColor", "spacing", "hl"].forEach((k) => { c[k] = fresh[k]; });
      loadFont(c.font);
      commit();
    } else addText(s, s.n === "Karaoke" ? "Kata ini menyala satu per satu" : "Ketik teksmu");
  });
  $("vEmojiGrid").innerHTML = EMOJIS.map((em) => `<button type="button" class="rounded-lg hover:bg-[#F3F3F0] aspect-square" data-emoji="${em}">${em}</button>`).join("");
  $("vEmojiGrid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-emoji]");
    if (!b) return;
    const c = addText({ n: "Emoji", font: "Plus Jakarta Sans", weight: 400, color: "#FFFFFF", shadow: 0, size: 220 }, b.dataset.emoji);
    c.loop = "breathe";
    commit();
  });

  // Audio
  $("vRecordVoice").addEventListener("click", toggleRecord);
  $("vExtractAudio").addEventListener("click", extractAudio);
  $("vAddBeat").addEventListener("click", () => { addMarker(); showToast("Ketukan ditandai"); });
  $("vAutoBeat").addEventListener("click", autoBeats);
  $("vAddMarker").addEventListener("click", () => { addMarker(); showToast("Ketukan ditandai"); });
  $("vSnap").addEventListener("click", (e) => {
    const on = e.currentTarget.getAttribute("aria-pressed") !== "true";
    e.currentTarget.setAttribute("aria-pressed", String(on));
    e.currentTarget.classList.toggle("on", on);
  });

  // Grid pratinjau filter/efek/transisi: digambar dari frame saat ini
  function previewThumb(cv, fn) {
    cv.width = 90; cv.height = 90;
    const x = cv.getContext("2d");
    fn(x, 90, 90);
  }
  function selVisual() {
    const c = clipById(selId);
    if (c && isVisual(c)) return c;
    return mainClips().find((x) => T >= x.start && T < end(x)) || null;
  }
  function renderLookGrid() {
    const c = selVisual();
    $("vLookGrid").innerHTML = LOOKS.map((l) => `<button type="button" class="vgrid-btn${c && c.look === l[0] ? " on" : ""}" data-look="${l[0]}"><canvas></canvas>${esc(l[1])}</button>`).join("");
    if (!c) return;
    const so = sourceOf(c);
    $("vLookGrid").querySelectorAll("[data-look]").forEach((b) => {
      previewThumb(b.querySelector("canvas"), (x, w, h) => {
        if (!so) { x.fillStyle = "#ddd"; x.fillRect(0, 0, w, h); return; }
        const tmp = { ...c, look: b.dataset.look, lookAmt: 1, fx: "none", x: 0.5, y: 0.5, scale: 1, rot: 0, animIn: "none", animOut: "none", loop: "none", fit: "cover", opacity: 1, chroma: c.chroma };
        const saveBg = P.bg; P.bg = { type: "color", color: "#000" };
        drawVisual(x, tmp, clamp(T, c.start, end(c) - 0.01), w, h, true);
        P.bg = saveBg;
      });
    });
  }
  $("vLookGrid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-look]");
    const c = selVisual();
    if (!b) return;
    if (!c) return showToast("Pilih klip video/foto dulu");
    c.look = b.dataset.look;
    if (!c.lookAmt) c.lookAmt = 1;
    selId = c.id;
    commit();
    renderLookGrid();
  });
  function renderFxGrid() {
    const c = selVisual();
    $("vFxGrid").innerHTML = EFFECTS.map((f) => `<button type="button" class="vgrid-btn${c && c.fx === f[0] ? " on" : ""}" data-fx="${f[0]}">${esc(f[1])}${["glitch", "rgb", "vhs", "leak", "zoomblur", "dream"].includes(f[0]) ? ' <span class="vpro">PRO</span>' : ""}</button>`).join("");
  }
  $("vFxGrid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-fx]");
    const c = selVisual();
    if (!b) return;
    if (!c) return showToast("Pilih klip video/foto dulu");
    c.fx = b.dataset.fx;
    selId = c.id;
    commit();
    renderFxGrid();
    if (!playing && c.fx !== "none") play();
  });
  function transTarget() {
    const c = clipById(selId);
    const mains = mainClips();
    if (c && isMain(c) && mains.indexOf(c) > 0) return c;
    // klip utama setelah playhead
    return mains.find((x, i) => i > 0 && x.start >= T - 0.01) || mains[1] || null;
  }
  function renderTransGrid() {
    const c = transTarget();
    $("vTransGrid").innerHTML = TRANSITIONS.map((tr) => `<button type="button" class="vgrid-btn${c && c.trans === tr[0] ? " on" : ""}" data-tr="${tr[0]}">${esc(tr[1])}</button>`).join("");
  }
  $("vTransGrid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tr]");
    if (!b) return;
    const c = transTarget();
    if (!c) return showToast("Butuh minimal 2 klip di trek utama");
    c.trans = b.dataset.tr;
    selId = c.id;
    commit();
    renderTransGrid();
    setT(Math.max(0, c.start - 0.8));
    if (c.trans !== "none") { play(); playEnd = c.start + 0.8; }
  });
  $("vTransAll").addEventListener("click", () => {
    const c = transTarget();
    const type = c && c.trans !== "none" ? c.trans : "fade";
    mainClips().forEach((x, i) => { if (i > 0) { x.trans = type; x.transDur = c ? c.transDur : 0.6; } });
    commit();
    renderTransGrid();
    showToast("Transisi dipasang di semua sambungan");
  });
  function renderCanvasPane() {
    $("vAspectChips").innerHTML = Object.keys(ASPECTS).map((a) => `<button type="button" class="vchip${P.aspect === a ? " on" : ""}" data-aspect="${a}">${a}</button>`).join("");
    $("vBgChips").innerHTML = [["blur", "Blur dari Video"], ["color", "Warna Polos"]].map(([k, n]) => `<button type="button" class="vchip${P.bg.type === k ? " on" : ""}" data-bgtype="${k}">${n}</button>`).join("");
    const sw = ["#000000", "#FFFFFF", "#171717", "#B42318", "#F4E3C1", "#FFD24A", "#177245", "#2F6FDB", "#7C4DDB", "#FF7AB6"];
    $("vBgSwatches").innerHTML = sw.map((c) => `<button type="button" class="vswatch${P.bg.type === "color" && P.bg.color.toUpperCase() === c ? " on" : ""}" data-bgc="${c}" style="background:${c}" aria-label="${c}"></button>`).join("") +
      `<input type="color" class="vcolor" id="vBgCustom" value="${P.bg.color}" title="Warna lain" />`;
  }
  $("vLeftBody").addEventListener("click", (e) => {
    const a = e.target.closest("[data-aspect]");
    if (a) { setAspect(a.dataset.aspect); return; }
    const bt = e.target.closest("[data-bgtype]");
    if (bt) { P.bg.type = bt.dataset.bgtype; commit(); renderCanvasPane(); return; }
    const bc = e.target.closest("[data-bgc]");
    if (bc) { P.bg = { type: "color", color: bc.dataset.bgc }; commit(); renderCanvasPane(); }
  });
  $("vLeftBody").addEventListener("input", (e) => {
    if (e.target.id === "vBgCustom") { P.bg = { type: "color", color: e.target.value }; requestRender(); }
  });
  $("vLeftBody").addEventListener("change", (e) => { if (e.target.id === "vBgCustom") { commit(); renderCanvasPane(); } });
  $("vFitAllCover").addEventListener("click", () => { mainClips().forEach((c) => { c.fit = "cover"; c.scale = 1; c.x = 0.5; c.y = 0.5; }); commit(); });
  $("vFitAllContain").addEventListener("click", () => { mainClips().forEach((c) => { c.fit = "contain"; c.scale = 1; c.x = 0.5; c.y = 0.5; }); commit(); });
  function setAspect(a) {
    if (!ASPECTS[a]) return;
    P.aspect = a;
    [P.w, P.h] = ASPECTS[a];
    commit();
    renderCanvasPane();
  }
  $("vAspect").addEventListener("change", (e) => setAspect(e.target.value));

  // ======================================================================
  // 12. INSPECTOR (panel kanan)
  // ======================================================================
  const getPath = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
  function setPath(o, p, v) {
    const ks = p.split(".");
    let cur = o;
    for (let i = 0; i < ks.length - 1; i++) { if (cur[ks[i]] == null) cur[ks[i]] = {}; cur = cur[ks[i]]; }
    cur[ks[ks.length - 1]] = v;
  }
  const FMT = {
    pct: (v) => Math.round(v * 100) + "%",
    int: (v) => String(Math.round(v)),
    deg: (v) => Math.round(v) + "°",
    sec: (v) => (+v).toFixed(1) + "s",
    x: (v) => (+v).toFixed(2) + "x",
    px: (v) => Math.round(v) + "px"
  };
  const slider = (path, label, min, max, step, fmt = "int", c) => {
    const v = getPath(c, path) ?? 0;
    return `<label class="vrowc"><span>${label}</span><input type="range" data-p="${path}" data-f="${fmt}" min="${min}" max="${max}" step="${step}" value="${v}" /><output>${FMT[fmt](v)}</output></label>`;
  };
  const chips = (path, list, cur) => `<div class="vchips">${list.map(([v, n]) => `<button type="button" class="vchip${String(cur) === String(v) ? " on" : ""}" data-set="${path}" data-v="${esc(v)}">${esc(n)}</button>`).join("")}</div>`;
  const sec = (title, body, open = false, id = "") => `<details class="vsec"${open ? " open" : ""}${id ? ` data-sec="${id}"` : ""}><summary>${title}</summary><div class="body">${body}</div></details>`;
  const openSecs = new Set(["dasar", "teks"]);

  function renderInspector() {
    const c = clipById(selId);
    const box = $("vInspector");
    const keepScroll = box.scrollTop;
    if (!c) {
      $("vInspTitle").textContent = "Proyek";
      $("vInspSub").textContent = `${P.aspect} · ${P.w}×${P.h} · ${fmtT(projectDur())}`;
      box.innerHTML = `<div class="p-4 space-y-3 text-xs text-[#525252] leading-relaxed">
        <div class="sne-panel-low p-3 space-y-1.5">
          <div class="font-bold text-[#171717]">Mulai cepat</div>
          <div>1. Impor video/foto di tab <b>Media</b> — langsung tersusun di timeline.</div>
          <div>2. Ketuk klip untuk memilih, lalu atur di panel ini: kecepatan, warna, filter, animasi, audio.</div>
          <div>3. Tambah teks, subtitle otomatis, musik, efek, dan transisi.</div>
          <div>4. <b>Ekspor</b> ke Reels, Story, Post, TikTok, atau Status WhatsApp.</div>
        </div>
        <div class="sne-panel-low p-3 space-y-1">
          <div class="font-bold text-[#171717]">Pintasan</div>
          <div><b>Spasi</b> putar/jeda · <b>S</b> potong · <b>Delete</b> hapus · <b>Ctrl+D</b> duplikat</div>
          <div><b>←/→</b> 1 frame (Shift = 1 detik) · <b>M</b> tandai ketukan · <b>Ctrl+Z/Y</b> urung/ulang</div>
          <div>Pratinjau: seret objek, tarik bulatan kuning untuk ubah ukuran & putar, cubit 2 jari di HP.</div>
        </div>
      </div>`;
      return;
    }
    const m = media.get(c.mediaId);
    const kindName = c.type === "text" ? "Teks" : c.type === "audio" ? "Audio" : isMain(c) ? (c.type === "video" ? "Video" : "Foto") : `Overlay ${c.type === "video" ? "Video" : "Foto"}`;
    $("vInspTitle").textContent = kindName + (m ? ` · ${m.name}` : "");
    $("vInspSub").textContent = `Mulai ${fmtT(c.start)} · durasi ${c.dur.toFixed(2)} dtk`;
    let h = "";
    const actions = `<div class="grid grid-cols-4 gap-1.5 p-3 border-b border-[#E7E7E4]">
      <button type="button" class="sne-btn-secondary py-2 text-[11px]" data-act="split">Potong</button>
      <button type="button" class="sne-btn-secondary py-2 text-[11px]" data-act="dup">Duplikat</button>
      ${c.type === "video" ? `<button type="button" class="sne-btn-secondary py-2 text-[11px]" data-act="freeze">Beku</button>` : `<button type="button" class="sne-btn-secondary py-2 text-[11px]" data-act="front">Ke Depan</button>`}
      <button type="button" class="sne-btn-danger py-2 text-[11px]" data-act="del">Hapus</button>
    </div>`;
    h += actions;
    if (c.type === "text") {
      h += sec("Teks", `
        <textarea data-p="text" rows="3" class="sne-field w-full p-2.5 text-sm" placeholder="Ketik teks…">${esc(c.text)}</textarea>
        <label class="vrowc"><span>Font</span><select data-p="font" data-commit class="sne-field h-9 px-2 text-xs col-span-2">${FONTS.map(([f]) => `<option value="${esc(f)}"${f === c.font ? " selected" : ""} style="font-family:'${esc(f)}'">${esc(f)}</option>`).join("")}</select></label>
        ${slider("size", "Ukuran", 16, 400, 1, "px", c)}
        <div class="vrowc"><span>Warna</span><div class="flex items-center gap-2 col-span-2"><input type="color" class="vcolor" data-p="color" value="${c.color}" /><span class="text-[11px]">Gradasi</span><input type="checkbox" data-toggle="color2" ${c.color2 ? "checked" : ""} class="accent-[#B42318]" />${c.color2 ? `<input type="color" class="vcolor" data-p="color2" value="${c.color2}" />` : ""}</div></div>
        <div class="vrowc"><span>Tebal</span><div class="col-span-2">${chips("weight", [[400, "Normal"], [700, "Tebal"], [900, "Ekstra"]], c.weight)}</div></div>
        <div class="vrowc"><span>Gaya</span><div class="col-span-2">${chips("italic", [[false, "Tegak"], [true, "Miring"]], c.italic)}</div></div>
        <div class="vrowc"><span>Rata</span><div class="col-span-2">${chips("align", [["left", "Kiri"], ["center", "Tengah"], ["right", "Kanan"]], c.align)}</div></div>
        ${slider("spacing", "Jarak huruf", -5, 40, 0.5, "px", c)}
        ${slider("lineH", "Jarak baris", 0.8, 2.2, 0.05, "x", c)}
        ${slider("boxW", "Lebar kotak", 0.2, 1, 0.01, "pct", c)}`, true, "teks");
      h += sec("Garis &amp; Bayangan", `
        ${slider("stroke", "Garis tepi", 0, 20, 0.5, "px", c)}
        <div class="vrowc"><span>Warna garis</span><input type="color" class="vcolor" data-p="strokeColor" value="${/^#/.test(c.strokeColor) ? c.strokeColor : "#000000"}" /></div>
        ${slider("shadow", "Bayangan", 0, 80, 1, "px", c)}
        <div class="vrowc"><span>Warna bayangan</span><input type="color" class="vcolor" data-p="shadowColor" value="${/^#/.test(c.shadowColor) ? c.shadowColor : "#000000"}" /></div>`, openSecs.has("garis"), "garis");
      h += sec("Latar Teks", `
        <label class="flex items-center gap-2 text-xs"><input type="checkbox" data-toggle="bgOn" ${c.bgOn ? "checked" : ""} class="accent-[#B42318] w-4 h-4" /> Tampilkan latar per baris</label>
        <div class="vrowc"><span>Warna</span><input type="color" class="vcolor" data-p="bgColor" value="${c.bgColor}" /></div>
        ${slider("bgAlpha", "Kepekatan", 0, 1, 0.01, "pct", c)}
        ${slider("bgPad", "Jarak tepi", 0, 1, 0.01, "pct", c)}
        ${slider("bgRadius", "Sudut", 0, 1, 0.01, "pct", c)}`, openSecs.has("latar"), "latar");
      h += sec("Sorot Kata (Karaoke) <span class='vpro'>PRO</span>", `
        <label class="flex items-center gap-2 text-xs"><input type="checkbox" data-toggle="hl" ${c.hl ? "checked" : ""} class="accent-[#B42318] w-4 h-4" /> Kata menyala bergiliran sepanjang durasi</label>
        ${c.hl ? `<div class="vrowc"><span>Warna sorot</span><input type="color" class="vcolor" data-p="hl" value="${c.hl}" /></div>` : ""}`, openSecs.has("karaoke"), "karaoke");
    }
    if (c.type !== "audio") {
      h += sec("Posisi &amp; Ukuran", `
        ${isVisual(c) ? `<div class="vrowc"><span>Tampilan</span><div class="col-span-2">${chips("fit", [["cover", "Penuhi"], ["contain", "Utuh"]], c.fit)}</div></div>` : ""}
        ${slider("scale", "Skala", 0.05, 4, 0.01, "pct", c)}
        ${slider("x", "Posisi X", -0.5, 1.5, 0.001, "pct", c)}
        ${slider("y", "Posisi Y", -0.5, 1.5, 0.001, "pct", c)}
        ${slider("rot", "Putar", -180, 180, 0.5, "deg", c)}
        ${slider("opacity", "Kepekatan", 0, 1, 0.01, "pct", c)}
        <div class="grid grid-cols-3 gap-1.5">
          ${isVisual(c) ? `<button type="button" class="sne-btn-secondary py-1.5 text-[11px]${c.flipH ? " on" : ""}" data-flip="flipH">Balik ↔</button><button type="button" class="sne-btn-secondary py-1.5 text-[11px]${c.flipV ? " on" : ""}" data-flip="flipV">Balik ↕</button>` : ""}
          <button type="button" class="sne-btn-secondary py-1.5 text-[11px]" data-act="center">Ke Tengah</button>
        </div>
        ${!isMain(c) && isVisual(c) ? `<div class="vrowc"><span>Campuran <span class="vpro">PRO</span></span><div class="col-span-2">${chips("blend", BLENDS, c.blend)}</div></div>` : ""}`, openSecs.has("dasar"), "dasar");
    }
    if (c.type === "video" || c.type === "audio") {
      h += sec("Kecepatan", `
        ${chips("speedChip", [[0.25, "0.25x"], [0.5, "0.5x"], [1, "1x"], [1.5, "1.5x"], [2, "2x"], [3, "3x"], [5, "5x"]], c.speed)}
        <label class="vrowc"><span>Kustom</span><input type="range" data-speed min="0.1" max="10" step="0.05" value="${c.speed}" /><output>${c.speed.toFixed(2)}x</output></label>
        <label class="flex items-center gap-2 text-xs"><input type="checkbox" data-toggle="keepPitch" ${c.keepPitch !== false ? "checked" : ""} class="accent-[#B42318] w-4 h-4" /> Pertahankan nada suara</label>
        <label class="flex items-center gap-2 text-xs"><input type="checkbox" data-toggle="reverse" ${c.reverse ? "checked" : ""} class="accent-[#B42318] w-4 h-4" /> Putar mundur (reverse)</label>
        ${c.reverse && c.type === "video" ? `<p class="text-[11px] text-[#737373]">Pratinjau mundur bisa patah-patah; hasil ekspor tetap mulus.</p>` : ""}`, openSecs.has("speed"), "speed");
    }
    if (hasSound(c)) {
      h += sec("Audio", `
        ${slider("volume", "Volume", 0, 2, 0.01, "pct", c)}
        ${slider("fadeIn", "Fade masuk", 0, Math.min(10, c.dur / 2), 0.1, "sec", c)}
        ${slider("fadeOut", "Fade keluar", 0, Math.min(10, c.dur / 2), 0.1, "sec", c)}
        <label class="flex items-center gap-2 text-xs"><input type="checkbox" data-toggle="mute" ${c.mute ? "checked" : ""} class="accent-[#B42318] w-4 h-4" /> Bisukan</label>
        <label class="flex items-center gap-2 text-xs"><input type="checkbox" data-toggle="denoise" ${c.denoise ? "checked" : ""} class="accent-[#B42318] w-4 h-4" /> Kurangi bising <span class="vpro">PRO</span></label>
        <div class="text-[11px] font-semibold text-[#525252]">Efek suara</div>
        ${chips("voice", VOICES, c.voice)}
        ${c.type === "video" ? `<button type="button" class="sne-btn-secondary py-2 text-[11px]" data-act="extract">Pisahkan Audio ke Trek Sendiri</button>` : `<button type="button" class="sne-btn-secondary py-2 text-[11px]" data-act="beats">Deteksi Ketukan Lagu Ini</button>`}`, openSecs.has("audio") || c.type === "audio", "audio");
    }
    if (isVisual(c)) {
      const a = c.adj;
      h += sec("Penyesuaian", `
        ${slider("adj.bright", "Kecerahan", -100, 100, 1, "int", c)}
        ${slider("adj.contrast", "Kontras", -100, 100, 1, "int", c)}
        ${slider("adj.sat", "Saturasi", -100, 100, 1, "int", c)}
        ${slider("adj.temp", "Suhu", -100, 100, 1, "int", c)}
        ${slider("adj.tint", "Rona", -100, 100, 1, "int", c)}
        ${slider("adj.hue", "Hue", -180, 180, 1, "deg", c)}
        ${slider("adj.vignette", "Vinyet", 0, 100, 1, "int", c)}
        ${slider("adj.grain", "Bintik film", 0, 100, 1, "int", c)}
        ${slider("adj.blur", "Kabur", 0, 30, 0.5, "px", c)}
        <button type="button" class="sne-btn-secondary py-1.5 text-[11px]" data-act="resetAdj">Atur Ulang Penyesuaian</button>
        ${!FILTER_OK ? `<p class="text-[11px] text-[#737373]">Browser ini belum mendukung filter kanvas penuh: kontras, hue, dan kabur tidak tampil.</p>` : ""}`, openSecs.has("adj"), "adj");
      h += sec("Filter &amp; Efek", `
        <div class="vrowc"><span>Filter</span><div class="col-span-2 flex items-center gap-2"><b class="text-xs text-[#171717]">${esc((LOOK_MAP[c.look] || LOOKS[0])[1])}</b><button type="button" class="sne-btn-secondary px-2 py-1 text-[11px]" data-act="tabFilter">Pilih</button></div></div>
        ${c.look !== "none" ? slider("lookAmt", "Intensitas", 0, 1, 0.01, "pct", c) : ""}
        <div class="vrowc"><span>Efek</span><div class="col-span-2 flex items-center gap-2"><b class="text-xs text-[#171717]">${esc((EFFECTS.find((f) => f[0] === c.fx) || EFFECTS[0])[1])}</b><button type="button" class="sne-btn-secondary px-2 py-1 text-[11px]" data-act="tabFx">Pilih</button></div></div>
        ${c.fx !== "none" ? slider("fxAmt", "Kekuatan", 0, 1, 0.01, "pct", c) : ""}`, openSecs.has("look"), "look");
      if (!isMain(c)) {
        const ck = c.chroma || { on: false, color: "#00FF00", tol: 40, soft: 20 };
        h += sec("Hapus Latar Hijau (Chroma Key) <span class='vpro'>PRO</span>", `
          <label class="flex items-center gap-2 text-xs"><input type="checkbox" data-toggle="chroma.on" ${ck.on ? "checked" : ""} class="accent-[#B42318] w-4 h-4" /> Aktifkan</label>
          <div class="vrowc"><span>Warna kunci</span><div class="col-span-2 flex items-center gap-2"><input type="color" class="vcolor" data-p="chroma.color" value="${ck.color}" /><button type="button" class="sne-btn-secondary px-2 py-1 text-[11px]" data-act="pickKey">Ambil dari tepi</button></div></div>
          ${slider("chroma.tol", "Toleransi", 0, 100, 1, "int", { chroma: ck })}
          ${slider("chroma.soft", "Kehalusan", 0, 100, 1, "int", { chroma: ck })}`, openSecs.has("chroma"), "chroma");
      }
    }
    if (c.type !== "audio") {
      const inList = c.type === "text" ? ANIM_IN : ANIM_IN.filter((x) => x[0] !== "typewriter");
      h += sec("Animasi", `
        <div class="text-[11px] font-semibold text-[#525252]">Masuk</div>${chips("animIn", inList, c.animIn)}
        ${c.animIn !== "none" ? slider("animInDur", "Durasi masuk", 0.1, Math.max(0.2, Math.min(5, c.dur)), 0.05, "sec", c) : ""}
        <div class="text-[11px] font-semibold text-[#525252] pt-1">Keluar</div>${chips("animOut", ANIM_OUT, c.animOut)}
        ${c.animOut !== "none" ? slider("animOutDur", "Durasi keluar", 0.1, Math.max(0.2, Math.min(5, c.dur)), 0.05, "sec", c) : ""}
        <div class="text-[11px] font-semibold text-[#525252] pt-1">Berulang</div>${chips("loop", ANIM_LOOP, c.loop)}`, openSecs.has("anim"), "anim");
    }
    if (isMain(c) && mainClips().indexOf(c) > 0) {
      h += sec("Transisi Masuk", `${chips("trans", TRANSITIONS, c.trans)}${c.trans !== "none" ? slider("transDur", "Durasi", 0.2, 2, 0.05, "sec", c) : ""}`, openSecs.has("trans"), "trans");
    }
    if (c.type === "image" || c.type === "text") {
      h += sec("Durasi", slider("dur", "Durasi", 0.2, 60, 0.1, "sec", c), openSecs.has("dur"), "dur");
    }
    box.innerHTML = h;
    box.scrollTop = keepScroll;
  }
  // nilai slider ikut berubah saat objek digeser di pratinjau
  function syncInspectorValues() {
    const c = clipById(selId);
    if (!c) return;
    $("vInspector").querySelectorAll("input[type=range][data-p]").forEach((r) => {
      const v = getPath(c, r.dataset.p);
      if (v === undefined || document.activeElement === r) return;
      r.value = v;
      const o = r.parentElement.querySelector("output");
      if (o) o.textContent = FMT[r.dataset.f](v);
    });
  }
  const insp = $("vInspector");
  insp.addEventListener("toggle", (e) => {
    const d = e.target.closest("details[data-sec]");
    if (d) (d.open ? openSecs.add(d.dataset.sec) : openSecs.delete(d.dataset.sec));
  }, true);
  insp.addEventListener("input", (e) => {
    const c = clipById(selId);
    if (!c) return;
    const t = e.target;
    if (t.dataset.speed !== undefined) {
      setSpeed(c, +t.value);
      t.parentElement.querySelector("output").textContent = c.speed.toFixed(2) + "x";
      renderTimeline();
      requestRender();
      return;
    }
    const p = t.dataset.p;
    if (!p) return;
    let v = t.type === "range" ? +t.value : t.value;
    if (p.startsWith("chroma.") && !c.chroma) c.chroma = { on: true, color: "#00FF00", tol: 40, soft: 20 };
    if (p === "dur") { c.dur = Math.max(MIN_DUR, v); normalize(); renderTimeline(); }
    else setPath(c, p, v);
    if (p === "font") loadFont(v);
    const o = t.parentElement.querySelector("output");
    if (o && t.dataset.f) o.textContent = FMT[t.dataset.f](v);
    if (p === "text") { const lbl = rows.querySelector(`[data-clip="${c.id}"] .lbl`); if (lbl) lbl.textContent = v.replace(/\n/g, " "); }
    if (p === "volume" && c.type === "audio") renderTimeline();
    syncMedia(playing);
    requestRender();
  });
  insp.addEventListener("change", (e) => {
    const c = clipById(selId);
    if (!c) return;
    const t = e.target;
    if (t.dataset.toggle) {
      const k = t.dataset.toggle;
      if (k === "color2") c.color2 = t.checked ? "#FF4F6D" : "";
      else if (k === "hl") c.hl = t.checked ? "#FFD24A" : "";
      else if (k === "chroma.on") {
        c.chroma = c.chroma || { on: false, color: "#00FF00", tol: 40, soft: 20 };
        c.chroma.on = t.checked;
        if (t.checked) autoKeyColor(c);
      } else c[k] = t.checked;
      commit();
      return;
    }
    if (t.dataset.p || t.dataset.speed !== undefined) commit();
  });
  insp.addEventListener("click", (e) => {
    const c = clipById(selId);
    if (!c) return;
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.set) {
      const p = b.dataset.set;
      let v = b.dataset.v;
      if (v === "true" || v === "false") v = v === "true";
      else if (v !== "" && !isNaN(+v)) v = +v;
      if (p === "speedChip") setSpeed(c, v);
      else setPath(c, p, v);
      if (p === "fit") { c.scale = 1; c.x = 0.5; c.y = 0.5; }
      commit();
      if (p === "animIn" || p === "animOut" || p === "trans") { setT(p === "animOut" ? Math.max(c.start, end(c) - c.animOutDur - 0.3) : Math.max(0, c.start - (p === "trans" ? 0.8 : 0))); play(); playEnd = p === "animOut" ? end(c) : c.start + (p === "trans" ? 0.8 : c.animInDur + 0.4); }
      return;
    }
    if (b.dataset.flip) { c[b.dataset.flip] = !c[b.dataset.flip]; commit(); return; }
    switch (b.dataset.act) {
      case "split": return doSplit();
      case "dup": return doDuplicate();
      case "del": return doDelete();
      case "freeze": return doFreeze();
      case "extract": return extractAudio();
      case "beats": return autoBeats();
      case "center": c.x = 0.5; c.y = 0.5; c.rot = 0; return commit();
      case "resetAdj": c.adj = { bright: 0, contrast: 0, sat: 0, temp: 0, tint: 0, hue: 0, blur: 0, vignette: 0, grain: 0 }; return commit();
      case "tabFilter": return openLeftTab("filter");
      case "tabFx": return openLeftTab("fx");
      case "pickKey": autoKeyColor(c); return commit();
      case "front": {
        const kind = kindOfTrack(c.track);
        if (kind === "main") return;
        const t = { id: uid("t"), kind };
        const idx = kind === "text" ? 0 : P.tracks.findIndex((x) => x.kind === "overlay");
        P.tracks.splice(Math.max(0, idx), 0, t);
        c.track = t.id;
        commit();
        return showToast("Dipindah ke lapisan paling depan");
      }
    }
  });
  // Warna kunci chroma = warna rata-rata tepi frame (biasanya layar hijau)
  function autoKeyColor(c) {
    const so = sourceOf(c);
    if (!so) return;
    const cv = document.createElement("canvas");
    cv.width = 64; cv.height = 64;
    const x = cv.getContext("2d");
    x.drawImage(so.src, 0, 0, 64, 64);
    const d = x.getImageData(0, 0, 64, 64).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = 0; y < 64; y++) for (let xx = 0; xx < 64; xx++) {
      if (y > 3 && y < 60 && xx > 3 && xx < 60) continue;
      const i = (y * 64 + xx) * 4;
      r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
    }
    const hx = (v) => Math.round(v / n).toString(16).padStart(2, "0");
    c.chroma = Object.assign(c.chroma || { tol: 40, soft: 20 }, { on: true, color: "#" + hx(r) + hx(g) + hx(b) });
  }

  // ======================================================================
  // 13. TOMBOL & KEYBOARD
  // ======================================================================
  $("vPlay").addEventListener("click", () => (playing ? pause() : play()));
  $("vToStart").addEventListener("click", () => { pause(); setT(0); tl.scrollLeft = 0; });
  const frameStep = (dir, big) => { pause(); setT(T + dir * (big ? 1 : 1 / 30)); autoScroll(); };
  $("vStepBack").addEventListener("click", () => frameStep(-1));
  $("vStepFwd").addEventListener("click", () => frameStep(1));
  $("vSplit").addEventListener("click", doSplit);
  $("vDelete").addEventListener("click", doDelete);
  $("vDup").addEventListener("click", doDuplicate);
  $("vFreeze").addEventListener("click", doFreeze);
  $("vUndo").addEventListener("click", undo);
  $("vRedo").addEventListener("click", redo);
  $("vFullscreen").addEventListener("click", () => {
    const el = document.querySelector(".vstage");
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (canvas.webkitEnterFullscreen) canvas.webkitEnterFullscreen();
  });
  $("vNewProject").addEventListener("click", () => {
    if (P.clips.length && !confirm("Mulai proyek baru? Semua klip di timeline dihapus (media impor tetap ada).")) return;
    pause();
    const keepAspect = P.aspect;
    P = emptyProject();
    P.aspect = keepAspect;
    [P.w, P.h] = ASPECTS[keepAspect];
    selId = null;
    T = 0;
    commit();
  });
  window.addEventListener("keydown", (e) => {
    const tag = (e.target.tagName || "").toUpperCase();
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) && e.target.type !== "range" && e.target.type !== "checkbox") return;
    if (!$("vExportModal").classList.contains("hidden")) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (k === " ") { e.preventDefault(); playing ? pause() : play(); }
    else if (mod && k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (mod && (k === "y" || (k === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
    else if (mod && k === "d") { e.preventDefault(); doDuplicate(); }
    else if (!mod && k === "s") { e.preventDefault(); doSplit(); }
    else if (k === "delete" || k === "backspace") { e.preventDefault(); doDelete(); }
    else if (k === "arrowleft") { e.preventDefault(); frameStep(-1, e.shiftKey); }
    else if (k === "arrowright") { e.preventDefault(); frameStep(1, e.shiftKey); }
    else if (k === "home") { e.preventDefault(); setT(0); }
    else if (k === "end") { e.preventDefault(); setT(projectDur()); }
    else if (!mod && k === "m") { addMarker(); showToast("Ketukan ditandai"); }
  });

  // ======================================================================
  // 14. API UNTUK MODUL EKSPOR & SUBTITLE + MULAI
  // ======================================================================
  function addCaptions(segments, style = TEXT_STYLES[2]) {
    if (!segments.length) return 0;
    const trackId = (() => { const t = { id: uid("t"), kind: "text" }; P.tracks.unshift(t); return t.id; })();
    segments.forEach((s) => {
      const c = newTextClip(s.start, style, s.text);
      c.dur = Math.max(0.3, s.end - s.start);
      c.track = trackId;
      c.animIn = "pop";
      c.animInDur = 0.18;
      P.clips.push(c);
    });
    loadFont(style.font);
    commit();
    return segments.length;
  }

  window.SNEVideo = {
    get project() { return P; },
    media, duration: projectDur, renderFrame, prepareFrame, renderAudio, pause, play, setT, showToast,
    startRealtime, stopRealtime, audioCtx: () => audioCtx(), masterNode: () => master,
    addCaptions, setAspect, fontsReady: () => Promise.all(P.clips.filter((c) => c.type === "text").map((c) => loadFont(c.font))).then(() => document.fonts && document.fonts.ready), TEXT_STYLES, ASPECTS, mainClips, select, commit,
    get time() { return T; }, get playing() { return playing; }, get selected() { return clipById(selId); },
    FILTER_OK
  };

  (async () => {
    renderMediaBin();
    const saved = await store.load();
    if (saved) {
      try {
        const p = JSON.parse(saved);
        if (p && Array.isArray(p.clips)) {
          P = Object.assign(emptyProject(), p);
          P.clips = P.clips.filter((c) => c.type === "text" || media.has(c.mediaId));
          P.clips.forEach((c) => { if (c.type === "text") loadFont(c.font); });
        }
      } catch (e) {}
    }
    renderMediaBin();
    history.length = 0;
    hIdx = -1;
    commit();
    if (P.clips.length) showToast("Proyek terakhir dimuat kembali");
    const firstVis = P.clips.find(isVisual);
    if (firstVis) setTimeout(() => { syncMedia(false); requestRender(); }, 300);
  })();
})();
