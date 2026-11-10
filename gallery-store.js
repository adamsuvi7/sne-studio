// SNE Studio — Galeri permanen.
// Foto yang diimpor disimpan di IndexedDB browser supaya tetap ada setelah tab ditutup / halaman dimuat ulang.
// Data tersimpan per perangkat & per browser (tidak diunggah ke server mana pun).
// Dimuat setelah <script> utama; memakai global: state, renderStudioGalleryGrid, showToast.
(function () {
  const DB_NAME = "sne-studio", STORE = "gallery";
  let dbPromise = null, warned = false;

  function openDb() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  async function run(mode, work) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }

  function warn(e) {
    console.warn("Galeri tidak bisa disimpan permanen", e);
    if (warned) return;
    warned = true;
    showToast("Penyimpanan browser penuh / diblokir: foto baru hanya ada sampai tab ditutup");
  }

  async function save(item) {
    try {
      await run("readwrite", (s) => s.put({ id: item.id, src: item.src, label: item.label, addedAt: Date.now() }));
      // Minta browser tidak menghapus data ini saat ruang disk menipis
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    } catch (e) {
      item.saved = false;
      warn(e);
      renderStudioGalleryGrid();
    }
  }

  async function remove(id) {
    try {
      await run("readwrite", (s) => s.delete(id));
    } catch (e) {
      console.warn(e);
    }
  }

  // Kembalikan foto tersimpan ke Galeri (terbaru di atas)
  async function restore() {
    try {
      const rows = (await run("readonly", (s) => s.getAll())) || [];
      rows.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
      let added = 0;
      for (const r of rows) {
        if (!r.src || state.galleryItems.some((g) => g.id === r.id || g.src === r.src)) continue;
        state.galleryItems.unshift({ id: r.id, src: r.src, label: r.label, saved: true });
        added++;
      }
      if (added) {
        renderStudioGalleryGrid();
        showToast(`${added} foto Galeri tersimpan dimuat kembali`);
      }
      return added;
    } catch (e) {
      console.warn("Galeri tersimpan tidak bisa dibaca", e);
      return 0;
    }
  }

  window.SNEGalleryStore = { save, remove, restore };
})();
