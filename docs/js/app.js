(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  // Palet status (hijau/kuning/merah) + abu-abu netral. Selalu dipasangkan dengan ikon dan teks, tidak pernah warna saja.
  const WARNA = { Sehat: '#0aac23', Cukup: '#fbb315', Buruk: '#dc3c3d', Mati: '#5f6b76', Belum: '#9aa5b1' };
  const IKON = { Sehat: '🌳', Cukup: '🌿', Buruk: '🥀', Mati: '🪵', Belum: '❔' };
  const NAMA = { Sehat: 'Sehat', Cukup: 'Cukup', Buruk: 'Buruk', Mati: 'Mati', Belum: 'Belum ada data' };
  const RAMP = ['#84b9f3', '#519ced', '#257de0', '#1b64be', '#0f4a96']; // biru, terang → gelap = tumbuh lebih cepat
  const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const bulanIni = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  const idxBulan = (b) => { const [y, m] = String(b).split('-'); return (+y) * 12 + (+m); };
  const labelBulan = (b) => { const [y, m] = String(b).split('-'); return (NAMA_BULAN[+m - 1] || b) + ' ' + y; };
  const fotoSrc = (f, w = 800) => !f ? '' : String(f).startsWith('data:') ? f : `https://drive.google.com/thumbnail?id=${encodeURIComponent(f)}&sz=w${w}`;
  const ls = {
    get: (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
  };
  const deviceId = () => { let d = ls.get('pohon_device'); if (!d) { d = 'd' + Math.random().toString(36).slice(2) + Date.now().toString(36); ls.set('pohon_device', d); } return d; };

  const state = { pohon: [], update: [], byId: new Map(), filter: null, cari: '', mode: 'kondisi' };
  let map, layer, pickDaftar, pickLokasi, idLokasi = '';

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
      // Pertumbuhan: selisih tinggi antar pengukuran berurutan, dibagi jumlah bulan di antaranya (cm per bulan)
      const ukur = t.riwayat.filter((u) => u.tinggi_cm !== '' && u.tinggi_cm !== null && isFinite(u.tinggi_cm))
        .map((u) => ({ b: idxBulan(u.bulan), bulan: u.bulan, h: +u.tinggi_cm }));
      t.interval = [];
      for (let i = 1; i < ukur.length; i++) {
        const d = ukur[i].b - ukur[i - 1].b;
        if (d > 0) t.interval.push({ bulan: ukur[i].bulan, laju: (ukur[i].h - ukur[i - 1].h) / d });
      }
      t.tumbuh = t.interval.length ? t.interval[t.interval.length - 1].laju : null;
      t.tinggi = ukur.length ? ukur[ukur.length - 1].h : null;
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
  function render() { renderStats(); renderLegend(); renderMap(); renderList(); renderDatalist(); infoPohonDipilih(); if (window.Dashboard) Dashboard.render(); }

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

  const kondisiTag = (k) => `<span class="ktag"><span class="dot" style="background:${WARNA[k] || WARNA.Belum}"></span>${IKON[k] || ''} ${esc(NAMA[k] || k)}</span>`;
  const fmtTumbuh = (v) => `${v > 0 ? '+' : ''}${Math.round(v * 10) / 10} cm/bln`;

  function hitungSkala() {
    const v = semua().map((t) => t.tumbuh).filter((x) => x !== null && isFinite(x));
    if (state.mode !== 'tumbuh' || !v.length) return null;
    return { lo: Math.min(...v), hi: Math.max(...v) };
  }
  function warnaMarker(t, sk) {
    if (state.mode !== 'tumbuh') return WARNA[t.kondisi];
    if (!sk || t.tumbuh === null) return WARNA.Belum;
    if (sk.hi === sk.lo) return RAMP[2];
    return RAMP[Math.min(RAMP.length - 1, Math.floor(((t.tumbuh - sk.lo) / (sk.hi - sk.lo)) * RAMP.length))];
  }
  function renderSkala(sk) {
    const el = $('#skala');
    if (state.mode !== 'tumbuh') { el.hidden = true; return; }
    el.hidden = false;
    if (!sk) { el.innerHTML = '<span class="hint">Belum ada data pertumbuhan: butuh minimal 2 pengukuran tinggi per pohon.</span>'; return; }
    const step = (sk.hi - sk.lo) / RAMP.length, kecil = sk.hi - sk.lo < 5;
    const f = (x) => (kecil ? x.toFixed(1) : Math.round(x));
    const bins = sk.hi === sk.lo ? `<span><i style="background:${RAMP[2]}"></i>${f(sk.lo)}</span>` :
      RAMP.map((c, i) => `<span><i style="background:${c}"></i>${f(sk.lo + i * step)}–${f(sk.lo + (i + 1) * step)}</span>`).join('');
    el.innerHTML = `<b>Pertumbuhan tinggi (cm per bulan)</b><div class="scale">${bins}<span><i style="background:${WARNA.Belum}"></i>Belum cukup data</span></div>`;
  }

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
    const skala = hitungSkala(); renderSkala(skala);
    const pts = [];
    semua().filter(lolos).forEach((t) => {
      if (!isFinite(t.lat) || !isFinite(t.lng) || t.lat === '' || t.lng === '') return;
      const stale = !t.sudahBulanIni;
      const m = L.circleMarker([t.lat, t.lng], {
        radius: 10, fillColor: warnaMarker(t, skala), fillOpacity: stale ? 0.65 : 0.95,
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
      `Kondisi: ${kondisiTag(t.kondisi)}` +
      (u ? `<br>Tinggi: ${u.tinggi_cm !== '' ? esc(u.tinggi_cm) + ' cm' : '-'}${t.tumbuh !== null ? ' (' + fmtTumbuh(t.tumbuh) + ')' : ''} · ${esc(labelBulan(u.bulan))}` : '') +
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
      `<p class="detail-meta">Pemilik: ${esc(t.pemilik)}${t.tanam ? ' · ditanam ' + esc(t.tanam) : ''}<br>${kondisiTag(t.kondisi)}${t.tinggi !== null ? ' · tinggi ' + esc(t.tinggi) + ' cm' : ''}${t.tumbuh !== null ? ' · ' + fmtTumbuh(t.tumbuh) : ''}<br>📍 Lokasi: ${infoLokasi(t)}</p>` +
      (u && u.foto_id ? `<img class="detail-foto" src="${esc(fotoSrc(u.foto_id, 900))}" alt="Foto terbaru">` : '') +
      sparkline(t.riwayat) +
      `<h4 style="margin:10px 0 0">Riwayat</h4><div class="hist">` +
      (t.riwayat.length ? [...t.riwayat].reverse().map((r) => `
        <div class="hist-row">${r.foto_id ? `<img src="${esc(fotoSrc(r.foto_id, 200))}" alt="" loading="lazy">` : ''}
          <div><b>${esc(labelBulan(r.bulan))} — ${kondisiTag(r.kondisi)}</b>
          Tinggi ${r.tinggi_cm !== '' ? esc(r.tinggi_cm) + ' cm' : '-'}${r.diameter_cm !== '' ? ', diameter ' + esc(r.diameter_cm) + ' cm' : ''}<br>
          <span class="hint">oleh ${esc(r.pelapor)}${r.catatan ? ' · ' + esc(r.catatan) : ''}</span></div></div>`).join('') : '<p class="hint">Belum ada update.</p>') +
      `</div><div class="btn-row"><button class="primary" data-isi="${esc(t.id)}">Update pohon ini</button><button class="small-btn" data-lokasi="${esc(t.id)}">📍 Perbarui lokasi</button></div>` +
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

  // ---------- Pemilih lokasi: GPS HP + peta (dipakai form daftar dan form perbarui lokasi) ----------
  function buatPicker(cfg) {
    const P = { map: null, marker: null, circle: null, ref: null, watch: null, timer: null, hasil: null, awal: true };
    const status = (html, kelas) => { const el = $(cfg.status); el.innerHTML = html; el.className = 'gps-status ' + (kelas || ''); };
    const tombol = (t) => { $(cfg.tombol).textContent = t; };
    const kualitas = (a) => (a <= 10 ? ['sangat baik', 'ok'] : a <= 25 ? ['baik', 'ok'] : a <= 50 ? ['cukup', 'warn'] : ['rendah', 'bad']);

    function taruh(ll, akurasi, manual) {
      P.hasil = { lat: ll.lat, lng: ll.lng, akurasi: akurasi, manual: !!manual };
      if (!P.marker) {
        P.marker = L.marker(ll, { draggable: true }).addTo(P.map);
        P.marker.on('dragend', () => { P.berhenti(); taruh(P.marker.getLatLng(), null, true); ringkas(); });
      } else P.marker.setLatLng(ll);
      if (akurasi) {
        if (!P.circle) P.circle = L.circle(ll, { radius: akurasi, color: '#257de0', weight: 1, fillColor: '#257de0', fillOpacity: 0.12, interactive: false }).addTo(P.map);
        else P.circle.setLatLng(ll).setRadius(akurasi);
      } else if (P.circle) { P.map.removeLayer(P.circle); P.circle = null; }
    }

    function ringkas() {
      const r = P.hasil; if (!r) return;
      const koord = `${r.lat.toFixed(6)}, ${r.lng.toFixed(6)}`;
      let teks, kelas;
      if (r.manual) { teks = `📍 Lokasi ditandai manual di peta: ${koord}`; kelas = 'warn'; }
      else {
        const [q, k] = kualitas(r.akurasi); kelas = k;
        teks = `✔ Lokasi dari GPS: ±${Math.round(r.akurasi)} m (akurasi ${q}). ${koord}`;
        if (r.akurasi > 50) teks += '<br>Tips: pindah ke tempat terbuka tanpa atap, tunggu beberapa detik, lalu tekan “Ulangi lokasi”.';
      }
      if (P.ref) {
        const jarak = Math.round(L.latLng(r.lat, r.lng).distanceTo(P.ref.getLatLng()));
        teks += `<br>${jarak > 500 ? '⚠️ ' : ''}Jarak dari lokasi lama: ${jarak} m.`;
      }
      status(teks, kelas);
    }

    function galat(err, adaFix) {
      P.berhenti();
      if (adaFix) return ringkas();
      status(err.code === 1
        ? '🚫 <b>Izin lokasi ditolak.</b> Tekan ikon gembok 🔒 di samping alamat website → <b>Izin / Lokasi → Izinkan</b>, lalu tekan “Ulangi lokasi”. Pastikan juga Lokasi/GPS menyala di pengaturan HP. Atau tandai posisi manual di peta.'
        : err.code === 2
          ? '📵 Posisi tidak ditemukan. Nyalakan <b>Lokasi/GPS</b> di HP atau pindah ke tempat terbuka, lalu tekan “Ulangi lokasi”. Atau tandai manual di peta.'
          : '⏱️ Terlalu lama mencari sinyal. Pindah ke tempat terbuka lalu tekan “Ulangi lokasi”, atau tandai manual di peta.', 'bad');
    }
    function selesai() {
      P.berhenti();
      if (P.hasil && !P.hasil.manual) ringkas();
      else status('Lokasi belum didapat. Tekan “Ulangi lokasi” atau sentuh peta untuk menandai manual.', 'warn');
    }

    P.berhenti = () => {
      if (P.watch !== null) navigator.geolocation.clearWatch(P.watch);
      P.watch = null; clearTimeout(P.timer); tombol('📍 Ulangi lokasi');
    };
    P.siapkan = (pusat, zoom, ref) => {
      P.berhenti();
      if (!P.map) {
        P.map = L.map(cfg.peta).setView(pusat, zoom);
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles © Esri' }).addTo(P.map);
        P.map.on('click', (e) => { P.berhenti(); taruh(e.latlng, null, true); ringkas(); });
      } else P.map.setView(pusat, zoom);
      [P.marker, P.circle, P.ref].forEach((l) => l && P.map.removeLayer(l));
      P.marker = P.circle = P.ref = null; P.hasil = null; P.awal = true;
      if (ref) P.ref = L.circleMarker(ref, { radius: 8, color: '#666', weight: 2, fillColor: '#ccc', fillOpacity: 0.8, dashArray: '3 3' }).addTo(P.map).bindTooltip('Lokasi lama');
      status('', ''); tombol('📍 Aktifkan lokasi');
      setTimeout(() => P.map.invalidateSize(), 60);
    };
    P.mulaiGps = () => {
      if (!navigator.geolocation) return status('HP/peramban ini tidak mendukung lokasi. Sentuh peta untuk menandai posisi pohon.', 'bad');
      if (window.isSecureContext === false) return status('Lokasi hanya bisa dipakai lewat alamat yang diawali https://. Sentuh peta untuk menandai manual.', 'bad');
      P.berhenti();
      status('📡 Meminta lokasi… Jika muncul pertanyaan izin, pilih <b>Izinkan</b>.', 'busy'); tombol('📡 Mencari…');
      let terbaik = Infinity;
      P.watch = navigator.geolocation.watchPosition((p) => {
        const a = p.coords.accuracy, ll = L.latLng(p.coords.latitude, p.coords.longitude);
        if (a < terbaik) {
          terbaik = a; taruh(ll, a, false);
          if (P.awal) P.map.setView(ll, 19); else P.map.panTo(ll);
          P.awal = false;
        }
        if (a <= 10) return selesai();
        status(`📡 Mengunci lokasi… ±${Math.round(terbaik)} m. Tunggu beberapa detik sambil berdiri dekat pohon.`, 'busy');
      }, (err) => galat(err, terbaik < Infinity), { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
      P.timer = setTimeout(selesai, 25000);
    };
    return P;
  }

  // ---------- Form daftar pohon baru ----------
  function bukaDaftar() {
    $$('dialog[open]').forEach((d) => d.close());
    $('#form-daftar').reset(); pesan('#d-msg', '');
    $('#d-pemilik').value = ls.get('pohon_pelapor'); $('#d-kode').value = ls.get('pohon_kode');
    $('#dlg-daftar').showModal();
    pickDaftar.siapkan(map ? map.getCenter() : CONFIG.PUSAT_PETA, 17);
    pickDaftar.mulaiGps(); // langsung minta izin lokasi
  }
  async function kirimDaftar(ev) {
    ev.preventDefault();
    const jenis = $('#d-jenis').value.trim(), pemilik = $('#d-pemilik').value.trim(), lok = pickDaftar.hasil;
    if (!jenis || !pemilik) return pesan('#d-msg', 'Isi jenis pohon dan nama pemilik.', 'err');
    if (!lok) return pesan('#d-msg', 'Lokasi belum didapat. Tekan “Aktifkan lokasi” atau sentuh peta untuk menandai posisi pohon.', 'err');
    const tombol = $('#d-kirim'); tombol.disabled = true; tombol.textContent = 'Mengirim…'; pesan('#d-msg', '');
    try {
      const r = await Api.post({
        action: 'daftar', jenis, pemilik, lat: +lok.lat.toFixed(6), lng: +lok.lng.toFixed(6), akurasi: lok.akurasi ? Math.round(lok.akurasi) : '',
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

  // ---------- Perbarui lokasi pohon yang sudah terdaftar ----------
  function bukaLokasi(id) {
    const t = state.byId.get(id); if (!t) return;
    $$('dialog[open]').forEach((d) => d.close());
    idLokasi = id; pesan('#l-msg', ''); $('#l-kode').value = ls.get('pohon_kode');
    $('#l-info').textContent = `${t.id} · ${t.jenis} milik ${t.pemilik}. Berdirilah sedekat mungkin dengan batang pohon, lalu izinkan akses lokasi.`;
    $('#dlg-lokasi').showModal();
    const ada = t.lat !== '' && t.lng !== '' && isFinite(t.lat) && isFinite(t.lng);
    pickLokasi.siapkan(ada ? [t.lat, t.lng] : (map ? map.getCenter() : CONFIG.PUSAT_PETA), 18, ada ? [t.lat, t.lng] : null);
    pickLokasi.mulaiGps();
  }
  async function kirimLokasi(ev) {
    ev.preventDefault();
    const lok = pickLokasi.hasil;
    if (!lok) return pesan('#l-msg', 'Lokasi baru belum didapat. Tekan “Aktifkan lokasi” atau sentuh peta.', 'err');
    const tombol = $('#l-kirim'); tombol.disabled = true; tombol.textContent = 'Menyimpan…'; pesan('#l-msg', '');
    try {
      const r = await Api.post({
        action: 'lokasi', id: idLokasi, lat: +lok.lat.toFixed(6), lng: +lok.lng.toFixed(6), akurasi: lok.akurasi ? Math.round(lok.akurasi) : '',
        device: deviceId(), kode: $('#l-kode').value.trim(),
      });
      if (!r.ok) throw new Error(r.error === 'Aksi tidak dikenal.' ? 'Fitur ini butuh Apps Script versi terbaru. Lihat PANDUAN.md bagian "Perbarui Apps Script".' : (r.error || 'Gagal menyimpan.'));
      ls.set('pohon_kode', $('#l-kode').value.trim());
      await muat(); $('#dlg-lokasi').close(); toast('Lokasi pohon diperbarui ✔');
    } catch (e) {
      pesan('#l-msg', e.message || 'Gagal menyimpan.', 'err');
    } finally { tombol.disabled = false; tombol.textContent = 'Simpan lokasi baru'; }
  }
  const infoLokasi = (t) => (t.akurasi_m !== '' && t.akurasi_m !== undefined && t.akurasi_m !== null ? `GPS ±${esc(t.akurasi_m)} m` : 'ditandai di peta (tanpa data akurasi)');

  // ---------- Mulai ----------
  function init() {
    $('#judul').textContent = 'Pohon ' + (CONFIG.NAMA_DESA || 'Desa');
    document.title = 'Pemantauan Pohon - ' + (CONFIG.NAMA_DESA || 'Desa');
    if (CONFIG.PAKAI_KODE_DESA) $$('.kode-desa').forEach((e) => (e.hidden = false));
    $('#u-pelapor').value = ls.get('pohon_pelapor'); $('#u-kode').value = ls.get('pohon_kode');

    $$('.tabs button').forEach((b) => (b.onclick = () => pindahTab(b.dataset.tab)));
    $('#btn-refresh').onclick = () => muat(true);
    $$('#mode-peta button').forEach((b) => (b.onclick = () => {
      state.mode = b.dataset.mode; $$('#mode-peta button').forEach((x) => x.classList.toggle('on', x === b)); renderMap();
    }));
    $('#btn-daftar').onclick = bukaDaftar;
    $('#form-update').onsubmit = kirimUpdate;
    $('#form-daftar').onsubmit = kirimDaftar;
    pickDaftar = buatPicker({ peta: 'map-pilih', status: '#d-gps-status', tombol: '#d-gps' });
    pickLokasi = buatPicker({ peta: 'map-lokasi', status: '#l-status', tombol: '#l-gps' });
    $('#d-gps').onclick = () => pickDaftar.mulaiGps();
    $('#l-gps').onclick = () => pickLokasi.mulaiGps();
    $('#form-lokasi').onsubmit = kirimLokasi;
    $('#dlg-daftar').addEventListener('close', () => pickDaftar.berhenti());
    $('#dlg-lokasi').addEventListener('close', () => pickLokasi.berhenti());
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
      const lk = e.target.closest('[data-lokasi]'); if (lk) bukaLokasi(lk.dataset.lokasi);
    });

    const deep = new URLSearchParams(location.search).get('pohon');
    muat().then(() => { if (deep) { isiUpdate(deep.toUpperCase()); } });
  }

  window.PohonApp = { esc, WARNA, IKON, NAMA, bulanIni, labelBulan, idxBulan, semua, state, bukaDetail, kondisiTag, fmtTumbuh };
  init();
})();
