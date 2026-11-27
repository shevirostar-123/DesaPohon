/**
 * PEMANTAUAN POHON DESA - "jembatan" antara website, Google Sheet dan Google Drive.
 *
 * Tempel seluruh isi file ini ke Apps Script yang menempel pada Google Sheet Anda
 * (menu Ekstensi > Apps Script). Langkah lengkap ada di PANDUAN.md.
 */

// ====== PENGATURAN (boleh diubah) ======
const KODE_DESA = '';                      // Isi mis. 'desa2026' agar hanya warga yang tahu kode bisa mengirim. Kosong = bebas.
const NAMA_FOLDER_FOTO = 'Foto Pohon Desa'; // Folder di Google Drive Anda (dibuat otomatis)
const ZONA_WAKTU = 'Asia/Jakarta';
// =======================================

const KONDISI = ['Sehat', 'Cukup', 'Buruk', 'Mati'];
const SHEET_POHON = 'Pohon';
const SHEET_UPDATE = 'Update';
const H_POHON = ['id', 'jenis', 'pemilik', 'lat', 'lng', 'tanam', 'dibuat', 'device_id', 'akurasi_m'];
const H_UPDATE = ['waktu', 'id', 'bulan', 'tinggi_cm', 'diameter_cm', 'kondisi', 'catatan', 'foto_id', 'pelapor', 'device_id'];
const KOLOM_TEKS = ['id', 'bulan', 'tanam'];   // dipaksa teks agar Sheet tidak mengubahnya jadi tanggal
const KOLOM_RAHASIA = ['device_id'];            // tidak pernah dikirim ke website

/** Jalankan SEKALI dari editor (untuk memberi izin dan menyiapkan Sheet + folder foto). */
function setup() {
  sheet_(SHEET_POHON, H_POHON);
  sheet_(SHEET_UPDATE, H_UPDATE);
  folderFoto_();
  const awal = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sheet1');
  if (awal && awal.getLastRow() === 0 && SpreadsheetApp.getActiveSpreadsheet().getSheets().length > 1) {
    SpreadsheetApp.getActiveSpreadsheet().deleteSheet(awal);
  }
}

// ---------- Pintu masuk dari website ----------

function doGet() {
  try {
    return keluar_({
      ok: true,
      pohon: baca_(SHEET_POHON, H_POHON),
      update: baca_(SHEET_UPDATE, H_UPDATE),
    });
  } catch (err) {
    return keluar_({ ok: false, error: 'Gagal membaca data.' });
  }
}

function doPost(e) {
  const kunci = LockService.getScriptLock();
  let terkunci = false;
  try {
    kunci.waitLock(20000);
    terkunci = true;
    const b = JSON.parse(e.postData.contents);
    if (KODE_DESA && String(b.kode || '').trim() !== KODE_DESA) {
      return keluar_({ ok: false, error: 'Kode desa salah.' });
    }
    if (b.action === 'daftar') return keluar_(daftar_(b));
    if (b.action === 'update') return keluar_(update_(b));
    if (b.action === 'lokasi') return keluar_(lokasi_(b));
    return keluar_({ ok: false, error: 'Aksi tidak dikenal.' });
  } catch (err) {
    return keluar_({ ok: false, error: err.pesan ? err.message : 'Terjadi kesalahan di server. Coba lagi.' });
  } finally {
    if (terkunci) kunci.releaseLock();
  }
}

// ---------- Aksi ----------

function daftar_(b) {
  const jenis = teks_(b.jenis, 60, 'Jenis pohon');
  const pemilik = teks_(b.pemilik, 80, 'Nama pemilik/penanam');
  const lat = angka_(b.lat, -90, 90, 'Lokasi (lat)');
  const lng = angka_(b.lng, -180, 180, 'Lokasi (lng)');
  const akurasi = opsional_(b.akurasi, 0, 100000, 'Akurasi lokasi');
  const tanam = String(b.tanam || '').trim();
  if (tanam && !/^\d{4}-\d{2}-\d{2}$/.test(tanam)) throw gagal_('Tanggal tanam tidak valid.');

  const sh = sheet_(SHEET_POHON, H_POHON);
  let maks = 0;
  baca_(SHEET_POHON, H_POHON, true).forEach(function (r) {
    const m = /^POHON-(\d+)$/.exec(String(r.id));
    if (m) maks = Math.max(maks, parseInt(m[1], 10));
  });
  const id = 'POHON-' + ('0000' + (maks + 1)).slice(-4);
  const baris = {
    id: id, jenis: jenis, pemilik: pemilik, lat: lat, lng: lng, tanam: tanam,
    dibuat: waktuSekarang_(), device_id: teks_(b.device, 60, null, true), akurasi_m: akurasi,
  };
  sh.appendRow(H_POHON.map(function (h) { return baris[h]; }));
  return { ok: true, id: id };
}

/** Perbarui lokasi pohon yang sudah terdaftar (mis. saat berdiri di dekat pohon dengan GPS HP). */
function lokasi_(b) {
  const id = String(b.id || '').trim().toUpperCase();
  const lat = angka_(b.lat, -90, 90, 'Lokasi (lat)');
  const lng = angka_(b.lng, -180, 180, 'Lokasi (lng)');
  const akurasi = opsional_(b.akurasi, 0, 100000, 'Akurasi lokasi');
  const sh = sheet_(SHEET_POHON, H_POHON);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === id) {
      sh.getRange(i + 1, H_POHON.indexOf('lat') + 1, 1, 2).setValues([[lat, lng]]);
      sh.getRange(i + 1, H_POHON.indexOf('akurasi_m') + 1).setValue(akurasi);
      return { ok: true };
    }
  }
  throw gagal_('Kode pohon tidak ditemukan.');
}

