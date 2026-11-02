import { firebaseConfig } from './firebase-config.js';
const CONFIGURED = !!(firebaseConfig && firebaseConfig.apiKey && !String(firebaseConfig.apiKey).startsWith('YOUR_'));
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LV = { high: 'เสี่ยงสูง', medium: 'เสี่ยงปานกลาง', low: 'เสี่ยงต่ำ' };
const ACTIONS = {
  high: ['ประสาน อสม. ประจำคุ้มบ้านเยี่ยมบ้านก่อนวันนัด', 'โทรประสานญาติหรือผู้ดูแลเพื่อยืนยันการมา', 'ประสานรถรับส่งในชุมชน หากเดินทางลำบาก'],
  medium: ['โทรติดตามผู้ดูแลล่วงหน้า 2–3 วัน', 'ประเมินความพร้อมและยืนยันการเดินทาง'],
  low: ['ส่ง SMS แจ้งเตือนอัตโนมัติก่อนวันนัด'],
};
const DEF_CUT = { low: 8, high: 30 };

// ================= ชั้นข้อมูล: Firebase หรือโหมดสาธิต =================
async function makeFirebase() {
  const base = 'https://www.gstatic.com/firebasejs/10.14.1/';
  const [{ initializeApp }, A, F] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]);
  const app = initializeApp(firebaseConfig), auth = A.getAuth(app), fs = F.getFirestore(app);
  const ref = (c, id) => F.doc(fs, c, id);
  const batched = async (items, fn) => { for (let i = 0; i < items.length; i += 400) { const b = F.writeBatch(fs); items.slice(i, i + 400).forEach(x => fn(b, x)); await b.commit(); } };
  return {
    demo: false,
    onUser(cb) {
      return A.onAuthStateChanged(auth, async u => {
        if (!u) return cb(null);
        try { const s = await F.getDoc(ref('users', u.uid)); cb({ uid: u.uid, email: u.email, role: s.exists() ? s.data().role : null }); }
        catch (e) { cb({ uid: u.uid, email: u.email, role: null }); }
      });
    },
    login: (e, p) => A.signInWithEmailAndPassword(auth, e, p),
    logout: () => A.signOut(auth),
    subAppts: cb => F.onSnapshot(F.collection(fs, 'appointments'), s => cb(s.docs.map(d => ({ _id: d.id, ...d.data() }))), () => cb([])),
    subSettings: cb => F.onSnapshot(F.collection(fs, 'settings'), s => { const o = {}; s.docs.forEach(d => o[d.id] = d.data()); cb(o); }, () => cb({})),
    setOutcome: (id, v, by) => F.updateDoc(ref('appointments', id), { outcome: v, updatedBy: by, updatedAt: F.serverTimestamp() }),
    setDone: (id, i, v, by) => F.updateDoc(ref('appointments', id), { ['done.' + i]: v, updatedBy: by, updatedAt: F.serverTimestamp() }),
    addAppts: list => batched(list, (b, a) => { const { _id, ...d } = a; b.set(ref('appointments', _id), { ...d, outcome: null, done: {}, createdAt: F.serverTimestamp() }); }),
    clearAppts: ids => batched(ids, (b, id) => b.delete(ref('appointments', id))),
    setSetting: (name, data) => F.setDoc(ref('settings', name), data),
  };
}
function makeDemo() {
  let appts = [], settings = {}, user = null; const subsA = [], subsS = [], subsU = [];
  const emitA = () => subsA.forEach(f => f(appts.map(a => ({ ...a })))), emitS = () => subsS.forEach(f => f({ ...settings })), emitU = () => subsU.forEach(f => f(user));
  return {
    demo: true,
    onUser(cb) { subsU.push(cb); cb(user); return () => {}; },
    async login(e) { user = { uid: 'demo-' + e, email: e, role: /^admin/i.test(e) ? 'admin' : 'staff' }; emitU(); },
    async logout() { user = null; emitU(); },
    subAppts(cb) { subsA.push(cb); cb(appts); return () => {}; }, subSettings(cb) { subsS.push(cb); cb(settings); return () => {}; },
    async setOutcome(id, v) { appts.find(a => a._id === id).outcome = v; emitA(); },
    async setDone(id, i, v) { const a = appts.find(x => x._id === id); a.done = { ...a.done, [i]: v }; emitA(); },
    async addAppts(l) { l.forEach(a => appts.push({ ...a, outcome: null, done: {} })); emitA(); },
    async clearAppts(ids) { appts = appts.filter(a => !ids.includes(a._id)); emitA(); },
    async setSetting(n, d) { settings[n] = d; emitS(); },
  };
}

