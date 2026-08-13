// ============================================================
// KONFIGURASI SUPABASE — GANTI DENGAN MILIK ANDA
// Ambil dari Supabase Dashboard -> Project Settings -> API
// ============================================================
const SUPABASE_URL = 'https://zqblyipfwemwphaphmvn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxYmx5aXBmd2Vtd3BoYXBobXZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2MzEwNzgsImV4cCI6MjEwMjIwNzA3OH0.3j7aKY3xyJviQyQkkvYk6Ey4nRnHwnfVfhXtVci-q8I';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let krama = [];
let kelompok = Array.from({length:8}, (_,i)=>({no:i+1, anggota:[]}));
let tugasLog = [];
let grupab = {};
let pinjaman = [];
let payingLoanId = null;

function rupiah(n){ n = Number(n)||0; return 'Rp ' + n.toLocaleString('id-ID'); }
function todayStr(){ return new Date().toISOString().slice(0,10); }

function showConnError(msg){
  const el = document.getElementById('connError');
  el.textContent = '⚠ ' + msg;
  el.classList.remove('hidden');
}

/* ============================================================
   MUAT SEMUA DATA DARI SUPABASE
   ============================================================ */
async function loadAll(){
  if(SUPABASE_URL.startsWith('ISI_') || SUPABASE_ANON_KEY.startsWith('ISI_')){
    showConnError('Konfigurasi Supabase belum diisi. Buka app.js dan isi SUPABASE_URL & SUPABASE_ANON_KEY.');
    return;
  }
  try{
    const { data: pengaturan } = await sb.from('pengaturan').select('*').eq('id',1).maybeSingle();
    document.getElementById('tempekLabel').textContent = pengaturan?.nama_tempek || 'Tempek Banjar';

    const { data: kramaData, error: e1 } = await sb.from('krama').select('*').order('nama', {ascending:true});
    if(e1) throw e1;
    krama = kramaData || [];

    const { data: kelData, error: e2 } = await sb.from('kelompok_anggota').select('*');
    if(e2) throw e2;
    kelompok = Array.from({length:8}, (_,i)=>({no:i+1, anggota:[]}));
    (kelData||[]).forEach(row=>{
      const kel = kelompok.find(x=>x.no===row.kelompok_no);
      if(kel) kel.anggota.push(row.krama_id);
    });

    const { data: tugasData, error: e3 } = await sb.from('tugas_log').select('*').order('tanggal', {ascending:false});
    if(e3) throw e3;
    tugasLog = tugasData || [];

    const { data: grupData, error: e4 } = await sb.from('pegebagan_group').select('*');
    if(e4) throw e4;
    grupab = {};
    (grupData||[]).forEach(row=>{ grupab[row.krama_id] = row.grup; });

    const { data: pinjamanData, error: e5 } = await sb.from('pinjaman').select('*').order('tanggal', {ascending:false});
    if(e5) throw e5;
    pinjaman = pinjamanData || [];

    document.getElementById('connError').classList.add('hidden');
    renderAll();
  }catch(err){
    console.error(err);
    showConnError('Gagal terhubung ke Supabase: ' + (err.message||err) + '. Cek URL/key, dan pastikan skema SQL sudah dijalankan.');
  }
}

function renderAll(){
  renderRingkasan();
  renderKrama();
  renderDenda();
  renderKelompok();
  renderTugasLog();
  renderGrupAB();
  renderPinjamanSelect();
  renderPinjaman();
}

/* ---------- TABS ---------- */
document.querySelectorAll('nav.tabs button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('nav.tabs button').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('view-'+btn.dataset.view).classList.add('active');
  });
});