function update_(b) {
  const id = String(b.id || '').trim().toUpperCase();
  const ada = baca_(SHEET_POHON, H_POHON, true).some(function (r) { return r.id === id; });
  if (!ada) throw gagal_('Kode pohon tidak ditemukan.');
  if (KONDISI.indexOf(b.kondisi) < 0) throw gagal_('Pilih kondisi pohon.');
  const pelapor = teks_(b.pelapor, 80, 'Nama pelapor');
  const tinggi = opsional_(b.tinggi, 0, 10000, 'Tinggi');
  const diameter = opsional_(b.diameter, 0, 1000, 'Diameter');
  const catatan = teks_(b.catatan, 500, null, true);
  const bulan = Utilities.formatDate(new Date(), ZONA_WAKTU, 'yyyy-MM');

  let fotoId = '';
  if (b.foto) fotoId = simpanFoto_(b.foto, id + '_' + bulan);

  const sh = sheet_(SHEET_UPDATE, H_UPDATE);
  const data = sh.getDataRange().getValues();
  let barisLama = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]) === id && norm_('bulan', data[i][2]) === bulan) { barisLama = i + 1; break; }
  }
  const baru = {
    waktu: waktuSekarang_(), id: id, bulan: bulan, tinggi_cm: tinggi, diameter_cm: diameter,
    kondisi: b.kondisi, catatan: catatan, foto_id: fotoId, pelapor: pelapor,
    device_id: teks_(b.device, 60, null, true),
  };
  if (barisLama > 0) {
    // Sudah pernah mengisi bulan ini: perbarui (foto lama dipertahankan jika tidak ada foto baru)
    if (!fotoId) baru.foto_id = data[barisLama - 1][H_UPDATE.indexOf('foto_id')];
    sh.getRange(barisLama, 1, 1, H_UPDATE.length).setValues([H_UPDATE.map(function (h) { return baru[h]; })]);
    return { ok: true, diperbarui: true };
  }
  sh.appendRow(H_UPDATE.map(function (h) { return baru[h]; }));
  return { ok: true, diperbarui: false };
}

// ---------- Foto di Google Drive ----------

function simpanFoto_(dataUrl, namaDasar) {
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(String(dataUrl));
  if (!m) throw gagal_('Format foto tidak didukung.');
  const bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 4 * 1024 * 1024) throw gagal_('Foto terlalu besar.');
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const blob = Utilities.newBlob(bytes, 'image/' + m[1], namaDasar + '_' + Date.now() + '.' + ext);
  const file = folderFoto_().createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getId();
}

function folderFoto_() {
  const props = PropertiesService.getScriptProperties();
  const idLama = props.getProperty('FOLDER_ID');
  if (idLama) {
    try { return DriveApp.getFolderById(idLama); } catch (e) { /* folder terhapus, buat ulang */ }
  }
  const folder = DriveApp.createFolder(NAMA_FOLDER_FOTO);
  props.setProperty('FOLDER_ID', folder.getId());
  return folder;
}

// ---------- Pembantu ----------

function sheet_(nama, header) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(nama);
  if (!sh) sh = ss.insertSheet(nama);
  if (sh.getLastRow() === 0) {
    header.forEach(function (h, i) {
      if (KOLOM_TEKS.indexOf(h) >= 0) sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('@');
    });
    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
    sh.setFrozenRows(1);
  } else {
    // Sheet lama: tambahkan judul kolom baru (mis. akurasi_m) bila belum ada
    const ada = sh.getRange(1, 1, 1, header.length).getValues()[0];
    if (header.some(function (h, i) { return ada[i] !== h; })) sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
  }
  return sh;
}

function baca_(nama, header, semua) {
  const sh = sheet_(nama, header);
  const nilai = sh.getDataRange().getValues();
  const hasil = [];
  for (let i = 1; i < nilai.length; i++) {
    if (nilai[i][0] === '' && nilai[i][1] === '') continue;
    const o = {};
    header.forEach(function (h, j) {
      if (!semua && KOLOM_RAHASIA.indexOf(h) >= 0) return;
      o[h] = norm_(h, nilai[i][j]);
    });
    hasil.push(o);
  }
  return hasil;
}

function norm_(kolom, v) {
  if (v instanceof Date) {
    if (kolom === 'bulan') return Utilities.formatDate(v, ZONA_WAKTU, 'yyyy-MM');
    if (kolom === 'tanam') return Utilities.formatDate(v, ZONA_WAKTU, 'yyyy-MM-dd');
    return Utilities.formatDate(v, ZONA_WAKTU, "yyyy-MM-dd'T'HH:mm:ssXXX");
  }
  return v;
}

function waktuSekarang_() {
  return Utilities.formatDate(new Date(), ZONA_WAKTU, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function gagal_(pesan) {
  const e = new Error(pesan);
  e.pesan = true; // tanda: pesan ini aman ditampilkan ke warga
  return e;
}

function teks_(v, maks, label, boleh_kosong) {
  let s = String(v === undefined || v === null ? '' : v).trim().slice(0, maks);
  if (!s && !boleh_kosong) throw gagal_((label || 'Isian') + ' wajib diisi.');
  if (/^[=+\-@]/.test(s)) s = "'" + s; // cegah rumus nyasar di Sheet
  return s;
}

function angka_(v, min, maks, label) {
  const n = Number(v);
  if (v === '' || v === null || v === undefined || !isFinite(n) || n < min || n > maks) {
    throw gagal_(label + ' tidak valid.');
  }
  return n;
}

function opsional_(v, min, maks, label) {
  if (v === '' || v === null || v === undefined) return '';
  return angka_(v, min, maks, label);
}

function keluar_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
