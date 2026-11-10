---
name: SNE Studio — Aplikasi Tipografi & Kolase Foto (Phonto Pro Edition)
description: Sistem tampilan hangat-jelas dan ramah-visual untuk studio tipografi fotografi, tata letak kolase multi-slot, dan ekspor HD Instagram.
model: Gabungan Hangat Jelas & Ramah Visual (SNE Design System)
version: 2.0
updated: 2026-11-10
source: Diselaraskan penuh dengan fitur SNE Studio yang berjalan (56+ font kurasi, import .TTF/.OTF, 7 template referensi asli, 10 tata letak kolase + PIP bebas, efek Phonto Pro 3D/Curve/Gradasi, dan ekspor HD 1080p/4K).
colors:
  primary: "#B42318"
  primary-hover: "#9F1F16"
  primary-pressed: "#8C1B14"
  primary-deep: "#911D17"
  primary-light: "#FBEAE8"
  visual-blue: "#1D4ED8"
  visual-blue-soft: "#E4EAFA"
  secondary: "#177245"
  secondary-bg: "#ECF8F1"
  background: "#F3F3F0"
  surface: "#FFFFFF"
  surface-low: "#F7F7F5"
  surface-mid: "#F3F3F0"
  surface-high: "#ECECE9"
  ink: "#171717"
  ink-secondary: "#525252"
  ink-muted: "#737373"
  border: "#E7E7E4"
  border-control: "#D2D2CE"
  border-strong: "#A8A8A3"
  success: "#177245"
  success-bg: "#ECF8F1"
  warning: "#A45A00"
  warning-bg: "#FFF5E6"
  error: "#B42318"
  error-bg: "#FDEDEC"
  backdrop: "rgb(23 23 23 / 0.45)"
typography:
  family: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
  weights: [400, 500, 600, 700, 800]
  numbers: tabular-nums
  page-title: { size: "24px HP / 28px tablet ke atas", weight: 800, line-height: 1.15, tracking: tight }
  card-title: { size: "18px HP / 20px tablet ke atas", weight: 700 }
  body: { size: 16px, weight: 400 }
  body-small: { size: 15px, weight: 500 }
  label: { size: 15px, weight: 600 }
  hint: { size: 14px, weight: 400, color: ink-muted }
radius:
  card: "18px HP / 22px dari 768px"
  button-sm: 12px
  button-md: 12px
  button-lg: 16px
  input: 12px
  inner-panel: 16px
  pill: 999px
spacing:
  base: 4px
  card-padding: "16px HP / 20px tablet ke atas"
  gap: 12px–24px
touch-target:
  minimum: 44px
  button: { sm: 40px, md: 44px, lg: 52px }
  input: 46px
  chip: { sm: 36px, md: 40px }
  nav-item: "40px HP / 36px tablet ke atas"
shadow:
  card: "0 2px 4px rgb(0 0 0 / 0.025), 0 12px 30px rgb(0 0 0 / 0.025)"
  raised: "0 8px 24px rgb(0 0 0 / 0.06)"
  brand: "0 1px 2px rgb(0 0 0 / 0.04)"
layout:
  nav-height: 64px
  app-scale: [0.8, 0.9, 1, 1.1, 1.2, 1.3]
  canvas-ratios: ["9:16 (1080×1920 IG Story)", "4:5 (1080×1350 IG Feed)", "1:1 (1080×1080 IG Square)", "16:9 (1920×1080 Landscape)"]
---

# SNE Studio — DESIGN.md (Aplikasi Tipografi & Kolase Foto Phonto Pro)

Studio desain fotografi dan tipografi yang terang, tenang, ramah visual, dan cepat digunakan oleh kreator maupun fotografer dari segala usia. Foto dan karya tipografi pengguna menjadi pusat perhatian di atas kanvas putih tulang hangat `#F3F3F0` dan kartu putih bersih `#FFFFFF`.

## 1. Arah tampilan

