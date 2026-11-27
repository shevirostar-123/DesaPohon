# Panduan Pemasangan — Pemantauan Pohon Desa

Total sekitar 20 menit. Semua gratis. Anda butuh: akun Google dan akun GitHub.

**Cara kerjanya:** warga membuka website → website bicara ke "jembatan" Google (Apps Script) → jembatan menyimpan data ke Google Sheet dan foto ke Google Drive Anda.

---

## Langkah 1 — Buat Google Sheet
1. Buka sheets.google.com → **Kosong** (spreadsheet baru).
2. Beri nama, mis. **Data Pohon Desa**.

## Langkah 2 — Pasang "jembatan" (Apps Script)
1. Di Sheet tadi: menu **Ekstensi → Apps Script**.
2. Hapus semua kode yang ada, lalu tempel seluruh isi file `apps-script/Code.gs`.
3. (Opsional) Di baris atas, isi `KODE_DESA = 'desa2026'` jika ingin hanya warga yang tahu kode bisa mengirim data. Kosongkan jika tidak perlu.
4. Klik ikon 💾 Simpan. Di menu pilihan fungsi (atas), pilih **setup**, klik **Jalankan**.
5. Google meminta izin → **Tinjau izin** → pilih akun → bila muncul "Google belum memverifikasi aplikasi ini": klik **Lanjutan → Buka … (tidak aman)** → **Izinkan**. (Aman: ini skrip milik Anda sendiri.)
   Setelah selesai, di Sheet akan ada tab **Pohon** dan **Update**, dan di Google Drive ada folder **Foto Pohon Desa**.

## Langkah 3 — Jadikan jembatan bisa diakses website
1. Klik **Terapkan → Deployment baru**.
2. Klik ikon roda gigi ⚙ → pilih **Aplikasi web**.
3. **Jalankan sebagai: Saya**. **Yang memiliki akses: Siapa saja**.
4. Klik **Terapkan**, lalu **salin "URL aplikasi web"** (berakhiran `/exec`).

## Langkah 4 — Isi pengaturan website
Buka file `config.js` dengan Notepad, lalu ubah:
- `NAMA_DESA`: nama desa Anda
- `APPS_SCRIPT_URL`: tempel URL dari langkah 3 (di antara tanda kutip)
- `PUSAT_PETA`: koordinat desa Anda. Cara dapat: buka Google Maps, klik lama di tengah desa, angka yang muncul (mis. `-6.9175, 107.6191`) adalah koordinatnya.
- `PAKAI_KODE_DESA`: ganti `true` kalau Anda mengisi `KODE_DESA` di langkah 2.

## Langkah 5 — Pasang di GitHub (gratis)
1. Di github.com buat repository baru, mis. `pohon-desa`, pilih **Public**.
2. Klik **uploading an existing file**, tarik semua isi folder ini (`index.html`, `config.js`, folder `css`, `js`, `lib`, dll.), lalu **Commit changes**.
3. Buka **Settings → Pages**. Pada *Source* pilih **Deploy from a branch**, branch **main**, folder **/ (root)**, **Save**.
4. Tunggu 1–2 menit. Alamat website: `https://NAMA-GITHUB-ANDA.github.io/pohon-desa/`

## Langkah 6 — Coba
1. Buka alamat website di HP. Tab **Update → Daftarkan pohon baru**, isi, tandai lokasi.
2. Cek Google Sheet: baris baru muncul di tab **Pohon**.
3. Isi satu update dengan foto. Cek tab **Update** di Sheet dan folder foto di Drive.
4. Hapus baris percobaan di Sheet bila perlu.

---

## Cara warga memakai
- **Pohon baru:** tab **Update → Daftarkan pohon baru** → dapat kode (mis. `POHON-0042`) dan QR. Cetak, laminasi, ikat di pohon.
- **Tiap bulan:** scan QR di pohon (atau ketik kodenya di tab **Update**) → isi tinggi, kondisi, foto → Kirim. Mengisi lagi di bulan yang sama akan menggantikan isian sebelumnya (berguna untuk memperbaiki salah ketik).
- **Terlacak tanpa login:** setiap update tercatat dengan kode pohon, nama pengisi, waktu, dan penanda perangkat. Peta menandai pohon yang belum diupdate bulan ini dengan garis putus-putus.

## Perawatan (hampir nol)
- Data ada di Google Sheet Anda: bisa dilihat, diurutkan, dan di-backup (File → Unduh) kapan saja.
- Jika suatu saat Anda mengubah `Code.gs`: Terapkan → **Kelola deployment** → ✏ → Versi: **Versi baru** → Terapkan. URL tidak berubah.
- Jika ada data salah/iseng: hapus barisnya langsung di Sheet.

## Hal yang perlu diketahui
- **Data bersifat terbuka:** siapa pun yang punya alamat website bisa melihat jenis pohon, nama pemilik, lokasi, dan foto. Penanda perangkat tidak ditampilkan. Jangan memakai website ini jika lokasi/nama tidak boleh publik.
- **Tanpa login = tidak bisa 100% anti-iseng.** `KODE_DESA` mengurangi risiko tapi bukan pengaman kuat. Karena semua tercatat, entri iseng mudah ditemukan dan dihapus.
- Tanpa internet, warga masih bisa melihat data terakhir yang pernah dimuat, tetapi tidak bisa mengirim update.
- Tanpa `APPS_SCRIPT_URL`, website berjalan dalam **mode contoh** (data palsu di perangkat sendiri) untuk mencoba tampilan.