/* ---------- RINGKASAN ---------- */
function renderRingkasan(){
  const total = krama.length;
  const aktif = krama.filter(k=>k.status==='Aktif').length;
  const totalDenda = krama.reduce((s,k)=>s+(Number(k.denda)||0),0);
  const pinjamanBerjalan = pinjaman.filter(p=>p.status!=='Lunas');
  const totalPokokBerjalan = pinjamanBerjalan.reduce((s,p)=>s+Number(p.jumlah),0);
  const totalSisaTagihan = pinjamanBerjalan.reduce((s,p)=>s+hitungSisa(p),0);

  document.getElementById('statsGrid').innerHTML = `
    <div class="stat accent-gold"><div class="label">Total Krama</div><div class="value">${total}</div></div>
    <div class="stat accent-green"><div class="label">Krama Aktif</div><div class="value">${aktif}</div></div>
    <div class="stat accent-clay"><div class="label">Total Denda Pegebagan</div><div class="value" style="font-size:19px;">${rupiah(totalDenda)}</div></div>
    <div class="stat accent-gold"><div class="label">Pinjaman Berjalan</div><div class="value" style="font-size:19px;">${rupiah(totalPokokBerjalan)}</div></div>
    <div class="stat accent-clay"><div class="label">Total Sisa Tagihan (+bunga)</div><div class="value" style="font-size:19px;">${rupiah(totalSisaTagihan)}</div></div>
  `;

  const a = Object.values(grupab).filter(g=>g==='A').length;
  const b = Object.values(grupab).filter(g=>g==='B').length;
  const belum = total - a - b;
  document.getElementById('ringkasanGrup').innerHTML =
    `<span class="badge groupA">Grup A: ${a} orang</span> &nbsp;
     <span class="badge groupB">Grup B: ${b} orang</span> &nbsp;
     <span style="color:var(--text-dim);">Belum ditentukan: ${belum} orang</span>`;
}

/* ---------- DATA KRAMA ---------- */
function badgeStatus(s){
  const cls = s==='Aktif'?'aktif':(s==='Pindah'?'pindah':'tidak');
  return `<span class="badge ${cls}">${s}</span>`;
}
function namaTampil(k){
  return k.alias ? `${k.nama} <span style="color:var(--text-dim);font-weight:400;">(${k.alias})</span>` : k.nama;
}
function namaTeks(k){
  return k.alias ? `${k.nama} (${k.alias})` : k.nama;
}

document.getElementById('kramaSaveBtn').addEventListener('click', async ()=>{
  const id = document.getElementById('kramaEditId').value;
  const nama = document.getElementById('kramaNama').value.trim();
  const alias = document.getElementById('kramaAlias').value.trim();
  const alamat = document.getElementById('kramaAlamat').value.trim();
  const status = document.getElementById('kramaStatus').value;
  if(!nama){ alert('Nama krama wajib diisi.'); return; }
  let error;
  if(id){
    ({error} = await sb.from('krama').update({nama, alias, alamat, status}).eq('id', id));
  } else {
    ({error} = await sb.from('krama').insert({nama, alias, alamat, status, denda:0}));
  }
  if(error){ alert('Gagal menyimpan: '+error.message); return; }
  resetKramaForm();
  await loadAll();
});
document.getElementById('kramaCancelBtn').addEventListener('click', resetKramaForm);
function resetKramaForm(){
  document.getElementById('kramaEditId').value='';
  document.getElementById('kramaNama').value='';
  document.getElementById('kramaAlias').value='';
  document.getElementById('kramaAlamat').value='';
  document.getElementById('kramaStatus').value='Aktif';
}
document.getElementById('kramaSearch').addEventListener('input', renderKrama);