- **Model Hangat Jelas & Ramah Visual**: foto pratinjau besar, kartu putih bersih, dan tombol berlabel jelas tanpa istilah teknis yang membingungkan.
- **Kanvas halaman putih tulang hangat `#F3F3F0`**, kartu putih `#FFFFFF`, dan tulisan gelap netral `#171717`.
- **Warna merek `#B42318` (Merah SNE)** — atau opsi **Biru Ramah Visual `#1D4ED8`** — dipakai secara disiplin hanya untuk tombol aksi utama (`Simpan HD`), tab menu aktif, chip terpilih, fokus input, dan identitas logo `SNE`.
- **Merah tua `#911D17`** dipakai khusus untuk **satu** kartu ringkasan unggulan di panel kiri (Kartu Status Kanvas & Kesiapan Resolusi Instagram HD).
- **Hijau `#177245`** dengan latar `#ECF8F1` menandakan status keterbacaan teks dan kualitas foto yang **Aman** (kontras teks terbaca jelas di atas foto dan resolusi siap unggah ke Instagram).
- **Antarmuka Datar (Flat Studio UI)**: tidak ada gradien pada latar/tombol UI, tidak ada kaca buram (*glassmorphism* / `backdrop-filter`) pada panel UI, bayangan sangat tipis, dan garis tepi tegas. *(Catatan: efek gradasi, bayangan, dan 3D tetap tersedia di dalam kanvas sebagai fitur artistik untuk merias teks foto ala Phonto Pro).*
- **Bahasa antarmuka**: Bahasa Indonesia sehari-hari yang ramah dan langsung menjelaskan fungsi (misalnya *"Masukin Foto Galeri"*, *"Geser Teks"*, *"Geser Foto Slot"*, *"Pindah Kotak Foto"*).

Perbandingan warna di layar: putih dan putih tulang 80–85%, tulisan gelap 10–12%, warna merek 4–7%, warna status di bawah 3%.

## 2. Warna

| Token | Hex | Dipakai untuk |
|---|---|---|
| `primary` | `#B42318` | Tombol utama (`Simpan HD`), tab aktif, chip layer terpilih, fokus, logo SNE |
| `primary-hover` | `#9F1F16` | Tombol utama saat disorot |
| `primary-pressed` | `#8C1B14` | Tombol utama saat ditekan |
| `primary-deep` | `#911D17` | Satu kartu ringkasan unggulan (Status Kanvas & Resolusi HD) |
| `primary-light` | `#FBEAE8` | Latar ikon merah, avatar inisial `SNE`, sorotan lembut |
| `background` | `#F3F3F0` | Latar halaman utama, area sekeliling kanvas foto, wadah segmented control |
| `surface` | `#FFFFFF` | Kartu kontrol, header atas, modal pop-up, kolom isian teks |
| `surface-low` | `#F7F7F5` | Wadah sub-kontrol di dalam kartu, keadaan kosong, hover baris |
| `surface-high` | `#ECECE9` | Garis pemisah dan jalur slider (*range track*) |
| `ink` | `#171717` | Judul panel, teks isi input, angka ukuran huruf & rotasi |
| `ink-secondary` | `#525252` | Teks pendukung, tab menu tidak aktif |
| `ink-muted` | `#737373` | Keterangan tambahan dan petunjuk singkat |
| `border` | `#E7E7E4` | Garis tepi kartu, header, dan pemisah panel |
| `border-control` | `#D2D2CE` | Garis tepi tombol sekunder dan chip layer/font |
| `border-strong` | `#A8A8A3` | Garis tepi kolom isian teks, pilihan font, dan input angka (`1,5px`) |

Warna status selalu tampil bersama ikon dan kata, tidak pernah mengandalkan warna saja:

| Status Kanvas & Teks | Teks | Latar | Penjelasan di SNE Studio |
|---|---|---|---|
| `✓ Aman • Siap IG HD` | `#177245` | `#ECF8F1` | Kontras teks terbaca jelas dan resolusi kanvas memenuhi standar HD Instagram (`1080p` / `4K`). |
| `⚠️ Perhatikan • Kontras` | `#A45A00` | `#FFF5E6` | Teks putih berada di atas area foto yang sangat terang tanpa outline/bayangan; disarankan klik *Auto-Adapt Teks*. |
| `! Segera • Kosong` | `#B42318` | `#FDEDEC` | Layer teks atau slot foto belum terisi. |

## 3. Tulisan Antarmuka & Koleksi 56+ Font Kanvas

**Tulisan Antarmuka (UI Aplikasi)**
- Huruf UI: **Plus Jakarta Sans** (400 sampai 800).
- Semua angka ukuran huruf (`72 px`), kemiringan (`-6°`), lengkungan (`62°`), proporsi split (`50 : 50`), opasitas (`100%`), dan dimensi piksel (`1080 × 1920 px`) wajib memakai `tabular-nums` agar tidak bergeser saat slider digerakkan.
- Pengguna dapat mengubah skala seluruh tampilan antarmuka lewat pemilih **Skala UI (`80%` hingga `130%` `--app-zoom`)** di bilah atas.

