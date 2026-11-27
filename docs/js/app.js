(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const WARNA = { Sehat: '#2e9e5b', Cukup: '#e5a50a', Buruk: '#d64545', Mati: '#5f6b76', Belum: '#9aa5b1' };
  const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const bulanIni = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  const labelBulan = (b) => { const [y, m] = String(b).split('-'); return (NAMA_BULAN[+m - 1] || b) + ' ' + y; };
  const fotoSrc = (f, w = 800) => !f ? '' : String(f).startsWith('data:') ? f : `https://drive.google.com/thumbnail?id=${encodeURIComponent(f)}&sz=w${w}`;
  const ls = {
    get: (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
  };
  const deviceId = () => { let d = ls.get('pohon_device'); if (!d) { d = 'd' + Math.random().toString(36).slice(2) + Date.now().toString(36); ls.set('pohon_device', d); } return d; };

  const state = { pohon: [], update: [], byId: new Map(), filter: null, cari: '' };
  let map, layer, pickMap, pickMarker, pickLatLng = null;

  // ---------- Pesan kecil ----------
  let toastTimer;
  function toast(t) {
    const el = $('#toast'); el.textContent = t; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.hidden = true), 3500);
  }
  function pesan(id, t, jenis = '') { const el = $(id); el.textContent = t; el.className = 'msg ' + jenis; }

  // ---------- Data ----------
  function hitung() {
    state.byId = new Map();
    state.pohon.forEach((p) => state.byId.set(p.id, { ...p, riwayat: [], terakhir: null }));
    state.update.forEach((u) => { const t = state.byId.get(u.id); if (t) t.riwayat.push(u); });
    state.byId.forEach((t) => {
      t.riwayat.sort((a, b) => String(a.bulan).localeCompare(String(b.bulan)) || String(a.waktu).localeCompare(String(b.waktu)));
      t.terakhir = t.riwayat[t.riwayat.length - 1] || null;
      t.kondisi = t.terakhir ? t.terakhir.kondisi : 'Belum';
      t.sudahBulanIni = !!(t.terakhir && t.terakhir.bulan === bulanIni());
    });
  }
  const semua = () => [...state.byId.values()];

  async function muat(tampilPesan) {
    try {
      const d = await Api.load();
      state.pohon = d.pohon || []; state.update = d.update || [];
      hitung(); render();
      if (d.basi) banner('Tidak bisa terhubung. Menampilkan data terakhir yang tersimpan di HP ini.', true);
      else if (Api.demo) banner('MODE CONTOH: data di bawah ini palsu dan hanya tersimpan di perangkat ini. Pasang alamat Apps Script di config.js untuk memakai data asli.');
      else banner('');
      if (tampilPesan) toast('Data diperbarui');
    } catch (e) {
      banner('Gagal memuat data. Periksa internet Anda lalu tekan tombol ⟳.', true);
    }
  }
  function banner(t, err) { const b = $('#banner'); b.hidden = !t; b.textContent = t || ''; b.className = 'banner' + (err ? ' err' : ''); }

  // ---------- Tampilan ----------
  function render() { renderStats(); renderLegend(); renderMap(); renderList(); renderDatalist(); infoPohonDipilih(); }

  function renderStats() {
    const a = semua();
    const sudah = a.filter((t) => t.sudahBulanIni).length;
    const sehat = a.filter((t) => t.kondisi === 'Sehat').length;
    const perhatian = a.filter((t) => t.kondisi === 'Buruk' || t.kondisi === 'Mati').length;
    $('#stats').innerHTML = [
      [a.length, 'Total pohon'], [`${sudah}/${a.length}`, 'Update bulan ini'], [sehat, 'Sehat'], [perhatian, 'Perlu perhatian'],
    ].map(([n, l]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join('');
  }

  function chipFilter(el) {
    const hit = { Semua: semua().length };
    semua().forEach((t) => { hit[t.kondisi] = (hit[t.kondisi] || 0) + 1; });
    const daftar = [['Semua', null, '#fff'], ['Sehat', 'Sehat'], ['Cukup', 'Cukup'], ['Buruk', 'Buruk'], ['Mati', 'Mati'], ['Belum ada data', 'Belum']];
    el.innerHTML = daftar.map(([nama, key]) => {
      const on = state.filter === key;
      const warna = key ? `<span class="dot" style="background:${WARNA[key]}"></span>` : '';
      return `<button type="button" data-f="${key || ''}" class="${on ? 'on' : ''}" aria-pressed="${on}">${warna}${nama} (${key ? hit[key] || 0 : hit.Semua})</button>`;
    }).join('');
  }
  function renderLegend() { chipFilter($('#legend')); chipFilter($('#filter-daftar')); }

  const lolos = (t) => (!state.filter || t.kondisi === state.filter);

  function renderMap() {
    if (!map) {
      map = L.map('map', { zoomControl: true }).setView(CONFIG.PUSAT_PETA, CONFIG.ZOOM_AWAL);
      const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
      const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles © Esri' });
      L.control.layers({ Peta: osm, Satelit: sat }, null, { position: 'topright' }).addTo(map);
      layer = L.layerGroup().addTo(map);
      map.on('popupopen', (e) => {
        const b = e.popup.getElement().querySelector('[data-detail]');
        if (b) b.onclick = () => bukaDetail(b.dataset.detail);
      });
    }
    layer.clearLayers();
    const pts = [];
    semua().filter(lolos).forEach((t) => {
      if (!isFinite(t.lat) || !isFinite(t.lng) || t.lat === '' || t.lng === '') return;
      const stale = !t.sudahBulanIni;
      const m = L.circleMarker([t.lat, t.lng], {
        radius: 10, fillColor: WARNA[t.kondisi], fillOpacity: stale ? 0.65 : 0.95,
        color: stale ? '#222' : '#fff', weight: stale ? 2 : 2.5, dashArray: stale ? '3 3' : null,
      }).addTo(layer);
      m.bindPopup(() => popup(t));
      pts.push([t.lat, t.lng]);
    });
    if (pts.length && !state.sudahFit) { map.fitBounds(pts, { padding: [30, 30], maxZoom: 18 }); state.sudahFit = true; }
  }

  function popup(t) {
    const u = t.terakhir;
    const foto = u && u.foto_id ? `<img src="${esc(fotoSrc(u.foto_id, 400))}" alt="Foto ${esc(t.id)}" loading="lazy">` : '';
    return `<b>${esc(t.id)} · ${esc(t.jenis)}</b><br>Pemilik: ${esc(t.pemilik)}<br>` +
      `Kondisi: <b style="color:${WARNA[t.kondisi]}">${t.kondisi === 'Belum' ? 'Belum ada data' : esc(t.kondisi)}</b>` +
      (u ? `<br>Tinggi: ${u.tinggi_cm !== '' ? esc(u.tinggi_cm) + ' cm' : '-'} · ${esc(labelBulan(u.bulan))}` : '') +
      (t.sudahBulanIni ? '' : '<br><i>Belum update bulan ini</i>') + foto +
      `<button class="pop-btn" data-detail="${esc(t.id)}">Lihat detail &amp; riwayat</button>`;
  }

  function renderList() {
    const q = state.cari.toLowerCase();
    const a = semua().filter(lolos).filter((t) => !q || [t.id, t.jenis, t.pemilik].join(' ').toLowerCase().includes(q))
      .sort((x, y) => (x.sudahBulanIni - y.sudahBulanIni) || x.id.localeCompare(y.id));
    $('#list').innerHTML = a.length ? a.map((t) => `
      <button class="item" data-detail="${esc(t.id)}">
        <span class="dot" style="background:${WARNA[t.kondisi]}"></span>
        <span class="t"><b>${esc(t.id)} · ${esc(t.jenis)}</b><span>${esc(t.pemilik)} · ${t.terakhir ? esc(t.kondisi) + ', ' + esc(labelBulan(t.terakhir.bulan)) : 'belum ada data'}</span></span>
        <span class="badge ${t.sudahBulanIni ? 'ok' : ''}">${t.sudahBulanIni ? 'Sudah update' : 'Belum update'}</span>
      </button>`).join('') : '<p class="hint">Tidak ada pohon yang cocok.</p>';
  }

  function renderDatalist() {
    $('#dl-pohon').innerHTML = semua().sort((a, b) => a.id.localeCompare(b.id))
      .map((t) => `<option value="${esc(t.id)}">${esc(t.jenis)} - ${esc(t.pemilik)}</option>`).join('');
  }

  function infoPohonDipilih() {
    const t = state.byId.get(($('#u-id').value || '').trim().toUpperCase());
    $('#u-info').textContent = t ? `${t.jenis} milik ${t.pemilik}` + (t.sudahBulanIni ? ' — sudah diisi bulan ini, mengirim lagi akan menggantikan isian sebelumnya.' : '') : '';
  }

  // ---------- Detail pohon ----------
  function sparkline(r) {
    const pts = r.filter((u) => u.tinggi_cm !== '' && u.tinggi_cm !== null && isFinite(u.tinggi_cm));
    if (pts.length < 2) return '';
    const W = 300, H = 64, P = 6, ys = pts.map((u) => +u.tinggi_cm), lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo || 1;
    const xy = pts.map((u, i) => [P + (i * (W - 2 * P)) / (pts.length - 1), H - P - ((+u.tinggi_cm - lo) / span) * (H - 2 * P)]);
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik tinggi pohon per bulan"><polyline fill="none" stroke="#1f7a4d" stroke-width="2.5" points="${xy.map((p) => p.join(',')).join(' ')}"/>` +
      xy.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="#1f7a4d"/>`).join('') + '</svg>' +
      `<p class="hint">Tinggi: ${ys[0]} cm → ${ys[ys.length - 1]} cm (${pts.length} catatan)</p>`;
  }

  function linkPohon(id) { return location.origin + location.pathname + '?pohon=' + encodeURIComponent(id); }
  const qrUrl = (id) => 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=8&data=' + encodeURIComponent(linkPohon(id));

  function bukaDetail(id) {
    const t = state.byId.get(id); if (!t) return;
    map && map.closePopup();
    $('#d-judul').textContent = `${t.id} · ${t.jenis}`;
    const u = t.terakhir;
    $('#d-isi').innerHTML =
      `<p class="detail-meta">Pemilik: ${esc(t.pemilik)}${t.tanam ? ' · ditanam ' + esc(t.tanam) : ''}</p>` +
      (u && u.foto_id ? `<img class="detail-foto" src="${esc(fotoSrc(u.foto_id, 900))}" alt="Foto terbaru">` : '') +
      sparkline(t.riwayat) +
      `<h4 style="margin:10px 0 0">Riwayat</h4><div class="hist">` +
      (t.riwayat.length ? [...t.riwayat].reverse().map((r) => `
        <div class="hist-row">${r.foto_id ? `<img src="${esc(fotoSrc(r.foto_id, 200))}" alt="" loading="lazy">` : ''}
          <div><b>${esc(labelBulan(r.bulan))} — <span style="color:${WARNA[r.kondisi] || '#333'}">${esc(r.kondisi)}</span></b>
          Tinggi ${r.tinggi_cm !== '' ? esc(r.tinggi_cm) + ' cm' : '-'}${r.diameter_cm !== '' ? ', diameter ' + esc(r.diameter_cm) + ' cm' : ''}<br>
          <span class="hint">oleh ${esc(r.pelapor)}${r.catatan ? ' · ' + esc(r.catatan) : ''}</span></div></div>`).join('') : '<p class="hint">Belum ada update.</p>') +
      `</div><div class="btn-row"><button class="primary" data-isi="${esc(t.id)}">Update pohon ini</button></div>` +
      `<details id="d-qr"><summary>Kode QR untuk ditempel di pohon</summary><div class="center" id="d-qr-isi"></div></details>`;
    $('#d-qr').ontoggle = (e) => { if (e.target.open && !$('#d-qr-isi').innerHTML) $('#d-qr-isi').innerHTML = qrBox(t.id); };
    $('#dlg-detail').showModal();
  }
  const qrBox = (id) => `<p class="kodebesar">${esc(id)}</p><img class="qr" src="${esc(qrUrl(id))}" alt="Kode QR ${esc(id)}"><p class="hint">Cetak, laminasi, lalu ikat di pohon. Warga cukup scan untuk mengisi update.</p>`;

  // ---------- Navigasi ----------
  function pindahTab(nama) {
    $$('.tab').forEach((s) => (s.hidden = s.id !== 'tab-' + nama));
    $$('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === nama));
    if (nama === 'peta' && map) setTimeout(() => map.invalidateSize(), 50);
    window.scrollTo(0, 0);
  }
  function isiUpdate(id) {
    $$('dialog[open]').forEach((d) => d.close());
    $('#u-id').value = id; infoPohonDipilih(); pindahTab('update');
  }

  // ---------- Foto ----------
  function kecilkanFoto(file, maks) {
    return new Promise((ok, gagal) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const k = Math.min(1, maks / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.78));
      };
      img.onerror = () => { URL.revokeObjectURL(url); gagal(new Error('Foto tidak bisa dibaca. Coba foto lain.')); };
      img.src = url;
    });
  }

  // ---------- Form update ----------
  async function kirimUpdate(ev) {
    ev.preventDefault();
    const id = $('#u-id').value.trim().toUpperCase();
    const kondisi = ($('input[name=kondisi]:checked') || {}).value;
    const pelapor = $('#u-pelapor').value.trim();
    if (!state.byId.has(id)) return pesan('#u-msg', 'Kode pohon tidak ditemukan. Pilih dari daftar yang muncul saat mengetik.', 'err');
    if (!pelapor) return pesan('#u-msg', 'Isi nama Anda.', 'err');
    if (!kondisi) return pesan('#u-msg', 'Pilih kondisi pohon.', 'err');
    const tombol = $('#u-kirim'); tombol.disabled = true; tombol.textContent = 'Mengirim…'; pesan('#u-msg', '');
    try {
      const f = $('#u-foto').files[0];
      const foto = f ? await kecilkanFoto(f, Api.demo ? 400 : 1280) : '';
      const r = await Api.post({
        action: 'update', id, pelapor, kondisi, foto, device: deviceId(), kode: $('#u-kode').value.trim(),
        tinggi: $('#u-tinggi').value, diameter: $('#u-diameter').value, catatan: $('#u-catatan').value.trim(),
      });
      if (!r.ok) throw new Error(r.error || 'Gagal mengirim.');
      ls.set('pohon_pelapor', pelapor); ls.set('pohon_kode', $('#u-kode').value.trim());
      toast(r.diperbarui ? 'Update bulan ini diperbarui ✔' : 'Terima kasih! Update tersimpan ✔');
      $('#form-update').reset(); $('#u-preview').hidden = true;
      $('#u-pelapor').value = pelapor; $('#u-kode').value = ls.get('pohon_kode');
      await muat(); pindahTab('peta');
    } catch (e) {
      pesan('#u-msg', (e.message || 'Gagal mengirim') + ' Isian Anda masih ada, coba kirim lagi.', 'err');
    } finally { tombol.disabled = false; tombol.textContent = 'Kirim update'; }
  }

  // ---------- Form daftar pohon baru ----------
  function setTitik(ll) {
    pickLatLng = ll;
    if (!pickMarker) pickMarker = L.marker(ll).addTo(pickMap); else pickMarker.setLatLng(ll);
    $('#d-koordinat').textContent = `Lokasi dipilih: ${ll.lat.toFixed(6)}, ${ll.lng.toFixed(6)} (geser/sentuh peta untuk mengubah)`;
  }
  function bukaDaftar() {
    $$('dialog[open]').forEach((d) => d.close());
    pickLatLng = null; $('#form-daftar').reset(); $('#d-msg').textContent = '';
    $('#d-koordinat').textContent = 'Sentuh peta untuk menandai posisi pohon.';
    $('#d-pemilik').value = ls.get('pohon_pelapor'); $('#d-kode').value = ls.get('pohon_kode');
    $('#dlg-daftar').showModal();
    setTimeout(() => {
      if (!pickMap) {
        pickMap = L.map('map-pilih').setView(map ? map.getCenter() : CONFIG.PUSAT_PETA, map ? Math.max(map.getZoom(), 17) : 17);
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles © Esri' }).addTo(pickMap);
        pickMap.on('click', (e) => setTitik(e.latlng));
      } else { pickMap.setView(map ? map.getCenter() : CONFIG.PUSAT_PETA, 17); }
      if (pickMarker) { pickMap.removeLayer(pickMarker); pickMarker = null; }
      pickMap.invalidateSize();
    }, 60);
  }
  function pakaiGps() {
    if (!navigator.geolocation) return pesan('#d-msg', 'HP/peramban ini tidak mendukung lokasi. Tandai di peta saja.', 'err');
    pesan('#d-msg', 'Mencari lokasi… (izinkan akses lokasi bila diminta)');
    navigator.geolocation.getCurrentPosition(
      (p) => { const ll = L.latLng(p.coords.latitude, p.coords.longitude); pickMap.setView(ll, 19); setTitik(ll); pesan('#d-msg', ''); },
      () => pesan('#d-msg', 'Lokasi tidak didapat. Tandai posisi pohon langsung di peta.', 'err'),
      { enableHighAccuracy: true, timeout: 15000 });
  }
  async function kirimDaftar(ev) {
    ev.preventDefault();
    const jenis = $('#d-jenis').value.trim(), pemilik = $('#d-pemilik').value.trim();
    if (!jenis || !pemilik) return pesan('#d-msg', 'Isi jenis pohon dan nama pemilik.', 'err');
    if (!pickLatLng) return pesan('#d-msg', 'Tandai lokasi pohon di peta dulu.', 'err');
    const tombol = $('#d-kirim'); tombol.disabled = true; tombol.textContent = 'Mengirim…'; pesan('#d-msg', '');
    try {
      const r = await Api.post({
        action: 'daftar', jenis, pemilik, lat: +pickLatLng.lat.toFixed(6), lng: +pickLatLng.lng.toFixed(6),
        tanam: $('#d-tanam').value, device: deviceId(), kode: $('#d-kode').value.trim(),
      });
      if (!r.ok) throw new Error(r.error || 'Gagal mendaftar.');
      ls.set('pohon_pelapor', pemilik); ls.set('pohon_kode', $('#d-kode').value.trim());
      await muat();
      $('#dlg-daftar').close();
      $('#ok-isi').innerHTML = `<p>Catat atau cetak kode ini dan tempel di pohon:</p>${qrBox(r.id)}` +
        `<div class="btn-row" style="justify-content:center"><button class="primary" data-isi="${esc(r.id)}">Isi update pertama</button></div>`;
      $('#dlg-ok').showModal();
    } catch (e) {
      pesan('#d-msg', e.message || 'Gagal mendaftar.', 'err');
    } finally { tombol.disabled = false; tombol.textContent = 'Daftarkan'; }
  }

  // ---------- Mulai ----------
  function init() {
    $('#judul').textContent = 'Pohon ' + (CONFIG.NAMA_DESA || 'Desa');
    document.title = 'Pemantauan Pohon - ' + (CONFIG.NAMA_DESA || 'Desa');
    if (CONFIG.PAKAI_KODE_DESA) $$('.kode-desa').forEach((e) => (e.hidden = false));
    $('#u-pelapor').value = ls.get('pohon_pelapor'); $('#u-kode').value = ls.get('pohon_kode');

    $$('.tabs button').forEach((b) => (b.onclick = () => pindahTab(b.dataset.tab)));
    $('#btn-refresh').onclick = () => muat(true);
    $('#btn-daftar').onclick = bukaDaftar;
    $('#form-update').onsubmit = kirimUpdate;
    $('#form-daftar').onsubmit = kirimDaftar;
    $('#d-gps').onclick = pakaiGps;
    $('#u-id').oninput = infoPohonDipilih;
    $('#cari').oninput = (e) => { state.cari = e.target.value; renderList(); };
    $('#u-foto').onchange = async (e) => {
      const f = e.target.files[0], p = $('#u-preview');
      if (!f) { p.hidden = true; return; }
      try { p.src = await kecilkanFoto(f, 400); p.hidden = false; } catch (err) { p.hidden = true; pesan('#u-msg', err.message, 'err'); }
    };
    $$('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

    document.addEventListener('click', (e) => {
      const c = e.target.closest('[data-close]'); if (c) c.closest('dialog').close();
      const f = e.target.closest('[data-f]');
      if (f) { state.filter = f.dataset.f || null; renderLegend(); renderMap(); renderList(); }
      const d = e.target.closest('.item[data-detail]'); if (d) bukaDetail(d.dataset.detail);
      const i = e.target.closest('[data-isi]'); if (i) isiUpdate(i.dataset.isi);
    });

    const deep = new URLSearchParams(location.search).get('pohon');
    muat().then(() => { if (deep) { isiUpdate(deep.toUpperCase()); } });
  }

  init();
})();