function renderKrama(){
  const q = (document.getElementById('kramaSearch').value||'').toLowerCase();
  const tbody = document.getElementById('kramaTableBody');
  const list = krama.filter(k=>k.nama.toLowerCase().includes(q));
  if(list.length===0){
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty"><div class="big">Belum ada krama</div>Tambahkan krama pertama melalui formulir di atas.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = list.map((k,i)=>`
    <tr>
      <td>${i+1}</td>
      <td>${namaTampil(k)}</td>
      <td>${k.alamat||'—'}</td>
      <td>${badgeStatus(k.status)}</td>
      <td style="white-space:nowrap;">
        <button class="btn ghost sm" onclick="editKrama('${k.id}')">Ubah</button>
        <button class="btn danger sm" onclick="hapusKrama('${k.id}')">Hapus</button>
      </td>
    </tr>`).join('');
}
window.editKrama = function(id){
  const k = krama.find(x=>x.id===id); if(!k) return;
  document.getElementById('kramaEditId').value = k.id;
  document.getElementById('kramaNama').value = k.nama;
  document.getElementById('kramaAlias').value = k.alias||'';
  document.getElementById('kramaAlamat').value = k.alamat||'';
  document.getElementById('kramaStatus').value = k.status;
  document.querySelector('[data-view="krama"]').click();
  window.scrollTo({top:0,behavior:'smooth'});
};
window.hapusKrama = async function(id){
  if(!confirm('Hapus krama ini? Data kelompok & grup pegebagan terkait ikut terhapus. Riwayat pinjaman tetap tersimpan.')) return;
  const {error} = await sb.from('krama').delete().eq('id', id);
  if(error){ alert('Gagal menghapus: '+error.message); return; }
  await loadAll();
};

/* ---------- DENDA PEGEBAGAN ---------- */
function renderDenda(){
  const tbody = document.getElementById('dendaTableBody');
  if(krama.length===0){
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty"><div class="big">Belum ada krama</div>Tambahkan krama terlebih dahulu di tab Data Krama.</div></td></tr>`;
    document.getElementById('totalDenda').textContent = rupiah(0);
    return;
  }
  tbody.innerHTML = krama.map((k,i)=>`
    <tr>
      <td>${i+1}</td>
      <td>${namaTampil(k)}</td>
      <td>${badgeStatus(k.status)}</td>
      <td><input type="number" min="0" value="${k.denda||0}" onchange="updateDenda('${k.id}', this.value)"></td>
    </tr>`).join('');
  const total = krama.reduce((s,k)=>s+(Number(k.denda)||0),0);
  document.getElementById('totalDenda').textContent = rupiah(total);
}
window.updateDenda = async function(id, val){
  const {error} = await sb.from('krama').update({denda: Number(val)||0}).eq('id', id);
  if(error){ alert('Gagal menyimpan denda: '+error.message); return; }
  await loadAll();
};

/* ---------- TUGAS KELOMPOK NGAYAH 1-8 ---------- */
function renderKelompok(){
  const grid = document.getElementById('kelompokGrid');
  grid.innerHTML = kelompok.map((kel)=>{
    const anggotaOptions = krama.map(k=>{
      const checked = kel.anggota.includes(k.id) ? 'checked' : '';
      return `<label class="anggota-item"><input type="checkbox" ${checked} onchange="toggleAnggota(${kel.no}, '${k.id}', this.checked)"> ${namaTeks(k)}</label>`;
    }).join('') || `<div style="font-size:12.5px;color:var(--text-dim);padding:6px;">Belum ada krama.</div>`;
    return `
      <div class="kelompok-card">
        <div class="kno"><span class="num">${kel.no}</span> Kelompok ${kel.no}</div>
        <label>Anggota</label>
        <div class="anggota-list">${anggotaOptions}</div>
        <div class="count-pill">${kel.anggota.length} anggota</div>
      </div>`;
  }).join('');
}
window.toggleAnggota = async function(kelompokNo, kramaId, checked){
  let error;
  if(checked){
    ({error} = await sb.from('kelompok_anggota').insert({kelompok_no:kelompokNo, krama_id:kramaId}));
  } else {
    ({error} = await sb.from('kelompok_anggota').delete().eq('kelompok_no',kelompokNo).eq('krama_id',kramaId));
  }
  if(error){ alert('Gagal menyimpan: '+error.message); }
  await loadAll();
};

