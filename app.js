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
let sesiPegebagan = [];
let absensiPegebagan = [];
let payingLoanId = null;
let currentUser = null; // {username, password, role, nama} — disimpan di memori saja, hilang saat reload/logout

const DENDA_PER_ABSEN = 10000;

function rupiah(n){ n = Number(n)||0; return 'Rp ' + n.toLocaleString('id-ID'); }
function todayStr(){ return new Date().toISOString().slice(0,10); }
function jumlahTidakHadir(kramaId){
  return absensiPegebagan.filter(a=>a.krama_id===kramaId && a.hadir===false).length;
}
function dendaOtomatis(kramaId){
  return jumlahTidakHadir(kramaId) * DENDA_PER_ABSEN;
}
function totalDendaKrama(k){
  return (Number(k.denda_manual)||0) + dendaOtomatis(k.id);
}

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

    kelompok = Array.from({length:8}, (_,i)=>({no:i+1, anggota:[]}));
    krama.forEach(k=>{
      if(k.kelompok_no){
        const kel = kelompok.find(x=>x.no===k.kelompok_no);
        if(kel) kel.anggota.push(k.id);
      }
    });

    const { data: tugasData, error: e3 } = await sb.from('tugas_log').select('*').order('tanggal', {ascending:false});
    if(e3) throw e3;
    tugasLog = tugasData || [];

    const { data: grupData, error: e4 } = await sb.from('pegebagan_group').select('*');
    if(e4) throw e4;
    grupab = {};
    (grupData||[]).forEach(row=>{ grupab[row.krama_id] = row.grup; });

    const { data: sesiData, error: e6 } = await sb.from('pegebagan_sesi').select('*').order('tanggal', {ascending:false});
    if(e6) throw e6;
    sesiPegebagan = sesiData || [];

    const { data: absensiData, error: e7 } = await sb.from('pegebagan_absensi').select('*');
    if(e7) throw e7;
    absensiPegebagan = absensiData || [];

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
  renderAbsensiForm();
  renderAbsensiLog();
  renderPinjamanSelect();
  renderPinjaman();
  renderRingkasanKelompok();
  renderRingkasanGrupAB();
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
  const totalDenda = krama.reduce((s,k)=>s+totalDendaKrama(k),0);
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

function tanggalIndo(iso){
  if(!iso) return '';
  const bulan = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const [y,m,d] = iso.split('-');
  return `${Number(d)} ${bulan[Number(m)-1]} ${y}`;
}
function renderRingkasanKelompok(){
  const detail = document.getElementById('ringkasanKelompokDetail');
  const sel = document.getElementById('ringkasanKelompokPilih');
  if(!detail || !sel) return;
  const no = Number(sel.value || 1);
  const kel = kelompok.find(k=>k.no===no);
  if(!kel){ detail.innerHTML=''; return; }
  const anggota = kel.anggota.map(id=>{
    const k = krama.find(x=>x.id===id);
    return k ? namaTeks(k) : null;
  }).filter(Boolean);
  const terakhir = tugasLog.find(t=>t.kelompok_no===no);
  const infoTerakhir = terakhir
    ? `<div class="count-pill">Terakhir: ${tanggalIndo(terakhir.tanggal)} · ${terakhir.jenis}</div>`
    : `<div class="count-pill">Belum pernah bertugas</div>`;
  detail.innerHTML = `
    <div class="kelompok-card">
      <div class="kno"><span class="num">${kel.no}</span> Kelompok ${kel.no}</div>
      ${anggota.length
        ? `<ul style="margin:0 0 8px;padding-left:18px;font-size:13px;line-height:1.7;">${anggota.map(n=>`<li>${n}</li>`).join('')}</ul>`
        : `<div style="font-size:12.5px;color:var(--text-dim);margin-bottom:8px;">Belum ada anggota.</div>`}
      ${infoTerakhir}
    </div>`;
}
document.getElementById('ringkasanKelompokPilih').addEventListener('change', renderRingkasanKelompok);

