// ====== PENGATURAN WEBSITE - hanya file ini yang perlu Anda ubah ======
window.CONFIG = {
  NAMA_DESA: "Desa Grobogan",

  // Tempel alamat Apps Script Anda di sini (lihat PANDUAN.md, langkah 4).
  // Kalau dikosongkan, website jalan dalam MODE CONTOH (data palsu, hanya tersimpan di HP/komputer ini).
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbziQZT9Wi_h1ssGlteTACCMuFv9iLeqmN8J3vwf_zZngLiF8CKm6cIddwPmKZS9rhm9Tg/exec?action=data",

  // Pusat peta saat pertama dibuka: [garis lintang, garis bujur]. Ganti ke lokasi desa Anda.
  PUSAT_PETA: [-7.114063, 110.956964],
  ZOOM_AWAL: 16,

  // true = form meminta "Kode desa" (harus sama dengan KODE_DESA di Code.gs). false = tidak diminta.
  PAKAI_KODE_DESA: false,
};