document.getElementById('tugasSaveBtn').addEventListener('click', async ()=>{
  const kelompok_no = Number(document.getElementById('tugasKelompokNo').value);
  const jenis = document.getElementById('tugasJenis').value;
  const tanggal = document.getElementById('tugasTanggal').value || todayStr();
  const keterangan = document.getElementById('tugasKeterangan').value.trim();
  const {error} = await sb.from('tugas_log').insert({kelompok_no, jenis, tanggal, keterangan});
  if(error){ alert('Gagal menyimpan: '+error.message); return; }
  document.getElementById('tugasKeterangan').value='';
  await loadAll();
});
function renderTugasLog(){
  if(!document.getElementById('tugasTanggal').value) document.getElementById('tugasTanggal').value = todayStr();
  const tbody = document.getElementById('tugasLogBody');
  if(tugasLog.length===0){
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty"><div class="big">Belum ada catatan tugas</div>Catat penugasan pertama melalui formulir di atas.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = tugasLog.map(t=>`
    <tr>
      <td>${t.tanggal}</td>
      <td>Kelompok ${t.kelompok_no}</td>
      <td><span class="badge ${t.jenis==='Ngejuk Celeng'?'berjalan':'groupB'}">${t.jenis}</span></td>
      <td>${t.keterangan || '—'}</td>
      <td><button class="btn danger sm" onclick="hapusTugasLog('${t.id}')">Hapus</button></td>
    </tr>`).join('');
}
window.hapusTugasLog = async function(id){
  if(!confirm('Hapus catatan tugas ini?')) return;
  const {error} = await sb.from('tugas_log').delete().eq('id', id);
  if(error){ alert('Gagal menghapus: '+error.message); return; }
  await loadAll();
};

/* ---------- GRUP A/B ---------- */
function renderGrupAB(){
  const tbody = document.getElementById('grupabTableBody');
  if(krama.length===0){
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty"><div class="big">Belum ada krama</div>Tambahkan krama terlebih dahulu di tab Data Krama.</div></td></tr>`;
    document.getElementById('grupabSummary').textContent='';
    return;
  }
  tbody.innerHTML = krama.map((k,i)=>{
    const g = grupab[k.id] || '';
    return `
    <tr>
      <td>${i+1}</td>
      <td>${namaTampil(k)}</td>
      <td>${badgeStatus(k.status)}</td>
      <td>
        <div class="toggleAB">
          <button class="sel-a ${g==='A'?'on':''}" onclick="setGrup('${k.id}','A')">A</button>
          <button class="sel-b ${g==='B'?'on':''}" onclick="setGrup('${k.id}','B')">B</button>
        </div>
      </td>
    </tr>`;
  }).join('');
  const a = Object.values(grupab).filter(g=>g==='A').length;
  const b = Object.values(grupab).filter(g=>g==='B').length;
  document.getElementById('grupabSummary').innerHTML = `Grup A: <strong>${a}</strong> orang &nbsp;•&nbsp; Grup B: <strong>${b}</strong> orang`;
}
window.setGrup = async function(kramaId, grup){
  let error;
  if(grupab[kramaId]===grup){
    ({error} = await sb.from('pegebagan_group').delete().eq('krama_id', kramaId));
  } else {
    ({error} = await sb.from('pegebagan_group').upsert({krama_id:kramaId, grup}));
  }
  if(error){ alert('Gagal menyimpan: '+error.message); }
  await loadAll();
};