function renderRingkasanGrupAB(){
  const detail = document.getElementById('ringkasanGrupDetail');
  const sel = document.getElementById('ringkasanGrupPilih');
  if(!detail || !sel) return;
  const grup = sel.value || 'A';
  const anggota = krama.filter(k=>grupab[k.id]===grup);
  detail.innerHTML = `
    <span class="badge ${grup==='A'?'groupA':'groupB'}" style="margin-bottom:8px;display:inline-block;">Grup ${grup} · ${anggota.length} orang</span>
    ${anggota.length
      ? `<ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.7;">${anggota.map(k=>`<li>${namaTeks(k)}</li>`).join('')}</ul>`
      : `<div style="font-size:12.5px;color:var(--text-dim);">Belum ada anggota.</div>`}`;
}
document.getElementById('ringkasanGrupPilih').addEventListener('change', renderRingkasanGrupAB);

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
        ${isViewOnly() ? '' : `
        <button class="btn ghost sm" onclick="editKrama('${k.id}')">Ubah</button>
        <button class="btn danger sm" onclick="hapusKrama('${k.id}')">Hapus</button>`}
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
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty"><div class="big">Belum ada krama</div>Tambahkan krama terlebih dahulu di tab Data Krama.</div></td></tr>`;
    document.getElementById('totalDenda').textContent = rupiah(0);
    return;
  }
  tbody.innerHTML = krama.map((k,i)=>{
    const otomatis = dendaOtomatis(k.id);
    const total = totalDendaKrama(k);
    return `
    <tr>
      <td>${i+1}</td>
      <td>${namaTampil(k)}</td>
      <td>${badgeStatus(k.status)}</td>
      <td>${isViewOnly()
        ? rupiah(k.denda_manual||0)
        : `<input type="number" min="0" value="${k.denda_manual||0}" onchange="updateDenda('${k.id}', this.value)">`}</td>
      <td>${rupiah(otomatis)} <span style="color:var(--text-dim);font-size:11px;">(${jumlahTidakHadir(k.id)}x absen)</span></td>
      <td><strong>${rupiah(total)}</strong></td>
    </tr>`;
  }).join('');
  const total = krama.reduce((s,k)=>s+totalDendaKrama(k),0);
  document.getElementById('totalDenda').textContent = rupiah(total);
}
window.updateDenda = async function(id, val){
  const {error} = await sb.from('krama').update({denda_manual: Number(val)||0}).eq('id', id);
  if(error){ alert('Gagal menyimpan denda: '+error.message); return; }
  await loadAll();
};