**Koleksi Aset Font Kanvas (56+ Font Kurasi + Import Font Sendiri)**
1. **Editorial & Luxury Serif (12 Font)**: Playfair Display, DM Serif Display, Fraunces, Instrument Serif, Bodoni Moda, Cormorant Garamond, Cinzel, Prata, Libre Baskerville, Marcellus, Lora, Merriweather.
2. **Script, Kaligrafi & Tulisan Tangan (14 Font)**: Great Vibes, Yellowtail, Caveat, Pacifico, Sacramento, Kaushan Script, Allura, Alex Brush, Dancing Script, Satisfy, Pinyon Script, Permanent Marker, Rock Salt, Gloria Hallelujah.
3. **Groovy, Retro & Pop Sticker (13 Font)**: Shrikhand, Fredoka, Righteous, Bebas Neue, Anton, Abril Fatface, Lobster, Bungee, Titan One, Alfa Slab One, Luckiest Guy, Bangers, Carter One.
4. **Modern Sans & Minimalist UI (12 Font)**: Montserrat, Plus Jakarta Sans, Poppins, Outfit, Urbanist, Manrope, Space Grotesk, Syne, Oswald, Archivo Black, Teko, Fjalla One.
5. **Camera Date Stamp & Monospace (5 Font)**: VT323 (stempel tanggal kamera analog 90-an), Share Tech Mono, JetBrains Mono, Space Mono, Courier Prime.
6. **Import Font Kustom (`.TTF`, `.OTF`, `.WOFF`, `.WOFF2`)**: Pengguna dapat memasukkan file font milik sendiri dari HP atau laptop secara instan menggunakan tombol **+ Import .TTF/.OTF**.

## 4. Sudut, Jarak, dan Bayangan

- Kartu dan modal: sudut `18px` di HP dan `22px` di layar tablet/desktop (`rounded-card`), latar putih `#FFFFFF`, garis `#E7E7E4`.
- Tombol aksi dan kolom isian: sudut `12px` hingga `16px`.
- Bentuk pil penuh (`999px`) khusus untuk: navigasi tab utama di dalam wadah `SegmentedControl`, chip pemilih layer teks, chip kategori font, lencana status, dan pengalih mode interaksi di atas kanvas.
- Bayangan kartu sangat tipis (`0 2px 4px rgb(0 0 0 / 0.025), 0 12px 30px rgb(0 0 0 / 0.025)`), tanpa pendaran warna atau *glassmorphism*.

## 5. Komponen & Fitur SNE Studio (Phonto Pro ATM)

**Header dan Navigasi Utama (`Navbar`)**
- Latar putih `#FFFFFF`, garis bawah `#E7E7E4`, tinggi minimal `64px`.
- Kiri: Avatar kotak bersudut lembut `#FBEAE8` dengan inisial merah `SNE`, judul **SNE Studio**, dan lencana status keterbacaan kanvas (`✓ Aman • Siap IG HD`).
- Tengah: Tombol aksi kerja cepat bergaris tegas `#D2D2CE` (*Undo/Redo*, *Masukin Foto Galeri*, *Foto PIP Bebas*, *Auto-Adapt Teks*, *7 Referensi Asli*, dan *DESIGN.md*).
- Kanan: Pemilih Skala UI (`80%–130%`), pemilih rasio kanvas Instagram, dan **satu-satunya tombol utama berwarna merek `#B42318`** di bilah atas yaitu **⬇️ Simpan HD**.

