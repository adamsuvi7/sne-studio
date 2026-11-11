// SNE Video — pembaca frame cepat untuk ekspor.
// Dulu tiap frame ekspor = seek elemen <video> (browser men-decode ulang dari keyframe terdekat: sangat lambat untuk
// video HP yang keyframe-nya jarang). Sekarang file MP4/MOV dibongkar (mp4box.js, hanya kotak ftyp+moov yang dibaca)
// lalu sampel di-decode berurutan dengan WebCodecs VideoDecoder (akselerasi perangkat keras bila ada).
(function () {
  "use strict";
  const LIB = "https://cdn.jsdelivr.net/npm/mp4box@0.5.2/dist/mp4box.all.min.js";
  let libP = null;
  function loadLib() {
    if (window.MP4Box) return Promise.resolve(window.MP4Box);
    return (libP = libP || new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = LIB;
      s.onload = () => res(window.MP4Box);
      s.onerror = () => { libP = null; rej(new Error("mp4box gagal dimuat")); };
      document.head.appendChild(s);
    }));
  }

  // Jelajahi kotak tingkat atas; ambil ftyp + moov saja (mdat yang besar dilewati)
  async function topBoxes(blob) {
    const want = [];
    let off = 0;
    for (let guard = 0; off + 8 <= blob.size && guard < 4096; guard++) {
      const dv = new DataView(await blob.slice(off, off + 16).arrayBuffer());
      let size = dv.getUint32(0);
      const type = String.fromCharCode(dv.getUint8(4), dv.getUint8(5), dv.getUint8(6), dv.getUint8(7));
      if (size === 1) size = Number(dv.getBigUint64(8));
      else if (size === 0) size = blob.size - off;
      if (size < 8) break;
      if (type === "ftyp" || type === "moov") want.push(new Uint8Array(await blob.slice(off, off + size).arrayBuffer()));
      if (type === "moov") break;
      off += size;
    }
    return want;
  }

  const demuxCache = new WeakMap(); // blob -> Promise<track|null>
  function demux(blob) {
    if (demuxCache.has(blob)) return demuxCache.get(blob);
    const p = (async () => {
      const MP4Box = await loadLib();
      const parts = await topBoxes(blob);
      if (parts.length < 1 || !parts.some((u) => String.fromCharCode(...u.subarray(4, 8)) === "moov")) return null;
      const total = parts.reduce((a, u) => a + u.length, 0), joined = new Uint8Array(total);
      let o = 0;
      parts.forEach((u) => { joined.set(u, o); o += u.length; });
      const f = MP4Box.createFile();
      let info = null;
      f.onReady = (i) => { info = i; };
      f.onError = () => {};
      const ab = joined.buffer;
      ab.fileStart = 0;
      f.appendBuffer(ab);
      f.flush();
      const vt = info && info.videoTracks && info.videoTracks[0];
      if (!vt) return null;
      const trak = f.getTrackById(vt.id);
      const samples = f.getTrackSamplesInfo(vt.id) || [];
      if (!samples.length) return null;
      // description (avcC/hvcC/vpcC/av1C) = isi kotak tanpa header 8 byte
      let description;
      for (const e of trak.mdia.minf.stbl.stsd.entries) {
        const b = e.avcC || e.hvcC || e.vpcC || e.av1C;
        if (b) {
          const DS = window.DataStream || MP4Box.DataStream; // build mp4box.all mengekspor DataStream global
          const s = new DS(undefined, 0, DS.BIG_ENDIAN);
          try { b.write(s); description = new Uint8Array(s.buffer, 8); } catch (err) { description = undefined; }
          break;
        }
      }
      const ts = trak.mdia.mdhd.timescale;
      let shift = 0; // edit list: waktu media yang tampil di detik 0 (umum pada video HP dengan B-frame)
      const el = trak.edts && trak.edts.elst && trak.edts.elst.entries;
      if (el && el.length) { const first = el.find((x) => x.media_time >= 0); if (first) shift = first.media_time; }
      const m = trak.tkhd.matrix || [65536, 0, 0, 0, 65536, 0, 0, 0, 1 << 30];
      const rot = ((Math.round((Math.atan2(m[1], m[0]) * 180) / Math.PI) % 360) + 360) % 360;
      return {
        codec: vt.codec, w: vt.video ? vt.video.width : vt.track_width, h: vt.video ? vt.video.height : vt.track_height, description, rot,
        samples: samples.map((s) => ({ off: s.offset, size: s.size, key: !!s.is_sync, pts: Math.round(((s.cts - shift) / ts) * 1e6), dur: Math.round((s.duration / ts) * 1e6) }))
      };
    })().catch((e) => { console.warn("demux gagal", e); return null; });
    demuxCache.set(blob, p);
    return p;
  }

  class Reader {
    constructor(blob, tr) {
      this.blob = blob; this.tr = tr; this.frames = []; this.ptr = 0; this.eof = false; this.err = null; this.waiter = null; this.lastT = -1;
      this.cfg = { codec: tr.codec, codedWidth: tr.w, codedHeight: tr.h, description: tr.description, optimizeForLatency: false };
      // urutan presentasi untuk mencari keyframe sebelum waktu tertentu
      this.keys = tr.samples.map((s, i) => (s.key ? i : -1)).filter((i) => i >= 0);
      this.win = null;
    }
    async init() {
      if (!window.VideoDecoder) return false;
      try { const r = await VideoDecoder.isConfigSupported(this.cfg); if (!r.supported) return false; } catch (e) { return false; }
      this.dec = new VideoDecoder({
        output: (f) => { this.frames.push(f); this.frames.sort((a, b) => a.timestamp - b.timestamp); this.wake(); },
        error: (e) => { this.err = e; this.wake(); }
      });
      this.dec.configure(this.cfg);
      return true;
    }
    wake() { const w = this.waiter; this.waiter = null; if (w) w(); }
    wait(ms) { return new Promise((r) => { this.waiter = r; setTimeout(() => { if (this.waiter === r) { this.waiter = null; r(); } }, ms); }); }
    clearFrames() { this.frames.forEach((f) => f.close()); this.frames = []; }
    seek(tu) {
      // keyframe terakhir yang tampil <= waktu diminta
      let k = this.keys[0] || 0;
      for (const i of this.keys) { if (this.tr.samples[i].pts <= tu) k = i; else break; }
      this.ptr = k; this.eof = false; this.flushing = null; this.win = null;
      this.clearFrames();
      this.dec.reset();
      this.dec.configure(this.cfg);
      this.started = true;
    }
    async data(i) {
      // baca jendela ±40 sampel sekaligus (lebih cepat daripada slice per sampel)
      const s = this.tr.samples[i];
      if (!this.win || i < this.win.i0 || i > this.win.i1) {
        const i1 = Math.min(this.tr.samples.length - 1, i + 40);
        let a = Infinity, b = 0;
        for (let j = i; j <= i1; j++) { const x = this.tr.samples[j]; a = Math.min(a, x.off); b = Math.max(b, x.off + x.size); }
        if (b - a > 64 * 1024 * 1024) { a = s.off; b = s.off + s.size; } // jaga-jaga file aneh
        this.win = { i0: i, i1: b - a === s.size ? i : i1, base: a, buf: new Uint8Array(await this.blob.slice(a, b).arrayBuffer()) };
      }
      return this.win.buf.subarray(s.off - this.win.base, s.off - this.win.base + s.size);
    }
    async feed(n) {
      let fed = 0;
      while (fed < n && this.ptr < this.tr.samples.length && this.dec.decodeQueueSize < 12) {
        const i = this.ptr++, s = this.tr.samples[i];
        const d = await this.data(i);
        this.dec.decode(new EncodedVideoChunk({ type: s.key ? "key" : "delta", timestamp: s.pts, duration: s.dur, data: d }));
        fed++;
      }
      return fed;
    }
    // Frame yang tampil pada detik t (sumber). Akses maju berurutan sangat cepat; mundur/lompat jauh = seek ke keyframe.
    async frameAt(t) {
      if (this.err) throw this.err;
      const tu = Math.round(t * 1e6);
      const head = this.frames[0];
      const back = this.lastT >= 0 && tu < this.lastT - 1000;
      const far = head && tu > head.timestamp + 2.5e6 && this.keys.some((i) => { const p = this.tr.samples[i].pts; return p > head.timestamp && p <= tu; });
      if (!this.started || back || far || (head && tu < head.timestamp - 1000 && !this.lastFrameOk(tu))) this.seek(tu);
      this.lastT = tu;
      for (let guard = 0; guard < 4000; guard++) {
        if (this.err) throw this.err;
        while (this.frames.length >= 2 && this.frames[1].timestamp <= tu + 500) this.frames.shift().close();
        const f0 = this.frames[0];
        if (this.frames.length >= 2 || (f0 && (this.eof || f0.timestamp > tu))) return f0;
        if (this.eof) return f0 || null;
        const fed = await this.feed(6);
        if (!fed && this.ptr >= this.tr.samples.length && !this.flushing) {
          this.flushing = this.dec.flush().catch(() => {}).then(() => { this.eof = true; this.wake(); });
        }
        await this.wait(fed ? 40 : 400);
      }
      return this.frames[0] || null;
    }
    lastFrameOk(tu) { return this.frames[0] && this.frames[0].timestamp <= tu; }
    close() { this.clearFrames(); try { this.dec && this.dec.state !== "closed" && this.dec.close(); } catch (e) {} }
  }

  async function open(blob) {
    if (!blob || !window.VideoDecoder || !window.EncodedVideoChunk) return null;
    const tr = await demux(blob);
    if (!tr) return null;
    const r = new Reader(blob, tr);
    return (await r.init()) ? r : null;
  }

  window.SNEDecode = { open, demux };
})();
