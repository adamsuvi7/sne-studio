// SNE Video — ekspor MP4.
// Jalur utama: WebCodecs (H.264 + AAC) frame demi frame -> mp4-muxer. Hasil tajam, tidak bergantung kecepatan perangkat,
// tiap frame tepat (tidak ada frame hilang). Cadangan: MediaRecorder memutar timeline secara real-time.
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const V = () => window.SNEVideo;
  const LIB_MUX = "https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.min.js";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Bitrate (Mbps) ditulis untuk 1080p pada fps preset; platform akan mengompres ulang, jadi kirim setinggi yang mereka terima.
  const PRESETS = [
    { id: "tiktok", name: "TikTok", sub: "1080×1920 · 60 fps · 16 Mbps", aspect: "9:16", res: 1080, fps: 60, mbps: 16, maxSec: 600 },
    { id: "reels", name: "Instagram Reels", sub: "1080×1920 · 30 fps · 12 Mbps", aspect: "9:16", res: 1080, fps: 30, mbps: 12, maxSec: 180 },
    { id: "igstory", name: "Instagram Story", sub: "1080×1920 · 30 fps · per 60 dtk", aspect: "9:16", res: 1080, fps: 30, mbps: 10, maxSec: 60 },
    { id: "igpost", name: "Post Instagram", sub: "1080×1350 (4:5) · 30 fps", aspect: "4:5", res: 1080, fps: 30, mbps: 10, maxSec: 3600 },
    { id: "wastory", name: "Status WhatsApp", sub: "1080×1920 · 30 fps · per 60 dtk", aspect: "9:16", res: 1080, fps: 30, mbps: 7, maxSec: 60 },
    { id: "custom", name: "Kustom / YouTube", sub: "Atur sendiri hingga 4K 60 fps", aspect: null, res: 1080, fps: 30, mbps: 12, maxSec: 36000 }
  ];
  let preset = PRESETS[0];
  let abortCtl = null;
  const results = [];

  function loadScript(url) {
    if (loadScript[url]) return loadScript[url];
    return (loadScript[url] = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = url;
      s.onload = res;
      s.onerror = () => { delete loadScript[url]; rej(new Error("Gagal memuat " + url)); };
      document.head.appendChild(s);
    }));
  }

  function dims(res) {
    const P = V().project, a = P.w / P.h;
    let W, H;
    if (a <= 1) { W = res; H = res / a; } else { H = res; W = res * a; }
    const even = (v) => Math.max(2, Math.round(v / 2) * 2);
    return { W: even(W), H: even(H) };
  }
  function config() {
    const res = +$("vExpRes").value, fps = +$("vExpFps").value, q = +$("vExpQuality").value;
    const { W, H } = dims(res);
    const px = (W * H) / (1080 * 1920);
    const fpsK = preset.id === "custom" ? (fps > 30 ? 1.45 : 1) : fps / preset.fps > 1 ? 1.45 : 1;
    const bitrate = Math.round(preset.mbps * 1e6 * q * Math.max(0.35, px) * fpsK);
    return { W, H, fps, bitrate: Math.min(bitrate, 80e6) };
  }

  // ---------- WebCodecs ----------
  function avcLevel(W, H, fps) {
    const fs = Math.ceil(W / 16) * Math.ceil(H / 16), mbps = fs * fps;
    if (fs <= 8192 && mbps <= 245760) return "28";
    if (fs <= 8704 && mbps <= 522240) return "2A";
    if (fs <= 36864 && mbps <= 983040) return "33";
    if (fs <= 36864 && mbps <= 2073600) return "34";
    return "3D";
  }
  async function pickVideoConfig(W, H, fps, bitrate) {
    if (!window.VideoEncoder) return null;
    const lvl = avcLevel(W, H, fps);
    for (const prof of ["6400", "4D00", "4200"]) {
      // encoder perangkat keras (GPU) dicoba dulu: jauh lebih cepat
      for (const hw of ["prefer-hardware", "no-preference", "prefer-software"]) {
        const cfg = { codec: `avc1.${prof}${lvl}`, width: W, height: H, bitrate, framerate: fps, bitrateMode: "variable", latencyMode: "quality", hardwareAcceleration: hw, avc: { format: "avc" } };
        try {
          const r = await VideoEncoder.isConfigSupported(cfg);
          if (r && r.supported) return cfg;
        } catch (e) {}
      }
    }
    return null;
  }
  // gambar kecil hasil ekspor (poster + daftar file)
  function snapThumb(src) {
    const w = 240, h = Math.round((240 * src.height) / src.width);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d").drawImage(src, 0, 0, w, h);
    try { return c.toDataURL("image/jpeg", 0.75); } catch (e) { return ""; }
  }
  async function pickAudioConfig() {
    if (!window.AudioEncoder) return null;
    const list = [
      { codec: "mp4a.40.2", sampleRate: 48000, numberOfChannels: 2, bitrate: 256000 },
      { codec: "mp4a.40.2", sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 },
      { codec: "mp4a.40.2", sampleRate: 44100, numberOfChannels: 2, bitrate: 192000 }
    ];
    for (const cfg of list) {
      try { const r = await AudioEncoder.isConfigSupported(cfg); if (r && r.supported) return cfg; } catch (e) {}
    }
    return null;
  }

  async function encodeWebCodecs(a, b, cfg, ui, signal) {
    await loadScript(LIB_MUX);
    const { W, H, fps, bitrate } = cfg;
    const vcfg = await pickVideoConfig(W, H, fps, bitrate);
    if (!vcfg) throw Object.assign(new Error("Encoder H.264 tidak tersedia"), { fallback: true });
    ui.stage("Mencampur audio…");
    const acfgPick = await pickAudioConfig();
    let audio = null;
    // tanpa encoder AAC, video bersuara harus lewat jalur perekaman
    if (!acfgPick) {
      const probe = V().project.clips.some((c) => (c.type === "audio" || c.type === "video") && !c.mute && c.start < b && c.start + c.dur > a);
      if (probe) throw Object.assign(new Error("Encoder AAC tidak tersedia"), { fallback: true });
    } else {
      audio = await V().renderAudio(acfgPick.sampleRate, 2, a, b);
    }
    const acfg = audio ? acfgPick : null;
    const muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(),
      video: { codec: "avc", width: W, height: H, frameRate: fps },
      audio: acfg ? { codec: "aac", numberOfChannels: 2, sampleRate: acfg.sampleRate } : undefined,
      fastStart: "in-memory",
      firstTimestampBehavior: "offset"
    });
    let err = null;
    const venc = new VideoEncoder({ output: (ch, meta) => muxer.addVideoChunk(ch, meta), error: (e) => { err = e; } });
    venc.configure(vcfg);
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d", { alpha: false });
    await V().fontsReady();
    const N = Math.max(1, Math.round((b - a) * fps));
    const t0 = performance.now();
    ui.stage(`Merender ${N} frame (${W}×${H}, ${fps} fps)…`);
    const fast = V().beginFastExport ? V().beginFastExport() : false;
    const thumbAt = Math.min(N - 1, Math.round(fps * 0.6));
    let thumb = "", st = null;
    try {
      for (let i = 0; i < N; i++) {
        if (signal.aborted) throw new DOMException("Dibatalkan", "AbortError");
        if (err) throw err;
        const t = a + i / fps;
        await V().prepareFrame(t);
        V().renderFrame(ctx, t, W, H);
        if (i === thumbAt) thumb = snapThumb(cv);
        const frame = new VideoFrame(cv, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
        venc.encode(frame, { keyFrame: i % (fps * 2) === 0 });
        frame.close();
        while (venc.encodeQueueSize > 6) await sleep(2);
        if (i % 3 === 0) {
          const el = (performance.now() - t0) / 1000, rate = (i + 1) / el;
          ui.progress((i + 1) / N * 0.94, `Frame ${i + 1}/${N} · ${rate.toFixed(1)} frame/dtk · sisa ±${Math.max(0, Math.round((N - i - 1) / rate))} dtk`);
        }
      }
    } finally {
      if (fast) st = V().endFastExport();
    }
    await venc.flush();
    venc.close();
    if (audio) {
      ui.stage("Mengodekan audio AAC…");
      const aenc = new AudioEncoder({ output: (ch, meta) => muxer.addAudioChunk(ch, meta), error: (e) => { err = e; } });
      aenc.configure(acfg);
      const L = audio.length, sr = audio.sampleRate;
      const c0 = audio.getChannelData(0), c1 = audio.numberOfChannels > 1 ? audio.getChannelData(1) : c0;
      const step = 4096;
      for (let o = 0; o < L; o += step) {
        if (signal.aborted) throw new DOMException("Dibatalkan", "AbortError");
        const n = Math.min(step, L - o);
        const data = new Float32Array(n * 2);
        data.set(c0.subarray(o, o + n), 0);
        data.set(c1.subarray(o, o + n), n);
        const ad = new AudioData({ format: "f32-planar", sampleRate: sr, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((o / sr) * 1e6), data });
        aenc.encode(ad);
        ad.close();
        while (aenc.encodeQueueSize > 16) await sleep(2);
      }
      await aenc.flush();
      aenc.close();
    }
    if (err) throw err;
    ui.progress(0.98, "Menyusun file MP4…");
    muxer.finalize();
    const gpu = vcfg.hardwareAcceleration === "prefer-hardware" ? " GPU" : "";
    const dec = st && st.fast ? " · decode cepat" : "";
    return { blob: new Blob([muxer.target.buffer], { type: "video/mp4" }), ext: "mp4", thumb, method: "WebCodecs H.264" + gpu + (audio ? " + AAC" : " (tanpa suara)") + dec };
  }

  // ---------- cadangan: rekam real-time ----------
  function recorderMime() {
    if (!window.MediaRecorder) return "";
    return ["video/mp4;codecs=avc1.640028,mp4a.40.2", "video/mp4;codecs=avc1,mp4a.40.2", "video/mp4", "video/webm;codecs=h264,opus", "video/webm;codecs=vp9,opus", "video/webm"]
      .find((m) => { try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; } }) || "";
  }
  async function encodeRecorder(a, b, cfg, ui, signal) {
    const mime = recorderMime();
    if (!mime) throw new Error("Browser ini tidak bisa membuat video. Pakai Chrome, Edge, atau Safari versi terbaru.");
    const { W, H, fps, bitrate } = cfg;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    cv.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none";
    document.body.appendChild(cv);
    const ctx = cv.getContext("2d", { alpha: false });
    V().renderFrame(ctx, Math.min(b, a + 0.6), W, H);
    const thumb = snapThumb(cv);
    const stream = cv.captureStream(fps);
    const ac = V().audioCtx(), master = V().masterNode();
    let dest = null;
    if (ac && master) {
      dest = ac.createMediaStreamDestination();
      try { master.disconnect(); } catch (e) {}
      master.connect(dest);
      dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    }
    const mr = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate, audioBitsPerSecond: 192000 });
    const chunks = [];
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise((r) => (mr.onstop = r));
    await V().fontsReady();
    V().renderFrame(ctx, a, W, H);
    mr.start(500);
    ui.stage("Merekam secara real-time… jangan pindah tab sampai selesai");
    await V().startRealtime(a, b, (t) => {
      V().renderFrame(ctx, t, W, H);
      ui.progress((t - a) / (b - a) * 0.97, `${(t - a).toFixed(1)} / ${(b - a).toFixed(1)} dtk`);
      if (signal.aborted) V().stopRealtime();
    });
    await sleep(200);
    mr.stop();
    await stopped;
    stream.getTracks().forEach((t) => t.stop());
    if (dest) { try { master.disconnect(dest); } catch (e) {} master.connect(ac.destination); }
    cv.remove();
    if (signal.aborted) throw new DOMException("Dibatalkan", "AbortError");
    const type = mime.split(";")[0];
    return { blob: new Blob(chunks, { type }), thumb, ext: type === "video/mp4" ? "mp4" : "webm", method: "Perekaman real-time (" + type + ")" };
  }

  async function exportRange(a, b, cfg, ui, signal) {
    if (window.VideoEncoder && window.VideoFrame) {
      try { return await encodeWebCodecs(a, b, cfg, ui, signal); }
      catch (e) {
        if (e.name === "AbortError" || !e.fallback) throw e;
        ui.stage("Beralih ke perekaman real-time…");
      }
    }
    return encodeRecorder(a, b, cfg, ui, signal);
  }

  // ---------- UI ----------
  function show(which) {
    ["vExpSetup", "vExpRun", "vExpDone"].forEach((id) => $(id).classList.toggle("hidden", id !== which));
  }
  function renderPresets() {
    $("vPresetGrid").innerHTML = PRESETS.map((p) => `<button type="button" class="vpreset${p === preset ? " on" : ""}" data-preset="${p.id}"><div class="text-xs font-bold">${p.name}</div><div class="text-[10.5px] text-[#737373] mt-0.5">${p.sub}</div></button>`).join("");
  }
  function applyPreset(p) {
    preset = p;
    $("vExpRes").value = String(p.res);
    $("vExpFps").value = String(p.fps);
    $("vExpQuality").value = "1";
    $("vExpSplit").checked = p.maxSec <= 60 && V().duration() > p.maxSec;
    renderPresets();
    refreshInfo();
  }
  function refreshInfo() {
    const P = V().project, D = V().duration();
    const cfg = config();
    const warn = $("vExpAspectWarn");
    if (preset.aspect && preset.aspect !== P.aspect) {
      warn.classList.remove("hidden");
      warn.innerHTML = `<span>${preset.name} memakai rasio <b>${preset.aspect}</b>, kanvas proyek <b>${P.aspect}</b>.</span><button type="button" class="sne-btn-secondary px-2.5 py-1.5 text-[11px] shrink-0" id="vExpFixAspect">Ubah ke ${preset.aspect}</button>`;
    } else warn.classList.add("hidden");
    const over = D > preset.maxSec;
    $("vExpSplit").parentElement.classList.toggle("hidden", !over);
    $("vExpSplitLabel").textContent = `Potong otomatis per ${preset.maxSec} detik (batas ${preset.name})`;
    const parts = over && $("vExpSplit").checked ? Math.ceil(D / preset.maxSec) : 1;
    const mb = ((cfg.bitrate + 256000) * D) / 8 / 1e6;
    const wc = !!(window.VideoEncoder && window.VideoFrame);
    $("vExpInfo").innerHTML = `
      <div><b>${cfg.W}×${cfg.H}</b> · ${cfg.fps} fps · ${(cfg.bitrate / 1e6).toFixed(1)} Mbps · durasi ${D.toFixed(1)} dtk${parts > 1 ? ` · <b>${parts} file</b>` : ""}</div>
      <div>Perkiraan ukuran ±${mb < 1 ? mb.toFixed(1) : Math.round(mb)} MB · MP4 (H.264 + AAC)</div>
      <div class="mt-1 text-[#737373]">${wc ? "Mode presisi: setiap frame dirender satu per satu, hasil tidak terpengaruh lag." : "Browser ini memakai mode perekaman real-time: biarkan tab tetap terbuka."}
      ${over && !$("vExpSplit").checked ? `<br><b class="text-[#B42318]">Video lebih panjang dari ${preset.maxSec} dtk</b>: ${preset.name} akan memotongnya, centang potong otomatis di atas.` : ""}
      ${preset.id === "wastory" ? "<br>WhatsApp mengompres ulang video status; versi 1080p 30 fps ini memberi hasil paling tajam setelah dikompres." : ""}
      ${preset.id === "tiktok" ? "<br>Di TikTok aktifkan <b>Unggah HD</b> (Pengaturan → Penghematan data mati) agar 1080p 60 fps tidak diturunkan." : ""}
      ${preset.id === "reels" || preset.id === "igstory" || preset.id === "igpost" ? "<br>Di Instagram aktifkan <b>Unggah kualitas tertinggi</b> (Pengaturan → Kualitas media)." : ""}</div>`;
    if (!D) $("vExpInfo").innerHTML = "Timeline kosong. Tambahkan klip dulu.";
    $("vExpStart").disabled = !D;
  }

  async function start() {
    const D = V().duration();
    if (!D) return;
    V().pause();
    const cfg = config();
    const split = $("vExpSplit").checked && D > preset.maxSec;
    const ranges = [];
    if (split) for (let s = 0; s < D - 0.05; s += preset.maxSec) ranges.push([s, Math.min(D, s + preset.maxSec)]);
    else ranges.push([0, D]);
    abortCtl = new AbortController();
    results.forEach((r) => URL.revokeObjectURL(r.url));
    results.length = 0;
    show("vExpRun");
    let wake = null;
    try { if (navigator.wakeLock) wake = await navigator.wakeLock.request("screen"); } catch (e) {}
    const t0 = performance.now();
    try {
      for (let i = 0; i < ranges.length; i++) {
        const [a, b] = ranges[i];
        const part = ranges.length > 1 ? ` — bagian ${i + 1}/${ranges.length}` : "";
        const ui = {
          stage: (s) => { $("vExpStage").textContent = s + part; },
          progress: (p, d) => { $("vExpBar").style.width = ((i + Math.min(1, p)) / ranges.length) * 100 + "%"; if (d) $("vExpDetail").textContent = d; }
        };
        const r = await exportRange(a, b, cfg, ui, abortCtl.signal);
        const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
        r.name = `SNE-${preset.id}-${stamp}${ranges.length > 1 ? "-bagian" + (i + 1) : ""}.${r.ext}`;
        r.url = URL.createObjectURL(r.blob);
        results.push(r);
      }
      $("vExpBar").style.width = "100%";
      done((performance.now() - t0) / 1000);
    } catch (e) {
      if (e.name === "AbortError") { V().showToast("Ekspor dibatalkan"); show("vExpSetup"); }
      else {
        console.error(e);
        $("vExpStage").textContent = "Ekspor gagal";
        $("vExpDetail").textContent = (e && e.message) || String(e);
        V().showToast("Ekspor gagal: " + ((e && e.message) || e), 6000);
        setTimeout(() => show("vExpSetup"), 4000);
      }
    } finally {
      if (wake) wake.release().catch(() => {});
      abortCtl = null;
    }
  }
  function done(secs) {
    show("vExpDone");
    const vid = $("vExpVideo");
    vid.poster = results[0].thumb || "";
    vid.src = results[0].url;
    const canShare = navigator.canShare && results.every((r) => navigator.canShare({ files: [new File([r.blob], r.name, { type: r.blob.type })] }));
    $("vExpFiles").innerHTML = `<div class="text-[11.5px] text-[#525252]">Selesai dalam ${Math.round(secs)} dtk · ${results[0].method}</div>` + results.map((r, i) => `
      <div class="flex items-center gap-2 sne-panel-low p-2.5">
        ${r.thumb ? `<img src="${r.thumb}" alt="" class="vexp-thumb">` : ""}
        <div class="min-w-0 flex-1"><div class="text-xs font-bold truncate">${r.name}</div><div class="text-[11px] text-[#737373]">${(r.blob.size / 1e6).toFixed(1)} MB</div></div>
        ${results.length > 1 ? `<button type="button" class="sne-btn-secondary px-2.5 py-1.5 text-[11px]" data-preview="${i}">Lihat</button>` : ""}
        <a class="sne-btn-primary px-3 py-1.5 text-[11px]" href="${r.url}" download="${r.name}">Unduh</a>
        ${canShare ? `<button type="button" class="sne-btn-secondary px-2.5 py-1.5 text-[11px]" data-share="${i}">Bagikan</button>` : ""}
      </div>`).join("") +
      (results.some((r) => r.ext !== "mp4") ? `<p class="text-[11px] text-[#B42318]">Browser ini hanya bisa membuat WebM. Untuk MP4 yang diterima semua aplikasi, ekspor dari Chrome/Edge/Safari terbaru.</p>` : "") +
      `<p class="text-[11px] text-[#737373]">Di iPhone: ketuk <b>Bagikan</b> → Simpan Video, atau langsung pilih Instagram/WhatsApp/TikTok.</p>`;
  }

  $("vOpenExport").addEventListener("click", () => {
    if (!V().duration()) return V().showToast("Timeline masih kosong. Impor video atau foto dulu.");
    V().pause();
    $("vExportModal").classList.remove("hidden");
    show(results.length ? "vExpDone" : "vExpSetup");
    if (!results.length) applyPreset(preset);
  });
  const close = () => {
    if (abortCtl) { if (!confirm("Ekspor sedang berjalan. Batalkan?")) return; abortCtl.abort(); }
    $("vExportModal").classList.add("hidden");
    $("vExpVideo").pause();
  };
  $("vExpClose").addEventListener("click", close);
  $("vExportModal").addEventListener("click", (e) => { if (e.target.id === "vExportModal" && !abortCtl) close(); });
  $("vPresetGrid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-preset]");
    if (b) applyPreset(PRESETS.find((p) => p.id === b.dataset.preset));
  });
  ["vExpRes", "vExpFps", "vExpQuality", "vExpSplit"].forEach((id) => $(id).addEventListener("change", refreshInfo));
  $("vExpAspectWarn").addEventListener("click", (e) => {
    if (e.target.id !== "vExpFixAspect") return;
    V().setAspect(preset.aspect);
    refreshInfo();
  });
  $("vExpStart").addEventListener("click", start);
  $("vExpCancel").addEventListener("click", () => abortCtl && abortCtl.abort());
  $("vExpAgain").addEventListener("click", () => { show("vExpSetup"); applyPreset(preset); });
  $("vExpFiles").addEventListener("click", async (e) => {
    const pv = e.target.closest("[data-preview]");
    if (pv) { const r = results[+pv.dataset.preview]; $("vExpVideo").poster = r.thumb || ""; $("vExpVideo").src = r.url; return; }
    const sh = e.target.closest("[data-share]");
    if (!sh) return;
    const r = results[+sh.dataset.share];
    try { await navigator.share({ files: [new File([r.blob], r.name, { type: r.blob.type })], title: r.name }); }
    catch (err) { if (err.name !== "AbortError") V().showToast("Tidak bisa membagikan: " + err.message); }
  });
  window.SNEExport = { PRESETS, exportRange, config, dims };
})();