/* ---------- TUGAS KELOMPOK NGAYAH 1-8 (eksklusif: 1 krama = 1 kelompok) ---------- */
function renderKelompok(){
  const grid = document.getElementById('kelompokGrid');
  if(isViewOnly()){
    grid.innerHTML = kelompok.map(kel=>{
      const anggota = kel.anggota.map(id=>{
        const k = krama.find(x=>x.id===id);
        return k ? namaTeks(k) : null;
      }).filter(Boolean);
      return `
        <div class="kelompok-card">
          <div class="kno"><span class="num">${kel.no}</span> Kelompok ${kel.no}</div>
          ${anggota.length
            ? `<ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.7;">${anggota.map(n=>`<li>${n}</li>`).join('')}</ul>`
            : `<div style="font-size:12.5px;color:var(--text-dim);">Belum ada anggota.</div>`}
        </div>`;
    }).join('');
    return;
  }
  grid.innerHTML = kelompok.map((kel)=>{
    // hanya tampilkan krama yang belum masuk kelompok manapun, atau sudah masuk KELOMPOK INI
    const tersedia = krama.filter(k => !k.kelompok_no || k.kelompok_no === kel.no);
    const anggotaOptions = tersedia.map(k=>{
      const checked = k.kelompok_no === kel.no ? 'checked' : '';
      return `<label class="anggota-item"><input type="checkbox" ${checked} onchange="toggleAnggota(${kel.no}, '${k.id}', this.checked)"> ${namaTeks(k)}</label>`;
    }).join('') || `<div style="font-size:12.5px;color:var(--text-dim);padding:6px;">Semua krama sudah masuk kelompok lain.</div>`;
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
  const {error} = await sb.from('krama').update({kelompok_no: checked ? kelompokNo : null}).eq('id', kramaId);
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
      <td>${isViewOnly() ? '' : `<button class="btn danger sm" onclick="hapusTugasLog('${t.id}')">Hapus</button>`}</td>
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
        ${isViewOnly()
          ? (g ? `<span class="badge ${g==='A'?'groupA':'groupB'}">Grup ${g}</span>` : `<span style="color:var(--text-dim);font-size:12px;">Belum ditentukan</span>`)
          : `<div class="toggleAB">
          <button class="sel-a ${g==='A'?'on':''}" onclick="setGrup('${k.id}','A')">A</button>
          <button class="sel-b ${g==='B'?'on':''}" onclick="setGrup('${k.id}','B')">B</button>
        </div>`}
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

/* ---------- ABSENSI PEGEBAGAN ---------- */
function renderAbsensiForm(){
  if(!document.getElementById('absensiTanggal').value) document.getElementById('absensiTanggal').value = todayStr();
  const wrap = document.getElementById('absensiChecklist');
  const anggotaGrup = krama.filter(k => grupab[k.id] === 'A' || grupab[k.id] === 'B');
  if(anggotaGrup.length===0){
    wrap.innerHTML = `<div style="font-size:12.5px;color:var(--text-dim);padding:6px;">Belum ada krama yang masuk Grup A/B. Atur dulu di tab Pegebagan Grup A/B.</div>`;
    return;
  }
  wrap.innerHTML = anggotaGrup.map(k=>`
    <label class="anggota-item">
      <input type="checkbox" data-krama-id="${k.id}" class="absen-tidak-hadir">
      Tidak Hadir — ${namaTeks(k)} <span class="badge ${grupab[k.id]==='A'?'groupA':'groupB'}" style="margin-left:6px;">Grup ${grupab[k.id]}</span>
    </label>`).join('');
}
document.getElementById('absensiSaveBtn').addEventListener('click', async ()=>{
  const tanggal = document.getElementById('absensiTanggal').value || todayStr();
  const keterangan = document.getElementById('absensiKeterangan').value.trim();
  const checkboxes = document.querySelectorAll('.absen-tidak-hadir');
  if(checkboxes.length===0){ alert('Belum ada krama di Grup A/B untuk diabsen.'); return; }

  const { data: sesi, error: e1 } = await sb.from('pegebagan_sesi').insert({tanggal, keterangan}).select().single();
  if(e1){ alert('Gagal menyimpan sesi: '+e1.message); return; }

  const rows = Array.from(checkboxes).map(cb=>({
    sesi_id: sesi.id,
    krama_id: cb.dataset.kramaId,
    hadir: !cb.checked
  }));
  const { error: e2 } = await sb.from('pegebagan_absensi').insert(rows);
  if(e2){ alert('Gagal menyimpan absensi: '+e2.message); return; }

  document.getElementById('absensiKeterangan').value='';
  await loadAll();
});
function renderAbsensiLog(){
  const tbody = document.getElementById('absensiLogBody');
  if(sesiPegebagan.length===0){
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty"><div class="big">Belum ada absensi tercatat</div>Catat sesi pegebagan pertama melalui formulir di atas.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = sesiPegebagan.map(s=>{
    const rows = absensiPegebagan.filter(a=>a.sesi_id===s.id);
    const hadir = rows.filter(a=>a.hadir).length;
    const tidakHadir = rows.filter(a=>!a.hadir).length;
    return `
      <tr>
        <td>${s.tanggal}</td>
        <td>${s.keterangan || '—'}</td>
        <td>${hadir}</td>
        <td>${tidakHadir > 0 ? `<strong>${tidakHadir}</strong> <span style="color:var(--text-dim);font-size:11px;">(${rupiah(tidakHadir*DENDA_PER_ABSEN)})</span>` : '0'}</td>
        <td>${isViewOnly() ? '' : `<button class="btn danger sm" onclick="hapusSesiAbsensi('${s.id}')">Hapus</button>`}</td>
      </tr>`;
  }).join('');
}
window.hapusSesiAbsensi = async function(id){
  if(!confirm('Hapus sesi absensi ini? Denda otomatis yang terkait juga akan hilang.')) return;
  const {error} = await sb.from('pegebagan_sesi').delete().eq('id', id);
  if(error){ alert('Gagal menghapus: '+error.message); return; }
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
          ${isViewOnly() ? '' : `
          ${p.status!=='Lunas' ? `<button class="btn gold sm" onclick="bukaBayar('${p.id}')">Bayar</button>` : ''}
          <button class="btn danger sm" onclick="hapusPinjaman('${p.id}')">Hapus</button>`}
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
    'Kelompok Ngayah': k.kelompok_no || '-',
    'Denda Manual (Rp)': Number(k.denda_manual)||0,
    'Denda Ketidakhadiran (Rp)': dendaOtomatis(k.id),
    'Total Denda (Rp)': totalDendaKrama(k)
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

  const absensiRows = [];
  sesiPegebagan.forEach(s=>{
    absensiPegebagan.filter(a=>a.sesi_id===s.id).forEach(a=>{
      absensiRows.push({
        'Tanggal': s.tanggal, 'Keterangan': s.keterangan || '-',
        'Krama': namaKrama(a.krama_id), 'Kehadiran': a.hadir ? 'Hadir' : 'Tidak Hadir',
        'Denda (Rp)': a.hadir ? 0 : DENDA_PER_ABSEN
      });
    });
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(absensiRows.length?absensiRows:[{'Tanggal':'','Keterangan':'(belum ada data)'}]), 'Absensi Pegebagan');

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

/* ---------- KELOLA PENGGUNA (admin & kelian tempekan) ---------- */
let daftarPengurus = [];
async function loadPengurus(){
  if(!currentUser || !(currentUser.role==='admin' || currentUser.role==='kelian')) return;
  try{
    const { data, error } = await sb.rpc('list_pengurus', { p_admin_username: currentUser.username, p_admin_password: currentUser.password });
    if(error) throw error;
    daftarPengurus = data || [];
    renderPengurus();
  }catch(err){
    console.error(err);
    document.getElementById('penggunaTableBody').innerHTML = `<tr><td colspan="4"><div class="empty"><div class="big">Gagal memuat</div>${err.message||err}</div></td></tr>`;
  }
}
function renderPengurus(){
  const tbody = document.getElementById('penggunaTableBody');
  if(!tbody) return;
  if(daftarPengurus.length===0){
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty"><div class="big">Belum ada akun</div>Tambahkan akun pengurus melalui formulir di atas.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = daftarPengurus.map(p=>`
    <tr>
      <td>${p.username}</td>
      <td>${p.nama||'—'}</td>
      <td><span class="badge ${p.role==='kelian'?'groupA':'aktif'}">${labelRole(p.role)}</span></td>
      <td style="white-space:nowrap;">
        <button class="btn ghost sm" onclick="editPengurus('${p.username}')">Ubah</button>
        <button class="btn danger sm" onclick="hapusPengurusUI('${p.username}')">Hapus</button>
      </td>
    </tr>`).join('');
}
window.editPengurus = function(username){
  const p = daftarPengurus.find(x=>x.username===username); if(!p) return;
  document.getElementById('penggunaUsername').value = p.username;
  document.getElementById('penggunaUsername').disabled = true;
  document.getElementById('penggunaNama').value = p.nama||'';
  document.getElementById('penggunaRole').value = p.role;
  document.getElementById('penggunaPassword').value = '';
  document.getElementById('penggunaPassword').placeholder = 'Kosongkan kalau tidak ingin ganti password';
  window.scrollTo({top:0,behavior:'smooth'});
};
document.getElementById('penggunaCancelBtn').addEventListener('click', resetPenggunaForm);
function resetPenggunaForm(){
  document.getElementById('penggunaUsername').value='';
  document.getElementById('penggunaUsername').disabled = false;
  document.getElementById('penggunaNama').value='';
  document.getElementById('penggunaRole').value='pengurus';
  document.getElementById('penggunaPassword').value='';
  document.getElementById('penggunaPassword').placeholder = 'Kosongkan kalau tidak diubah (saat edit)';
}
document.getElementById('penggunaSaveBtn').addEventListener('click', async ()=>{
  const username = document.getElementById('penggunaUsername').value.trim().toLowerCase();
  const nama = document.getElementById('penggunaNama').value.trim();
  const role = document.getElementById('penggunaRole').value;
  const password = document.getElementById('penggunaPassword').value;
  if(!username){ alert('Username wajib diisi.'); return; }
  try{
    const { error } = await sb.rpc('simpan_pengurus', {
      p_admin_username: currentUser.username, p_admin_password: currentUser.password,
      p_target_username: username, p_target_password: password || null,
      p_target_nama: nama || null, p_target_role: role
    });
    if(error) throw error;
    resetPenggunaForm();
    await loadPengurus();
  }catch(err){
    alert('Gagal menyimpan akun: ' + (err.message||err));
  }
});
window.hapusPengurusUI = async function(username){
  if(!confirm(`Hapus akun "${username}"? Aksi ini tidak bisa dibatalkan.`)) return;
  try{
    const { error } = await sb.rpc('hapus_pengurus', {
      p_admin_username: currentUser.username, p_admin_password: currentUser.password,
      p_target_username: username
    });
    if(error) throw error;
    await loadPengurus();
  }catch(err){
    alert('Gagal menghapus akun: ' + (err.message||err));
  }
};

/* ---------- LOGIN / LOGOUT ---------- */
document.getElementById('loginBtn').addEventListener('click', doLogin);
document.getElementById('loginPassword').addEventListener('keydown', (e)=>{ if(e.key==='Enter') doLogin(); });
document.getElementById('loginUsername').addEventListener('keydown', (e)=>{ if(e.key==='Enter') doLogin(); });

async function doLogin(){
  const username = document.getElementById('loginUsername').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.style.display='none';
  if(!username || !password){ errEl.textContent='Isi username dan password.'; errEl.style.display='block'; return; }
  if(SUPABASE_URL.startsWith('ISI_') || SUPABASE_ANON_KEY.startsWith('ISI_')){
    errEl.textContent='Konfigurasi Supabase belum diisi di app.js.'; errEl.style.display='block'; return;
  }
  const loginBtn = document.getElementById('loginBtn');
  loginBtn.disabled = true; loginBtn.textContent = 'Memeriksa...';
  try{
    const { data, error } = await sb.rpc('login_pengurus', { p_username: username, p_password: password });
    if(error) throw error;
    const hasil = Array.isArray(data) ? data[0] : data;
    if(!hasil || !hasil.ok){
      errEl.textContent = 'Username atau password salah.'; errEl.style.display='block';
      return;
    }
    currentUser = { username: hasil.username, password, role: hasil.role, nama: hasil.nama || hasil.username };
    document.getElementById('loginOverlay').classList.add('hidden');
    document.getElementById('appRoot').style.display = '';
    document.getElementById('loginPassword').value = '';
    const badge = document.getElementById('userBadge');
    badge.style.display = '';
    badge.textContent = `${currentUser.nama} · ${labelRole(currentUser.role)}`;
    document.getElementById('logoutBtn').style.display = '';
    document.getElementById('navPengguna').style.display = (currentUser.role==='admin'||currentUser.role==='kelian') ? '' : 'none';
    document.body.classList.toggle('krama-mode', currentUser.role==='krama');
    await loadAll();
    await loadPengurus();
  }catch(err){
    console.error(err);
    errEl.textContent = 'Gagal terhubung: ' + (err.message||err); errEl.style.display='block';
  }finally{
    loginBtn.disabled = false; loginBtn.textContent = 'Masuk';
  }
}
function labelRole(r){
  if(r==='admin') return 'Admin';
  if(r==='kelian') return 'Kelian Tempekan';
  if(r==='krama') return 'Krama (Lihat Saja)';
  return 'Pengurus';
}
function isViewOnly(){
  return !!(currentUser && currentUser.role === 'krama');
}
document.getElementById('logoutBtn').addEventListener('click', ()=>{
  currentUser = null;
  location.reload();
});

