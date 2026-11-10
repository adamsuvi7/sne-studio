# CLAUDE.md — Panduan Arsitektur Proyek SNE Studio

Dokumen ini dibaca otomatis oleh **Claude Code** agar pengembangan lanjutan berjalan langsung di atas kode yang sudah ada tanpa membuat ulang dari awal dan tanpa menghabiskan kuota token.

## 1. Aturan Penting untuk Claude Code (WAJIB DIBACA PERTAMA)

1. **JANGAN membuat ulang proyek dari nol**: Seluruh fitur utama sudah berjalan penuh di dalam `index.html`. Lanjutkan pengembangan secara inkremental (tambahkan/ubah fungsi yang diminta pengguna tanpa menghapus fitur yang sudah ada).

2. **PERINGATAN TOKEN — Jangan baca baris `1338` s.d. `1400` di `index.html`**:

   * Baris `1338–1400` berisi konstanta gambar Base64 (`SAMPLE_PHOTOS`, `CLEAN_PHOTOS`, `REF_THUMBS`) berukuran \~2,8 MB.

   * Saat membaca `index.html`, gunakan rentang baris di luar `1338–1400` (misalnya `1–1335` atau `1401–5305`), **ATAU** jalankan langkah modularisasi otomatis di Bagian 3 di bawah agar Base64 dipindahkan ke file terpisah `assets-data.js`.

3. **Deployment Vercel**:

   * Proyek ini adalah **Static Web App** murni yang terhubung ke GitHub (`adamsuvi7/sne-studio`) dan otomatis ter-deploy ke Vercel setiap kali ada `git push origin main`.

   * Jangan menambahkan `"build"` script kosong di `package.json` tanpa menyertakan `"outputDirectory": "."` di `vercel.json`.

## 2. Peta Baris Kode `index.html` (Total: 5.305 Baris)

Gunakan peta baris ini untuk langsung menuju ke bagian kode yang ingin diedit:

* **Baris `1–208`**: `<head>`, pemuatan 152 Google Fonts, Tailwind CSS CDN, dan custom CSS (`<style>`).

* **Baris `209–1333`**: Struktur DOM / UI HTML:

  * Header atas (Mode Kanvas, Undo/Redo, Simpan Template, DESIGN.md, Export HD).

  * Sidebar Kiri dengan 4 tab (`Template`, `Layout`, `Elemen`, `Galeri`) + fitur *Jiplak Referensi*.

  * Area Tengah: Kanvas utama `#studioCanvas` (`1080x1920`) + toolbar floating bawah.

  * Panel Inspector Kanan dengan 4 tab (`Gaya Teks`, `Efek & 3D`, `Pill & Dekor`, `Warna & Foto`).

  * Bottom Navigation khusus layar HP/Mobile (`< 1024px`).

* **Baris `1338–1400` (SKIP SAAT BACA FILE)**: Data gambar Base64 (`SAMPLE_PHOTOS`, `CLEAN_PHOTOS`, `REF_THUMBS`).

* **Baris `1404–1532`**: `PHOTO_LAYOUTS` — 15 tata letak kolase multi-foto (1 hingga 6 slot foto, termasuk diagonal, polaroid, filmstrip, grid, dan PIP).

* **Baris `1536–1981`**: `REFERENCE_TEMPLATES` — 24 preset template Instastory lengkap dengan koordinat layer teks, font, warna, dan dekorasi.

* **Baris `1985–2104`**: State global (`state`), sistem Undo/Redo (`historyStack`, `pushHistorySnapshot`, `restoreHistorySnapshot`), dan `imageCache`.

* **Baris `2108–2260`**: Fungsi pemuat template (`applyReferenceTemplate`), auto-crop gambar ke masing-masing slot kolase, dan ekstraksi palet warna otomatis (`extractPaletteFromActivePhotos`).

* **Baris `2264–3006`**: **HTML5 Canvas 2D Rendering Engine**:

  * `getEffectiveSlots()` (Baris `2264`): Menghitung dimensi slot foto beserta `scaleBox` dan `offsetX/Y`.

  * `renderPhotoSlotsOnly()` (Baris `2282`): Menggambar seluruh slot foto, feathering/gradasi antar foto, filter warna, dan PIP.

  * `renderAllLayers()` (Baris `2658`): Menggambar seluruh layer teks, teks melengkung (`drawCurvedText`), efek 3D extrude, neon glow, pill background, pin lokasi, dan ornamen bintang/sparkle.

  * `renderGuidesAndSelection()` (Baris `2862`): Menggambar garis bantu magnetik (smart guides) dan bounding box interaktif.

  * `renderCanvas()` (Baris `2991`): Fungsi utama penggambaran ulang kanvas.

* **Baris `3010–3237`**: Interaksi pointer/mouse/touch di kanvas (`onCanvasPointerDown`, `onCanvasPointerMove`, `onCanvasPointerUp`) untuk geser teks, putar teks, ubah ukuran teks, dan geser/zoom foto di dalam slot.

* **Baris `3241–3936`**: Sinkronisasi UI sidebar & inspector (`renderTemplateCards`, `renderLayoutSelector`, `renderQuickFillInputs`, `renderPhotoSlotsManager`, upload banyak foto sekaligus, dan upload font kustom `.ttf/.otf/.woff2`).

* **Baris `3940–4751`**: Fitur *Jiplak Referensi* (`refInteractiveCanvas`), tombol tambah elemen preset (`addPresetLayer`), sistem tema UI (Dark/Light), dan mesin Export PNG/JPG resolusi `1x`/`2x`.

* **Baris `4755–5108`**: Galeri Foto Studio (`addPhotoToStudioGallery`), **Hapus Background Otomatis / Magic Cutout** (baris `4860–4960`), dan **Peningkatan Foto HD / Bilateral Unsharp Mask** (baris `4965–5035`).

* **Baris `5112–5305`**: Strip pratinjau langsung 152 font (`renderFontLivePreviewStrip`), pencarian & filter kategori font, navigasi responsif HP, tombol bandingkan referensi asli, dan dukungan sentuh (touch gestures).

## 3. Rekomendasi Tugas Pertama untuk Claude Code: Pisahkan Base64 ke `assets-data.js`

Jika diminta melakukan refactoring atau sebelum menambah fitur besar, Claude Code dapat memisahkan baris `1338–1400` (`SAMPLE_PHOTOS`, `CLEAN_PHOTOS`, `REF_THUMBS`) ke dalam file `assets-data.js` lalu memuatnya dengan `<script src="assets-data.js"></script>` tepat sebelum `<script>` utama di `index.html`. Dengan begitu ukuran `index.html` turun dari **3,1 MB** menjadi **\~300 KB** murni kode HTML/CSS/JS yang sangat ringan diedit.