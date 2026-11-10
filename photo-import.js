// SNE Studio — Import foto universal.
// Menerima semua format yang bisa dibaca browser (JPG, PNG, WebP, GIF, AVIF, BMP, SVG) ditambah
// HEIC/HEIF bawaan iPhone dan TIFF lewat dekoder yang dimuat hanya saat dibutuhkan.
// Dimuat setelah <script> utama; memakai global: state, loadImage, showToast, dst.
(function () {
  const LIB_HEIC = "https://cdn.jsdelivr.net/npm/heic-to@1.5.2/dist/iife/heic-to.js";
  const LIB_HEIC_LEGACY = "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js";
  const LIB_TIFF = "https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.js";

  const IS_SMALL_DEVICE = window.matchMedia("(max-width: 1023px)").matches || (navigator.deviceMemory || 8) <= 4;
  // Sisi terpanjang foto yang disimpan. Story 1080×1920 (2x = 2160×3840) tidak butuh lebih dari ini,
  // dan iPhone membatasi luas kanvas ~16 MP.
  const MAX_EDGE = IS_SMALL_DEVICE ? 2560 : 3840;
  const KEEP_ORIGINAL_BYTES = 8 * 1024 * 1024;
  const PASSTHROUGH_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

  const scriptCache = {};
  function loadScript(url) {
    if (!scriptCache[url]) {
      scriptCache[url] = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = url;
        s.onload = resolve;
        s.onerror = () => { delete scriptCache[url]; reject(new Error("Gagal memuat " + url)); };
        document.head.appendChild(s);
      });
    }
    return scriptCache[url];
  }

  // Jenis file dari isi (magic bytes), karena iPhone/Windows sering mengirim HEIC tanpa MIME type.
  async function sniffKind(file) {
    const name = (file.name || "").toLowerCase();
    try {
      const b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
      const box = String.fromCharCode(...b.slice(4, 8));
      const brand = String.fromCharCode(...b.slice(8, 12));
      if (box === "ftyp") {
        if (/^(heic|heix|hevc|hevx|heim|heis|hevm|hevs|mif1|msf1)$/.test(brand)) return "heic";
        if (/^avi[fs]$/.test(brand)) return "avif";
      }
      if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 0x2a)) return "tiff";
    } catch (e) {}
    if (/\.(heic|heif)$/.test(name) || /hei[cf]/.test(file.type)) return "heic";
    if (/\.(tiff?|dng)$/.test(name) || file.type === "image/tiff") return "tiff";
    return "";
  }

  function decodeNative(blob) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => resolve({ source: img, width: img.naturalWidth || 1080, height: img.naturalHeight || 1080, release: () => URL.revokeObjectURL(url) });
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  async function decodeHeic(file) {
    try {
      await loadScript(LIB_HEIC);
      const blob = await window.HeicTo({ blob: file, type: "image/jpeg", quality: 0.95 });
      const dec = await decodeNative(blob);
      if (dec) return dec;
    } catch (e) {
      console.warn("heic-to gagal, mencoba dekoder cadangan", e);
    }
    await loadScript(LIB_HEIC_LEGACY);
    const out = await window.heic2any({ blob: file, toType: "image/jpeg", quality: 0.95 });
    return decodeNative(Array.isArray(out) ? out[0] : out);
  }

  async function decodeTiff(file) {
    await loadScript(LIB_TIFF);
    const buf = await file.arrayBuffer();
    const ifds = window.UTIF.decode(buf);
    // Halaman terbesar = gambar utama (DNG/TIFF bisa berisi thumbnail)
    const page = ifds.reduce((a, b) => ((b.t256?.[0] || 0) * (b.t257?.[0] || 0) > (a.t256?.[0] || 0) * (a.t257?.[0] || 0) ? b : a), ifds[0]);
    window.UTIF.decodeImage(buf, page);
    const rgba = window.UTIF.toRGBA8(page);
    const c = document.createElement("canvas");
    c.width = page.width;
    c.height = page.height;
    c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer), page.width, page.height), 0, 0);
    return { source: c, width: c.width, height: c.height, release: () => {} };
  }

  function hasTransparency(source, w, h) {
    const c = document.createElement("canvas");
    c.width = 48;
    c.height = 48;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(source, 0, 0, w, h, 0, 0, 48, 48);
    const d = x.getImageData(0, 0, 48, 48).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
    return false;
  }

  function readOriginalBytes(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  // File apa pun -> data URL yang pasti bisa digambar di kanvas, atau null bila bukan gambar.
  async function fileToDataURL(file) {
    if (!file) return null;
    const kind = await sniffKind(file);
    let dec = await decodeNative(file); // Safari membaca HEIC secara native; browser lain gagal di sini
    try {
      if (!dec && (kind === "heic" || kind === "avif")) {
        showToast("Mengonversi foto iPhone (HEIC)…");
        dec = await decodeHeic(file);
      } else if (!dec && kind === "tiff") {
        showToast("Mengonversi TIFF…");
        dec = await decodeTiff(file);
      }
    } catch (e) {
      console.error(e);
      dec = null;
    }
    if (!dec) {
      showToast(`Format "${file.name || "file"}" tidak bisa dibuka sebagai foto`);
      return null;
    }

    const longEdge = Math.max(dec.width, dec.height);
    if (!kind && PASSTHROUGH_TYPES.includes(file.type) && longEdge <= MAX_EDGE && file.size <= KEEP_ORIGINAL_BYTES) {
      dec.release();
      return readOriginalBytes(file); // sudah optimal: simpan byte asli tanpa kompres ulang
    }

    const scale = Math.min(1, MAX_EDGE / longEdge);
    const w = Math.max(1, Math.round(dec.width * scale));
    const h = Math.max(1, Math.round(dec.height * scale));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const x = c.getContext("2d");
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = "high";
    x.drawImage(dec.source, 0, 0, w, h);
    const alpha = hasTransparency(dec.source, dec.width, dec.height);
    dec.release();
    return alpha ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", 0.95);
  }

  const cleanLabel = (file) => (file.name || "Foto").replace(/\.[^.]+$/, "");

  async function putFileInSlot(file, slotIdx) {
    const dataUrl = await fileToDataURL(file);
    const img = await loadImage(dataUrl);
    const slot = state.slots[slotIdx];
    if (!img || !slot) return false;
    Object.assign(slot, { src: dataUrl, origSrc: dataUrl, img, zoom: 1.0, panX: 0, panY: 0, isUserUploaded: true });
    addPhotoToStudioGallery(dataUrl, cleanLabel(file));
    return true;
  }

  // File pertama masuk ke slot tujuan, sisanya ke Galeri.
  async function importFiles(files, slotIdx) {
    const list = Array.from(files || []).filter((f) => f && (f.type.startsWith("image/") || /\.(heic|heif|tiff?|dng|avif|jxl|bmp|webp|png|jpe?g|gif|svg)$/i.test(f.name || "")));
    if (list.length === 0) return;
    let done = 0;
    if (await putFileInSlot(list[0], slotIdx)) done++;
    for (const f of list.slice(1)) {
      const dataUrl = await fileToDataURL(f);
      if (dataUrl && (await loadImage(dataUrl))) {
        addPhotoToStudioGallery(dataUrl, cleanLabel(f));
        done++;
      }
    }
    if (done === 0) return;
    state.selectedSlotIndex = slotIdx;
    adaptTypographyToActiveLayout(false);
    pushHistorySnapshot();
    syncAllUI();
    renderCanvas();
    showToast(list.length > 1 ? `Foto masuk ke Slot #${slotIdx + 1}, ${done - 1} lainnya ke Galeri` : `Foto masuk ke Slot #${slotIdx + 1}`);
  }

  // Semua input foto: izinkan format iPhone & TIFF muncul di pemilih file
  document.querySelectorAll('input[type="file"][accept="image/*"]').forEach((inp) => {
    inp.accept = "image/*,.heic,.heif,.avif,.tif,.tiff,.dng,.bmp";
  });

  // Seret & lepas foto dari komputer: di atas kanvas -> slot di bawah kursor, selain itu -> slot aktif
  window.addEventListener("dragover", (e) => {
    if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files")) e.preventDefault();
  });
  window.addEventListener("drop", (e) => {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    e.preventDefault();
    let slotIdx = state.selectedSlotIndex || 0;
    if (e.target === canvas) {
      const { x, y } = getCanvasCoords(e);
      slotIdx = findHitSlotIndex(x, y);
    }
    importFiles(files, slotIdx);
  });

  // Tempel gambar dari clipboard (Ctrl+V) ke slot aktif
  window.addEventListener("paste", (e) => {
    if (/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || "")) return;
    const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    e.preventDefault();
    importFiles(files, state.selectedSlotIndex || 0);
  });

  window.SNEImport = { fileToDataURL, importFiles, MAX_EDGE, IS_SMALL_DEVICE };
})();
