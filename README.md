# SNE Studio — Studio Tipografi & Kolase Instastory (Siap Deploy ke Vercel)

Paket ini berisi seluruh kode produksi **SNE Studio** yang sudah mandiri (*self-contained* beserta seluruh 24 aset template, 670 font (152 kurasi + 518 dimuat saat dipakai), penghapus background ala Canva, dan penajam HD) sehingga siap di-deploy ke **Vercel** dalam hitungan detik tanpa memerlukan proses kompilasi tambahan.

## Cara Cepat Deploy ke Vercel (Pilih Salah Satu)

### Cara 1: Lewat Vercel CLI (Paling Cepat — 30 Detik)
1. Ekstrak file `sne_studio_vercel.zip` ini ke satu folder di komputer Anda.
2. Buka Terminal / Command Prompt di dalam folder tersebut.
3. Jalankan perintah berikut:
   ```bash
   npx vercel --prod
   ```
4. Ikuti petunjuk login singkat di layar, lalu Vercel akan langsung memberikan tautan publik `https://sne-studio-....vercel.app` yang siap diakses dari HP maupun laptop!

### Cara 2: Lewat GitHub + Dashboard Vercel
1. Unggah isi folder ini (`index.html`, `vercel.json`, `package.json`, `README.md`) ke repositori GitHub baru Anda.
2. Buka [vercel.com/new](https://vercel.com/new), pilih repositori tersebut, lalu klik **Deploy**.