**Panel Kiri: 4 Tab Segmented Control (`7 Template`, `Tata Letak`, `Isian Cepat`, `Slot Foto`)**
- **7 Template Referensi Asli + Simpan Preset**: Menampilkan kartu putih dengan foto pratinjau besar dari ke-7 referensi (*Let's Go Workout*, *First Stop Coffee*, *About Today*, *HAKORDIA Pop Sticker*, *Obelix Blue Hour*, *Modern Jogja 5+1*, *Jogja Airport Resto*). Tersedia tombol **Pakai Template** (lengkap dengan tata letak) atau **Salin Teks Saja** (menempelkan tipografi ke tata letak foto yang sedang aktif), serta opsi **Kunci Foto** agar foto galeri pengguna tidak terganti.
- **10 Tata Letak Kolase & Proporsi Fleksibel**: Mendukung *Split 2 Vertikal*, *1 Foto Utama + 3 Kotak Bawah*, *Grid 2×2*, *Kolase 4 Foto Diagonal HAKORDIA*, *1 Foto Full*, *1 Foto Utama + 5 Grid Atas*, *Split 2 Horizontal*, *3 Baris Sinematik*, *1 Background + 2 Polaroid Melayang*, dan *Moodboard 6 Foto*. Dilengkapi pengatur **Proporsi Split (`25:75` s/d `75:25`)**, jarak antar foto (*gap*), kelengkungan sudut, garis tepi (*border*), *dim overlay*, dan *vignette*.
- **Isian Cepat Semua Teks**: Daftar kolom isian berurutan dengan garis tegas `#A8A8A3` untuk mengubah seluruh teks dan *watermark* `@username` sekaligus.
- **Manajer Slot Foto & Foto PIP Bebas**: Mengunggah banyak foto sekaligus dari galeri, menukar urutan slot, mengambil palet warna otomatis dari foto, mengatur *zoom/crop* per slot, serta menambahkan **Foto PIP (Picture-in-Picture) Bebas** yang ukurannya bisa diubah dan digeser ke mana saja.

**Area Tengah: Kanvas Interaktif HD dengan 3 Mode Sentuh**
- **🔤 Geser Teks (Edit, Resize & Rotate Langsung)**: Klik teks untuk memilih, geser dengan garis bantu tengah magnetis (*Smart Snap Guides*), tarik titik bulat di kanan-bawah kotak seleksi untuk mengubah ukuran huruf secara langsung, atau tarik tangkai atas untuk memutar teks.
- **🖐️ Geser Foto Slot (Cropping Foto)**: Geser langsung gambar di dalam bingkai slot kolase.
- **📐 Pindah Kotak Foto (Freeform Inset & PIP)**: Geser posisi kotak foto *inset* (seperti 3 kotak bawah pada *First Stop* atau 5 kotak atas pada *Modern Jogja*) maupun foto PIP bebas ke posisi mana pun di atas kanvas.

**Panel Kanan: Inspector Tipografi Phonto Pro**
- **4 Sub-Tab Segmented Control**:
  1. *Ukuran & Warna*: Warna solid, **Gradasi 2 Warna Phonto Pro** (Vertikal/Horizontal/Diagonal), opasitas, ukuran huruf, spasi huruf (*kerning*), jarak baris, dan *Blend Mode* (`Normal`, `Overlay`, `Screen`, `Multiply`, `Difference`).
  2. *Stroke & 3D*: Ketebalan *outline* (`0–36px`), **Efek Timbul 3D (*Extrude Depth*)**, kelembutan bayangan (*Drop Shadow*), dan **Efek Pudar Bawah (*Fade Mask*)**.
  3. *Curve & Tilt*: **Lengkungan Teks Melingkar (*Phonto Curve* `-100°` s/d `+100°`)**, rotasi 2D, serta **Kemiringan Perspektif 3D (`Tilt X` & `Tilt Y`)**.
  4. *Pill & Ornamen*: Background kapsul (*Solid*, *Frosted*, *Pin Lokasi Merah*, *Garis Bingkai Tipis*) serta ornamen vektor (*Kilau Bintang Kuning*, *Stiker Matahari Biru HAKORDIA*, *Bingkai Fokus Kamera*).

## 6. Standar Kualitas Ekspor Instagram

- **IG Native HD (1x)**: `1080 × 1920 px` (Story/Reels 9:16), `1080 × 1350 px` (Feed Portrait 4:5), `1080 × 1080 px` (Square 1:1).
- **Ultra HD 4K (2x)**: `2160 × 3840 px` untuk ketajaman cetak dan arsip resolusi tinggi.
- Pilihan format **PNG Lossless** dan **JPEG 100%** dengan perenderan vektor teks tajam tanpa garis bantu seleksi.

## 7. Lakukan dan Jangan

**Lakukan**
- Gunakan latar hangat `#F3F3F0` dan kartu putih `#FFFFFF` bergaris `#E7E7E4` pada seluruh ruang kerja aplikasi.
- Gunakan garis `#A8A8A3` (`1,5px`) pada semua kolom isian teks dan pilihan dropdown agar mudah dilihat oleh semua mata.
- Gunakan angka `tabular-nums` pada setiap indikator angka dan piksel.
- Sediakan label teks yang jelas mendampingi setiap ikon aksi penting.

**Jangan**
- Jangan memakai gradien atau efek kaca buram (*glassmorphism*) pada panel antarmuka aplikasi.
- Jangan menaruh lebih dari satu kartu berwarna merah tua `#911D17` di layar.
- Jangan memakai warna sebagai satu-satunya penanda status tanpa ikon dan kata.
- Jangan membuat halaman bergulir mendatar (*horizontal scroll*) pada ukuran layar berapa pun.

## 8. Rumus Singkat SNE Studio

```text
Kanvas kerja hangat #F3F3F0
+ kartu putih bersih bersudut 18–22px dengan garis #E7E7E4
+ kolom isian bergaris tegas #A8A8A3 dan huruf Plus Jakarta Sans (tabular-nums)
+ navigasi tab & chip berbentuk pil dengan aksen merah SNE #B42318
+ mesin kanvas foto & tipografi Phonto Pro (56+ font, .TTF/.OTF, 3D, Curve, 10 Layout & PIP)
= tampilan SNE Studio (Hangat Jelas & Ramah Visual)
```
