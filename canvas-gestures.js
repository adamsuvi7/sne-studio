// SNE Studio — Gestur kanvas: cubit dua jari (zoom foto / perbesar & putar teks) dan roda mouse.
// Dimuat setelah <script> utama; memakai global: state, canvas, findHit*, renderCanvas, dst.
(function () {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const FONT_MIN = 14, FONT_MAX = 280, ZOOM_MIN = 1, ZOOM_MAX = 2.8; // sama dengan batas slider inspector

  function toCanvas(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return { x: ((clientX - rect.left) / rect.width) * state.canvasWidth, y: ((clientY - rect.top) / rect.height) * state.canvasHeight };
  }

  // Teks hanya jadi sasaran di mode Teks; selain itu stiker PIP, lalu slot foto di bawah titik
  function pickTarget(points) {
    if (state.interactionMode === "text") {
      for (const p of points) {
        const lyr = findHitLayer(p.x, p.y);
        if (lyr && !lyr.locked) return { type: "layer", lyr, size: lyr.fontSize, rot: lyr.rotation || 0 };
      }
    }
    const mid = points[0];
    const pip = findHitPipPhoto(mid.x, mid.y);
    if (pip) return { type: "pip", pip, w: pip.w, h: pip.h };
    const idx = findHitSlotIndex(mid.x, mid.y);
    const slot = state.slots[idx];
    return slot ? { type: "slot", slot, idx, zoom: slot.zoom } : null;
  }

  function scaleTarget(t, k) {
    if (t.type === "layer") t.lyr.fontSize = clamp(Math.round(t.size * k), FONT_MIN, FONT_MAX);
    else if (t.type === "slot") t.slot.zoom = clamp(t.zoom * k, ZOOM_MIN, ZOOM_MAX);
    else {
      const kk = clamp(k, 0.08 / t.w, 0.95 / t.w);
      t.pip.w = t.w * kk;
      t.pip.h = t.h * kk;
    }
  }

  function commit(t) {
    if (t.type === "layer") state.selectedLayerId = t.lyr.id;
    if (t.type === "slot") state.selectedSlotIndex = t.idx;
    pushHistorySnapshot();
    syncAllUI();
    renderCanvas();
  }

  // ----- Cubit dua jari -----------------------------------------------------
  let pinch = null;
  const span = (a, b) => ({ dist: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY), ang: Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX) });

  canvas.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 2) return;
    e.preventDefault();
    state.drag.active = false; // batalkan geser satu jari yang sudah dimulai
    const [a, b] = e.touches;
    const mid = toCanvas((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
    const target = pickTarget([mid, toCanvas(a.clientX, a.clientY), toCanvas(b.clientX, b.clientY)]);
    if (target) pinch = { ...span(a, b), target };
  }, { passive: false });

  window.addEventListener("touchmove", (e) => {
    if (!pinch || e.touches.length < 2) return;
    e.preventDefault();
    const now = span(e.touches[0], e.touches[1]);
    const t = pinch.target;
    scaleTarget(t, now.dist / Math.max(1, pinch.dist));
    if (t.type === "layer") {
      let rot = Math.round(t.rot + ((now.ang - pinch.ang) * 180) / Math.PI);
      rot = ((rot + 540) % 360) - 180;
      t.lyr.rotation = Math.abs(rot) < 4 ? 0 : rot; // magnet ke posisi lurus
    }
    renderCanvas();
  }, { passive: false });

  const endPinch = (e) => {
    if (!pinch || e.touches.length >= 2) return;
    const t = pinch.target;
    pinch = null;
    commit(t);
  };
  window.addEventListener("touchend", endPinch);
  window.addEventListener("touchcancel", endPinch);

  // ----- Roda mouse / trackpad ---------------------------------------------
  // Faktor diakumulasi dari nilai awal supaya scroll halus trackpad tidak hilang karena pembulatan
  let wheelTimer = 0, wheel = null;
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (!wheel) {
      const target = pickTarget([toCanvas(e.clientX, e.clientY)]);
      if (!target) return;
      wheel = { target, k: 1 };
    }
    wheel.k *= Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0012)); // ctrlKey = cubit trackpad
    scaleTarget(wheel.target, wheel.k);
    renderCanvas();
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { // satu langkah undo per rangkaian scroll
      const t = wheel.target;
      wheel = null;
      commit(t);
    }, 260);
  }, { passive: false });
})();