/* ---------- PINJAMAN ---------- */
function renderPinjamanSelect(){
  const sel = document.getElementById('pinjamKrama');
  sel.innerHTML = krama.map(k=>`<option value="${k.id}">${namaTeks(k)}</option>`).join('') || `<option value="">Belum ada krama</option>`;
  if(!document.getElementById('pinjamTanggal').value) document.getElementById('pinjamTanggal').value = todayStr();
}
document.getElementById('pinjamSaveBtn').addEventListener('click', async ()=>{
  const kramaId = document.getElementById('pinjamKrama').value;
  const jumlah = Number(document.getElementById('pinjamJumlah').value);
  const tanggal = document.getElementById('pinjamTanggal').value || todayStr();
  if(!kramaId){ alert('Tambahkan krama terlebih dahulu.'); return; }
  if(!jumlah || jumlah<=0){ alert('Jumlah pinjaman harus lebih dari 0.'); return; }
  const {error} = await sb.from('pinjaman').insert({krama_id:kramaId, jumlah, tanggal, dibayar:0, status:'Berjalan'});
  if(error){ alert('Gagal menyimpan: '+error.message); return; }
  document.getElementById('pinjamJumlah').value='';
  await loadAll();
});

function siklusTumpek(tanggalPinjam){
  const hariBerlalu = Math.floor((Date.now() - new Date(tanggalPinjam).getTime()) / (1000*60*60*24));
  return Math.max(0, Math.floor(hariBerlalu/35));
}
function hitungBunga(p){
  return Math.round(Number(p.jumlah) * 0.02 * siklusTumpek(p.tanggal));
}
function hitungSisa(p){
  const total = Number(p.jumlah) + hitungBunga(p) - Number(p.dibayar||0);
  return Math.max(0, total);
}
function ringSVG(){
  const r=13, c=2*Math.PI*r;
  return `<svg class="ring" viewBox="0 0 34 34"><circle class="bg" cx="17" cy="17" r="${r}"></circle>
    <circle class="fg" cx="17" cy="17" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="0"></circle></svg>`;
}

function renderPinjaman(){
  const tbody = document.getElementById('pinjamanTableBody');
  if(pinjaman.length===0){
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty"><div class="big">Belum ada pinjaman</div>Catat pinjaman baru melalui formulir di atas.</div></td></tr>`;
    return;
  }
  let needsLunasUpdate = [];
  const rows = pinjaman.map(p=>{
    const k = krama.find(x=>x.id===p.krama_id);
    const siklus = siklusTumpek(p.tanggal);
    const bunga = hitungBunga(p);
    const sisa = hitungSisa(p);
    if(sisa<=0 && p.status!=='Lunas') needsLunasUpdate.push(p.id);
    return `
      <tr>
        <td>${k? namaTampil(k) : '(krama dihapus)'}</td>
        <td>${rupiah(p.jumlah)}</td>
        <td>${p.tanggal}</td>
        <td><div class="ring-wrap">${ringSVG()}<span class="ring-label">${siklus}×</span></div></td>
        <td>${rupiah(bunga)}</td>
        <td>${rupiah(p.dibayar||0)}</td>
        <td><strong>${rupiah(sisa)}</strong></td>
        <td>${p.status==='Lunas' ? '<span class="badge lunas">Lunas</span>' : '<span class="badge berjalan">Berjalan</span>'}</td>
        <td style="white-space:nowrap;">
          ${p.status!=='Lunas' ? `<button class="btn gold sm" onclick="bukaBayar('${p.id}')">Bayar</button>` : ''}
          <button class="btn danger sm" onclick="hapusPinjaman('${p.id}')">Hapus</button>
        </td>
      </tr>`;
  }).join('');
  tbody.innerHTML = rows;

  if(needsLunasUpdate.length){
    (async ()=>{
      for(const id of needsLunasUpdate){
        await sb.from('pinjaman').update({status:'Lunas'}).eq('id', id);
      }
    })();
  }
}
window.hapusPinjaman = async function(id){
  if(!confirm('Hapus catatan pinjaman ini?')) return;
  const {error} = await sb.from('pinjaman').delete().eq('id', id);
  if(error){ alert('Gagal menghapus: '+error.message); return; }
  await loadAll();
};
window.bukaBayar = function(id){
  payingLoanId = id;
  document.getElementById('bayarJumlah').value='';
  document.getElementById('modalBg').classList.remove('hidden');
};
document.getElementById('bayarCancel').addEventListener('click', ()=>{
  document.getElementById('modalBg').classList.add('hidden');
  payingLoanId=null;
});
document.getElementById('bayarSimpan').addEventListener('click', async ()=>{
  const val = Number(document.getElementById('bayarJumlah').value);
  if(!val || val<=0){ alert('Masukkan jumlah pembayaran.'); return; }
  const p = pinjaman.find(x=>x.id===payingLoanId);
  if(p){
    const dibayarBaru = Number(p.dibayar||0) + val;
    const statusBaru = hitungSisa({...p, dibayar:dibayarBaru})<=0 ? 'Lunas' : 'Berjalan';
    const {error} = await sb.from('pinjaman').update({dibayar: dibayarBaru, status: statusBaru}).eq('id', p.id);
    if(error){ alert('Gagal menyimpan pembayaran: '+error.message); return; }
  }
  document.getElementById('modalBg').classList.add('hidden');
  payingLoanId=null;
  await loadAll();
});

