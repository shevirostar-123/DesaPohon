// Lapisan data: bicara dengan Google Apps Script (asli) atau localStorage (mode contoh).
const Api = (() => {
  const URL_ = ((window.CONFIG && CONFIG.APPS_SCRIPT_URL) || '').trim();
  const demo = !URL_;
  const KEY_DEMO = 'pohon_demo_db_v1';
  const KEY_CACHE = 'pohon_cache_v1';

  const bulanKe = (offset) => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - offset);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  };

  // ---------- Mode contoh ----------
  function seed() {
    const [lat0, lng0] = CONFIG.PUSAT_PETA;
    const jenis = ['Mangga', 'Alpukat', 'Jati', 'Mahoni', 'Durian', 'Rambutan', 'Sengon', 'Trembesi'];
    const nama = ['Pak Budi', 'Bu Siti', 'Pak Joko', 'Bu Wati', 'Pak Agus', 'Bu Rina', 'Pak Dedi', 'Bu Lilis'];
    const kond = ['Sehat', 'Sehat', 'Sehat', 'Cukup', 'Cukup', 'Buruk', 'Sehat', 'Mati', 'Sehat', 'Cukup', 'Sehat', 'Buruk'];
    const pohon = [], update = [];
    for (let i = 0; i < 12; i++) {
      const id = 'POHON-' + String(i + 1).padStart(4, '0');
      const ang = i * 2.399, r = 0.0006 + (i % 5) * 0.00035;
      pohon.push({
        id, jenis: jenis[i % jenis.length], pemilik: nama[i % nama.length],
        lat: +(lat0 + Math.sin(ang) * r).toFixed(6), lng: +(lng0 + Math.cos(ang) * r).toFixed(6),
        tanam: bulanKe(7 + (i % 4)) + '-10', dibuat: new Date().toISOString(),
      });
      const jmlBulan = 2 + (i % 3);
      for (let m = jmlBulan - 1; m >= 0; m--) {
        if (m === 0 && [2, 8, 9].includes(i)) continue; // sebagian belum update bulan ini
        const bulan = bulanKe(m);
        update.push({
          waktu: bulan + '-15T09:00:00+07:00', id, bulan,
          tinggi_cm: 60 + (jmlBulan - m) * (8 + (i % 4) * 3) + i * 4,
          diameter_cm: +(1.5 + (jmlBulan - m) * 0.4).toFixed(1),
          kondisi: m === 0 ? kond[i] : (i % 4 === 0 && m > 0 ? 'Cukup' : 'Sehat'),
          catatan: m === 0 && kond[i] === 'Buruk' ? 'Daun menguning, perlu dicek' : '',
          foto_id: '', pelapor: nama[i % nama.length],
        });
      }
    }
    return { ok: true, pohon, update };
  }
  const bacaDemo = () => {
    try { const s = localStorage.getItem(KEY_DEMO); if (s) return JSON.parse(s); } catch (e) {}
    const d = seed(); simpanDemo(d); return d;
  };
  const simpanDemo = (d) => { try { localStorage.setItem(KEY_DEMO, JSON.stringify(d)); } catch (e) {} };

  function postDemo(p) {
    const db = bacaDemo();
    if (p.action === 'daftar') {
      if (!p.jenis || !p.pemilik) return { ok: false, error: 'Jenis dan nama pemilik wajib diisi.' };
      const maks = db.pohon.reduce((a, t) => Math.max(a, parseInt(String(t.id).replace(/\D/g, ''), 10) || 0), 0);
      const id = 'POHON-' + String(maks + 1).padStart(4, '0');
      db.pohon.push({ id, jenis: p.jenis, pemilik: p.pemilik, lat: p.lat, lng: p.lng, tanam: p.tanam || '', dibuat: new Date().toISOString() });
      simpanDemo(db);
      return { ok: true, id };
    }
    if (p.action === 'update') {
      const bulan = bulanKe(0);
      const baru = {
        waktu: new Date().toISOString(), id: p.id, bulan, tinggi_cm: p.tinggi ?? '', diameter_cm: p.diameter ?? '',
        kondisi: p.kondisi, catatan: p.catatan || '', foto_id: p.foto || '', pelapor: p.pelapor,
      };
      const i = db.update.findIndex((u) => u.id === p.id && u.bulan === bulan);
      if (i >= 0) { if (!baru.foto_id) baru.foto_id = db.update[i].foto_id; db.update[i] = baru; } else db.update.push(baru);
      simpanDemo(db);
      return { ok: true, diperbarui: i >= 0 };
    }
    return { ok: false, error: 'Aksi tidak dikenal.' };
  }

  // ---------- Mode asli ----------
  async function load() {
    if (demo) return bacaDemo();
    try {
      const r = await fetch(URL_ + '?action=data', { cache: 'no-store' });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Gagal memuat data');
      try { localStorage.setItem(KEY_CACHE, JSON.stringify(j)); } catch (e) {}
      return j;
    } catch (err) {
      const s = localStorage.getItem(KEY_CACHE);
      if (s) return Object.assign(JSON.parse(s), { basi: true }); // tampilkan data terakhir yang tersimpan
      throw err;
    }
  }

  async function post(payload) {
    if (demo) return postDemo(payload);
    const r = await fetch(URL_, { method: 'POST', body: JSON.stringify(payload) }); // text/plain: tanpa preflight CORS
    return r.json();
  }

  return { demo, load, post };
})();
