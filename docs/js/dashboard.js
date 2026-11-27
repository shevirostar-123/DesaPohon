// Dashboard: ringkasan, grafik, dan daftar "perlu perhatian". Hanya membaca data yang sudah dimuat app.js.
(() => {
  'use strict';
  const A = () => window.PohonApp;
  const $ = (s) => document.querySelector(s);
  const SVGNS = 'http://www.w3.org/2000/svg';
  const INK = '#191919', INK2 = '#666666', GRID = '#e7e7e7', AXIS = '#c2c2c2', SURF = '#ffffff', WASH = '#f1f5f3', BLUE = '#257de0';
  const URUT = ['Sehat', 'Cukup', 'Buruk', 'Mati'];            // dari dasar kolom ke atas
  const TEKS_DI_ATAS = { Sehat: '#ffffff', Cukup: '#0b0b0b', Buruk: '#ffffff', Mati: '#ffffff', Belum: '#0b0b0b' };
  const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  // ---------- Pembuat elemen (teks selalu lewat textContent) ----------
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) { const v = attrs[k]; if (v === false || v == null) continue; k === 'class' ? (e.className = v) : e.setAttribute(k, v === true ? '' : v); }
    kids.flat().forEach((c) => c != null && e.append(c.nodeType ? c : document.createTextNode(String(c))));
    return e;
  }
  function sv(tag, attrs, text) {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }

  // ---------- Tooltip (satu untuk semua grafik) ----------
  const tip = h('div', { class: 'tip', role: 'tooltip', hidden: true });
  document.body.appendChild(tip);
  function showTip(x, y, judul, baris) {
    tip.replaceChildren(h('div', { class: 'tip-t' }, judul), ...baris.map((r) =>
      h('div', { class: 'tip-r' }, r.warna ? h('i', { style: `background:${r.warna}` }) : null, h('strong', {}, r.nilai), ' ', h('span', {}, r.label))));
    tip.hidden = false;
    const w = tip.offsetWidth, hh = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(x + 12, window.innerWidth - w - 8)) + 'px';
    tip.style.top = (y - hh - 12 < 8 ? y + 18 : y - hh - 12) + 'px';
  }
  const hideTip = () => (tip.hidden = true);
  function pasangTip(el, ambil) {
    const dari = (ev) => { const r = el.getBoundingClientRect(); return ev.clientX ? [ev.clientX, ev.clientY] : [r.left + r.width / 2, r.top]; };
    el.addEventListener('pointermove', (ev) => { const [x, y] = dari(ev); const t = ambil(); showTip(x, y, t.judul, t.baris); t.aktif && t.aktif(true); });
    el.addEventListener('focus', (ev) => { const [x, y] = dari({}); const t = ambil(); showTip(x, y, t.judul, t.baris); t.aktif && t.aktif(true); });
    const off = () => { hideTip(); const t = ambil(); t.aktif && t.aktif(false); };
    el.addEventListener('pointerleave', off); el.addEventListener('blur', off);
  }

  // ---------- Bulan & hitungan ----------
  function enamBulan() {
    const A_ = A(), [y, m] = A_.bulanIni().split('-').map(Number), out = [];
    for (let i = 5; i >= 0; i--) { const d = new Date(y, m - 1 - i, 1); out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); }
    return out;
  }
  const namaBulan = (b) => BLN[+b.split('-')[1] - 1];
  const bulanPenuh = (b) => A().labelBulan(b);
  const rata = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const bulat1 = (v) => Math.round(v * 10) / 10;

  function alasan(t) {
    const A_ = A(), a = [], now = A_.idxBulan(A_.bulanIni());
    if (t.kondisi === 'Mati') a.push({ sev: 3, ikon: '🪵', teks: 'Pohon mati, perlu diganti' });
    else if (t.kondisi === 'Buruk') a.push({ sev: 2, ikon: '🥀', teks: 'Kondisi buruk' });
    if (t.kondisi !== 'Mati' && t.tumbuh !== null && t.tumbuh <= 0) a.push({ sev: 1, ikon: '📉', teks: 'Tidak tumbuh atau menyusut' });
    if (t.kondisi !== 'Mati') {
      if (t.terakhir) { const s = now - A_.idxBulan(t.terakhir.bulan); if (s >= 2) a.push({ sev: 1, ikon: '⏰', teks: `Belum update ${s} bulan` }); }
      else if (t.dibuat && /^\d{4}-\d{2}/.test(String(t.dibuat)) && A_.idxBulan(String(t.dibuat).slice(0, 7)) < now) a.push({ sev: 1, ikon: '⏰', teks: 'Belum pernah diupdate' });
    }
    return a;
  }

  function nilaiSkala(maks) {                       // batas atas sumbu yang "bulat" dan 3-5 garis
    const langkah = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
    const st = langkah.find((s) => maks / s <= 4) || 1000;
    return { st, atas: Math.max(st, Math.ceil(maks / st) * st) };
  }

  function tabelTampil(judul, kepala, baris) {
    return h('details', { class: 'tv' }, h('summary', {}, judul),
      h('div', { class: 'tv-scroll' }, h('table', {}, h('thead', {}, h('tr', {}, kepala.map((k) => h('th', {}, k)))),
        h('tbody', {}, baris.map((r) => h('tr', {}, r.map((c) => h('td', {}, c))))))));
  }
  const kosong = (t) => h('p', { class: 'hint kosong' }, t);

  // ---------- Render ----------
  function render() {
    if (!$('#db-kpi') || !A()) return;
    isiFilter();
    const semua = A().semua(), jenis = $('#db-jenis').value;
    const rows = jenis ? semua.filter((t) => t.jenis === jenis) : semua;
    kpi(rows); perhatian(rows); segmen(rows); perBulan(rows); tumbuhChart(rows); tabelJenis(rows);
  }

  function isiFilter() {
    const sel = $('#db-jenis'), now = sel.value, js = [...new Set(A().semua().map((t) => t.jenis))].sort();
    if (sel.dataset.sig === js.join('|')) return;
    sel.dataset.sig = js.join('|');
    sel.replaceChildren(h('option', { value: '' }, 'Semua jenis'), ...js.map((j) => h('option', { value: j }, j)));
    sel.value = js.includes(now) ? now : '';
  }

  // ---- KPI ----
  function kpi(rows) {
    const total = rows.length, sudah = rows.filter((t) => t.sudahBulanIni).length;
    const ada = rows.filter((t) => t.terakhir), sehat = ada.filter((t) => t.kondisi === 'Sehat').length;
    const perlu = rows.filter((t) => alasan(t).length).length;
    const tg = rata(rows.map((t) => t.tinggi).filter((v) => v !== null));
    const tb = rata(rows.map((t) => t.tumbuh).filter((v) => v !== null));
    const tiles = [
      ['Total pohon', total, 'terdaftar'],
      ['Update bulan ini', `${sudah}/${total}`, total ? Math.round((sudah / total) * 100) + '% sudah mengisi' : '-'],
      ['Pohon sehat', ada.length ? Math.round((sehat / ada.length) * 100) + '%' : '-', ada.length ? `${sehat} dari ${ada.length} yang punya data` : 'belum ada data'],
      ['Perlu perhatian', perlu, perlu ? '⚠️ lihat daftar di bawah' : '✔ tidak ada'],
      ['Rata-rata tinggi', tg === null ? '-' : Math.round(tg) + ' cm', 'update terakhir'],
      ['Pertumbuhan', tb === null ? '-' : (tb > 0 ? '+' : '') + bulat1(tb) + ' cm', 'rata-rata per bulan'],
    ];
    $('#db-kpi').replaceChildren(...tiles.map(([l, v, s]) => h('div', { class: 'tile' }, h('span', { class: 'tl' }, l), h('b', {}, v), h('span', { class: 'ts' }, s))));
  }

  // ---- Perlu perhatian ----
  function perhatian(rows) {
    const daftar = rows.map((t) => ({ t, a: alasan(t) })).filter((x) => x.a.length)
      .sort((x, y) => Math.max(...y.a.map((r) => r.sev)) - Math.max(...x.a.map((r) => r.sev)) || x.t.id.localeCompare(y.t.id));
    const box = $('#db-attn');
    if (!daftar.length) { box.replaceChildren(h('p', { class: 'ok-msg' }, '✔ Semua pohon dalam kondisi baik dan sudah diperbarui.')); return; }
    const MAKS = 8;
    const isi = [h('div', { class: 'list' }, daftar.slice(0, MAKS).map(({ t, a }) =>
      h('button', { class: 'item', type: 'button', 'data-detail': t.id },
        h('span', { class: 'dot', style: `background:${A().WARNA[t.kondisi]}` }),
        h('span', { class: 't' }, h('b', {}, `${t.id} · ${t.jenis}`), h('span', {}, `${t.pemilik} · ` + a.map((r) => `${r.ikon} ${r.teks}`).join(' · ')))))) ,
      ];
    if (daftar.length > MAKS) isi.push(h('p', { class: 'hint' }, `…dan ${daftar.length - MAKS} pohon lainnya. Lihat tab Daftar.`));
    box.replaceChildren(...isi);
  }

  // ---- Batang bersegmen tinggi: kondisi sekarang ----
  function segmen(rows) {
    const A_ = A(), box = $('#db-seg'), ord = [...URUT, 'Belum'];
    const n = {}; ord.forEach((k) => (n[k] = rows.filter((t) => t.kondisi === k).length));
    const total = rows.length;
    if (!total) { box.replaceChildren(kosong('Belum ada pohon terdaftar.')); return; }
    const bar = h('div', { class: 'segbar', role: 'img', 'aria-label': ord.filter((k) => n[k]).map((k) => `${A_.NAMA[k]} ${n[k]}`).join(', ') },
      ord.filter((k) => n[k]).map((k) => {
        const pct = Math.round((n[k] / total) * 100);
        return h('div', { class: 'seg', title: `${A_.NAMA[k]}: ${n[k]} pohon (${pct}%)`, style: `flex:${n[k]} 1 0;background:${A_.WARNA[k]};color:${TEKS_DI_ATAS[k]}` },
          (n[k] / total) >= 0.1 ? pct + '%' : '');
      }));
    const legend = h('div', { class: 'lg' }, ord.map((k) => h('span', {}, h('i', { style: `background:${A_.WARNA[k]}` }), `${A_.IKON[k]} ${A_.NAMA[k]}`)));
    box.replaceChildren(bar, legend, tabelTampil('Lihat sebagai tabel', ['Kondisi', 'Jumlah pohon', 'Persen'],
      ord.map((k) => [A_.NAMA[k], n[k], Math.round((n[k] / total) * 100) + '%'])));
  }

  // ---- Kolom bertumpuk: update per bulan menurut kondisi ----
  function perBulan(rows) {
    const A_ = A(), box = $('#db-bulan'), bl = enamBulan();
    const hit = bl.map((b) => { const c = { Sehat: 0, Cukup: 0, Buruk: 0, Mati: 0 }; rows.forEach((t) => t.riwayat.filter((u) => u.bulan === b).slice(-1).forEach((u) => { if (c[u.kondisi] !== undefined) c[u.kondisi]++; })); return c; });
    const tot = hit.map((c) => URUT.reduce((a, k) => a + c[k], 0));
    if (!Math.max(...tot)) { box.replaceChildren(kosong('Belum ada update dalam 6 bulan terakhir.')); return; }

    const W = 340, H = 214, L = 30, R = 8, T = 16, B = 26, pw = W - L - R, ph = H - T - B;
    const { st, atas } = nilaiSkala(Math.max(...tot)), y = (v) => T + ph - (v / atas) * ph;
    const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Jumlah update per bulan menurut kondisi' });
    for (let v = 0; v <= atas; v += st) {
      svg.append(sv('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: v === 0 ? AXIS : GRID, 'stroke-width': 1 }));
      svg.append(sv('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 11, fill: INK2 }, v));
    }
    const slot = pw / bl.length, bw = Math.min(24, slot * 0.55);
    bl.forEach((b, i) => {
      const x0 = L + i * slot, x = x0 + (slot - bw) / 2;
      const wash = sv('rect', { x: x0 + 2, y: T, width: slot - 4, height: ph, fill: WASH, opacity: 0, rx: 4 });
      svg.append(wash);
      let cum = 0;
      const aktif = URUT.filter((k) => hit[i][k] > 0);
      aktif.forEach((k, j) => {
        const yb = y(cum), yt = y(cum + hit[i][k]); cum += hit[i][k];
        const atasSeg = j === aktif.length - 1, hSeg = yb - yt - (atasSeg ? 0 : 2), r = Math.min(4, hSeg / 2);
        svg.append(sv('path', { fill: A_.WARNA[k], d: atasSeg
          ? `M${x},${yt + r}Q${x},${yt} ${x + r},${yt}L${x + bw - r},${yt}Q${x + bw},${yt} ${x + bw},${yt + r}L${x + bw},${yt + hSeg}L${x},${yt + hSeg}Z`
          : `M${x},${yt + 2}H${x + bw}V${yb}H${x}Z` }));
      });
      if (i === bl.length - 1) svg.append(sv('text', { x: x + bw / 2, y: y(cum) - 5, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: INK }, cum));
      svg.append(sv('text', { x: x0 + slot / 2, y: H - 8, 'text-anchor': 'middle', 'font-size': 11, fill: INK2 }, namaBulan(b)));
      const zona = sv('rect', { x: x0, y: T, width: slot, height: ph, fill: 'transparent', tabindex: 0, 'aria-label': `${bulanPenuh(b)}: ${tot[i]} pohon diupdate` });
      pasangTip(zona, () => ({
        judul: bulanPenuh(b), aktif: (on) => wash.setAttribute('opacity', on ? 1 : 0),
        baris: [{ nilai: tot[i], label: 'pohon diupdate' }, ...[...URUT].reverse().filter((k) => hit[i][k]).map((k) => ({ warna: A_.WARNA[k], nilai: hit[i][k], label: A_.NAMA[k] }))],
      }));
      svg.append(zona);
    });
    const legend = h('div', { class: 'lg' }, URUT.map((k) => h('span', {}, h('i', { style: `background:${A_.WARNA[k]}` }), `${A_.IKON[k]} ${A_.NAMA[k]}`)));
    box.replaceChildren(svg, legend, tabelTampil('Lihat sebagai tabel', ['Bulan', ...URUT, 'Total'],
      bl.map((b, i) => [bulanPenuh(b), ...URUT.map((k) => hit[i][k]), tot[i]])));
  }

  // ---- Garis: rata-rata pertumbuhan ----
  function tumbuhChart(rows) {
    const box = $('#db-tumbuh'), bl = enamBulan();
    const per = bl.map((b) => { const v = []; rows.forEach((t) => t.interval.filter((x) => x.bulan === b).forEach((x) => v.push(x.laju))); return v.length ? { avg: rata(v), n: v.length } : null; });
    if (!per.some(Boolean)) { box.replaceChildren(kosong('Belum cukup data: butuh minimal 2 pengukuran tinggi pada pohon yang sama.')); return; }

    const W = 340, H = 200, L = 34, R = 18, T = 20, B = 26, pw = W - L - R, ph = H - T - B;
    const vals = per.filter(Boolean).map((p) => p.avg), lo = Math.min(0, Math.floor(Math.min(...vals))), { st, atas } = nilaiSkala(Math.max(1, Math.max(...vals) - lo));
    const top = lo + atas, y = (v) => T + ph - ((v - lo) / (top - lo)) * ph;
    const slot = pw / bl.length, xs = (i) => L + slot * i + slot / 2;
    const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Rata-rata pertumbuhan tinggi per bulan' });
    for (let v = lo; v <= top; v += st) {
      svg.append(sv('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: v === 0 ? AXIS : GRID, 'stroke-width': 1 }));
      svg.append(sv('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 11, fill: INK2 }, v));
    }
    const garis = sv('line', { y1: T, y2: T + ph, stroke: AXIS, 'stroke-width': 1, opacity: 0 });
    svg.append(garis);
    let seg = [];
    const tutup = () => { if (seg.length > 1) svg.append(sv('polyline', { points: seg.join(' '), fill: 'none', stroke: BLUE, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' })); seg = []; };
    per.forEach((p, i) => { if (p) seg.push(`${xs(i)},${y(p.avg)}`); else tutup(); }); tutup();
    let terakhir = -1;
    per.forEach((p, i) => { if (p) { terakhir = i; svg.append(sv('circle', { cx: xs(i), cy: y(p.avg), r: 5, fill: BLUE, stroke: SURF, 'stroke-width': 2 })); } });
    if (terakhir >= 0) svg.append(sv('text', { x: xs(terakhir), y: y(per[terakhir].avg) - 11, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: INK }, (per[terakhir].avg > 0 ? '+' : '') + bulat1(per[terakhir].avg)));
    bl.forEach((b, i) => {
      svg.append(sv('text', { x: xs(i), y: H - 8, 'text-anchor': 'middle', 'font-size': 11, fill: INK2 }, namaBulan(b)));
      const zona = sv('rect', { x: L + slot * i, y: T, width: slot, height: ph, fill: 'transparent', tabindex: 0, 'aria-label': per[i] ? `${bulanPenuh(b)}: ${bulat1(per[i].avg)} cm per bulan` : `${bulanPenuh(b)}: tidak ada data` });
      pasangTip(zona, () => ({
        judul: bulanPenuh(b),
        aktif: (on) => { garis.setAttribute('x1', xs(i)); garis.setAttribute('x2', xs(i)); garis.setAttribute('opacity', on ? 1 : 0); },
        baris: per[i] ? [{ warna: BLUE, nilai: (per[i].avg > 0 ? '+' : '') + bulat1(per[i].avg) + ' cm/bln', label: `rata-rata, ${per[i].n} pohon` }] : [{ nilai: '-', label: 'tidak ada pengukuran' }],
      }));
      svg.append(zona);
    });
    box.replaceChildren(svg, tabelTampil('Lihat sebagai tabel', ['Bulan', 'Rata-rata (cm/bulan)', 'Jumlah pohon'],
      bl.map((b, i) => [bulanPenuh(b), per[i] ? bulat1(per[i].avg) : '-', per[i] ? per[i].n : '-'])));
  }

  // ---- Per jenis: batang tipis + angka ----
  function tabelJenis(rows) {
    const A_ = A(), box = $('#db-jenis-tbl'), ord = [...URUT, 'Belum'];
    if (!rows.length) { box.replaceChildren(kosong('Belum ada pohon terdaftar.')); return; }
    const g = {}; rows.forEach((t) => (g[t.jenis] = g[t.jenis] || []).push(t));
    const baris = Object.keys(g).map((j) => {
      const a = g[j], n = {}; ord.forEach((k) => (n[k] = a.filter((t) => t.kondisi === k).length));
      const ada = a.filter((t) => t.terakhir).length, tb = rata(a.map((t) => t.tumbuh).filter((v) => v !== null));
      return { j, a, n, sehat: ada ? Math.round((n.Sehat / ada) * 100) : null, tb };
    }).sort((x, y) => y.a.length - x.a.length || x.j.localeCompare(y.j));
    const legend = h('div', { class: 'lg' }, ord.map((k) => h('span', {}, h('i', { style: `background:${A_.WARNA[k]}` }), `${A_.IKON[k]} ${A_.NAMA[k]}`)));
    const head = h('div', { class: 'jrow jhead' }, h('span', {}, 'Jenis'), h('span', {}, 'Kondisi'), h('span', { class: 'r' }, 'Sehat'), h('span', { class: 'r' }, 'cm/bln'));
    const list = baris.map((r) => h('div', { class: 'jrow' },
      h('span', { class: 'jn' }, h('b', {}, r.j), h('small', {}, `${r.a.length} pohon`)),
      h('span', { class: 'thin', role: 'img', 'aria-label': ord.filter((k) => r.n[k]).map((k) => `${A_.NAMA[k]} ${r.n[k]}`).join(', ') },
        ord.filter((k) => r.n[k]).map((k) => h('i', { title: `${A_.NAMA[k]}: ${r.n[k]}`, style: `flex:${r.n[k]} 1 0;background:${A_.WARNA[k]}` }))),
      h('span', { class: 'r' }, r.sehat === null ? '-' : r.sehat + '%'),
      h('span', { class: 'r' }, r.tb === null ? '-' : (r.tb > 0 ? '+' : '') + bulat1(r.tb))));
    box.replaceChildren(legend, head, ...list);
  }

  // ---------- Unduh CSV ----------
  function unduhCsv() {
    const A_ = A(), jenis = $('#db-jenis').value, semua = A_.semua(), rows = jenis ? semua.filter((t) => t.jenis === jenis) : semua;
    const kepala = ['kode', 'jenis', 'pemilik', 'lat', 'lng', 'tanggal_tanam', 'kondisi_terakhir', 'tinggi_cm', 'pertumbuhan_cm_per_bulan', 'update_terakhir', 'sudah_update_bulan_ini', 'akurasi_lokasi_m'];
    const sel = (v) => { let s = v === null || v === undefined ? '' : String(v); if (typeof v === 'string' && /^[=+\-@]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const baris = rows.map((t) => [t.id, t.jenis, t.pemilik, t.lat, t.lng, t.tanam, t.terakhir ? t.kondisi : '', t.tinggi, t.tumbuh === null ? '' : bulat1(t.tumbuh), t.terakhir ? t.terakhir.bulan : '', t.sudahBulanIni ? 'ya' : 'tidak', t.akurasi_m === undefined ? '' : t.akurasi_m]);
    const csv = '﻿' + [kepala, ...baris].map((r) => r.map(sel).join(',')).join('\r\n');
    const a = h('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: `data-pohon-${A_.bulanIni()}.csv` });
    document.body.appendChild(a); a.click(); a.remove();
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('#db-jenis').addEventListener('change', render);
    $('#db-csv').addEventListener('click', unduhCsv);
  });
  window.Dashboard = { render };
})();