/* ---------- EKSPOR EXCEL ---------- */
function namaKrama(id){ const k = krama.find(x=>x.id===id); return k ? namaTeks(k) : '(krama dihapus)'; }

document.getElementById('exportBtn').addEventListener('click', ()=>{
  if(typeof XLSX === 'undefined'){ alert('Modul ekspor belum siap, coba lagi sebentar.'); return; }

  const wb = XLSX.utils.book_new();

  const kramaRows = krama.map((k,i)=>({
    'No': i+1, 'Nama Krama': k.nama, 'Alias/Panggilan': k.alias||'', 'Alamat / No. KK': k.alamat||'', 'Status': k.status,
    'Denda Pegebagan (Rp)': Number(k.denda)||0
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kramaRows.length?kramaRows:[{'No':'','Nama Krama':'(belum ada data)'}]), 'Data Krama & Denda');

  const kelompokRows = kelompok.map(kel=>({
    'Kelompok': kel.no,
    'Anggota': kel.anggota.map(namaKrama).join(', ') || '-',
    'Jumlah Anggota': kel.anggota.length
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kelompokRows), 'Anggota Kelompok 1-8');

  const tugasLogRows = tugasLog.map(t=>({
    'Tanggal': t.tanggal, 'Kelompok': 'Kelompok '+t.kelompok_no,
    'Jenis Tugas': t.jenis, 'Keterangan': t.keterangan || '-'
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tugasLogRows.length?tugasLogRows:[{'Tanggal':'','Kelompok':'(belum ada catatan)'}]), 'Riwayat Tugas Ngayah');

  const grupRows = krama.map((k,i)=>({
    'No': i+1, 'Nama Krama': k.nama, 'Status': k.status, 'Grup Pegebagan': grupab[k.id] || '-'
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(grupRows.length?grupRows:[{'No':'','Nama Krama':'(belum ada data)'}]), 'Pegebagan Grup A-B');

  const pinjamanRows = pinjaman.map(p=>{
    const siklus = siklusTumpek(p.tanggal);
    const bunga = hitungBunga(p);
    const sisa = hitungSisa(p);
    return {
      'Krama': namaKrama(p.krama_id), 'Pokok Pinjaman (Rp)': Number(p.jumlah)||0,
      'Tanggal Pinjam': p.tanggal, 'Siklus Manis Tumpek Terlewati': siklus,
      'Bunga 2%/Siklus (Rp)': bunga, 'Sudah Dibayar (Rp)': Number(p.dibayar)||0,
      'Sisa Tagihan (Rp)': sisa, 'Status': p.status
    };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pinjamanRows.length?pinjamanRows:[{'Krama':'(belum ada data)'}]), 'Pinjaman Uang');

  const tanggal = todayStr();
  XLSX.writeFile(wb, `tempek-banjar-backup-${tanggal}.xlsx`);
});

loadAll();
