// SNE Video — konversi video yang tidak bisa diputar browser (mis. HEVC/H.265 .MOV dari iPhone di Chrome)
// menjadi MP4 H.264 + AAC, sepenuhnya di perangkat dengan ffmpeg.wasm (tidak ada file yang diunggah ke server).
// Kelas FFmpeg disimpan lokal di /vendor/ffmpeg (worker harus satu origin); inti wasm (~32 MB) diunduh sekali dari CDN.
(function () {
  "use strict";
  const CORE = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm/";
  let ff = null, loading = null, queue = Promise.resolve(), cancelled = false;

  // ---- panel kemajuan kecil (dibuat sekali) ----
  let box;
  function ui() {
    if (box) return box;
    box = document.createElement("div");
    box.id = "vConvert";
    box.setAttribute("role", "status");
    box.style.cssText = "position:fixed;left:50%;top:68px;transform:translateX(-50%);z-index:85;width:min(92vw,380px);background:var(--surface,#fff);border:1px solid var(--border,#E7E7E4);border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.14);padding:12px 14px;display:none;font-size:12.5px;color:var(--ink,#171717)";
    box.innerHTML = '<div style="display:flex;align-items:center;gap:8px"><b id="vConvTitle" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Mengonversi video…</b><button id="vConvCancel" type="button" class="sne-btn-secondary" style="height:28px;padding:0 10px;font-size:12px">Batal</button></div>' +
      '<div style="height:6px;border-radius:99px;background:var(--surface-high,#ECECE9);margin:9px 0 6px;overflow:hidden"><div id="vConvBar" style="height:100%;width:0;background:var(--primary,#B42318);transition:width .2s"></div></div>' +
      '<div id="vConvDetail" style="color:var(--ink-muted,#737373)"></div>';
    document.body.appendChild(box);
    box.querySelector("#vConvCancel").onclick = cancel;
    return box;
  }
  function show(title, pct, detail) {
    const b = ui();
    b.style.display = "block";
    b.querySelector("#vConvTitle").textContent = title;
    b.querySelector("#vConvBar").style.width = Math.max(0, Math.min(100, pct)) + "%";
    b.querySelector("#vConvDetail").textContent = detail || "";
  }
  function hide() { if (box) box.style.display = "none"; }

  async function fetchBlobURL(url, type, onBytes) {
    const r = await fetch(url);
    if (!r.ok) throw new Error("Gagal mengunduh " + url.split("/").pop());
    const total = +r.headers.get("content-length") || 0;
    if (!r.body || !onBytes) return URL.createObjectURL(new Blob([await r.arrayBuffer()], { type }));
    const rd = r.body.getReader(), parts = [];
    let got = 0;
    for (;;) {
      const { done, value } = await rd.read();
      if (done) break;
      parts.push(value);
      got += value.length;
      onBytes(got, total);
    }
    return URL.createObjectURL(new Blob(parts, { type }));
  }

  function load() {
    if (ff) return Promise.resolve(ff);
    if (loading) return loading;
    loading = (async () => {
      const { FFmpeg } = await import(new URL("vendor/ffmpeg/index.js", document.baseURI).href);
      const coreURL = await fetchBlobURL(CORE + "ffmpeg-core.js", "text/javascript");
      const wasmURL = await fetchBlobURL(CORE + "ffmpeg-core.wasm", "application/wasm", (got, tot) => {
        if (tot < got) tot = 32.2e6; // content-length bisa ukuran terkompresi (gzip/br)
        show("Menyiapkan pengonversi (sekali saja)…", (got / tot) * 100, `${(got / 1e6).toFixed(1)} / ${(tot / 1e6).toFixed(0)} MB`);
      });
      const f = new FFmpeg();
      await f.load({ coreURL, wasmURL });
      ff = f;
      return f;
    })();
    loading.catch(() => { loading = null; });
    return loading;
  }

  function cancel() {
    cancelled = true;
    if (ff) { try { ff.terminate(); } catch (e) {} }
    ff = null; loading = null;
    hide();
  }

  // file -> { blob } | { noVideo: true } | { cancelled: true } | { error }
  function toH264(file) {
    const job = queue.then(() => run(file));
    queue = job.catch(() => {});
    return job;
  }
  async function run(file) {
    cancelled = false;
    const label = file.name || "video";
    show(`Mengonversi ${label}`, 0, "Video ini (HEVC/H.265) tidak bisa diputar browser. Diubah ke H.264 di perangkat Anda…");
    let f;
    try { f = await load(); } catch (e) {
      hide();
      return cancelled ? { cancelled: true } : { error: "Pengonversi gagal dimuat: " + (e.message || e) };
    }
    let dur = 0, noVideo = false, lastLog = "";
    const onLog = ({ message }) => {
      lastLog = message;
      const d = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(message);
      if (d) dur = +d[1] * 3600 + +d[2] * 60 + +d[3];
      if (/matches no streams|does not contain any stream/i.test(message)) noVideo = true;
    };
    const t0 = performance.now();
    const onProg = ({ time }) => {
      if (!dur || !(time > 0)) return;
      const p = Math.min(1, time / 1e6 / dur);
      const el = (performance.now() - t0) / 1000;
      const left = p > 0.02 ? Math.max(0, el / p - el) : 0;
      show(`Mengonversi ${label}`, p * 100, `${Math.round(p * 100)}%${left ? ` · sisa ±${left < 90 ? Math.round(left) + " dtk" : Math.round(left / 60) + " mnt"}` : ""} · tetap buka halaman ini`);
    };
    f.on("log", onLog);
    f.on("progress", onProg);
    const dir = "/in" + Date.now();
    try {
      await f.createDir(dir);
      await f.mount("WORKERFS", { files: [file] }, dir); // dibaca langsung dari file, tidak disalin ke memori
      const code = await f.exec([
        "-i", `${dir}/${file.name}`,
        "-map", "0:v:0", "-map", "0:a:0?",
        // maksimal 1080p (sisi panjang 1920) agar cepat & hemat memori; rotasi iPhone diterapkan otomatis
        "-vf", "scale=w='min(1920,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", "-g", "30", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-ac", "2",
        "-movflags", "+faststart", "/out.mp4"
      ]);
      try { await f.unmount(dir); await f.deleteDir(dir); } catch (e) {}
      if (cancelled) return { cancelled: true };
      if (code !== 0) return noVideo ? { noVideo: true } : { error: lastLog || "ffmpeg gagal (" + code + ")" };
      const data = await f.readFile("/out.mp4");
      await f.deleteFile("/out.mp4").catch(() => {});
      return { blob: new Blob([data.buffer], { type: "video/mp4" }) };
    } catch (e) {
      return cancelled ? { cancelled: true } : { error: String((e && e.message) || e) };
    } finally {
      if (ff) { ff.off("log", onLog); ff.off("progress", onProg); }
      hide();
    }
  }

  window.SNEConvert = { toH264, load, cancel };
})();