// ================= สถานะ =================
let DB, me = null, appts = [], settings = {}, tab = 'q', filterLevel = null, filterDate = '', sel = null, clearArmed = false, authMsg = '';
const cut = () => ({ ...DEF_CUT, ...(settings.config || {}) });
const score = a => Math.round(a.p * 100);
const lvl = a => { const v = score(a), c = cut(); return v >= c.high ? 'high' : v >= c.low ? 'medium' : 'low'; };
const fmtDay = s => new Date(s + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
const isAdmin = () => me && me.role === 'admin';
const PROCS = ['ขูดหินปูน', 'ถอนฟัน', 'อุดฟัน', 'ฟันเทียม', 'รักษาปริทันต์'];

// ================= หน้าจอ =================
function renderShell() {
  const root = $('#app');
  if (!me) {
    root.innerHTML = `<div class="login"><div><h1>Smart Dental Alert</h1></div>
      ${DB.demo ? '<p class="banner">โหมดสาธิต</p>' : ''}
      <div class="card"><div class="form" style="grid-template-columns:1fr"><label>อีเมล<input type="text" id="lg-email" autocomplete="username" inputmode="email"></label>
      <label>รหัสผ่าน<input type="password" id="lg-pw" autocomplete="current-password"></label></div>
      <div class="btns"><button class="btn" id="lg-go">เข้าสู่ระบบ</button></div>${authMsg ? `<p class="msg err" role="alert">${esc(authMsg)}</p>` : ''}</div>
      </div>`;
    const go = async () => { authMsg = ''; try { await DB.login($('#lg-email').value.trim(), $('#lg-pw').value); } catch (e) { authMsg = /invalid|wrong|user-not-found|credential/i.test(e.code + e.message) ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : 'เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง'; renderShell(); } };
    $('#lg-go').onclick = go; $('#lg-pw').onkeydown = e => { if (e.key === 'Enter') go(); };
    return;
  }
  if (!me.role) {
    root.innerHTML = `<div class="login"><h1>บัญชียังไม่ได้รับสิทธิ์</h1><p class="note">ติดต่อแอดมินเพื่อขอสิทธิ์</p>
      <div class="card"><p class="sec">UID</p><p class="mono">${esc(me.uid)}</p><p class="note">${esc(me.email)}</p></div><div class="btns"><button class="btn sec2" id="lo">ออกจากระบบ</button></div></div>`;
    $('#lo').onclick = () => DB.logout(); return;
  }
  const tabs = isAdmin() ? [['q', 'คิวนัดหมาย'], ['i', 'นำเข้านัดหมาย'], ['m', 'จุดตัดและโมเดล']] : [['q', 'คิวนัดหมาย']];
  if (!tabs.some(t => t[0] === tab)) tab = 'q';
  root.innerHTML = `<header><div><h1>ระบบเตือนนัดทันตกรรม ผู้สูงอายุ</h1><p class="sub">${esc((settings.facility && settings.facility.name) || 'รพ.สต.')}</p></div>
    <div class="userbar">${DB.demo ? '<span class="badge">โหมดสาธิต</span>' : ''}<span>${esc(me.email)}</span><span class="tag">${isAdmin() ? 'แอดมิน' : 'เจ้าหน้าที่'}</span><button class="btn sec2 sm" id="lo">ออกจากระบบ</button></div></header>
    <nav class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-t="${k}" aria-selected="${tab === k}">${l}</button>`).join('')}</nav>
    <section id="v-q" ${tab === 'q' ? '' : 'hidden'} style="display:flex;flex-direction:column;gap:18px"></section>
    <section id="v-i" ${tab === 'i' ? '' : 'hidden'}></section><section id="v-m" ${tab === 'm' ? '' : 'hidden'}></section>
    `;
  $('#lo').onclick = () => DB.logout();
  document.querySelectorAll('nav.tabs button').forEach(b => b.onclick = () => { tab = b.dataset.t; renderShell(); renderTab(); });
  renderTab();
}
function renderTab() { if (!me || !me.role) return; if (tab === 'q') renderQueueView(); if (tab === 'i') renderImport(); if (tab === 'm') renderAdminTab(); }

// ---------- คิวนัด ----------
const dates = () => [...new Set(appts.map(a => a.date))].sort();
function defaultDate() { const d = dates(), today = new Date().toISOString().slice(0, 10); return d.find(x => x >= today) || d[d.length - 1] || ''; }
function renderQueueView() {
  const v = $('#v-q'); if (!v) return;
  if (!appts.length) { v.innerHTML = `<div class="card"><h2>ยังไม่มีนัดในระบบ</h2><p class="note">${isAdmin() ? 'นำเข้าที่แท็บ "นำเข้านัดหมาย"' : ''}</p></div>`; return; }
  if (filterDate !== 'all' && !dates().includes(filterDate)) filterDate = defaultDate();
  const inDay = appts.filter(a => filterDate === 'all' || a.date === filterDate), c = { high: 0, medium: 0, low: 0 }; inDay.forEach(a => c[lvl(a)]++);
  v.innerHTML = `<div class="form" style="grid-template-columns:minmax(0,320px);margin:0"><label>วันที่นัด<select id="q-date"><option value="all">ทุกวัน</option>${dates().map(d => `<option value="${d}">${fmtDay(d)}</option>`).join('')}</select></label></div>
    <div class="sum" id="sum"></div><div class="main"><div id="queue"></div><aside class="panel" id="panel" aria-live="polite"></aside></div>`;
  $('#q-date').value = filterDate; $('#q-date').onchange = e => { filterDate = e.target.value; renderQueueView(); };
  $('#sum').innerHTML = `<button data-f="" aria-pressed="${filterLevel === null}"><span class="n">${inDay.length}</span><span class="l">นัดทั้งหมด</span></button>` +
    ['high', 'medium', 'low'].map(l => `<button class="${l}" data-f="${l}" aria-pressed="${filterLevel === l}"><span class="n">${c[l]}</span><span class="l"><i class="dot"></i>${LV[l]}</span></button>`).join('');
  document.querySelectorAll('#sum button').forEach(b => b.onclick = () => { filterLevel = b.dataset.f || null; renderQueueView(); });
  const rows = inDay.filter(a => !filterLevel || lvl(a) === filterLevel).sort((a, b) => a.date.localeCompare(b.date) || a.period.localeCompare(b.period) || b.p - a.p);
  const days = {}; rows.forEach(a => (days[a.date] = days[a.date] || []).push(a));
  $('#queue').innerHTML = Object.keys(days).map(d => `<div class="day"><h3>${fmtDay(d)}</h3><div class="list">` + days[d].map(a => `<button class="row ${lvl(a)}" data-k="${esc(a._id)}" aria-current="${sel === a._id}">
    <span class="t">${a.period === 'morning' ? 'เช้า' : 'บ่าย'}</span><span><span class="id">${esc(a.id)}</span> <span class="meta">${esc(a.age)} ปี · ${esc(a.proc)}</span></span>
    <span><span class="pill"><i class="dot"></i>${LV[lvl(a)]} <b>${score(a)}</b></span>${a.outcome ? `<span class="done-mark" ${a.outcome === 'noshow' ? 'style="color:var(--hi)"' : ''}>${a.outcome === 'came' ? 'มาตามนัด' : 'ขาดนัด'}</span>` : ''}</span></button>`).join('') + '</div></div>').join('') || '<p class="note">ไม่มีนัดในกลุ่มนี้</p>';
  document.querySelectorAll('.row').forEach(r => r.onclick = () => { sel = r.dataset.k; renderQueueView(); });
  renderPanel();
}
function renderPanel() {
  const P = $('#panel'); if (!P) return; const a = appts.find(x => x._id === sel);
  if (!a) { P.className = 'panel'; P.innerHTML = '<h2>เลือกผู้ป่วยจากคิวนัด</h2>'; return; }
  const L = lvl(a), c = cut(), done = a.done || {}; P.className = 'panel ' + L;
  P.innerHTML = `<div><h2><span class="mono">${esc(a.id)}</span> <span class="pill" style="margin-left:6px"><i class="dot"></i>${LV[L]}</span></h2>
    <p class="note">${fmtDay(a.date)} · ${a.period === 'morning' ? 'ช่วงเช้า' : 'ช่วงบ่าย'} · ${esc(a.proc)}</p></div>
    <div><p class="sec">คะแนนความเสี่ยง</p><div class="gauge"><i style="width:${Math.min(100, score(a) * 1.6)}%"></i></div><p class="note" style="margin-top:4px">${score(a)} / 100 · สูง ≥ ${c.high} · ต่ำ &lt; ${c.low}</p></div>
    <dl class="kv"><div><dt>อายุ / เพศ</dt><dd>${esc(a.age)} ปี · ${a.sex === 'F' ? 'หญิง' : 'ชาย'}</dd></div></dl>
    <div><p class="sec">มาตรการที่แนะนำ</p>${ACTIONS[L].map((t, i) => `<div class="act"><input type="checkbox" id="a${i}" data-i="${i}" ${done[i] ? 'checked' : ''}><label for="a${i}">${t}</label></div>`).join('')}</div>
    <div><p class="sec">ผลการมารับบริการ</p><div class="outc"><button data-o="came" aria-pressed="${a.outcome === 'came'}">มาตามนัด</button><button data-o="noshow" aria-pressed="${a.outcome === 'noshow'}">ขาดนัด</button></div></div>
    <p id="p-err"></p>`;
  const fail = () => { $('#p-err').innerHTML = '<p class="msg err" role="alert">บันทึกไม่สำเร็จ ตรวจสิทธิ์หรืออินเทอร์เน็ตแล้วลองใหม่</p>'; };
  P.querySelectorAll('input[type=checkbox]').forEach(x => x.onchange = () => DB.setDone(a._id, x.dataset.i, x.checked, me.email).catch(fail));
  P.querySelectorAll('.outc button').forEach(b => b.onclick = () => DB.setOutcome(a._id, a.outcome === b.dataset.o ? null : b.dataset.o, me.email).catch(fail));
}

// ---------- นำเข้า (แอดมิน) ----------
const ID_RE = /^P?\d{3,6}$/i, DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function mkAppt(r) {
  const id = String(r.id || '').trim(), date = String(r.date || '').trim();
  if (!ID_RE.test(id)) return 'รหัสผู้ป่วยต้องเป็นรหัสวิจัย เช่น P0123 (ไม่รับชื่อหรือเลขบัตร)';
  if (!DATE_RE.test(date) || isNaN(new Date(date))) return 'วันที่ต้องอยู่ในรูปแบบ ปปปป-ดด-วว (ค.ศ.)';
  const sc = Number(r.score); if (!(sc >= 0 && sc <= 100) || r.score === '') return 'คะแนนความเสี่ยงต้องอยู่ระหว่าง 0–100';
  if (!['morning', 'afternoon'].includes(r.period)) return 'ช่วงเวลาต้องเป็น morning หรือ afternoon';
  const age = Math.round(Number(r.age)); if (!(age >= 60 && age <= 110)) return 'อายุต้องอยู่ระหว่าง 60–110 ปี';
  const sex = String(r.sex).toUpperCase(); if (!['F', 'M'].includes(sex)) return 'เพศต้องเป็น F หรือ M';
  const proc = String(r.proc || '').trim(); if (!proc || proc.length > 30) return 'ต้องระบุหัตถการ (ไม่เกิน 30 ตัวอักษร)';
  const idn = id.toUpperCase().startsWith('P') ? id.toUpperCase() : 'P' + id.padStart(4, '0');
  return { _id: idn + '_' + date, id: idn, date, period: r.period, age, sex, proc, p: Math.round(sc) / 100 };
}
function parseCSV(t) {
  const lines = t.replace(/^﻿/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean); if (lines.length < 2) return { err: 'ไม่พบข้อมูล ต้องมีบรรทัดหัวตารางและอย่างน้อย 1 แถว' };
  const h = lines[0].split(',').map(x => x.trim().toLowerCase()), need = ['patient_id', 'appt_date', 'period', 'procedure', 'age', 'sex', 'risk_score'], miss = need.filter(n => !h.includes(n));
  if (miss.length) return { err: 'ขาดคอลัมน์: ' + miss.join(', ') };
  return { rows: lines.slice(1).map(l => { const c = l.split(',').map(x => x.trim()), g = n => c[h.indexOf(n)]; return { id: g('patient_id'), date: g('appt_date'), period: g('period'), proc: g('procedure'), age: g('age'), sex: g('sex'), score: g('risk_score') }; }) };
}
const msg = (el, html, cls) => { const e = $(el); if (e) e.innerHTML = `<p class="msg ${cls}" role="status">${html}</p>`; };
async function importList(list, el) {
  const have = new Set(appts.map(a => a._id)), bad = []; let ok = []; const seen = new Set();
  list.forEach((r, i) => { const a = typeof r === 'string' ? r : mkAppt(r); if (typeof a === 'string') bad.push(`แถว ${i + 2}: ${a}`); else if (have.has(a._id) || seen.has(a._id)) bad.push(`แถว ${i + 2}: มีนัดของรหัสนี้ในวันเดียวกันแล้ว`); else { seen.add(a._id); ok.push(a); } });
  try { if (ok.length) await DB.addAppts(ok); } catch (e) { return msg(el, 'บันทึกไม่สำเร็จ ตรวจสิทธิ์แอดมินและอินเทอร์เน็ต', 'err'); }
  msg(el, `นำเข้าสำเร็จ ${ok.length} แถว${bad.length ? ` · ข้าม ${bad.length} แถว<br>` + bad.slice(0, 5).map(esc).join('<br>') + (bad.length > 5 ? '<br>…' : '') : ''}`, bad.length && !ok.length ? 'err' : 'ok');
}
function renderImport() {
  const v = $('#v-i'); if (!v) return;
  v.innerHTML = `<div class="grid2"><div class="card"><h2>เพิ่มนัดหมายทีละราย</h2><div class="form">
    <label>รหัสผู้ป่วย<input type="text" id="f-id" placeholder="P0123" autocomplete="off"></label><label>วันที่นัด<input type="date" id="f-date"></label>
    <label>ช่วงเวลา<select id="f-period"><option value="morning">เช้า</option><option value="afternoon">บ่าย</option></select></label>
    <label>หัตถการ<select id="f-proc">${PROCS.map(p => `<option>${p}</option>`).join('')}</select></label>
    <label>อายุ (ปี)<input type="number" id="f-age" min="60" max="110" value="70"></label><label>เพศ<select id="f-sex"><option value="F">หญิง</option><option value="M">ชาย</option></select></label>
    <label>คะแนนความเสี่ยง (0–100)<input type="number" id="f-score" min="0" max="100" value="20"></label></div>
    <div class="btns"><button class="btn" id="f-add">เพิ่มเข้าคิว</button></div><div id="f-msg"></div></div>
    <div class="card"><h2>นำเข้าหลายรายจากไฟล์ CSV</h2>
    
    <div class="form" style="grid-template-columns:1fr"><label>เลือกไฟล์ .csv<input type="file" id="c-file" accept=".csv,text/csv"></label><label>หรือวางข้อความ CSV<textarea id="c-text"></textarea></label></div>
    <div class="btns"><button class="btn" id="c-go">นำเข้า</button><button class="btn sec2" id="c-clear">${clearArmed ? 'กดอีกครั้งเพื่อยืนยันลบนัดทั้งหมด' : 'ลบนัดทั้งหมด'}</button></div><div id="c-msg"></div></div></div>`;
  $('#f-date').value = new Date().toISOString().slice(0, 10);
  $('#f-add').onclick = async () => {
    const r = mkAppt({ id: $('#f-id').value, date: $('#f-date').value, period: $('#f-period').value, proc: $('#f-proc').value, age: $('#f-age').value, sex: $('#f-sex').value, score: $('#f-score').value });
    if (typeof r === 'string') return msg('#f-msg', esc(r), 'err');
    if (appts.some(a => a._id === r._id)) return msg('#f-msg', 'มีนัดของรหัสนี้ในวันเดียวกันแล้ว', 'err');
    try { await DB.addAppts([r]); msg('#f-msg', `เพิ่ม ${esc(r.id)} เข้าคิวแล้ว`, 'ok'); $('#f-id').value = ''; } catch (e) { msg('#f-msg', 'บันทึกไม่สำเร็จ ตรวจสิทธิ์แอดมินและอินเทอร์เน็ต', 'err'); }
  };
  $('#c-file').onchange = e => { const f = e.target.files[0]; if (!f) return; const fr = new FileReader(); fr.onload = () => { $('#c-text').value = fr.result; }; fr.readAsText(f); };
  $('#c-go').onclick = () => { const p = parseCSV($('#c-text').value); if (p.err) return msg('#c-msg', esc(p.err), 'err'); importList(p.rows, '#c-msg'); };
  $('#c-clear').onclick = async () => {
    if (!clearArmed) { clearArmed = true; return renderImport(); }
    clearArmed = false; try { await DB.clearAppts(appts.map(a => a._id)); renderImport(); msg('#c-msg', 'ลบนัดทั้งหมดแล้ว', 'ok'); } catch (e) { renderImport(); msg('#c-msg', 'ลบไม่สำเร็จ ตรวจสิทธิ์แอดมิน', 'err'); }
  };
}

// ---------- จุดตัดและโมเดล (แอดมิน) ----------
function renderAdminTab() {
  const v = $('#v-m'); if (!v) return; const c = cut(), m = settings.model, cnt = { high: 0, medium: 0, low: 0 }; appts.forEach(a => cnt[lvl(a)]++);
  const o = { high: [0, 0], medium: [0, 0], low: [0, 0] }; appts.forEach(a => { if (a.outcome) { o[lvl(a)][0]++; if (a.outcome === 'noshow') o[lvl(a)][1]++; } });
  const tot = Object.values(o).reduce((s, x) => s + x[0], 0);
  v.innerHTML = `<div class="grid2"><div class="card"><h2>จุดตัดระดับความเสี่ยง</h2>
    <div class="cutrow"><label class="note">เสี่ยงสูงเริ่มที่คะแนน<input type="number" id="cut-high" min="1" max="100" value="${c.high}"></label><label class="note">เสี่ยงต่ำต่ำกว่าคะแนน<input type="number" id="cut-low" min="0" max="99" value="${c.low}"></label></div>
    <div class="btns"><button class="btn sm" id="cut-save">บันทึกจุดตัด</button>${m && m.cut ? '<button class="btn sec2 sm" id="cut-model">ใช้ค่าจากโมเดล</button>' : ''}</div><div id="cut-msg"></div>
    <div class="risk3" style="margin-top:10px">${['high', 'medium', 'low'].map(l => `<div class="${l}"><i class="dot"></i>${LV[l]} ${cnt[l]} นัด</div>`).join('')}</div></div>
    <div class="card"><h2>อัตราขาดนัดตามระดับเสี่ยง</h2><div class="risk3">${tot ? ['high', 'medium', 'low'].map(l => `<div class="${l}"><div style="display:flex;justify-content:space-between"><span><i class="dot"></i>${LV[l]} · บันทึกแล้ว ${o[l][0]}</span><b class="mono">${o[l][0] ? Math.round(o[l][1] / o[l][0] * 100) + '%' : '—'}</b></div></div>`).join('') : '<p class="note">ยังไม่มีการบันทึกผล</p>'}</div></div></div>
    <div class="grid2" style="margin-top:18px"><div class="card"><h2>ชื่อหน่วยบริการ</h2><div class="form" style="grid-template-columns:1fr"><label>ชื่อ<input type="text" id="fac" maxlength="60" value="${esc((settings.facility && settings.facility.name) || '')}"></label></div><div class="btns"><button class="btn sm" id="fac-save">บันทึก</button></div></div>
    <div class="card"><h2>ผลโมเดล</h2><div class="form" style="grid-template-columns:1fr"><label>เลือกไฟล์<input type="file" id="mdl-file" accept=".json,application/json"></label></div><div id="mdl-msg"></div></div></div>
    ${m ? modelHtml(m) : ''}`;
  const saveCut = async (low, high) => { if (!(high >= 1 && high <= 100 && low >= 0 && low < high)) return msg('#cut-msg', 'จุดตัดไม่ถูกต้อง ค่าต่ำต้องน้อยกว่าค่าสูง', 'err'); try { await DB.setSetting('config', { low, high }); msg('#cut-msg', 'บันทึกจุดตัดแล้ว', 'ok'); } catch (e) { msg('#cut-msg', 'บันทึกไม่สำเร็จ ตรวจสิทธิ์แอดมิน', 'err'); } };
  $('#cut-save').onclick = () => saveCut(Math.round(+$('#cut-low').value), Math.round(+$('#cut-high').value));
  if ($('#cut-model')) $('#cut-model').onclick = () => saveCut(m.cut.low, m.cut.high);
  $('#fac-save').onclick = () => DB.setSetting('facility', { name: $('#fac').value.trim().slice(0, 60) }).catch(() => {});
  $('#mdl-file').onchange = e => { const f = e.target.files[0]; if (!f) return; const fr = new FileReader(); fr.onload = async () => {
    try { const j = JSON.parse(fr.result), mm = j.models && (j.models['RF + SMOTE (ตามโครงร่าง)'] || Object.values(j.models)[0]); if (!mm || !j.importance) throw 0;
      await DB.setSetting('model', { metrics: { auc: mm.auc, pr_auc: mm.pr_auc, recall: mm.recall, precision: mm.precision, f1: mm.f1, accuracy: mm.accuracy }, n: j.n || {}, risk: j.risk_table || {},
        cut: j.risk_cutoffs ? { low: Math.round(j.risk_cutoffs.low_below * 100), high: Math.round(j.risk_cutoffs.high_from * 100) } : null,
        imp: j.importance.slice(0, 12).map(d => ({ f: d.feature, g: d.gini, pm: d.permutation_auc_drop, grp: d.andersen_group })) }); msg('#mdl-msg', 'อัปโหลดผลโมเดลแล้ว', 'ok'); }
    catch (err) { msg('#mdl-msg', 'ไฟล์ไม่ถูกต้อง ต้องเป็น results.json จาก train_model.py', 'err'); } }; fr.readAsText(f); };
}
const NM = { procedure: 'ประเภทหัตถการ', sex: 'เพศ', prior_noshows: 'จำนวนครั้งที่เคยขาดนัด', prior_noshow_rate: 'อัตราขาดนัดสะสม', marital: 'สถานภาพสมรส', period: 'ช่วงเวลานัด', age: 'อายุ', out_area: 'ที่พักนอกเขต', lead_days: 'นัดล่วงหน้า (วัน)', scheme: 'สิทธิการรักษา', dow: 'วันในสัปดาห์', chronic_disease: 'โรคเรื้อรัง' };
function modelHtml(m) {
  const p = x => (+x).toFixed(2), imp = [...(m.imp || [])].sort((a, b) => b.pm - a.pm).slice(0, 10), mp = Math.max(...imp.map(i => Math.max(i.pm, 0)), 1e-9), mg = Math.max(...imp.map(i => i.g), 1e-9);
  return `<div class="card" style="margin-top:18px"><h2>ประสิทธิภาพโมเดลบนชุดทดสอบ</h2><p class="note">ฝึก ${m.n.train ?? '-'} นัด · ทดสอบ ${m.n.test ?? '-'} นัด</p>
    <div class="mets">${[['AUC', m.metrics.auc], ['PR-AUC', m.metrics.pr_auc], ['Recall', m.metrics.recall], ['Precision', m.metrics.precision], ['F1', m.metrics.f1], ['Accuracy', m.metrics.accuracy]].map(([k, v]) => `<div><div class="v">${p(v)}</div><div class="k">${k}</div></div>`).join('')}</div>
    <h2 style="margin-top:18px">ความสำคัญของปัจจัยตามกรอบ Andersen</h2>
    ${imp.map(i => `<div class="bar"><span>${esc(NM[i.f] || i.f)}</span><div><div class="track"><div class="fill g-${esc(i.grp)}" style="width:${Math.max(0, i.pm) / mp * 100}%"></div></div><div class="track" style="margin-top:3px;height:8px;opacity:.55"><div class="fill g-${esc(i.grp)}" style="width:${i.g / mg * 100}%"></div></div></div><span class="num">${(+i.pm).toFixed(3)}</span></div>`).join('')}</div>`;
}

// ================= เริ่มทำงาน =================
(async () => {
  try { DB = CONFIGURED ? await makeFirebase() : makeDemo(); } catch (e) { $('#app').innerHTML = '<p class="msg err">โหลด Firebase ไม่สำเร็จ ตรวจอินเทอร์เน็ตและค่า config</p>'; return; }
  let unA = null, unS = null;
  DB.onUser(u => {
    me = u; if (unA) unA(), unA = null; if (unS) unS(), unS = null; appts = []; settings = {};
    renderShell();
    if (me && me.role) {
      unA = DB.subAppts(list => { appts = list || []; if (tab === 'q') renderQueueView(); if (tab === 'm') renderAdminTab(); });
      unS = DB.subSettings(s => { settings = s || {}; const keepTab = tab; renderShell(); tab = keepTab; });
    }
  });
})();
window.__app = { get appts() { return appts; } };
