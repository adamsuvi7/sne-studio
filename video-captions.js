// SNE Video — subtitle otomatis.
// Suara timeline dicampur ke 16 kHz mono, lalu dibaca model Whisper (transformers.js) di Web Worker:
// semua di perangkat, tidak ada audio yang dikirim ke server. Model diunduh sekali lalu di-cache browser.
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const LIB = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2/dist/transformers.min.js";
  const MODELS = { base: "onnx-community/whisper-base", tiny: "onnx-community/whisper-tiny" };
  let worker = null, busy = false;

  const WORKER_SRC = `
    import { pipeline, env } from "${LIB}";
    env.allowLocalModels = false;
    let pipe = null, cur = "";
    self.onmessage = async (e) => {
      const { model, audio, language } = e.data;
      try {
        if (!pipe || cur !== model) {
          pipe = await pipeline("automatic-speech-recognition", model, {
            progress_callback: (p) => self.postMessage({ type: "progress", p: { status: p.status, file: p.file, progress: p.progress, loaded: p.loaded, total: p.total } })
          });
          cur = model;
        }
        self.postMessage({ type: "status", text: "transcribe" });
        const out = await pipe(audio, { language, task: "transcribe", return_timestamps: true, chunk_length_s: 30, stride_length_s: 5 });
        self.postMessage({ type: "done", out: { text: out.text, chunks: out.chunks || [] } });
      } catch (err) {
        self.postMessage({ type: "error", message: String((err && err.message) || err) });
      }
    };`;

  function getWorker() {
    if (worker) return worker;
    const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
    worker = new Worker(url, { type: "module" });
    return worker;
  }
  function status(text) {
    const el = $("vCapStatus");
    el.classList.remove("hidden");
    el.textContent = text;
  }

  // Potongan panjang dipecah jadi baris pendek (±5 kata) supaya enak dibaca di layar HP
  function toSegments(chunks, total) {
    const segs = [];
    chunks.forEach((ch) => {
      let text = (ch.text || "").trim();
      if (!text || /^[\[(].*[\])]$/.test(text) || /^(\.|…|-)+$/.test(text)) return; // [Musik], (tepuk tangan), dll.
      let [s, e] = ch.timestamp || [0, null];
      if (s == null) return;
      if (e == null || e <= s) e = Math.min(total, s + Math.max(1.2, text.length * 0.07));
      const words = text.split(/\s+/);
      const groups = [];
      for (let i = 0; i < words.length; i += 5) groups.push(words.slice(i, i + 5).join(" "));
      const totalChars = groups.reduce((a, g) => a + g.length, 0) || 1;
      let t = s;
      groups.forEach((g) => {
        const d = ((e - s) * g.length) / totalChars;
        segs.push({ start: t, end: t + d, text: g });
        t += d;
      });
    });
    // rapikan tumpang tindih kecil antar potongan
    segs.sort((a, b) => a.start - b.start);
    for (let i = 1; i < segs.length; i++) if (segs[i].start < segs[i - 1].end) segs[i - 1].end = Math.max(segs[i - 1].start + 0.2, segs[i].start);
    return segs;
  }

  async function run() {
    if (busy) return;
    const V = window.SNEVideo;
    const D = V.duration();
    if (!D) return V.showToast("Timeline kosong. Tambahkan video bersuara dulu.");
    busy = true;
    const btn = $("vAutoCaption");
    btn.disabled = true;
    try {
      status("Mengambil suara dari timeline…");
      const buf = await V.renderAudio(16000, 1, 0, D);
      if (!buf) throw new Error("Tidak ada suara di timeline (video bisu atau semua klip dibisukan).");
      const audio = buf.getChannelData(0).slice();
      const model = MODELS[$("vCapModel").value] || MODELS.base;
      const language = $("vCapLang").value;
      const w = getWorker();
      const files = {};
      const out = await new Promise((resolve, reject) => {
        w.onmessage = (e) => {
          const m = e.data;
          if (m.type === "progress" && m.p.status === "progress" && m.p.file) {
            files[m.p.file] = m.p;
            const all = Object.values(files);
            const loaded = all.reduce((a, f) => a + (f.loaded || 0), 0), tot = all.reduce((a, f) => a + (f.total || 0), 0);
            status(`Mengunduh model ${tot ? Math.round((loaded / tot) * 100) : 0}% (${(loaded / 1e6).toFixed(0)} / ${(tot / 1e6).toFixed(0)} MB, hanya sekali)…`);
          } else if (m.type === "status") status(`Mengenali ucapan (${D.toFixed(0)} dtk audio)… bisa 10–60 dtk`);
          else if (m.type === "done") resolve(m.out);
          else if (m.type === "error") reject(new Error(m.message));
        };
        w.onerror = (e) => reject(new Error(e.message || "Worker gagal dimuat"));
        w.postMessage({ model, audio, language }, [audio.buffer]);
      });
      const segs = toSegments(out.chunks, D);
      if (!segs.length) throw new Error("Tidak ada ucapan yang terdeteksi.");
      const n = V.addCaptions(segs, V.TEXT_STYLES[2]);
      status(`${n} baris subtitle dibuat. Ketuk baris di timeline untuk mengedit teks, gaya, atau waktunya.`);
      V.showToast(`${n} baris subtitle ditambahkan`);
    } catch (e) {
      console.error(e);
      status("Gagal: " + e.message);
      if (worker && /worker|import|module/i.test(e.message)) { worker.terminate(); worker = null; }
    } finally {
      busy = false;
      btn.disabled = false;
    }
  }
  $("vAutoCaption").addEventListener("click", run);
  window.SNECaptions = { run, toSegments };
})();
