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
const PROC_TH = { scaling: 'ขูดหินปูน', extraction: 'ถอนฟัน', filling: 'อุดฟัน', denture: 'ฟันเทียม' };
const MAR_TH = { single: 'โสด', married: 'สมรส', widowed: 'หม้าย', divorced: 'หย่าร้าง' };
const SCH_TH = { UC: 'บัตรทอง', civil: 'ข้าราชการ', social: 'ประกันสังคม' };
const DOW_TH = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
const GRP_TH = { Predisposing: 'ปัจจัยพื้นฐาน', Enabling: 'ปัจจัยเอื้ออำนวย', Need: 'ปัจจัยความจำเป็น' };
// กลุ่มตัวแปรสำหรับอธิบายเหตุผล (ตามภาคผนวก ก)
const FACTORS = [
  { k: 'prior', grp: 'Predisposing', label: 'ประวัติการขาดนัด', vars: ['prior_noshows', 'prior_noshow_rate'], txt: a => `เคยขาดนัด ${a.priorNs} จาก ${a.priorAp} ครั้ง` },
  { k: 'age', grp: 'Predisposing', label: 'อายุ', vars: ['age'], txt: a => `${a.age} ปี` },
  { k: 'sex', grp: 'Predisposing', label: 'เพศ', vars: ['sex'], txt: a => a.sex === 'F' ? 'หญิง' : 'ชาย' },
  { k: 'marital', grp: 'Predisposing', label: 'สถานภาพสมรส', vars: ['marital'], txt: a => MAR_TH[a.marital] },
  { k: 'scheme', grp: 'Enabling', label: 'สิทธิการรักษา', vars: ['scheme'], txt: a => SCH_TH[a.scheme] },
  { k: 'area', grp: 'Enabling', label: 'ที่พักอาศัย', vars: ['out_area'], txt: a => a.outArea ? 'นอกเขต รพ.สต.' : 'ในเขต รพ.สต.' },
  { k: 'lead', grp: 'Enabling', label: 'นัดล่วงหน้า', vars: ['lead_days'], txt: a => `${a.lead} วัน` },
  { k: 'dow', grp: 'Enabling', label: 'วันในสัปดาห์', vars: ['dow'], txt: a => 'วัน' + DOW_TH[a.dow] },
  { k: 'period', grp: 'Enabling', label: 'ช่วงเวลานัด', vars: ['period'], txt: a => a.period === 'morning' ? 'ช่วงเช้า' : 'ช่วงบ่าย' },
  { k: 'proc', grp: 'Need', label: 'หัตถการ', vars: ['procedure'], txt: a => PROC_TH[a.proc] },
  { k: 'chronic', grp: 'Need', label: 'โรคเรื้อรัง', vars: ['chronic_disease'], txt: a => a.chronic ? 'มีโรคประจำตัว' : 'ไม่มี' },
  { k: 'cont', grp: 'Need', label: 'ความต่อเนื่องของการรักษา', vars: ['continuing_care'], txt: a => a.cont ? 'นัดต่อเนื่องตามแผน' : 'ตรวจใหม่' },
];
const REASONS = { forgot: 'ลืมนัด', travel: 'เดินทางไม่สะดวก', no_escort: 'ไม่มีผู้พามา', sick: 'ป่วยหรือไม่สบาย', busy: 'ติดธุระหรือภาระงาน', afraid: 'กลัวหรือกังวลเรื่องการรักษา', other: 'อื่นๆ' };
let M = null;   // โมเดลที่โหลดจาก model.json
function featVec(a, over) {
  const raw = { age: a.age, sex: a.sex, marital: a.marital, prior_noshows: a.priorNs, prior_noshow_rate: a.priorAp ? a.priorNs / a.priorAp : 0, scheme: a.scheme, out_area: a.outArea,
    dow: a.dow, period: a.period, lead_days: a.lead, procedure: a.proc, chronic_disease: a.chronic, continuing_care: a.cont };
  Object.assign(raw, over || {});
  return M.features.map(c => { if (c in raw) return +raw[c]; const v = Object.keys(raw).filter(k => c.startsWith(k + '_')).sort((x, y) => y.length - x.length)[0]; return v && c === v + '_' + raw[v] ? 1 : 0; });
}
function predict(a, over) {
  const x = featVec(a, over); let sum = 0;
  for (const t of M.trees) { let i = 0; while (t.f[i] !== -1) i = x[t.f[i]] <= t.t[i] ? t.l[i] : t.r[i]; sum += t.v[i]; }
  return sum / M.trees.length;
}
function explain(a) {   // ผลต่างคะแนนเมื่อแทนค่าของปัจจัยนั้นด้วยค่าอ้างอิงของกลุ่มผู้ป่วย
  const p0 = predict(a);
  return FACTORS.map(f => { const over = {}; f.vars.forEach(v => over[v] = M.ref[v]); return { f, d: p0 - predict(a, over) }; }).sort((x, y) => y.d - x.d);
}

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
    setOutcome: (id, v, by) => F.updateDoc(ref('appointments', id), v === 'noshow' ? { outcome: v, updatedBy: by, updatedAt: F.serverTimestamp() } : { outcome: v, reason: null, reasonNote: null, updatedBy: by, updatedAt: F.serverTimestamp() }),
    setReason: (id, reason, note, by) => F.updateDoc(ref('appointments', id), { reason: reason || null, reasonNote: note || null, updatedBy: by, updatedAt: F.serverTimestamp() }),
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
    async setOutcome(id, v) { const a = appts.find(x => x._id === id); a.outcome = v; if (v !== 'noshow') { a.reason = null; a.reasonNote = null; } emitA(); },
    async setReason(id, r, n) { const a = appts.find(x => x._id === id); a.reason = r || null; a.reasonNote = n || null; emitA(); },
    async setDone(id, i, v) { const a = appts.find(x => x._id === id); a.done = { ...a.done, [i]: v }; emitA(); },
    async addAppts(l) { l.forEach(a => appts.push({ ...a, outcome: null, done: {} })); emitA(); },
    async clearAppts(ids) { appts = appts.filter(a => !ids.includes(a._id)); emitA(); },
    async setSetting(n, d) { settings[n] = d; emitS(); },
  };
}

// ================= สถานะ =================
let DB, me = null, appts = [], settings = {}, tab = 'd', filterLevel = null, filterDate = '', sel = null, clearArmed = false, authMsg = '';
const cut = () => ({ ...M.cutoffs, ...(settings.config || {}) });
const score = a => Math.round(a.p * 100);
const lvl = a => { const v = score(a), c = cut(); return v >= c.high ? 'high' : v >= c.low ? 'medium' : 'low'; };
const fmtDay = s => new Date(s + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
const isAdmin = () => me && me.role === 'admin';

// ================= หน้าจอ =================
function renderShell() {
  const root = $('#app');
  if (!me) {
    root.innerHTML = `<div class="login"><div class="brand"><img src="icons/logo.png" alt="Smart Dental Alert" width="180" height="180"><h1 class="sr">Smart Dental Alert</h1></div>
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
  const tabs = isAdmin() ? [['d', 'ภาพรวม'], ['q', 'คิวนัดหมาย'], ['a', 'เพิ่มนัด'], ['i', 'นำเข้า CSV'], ['m', 'จุดตัดและโมเดล']] : [['d', 'ภาพรวม'], ['q', 'คิวนัดหมาย'], ['a', 'เพิ่มนัด']];
  if (!tabs.some(t => t[0] === tab)) tab = 'q';
  root.innerHTML = `<header><div><h1>ระบบเตือนนัดทันตกรรม ผู้สูงอายุ</h1><p class="sub">${esc((settings.facility && settings.facility.name) || 'รพ.สต.')}</p></div>
    <div class="userbar">${DB.demo ? '<span class="badge">โหมดสาธิต</span>' : ''}<span>${esc(me.email)}</span><span class="tag">${isAdmin() ? 'แอดมิน' : 'เจ้าหน้าที่'}</span><button class="btn sec2 sm" id="lo">ออกจากระบบ</button></div></header>
    <nav class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-t="${k}" aria-selected="${tab === k}">${l}</button>`).join('')}</nav>
    <section id="v-d" ${tab === 'd' ? '' : 'hidden'} style="display:flex;flex-direction:column;gap:18px"></section>
    <section id="v-q" ${tab === 'q' ? '' : 'hidden'} style="display:flex;flex-direction:column;gap:18px"></section>
    <section id="v-a" ${tab === 'a' ? '' : 'hidden'}></section><section id="v-i" ${tab === 'i' ? '' : 'hidden'}></section><section id="v-m" ${tab === 'm' ? '' : 'hidden'}></section>
    `;
  $('#lo').onclick = () => DB.logout();
  document.querySelectorAll('nav.tabs button').forEach(b => b.onclick = () => { tab = b.dataset.t; renderShell(); renderTab(); });
  renderTab();
}
function renderTab() { if (!me || !me.role) return; if (tab === 'd') renderDash(); if (tab === 'q') renderQueueView(); if (tab === 'a') renderAdd(); if (tab === 'i') renderImport(); if (tab === 'm') renderAdminTab(); }

// ---------- ภาพรวม ----------
function renderDash() {
  const v = $('#v-d'); if (!v) return;
  if (!appts.length) { v.innerHTML = '<div class="card"><h2>ยังไม่มีนัดในระบบ</h2><p class="note">เพิ่มที่แท็บ "เพิ่มนัด"</p></div>'; return; }
  const n = appts.length, c = { high: 0, medium: 0, low: 0 }, byDay = {}, byProc = {}, fac = {};
  const rec = appts.filter(a => a.outcome), ns = rec.filter(a => a.outcome === 'noshow').length, pct = (x, t) => t ? Math.round(x / t * 100) : 0;
  appts.forEach(a => { const L = lvl(a); c[L]++; (byDay[a.date] = byDay[a.date] || { high: 0, medium: 0, low: 0 })[L]++;
    const p = (byProc[a.proc] = byProc[a.proc] || { n: 0, high: 0 }); p.n++; if (L === 'high') { p.high++; explain(a).filter(x => x.d > 0.005).slice(0, 3).forEach(x => { const o = (fac[x.f.k] = fac[x.f.k] || { f: x.f, n: 0 }); o.n++; }); } });
  const days = Object.keys(byDay).sort(), maxDay = Math.max(...days.map(d => byDay[d].high + byDay[d].medium + byDay[d].low));
  const facs = Object.values(fac).sort((a, b) => b.n - a.n).slice(0, 6), maxF = Math.max(1, ...facs.map(x => x.n));
  const kpi = (val, lab, col) => `<div><div class="v" ${col ? `style="color:var(${col})"` : ''}>${val}</div><div class="k">${lab}</div></div>`;
  const seg = (k, L) => k ? `<span style="width:${k / maxDay * 100}%;background:var(--${L === 'high' ? 'hi' : L === 'medium' ? 'mid' : 'lo'}-bg);color:var(--${L === 'high' ? 'hi' : L === 'medium' ? 'mid' : 'lo'});border-left:3px solid var(--${L === 'high' ? 'hi' : L === 'medium' ? 'mid' : 'lo'});display:flex;align-items:center;justify-content:center;font-weight:600;font-size:.8rem;min-width:22px">${k}</span>` : '';
  v.innerHTML = `<div class="mets" style="margin-top:0">${kpi(n, 'นัดทั้งหมด')}${kpi(c.high, `เสี่ยงสูง (${pct(c.high, n)}%)`, '--hi')}${kpi(c.medium, `เสี่ยงปานกลาง (${pct(c.medium, n)}%)`, '--mid')}${kpi(c.low, `เสี่ยงต่ำ (${pct(c.low, n)}%)`, '--lo')}${kpi(rec.length, 'บันทึกผลแล้ว')}${kpi(rec.length ? pct(ns, rec.length) + '%' : '—', 'ขาดนัดจริง')}</div>
    <div class="grid2"><div class="card"><h2>จำนวนนัดรายวัน</h2><div style="display:flex;flex-direction:column;gap:6px;margin-top:10px">${days.map(d => { const x = byDay[d]; return `<div style="display:grid;grid-template-columns:96px minmax(0,1fr);gap:10px;align-items:center;font-size:.85rem"><span class="note">${new Date(d + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })}</span><div style="display:flex;height:26px;gap:2px">${seg(x.high, 'high')}${seg(x.medium, 'medium')}${seg(x.low, 'low')}</div></div>`; }).join('')}</div></div>
    <div class="card"><h2>ปัจจัยที่พบบ่อยในกลุ่มเสี่ยงสูง</h2>${facs.length ? facs.map(x => `<div class="bar"><span>${x.f.label}<br><span class="note">${GRP_TH[x.f.grp]}</span></span><div class="track"><div class="fill g-${x.f.grp}" style="width:${x.n / maxF * 100}%"></div></div><span class="num">${x.n}</span></div>`).join('') : '<p class="note">ไม่มีนัดเสี่ยงสูง</p>'}
    ${(() => { const rc = {}; appts.filter(a => a.outcome === 'noshow' && a.reason).forEach(a => rc[a.reason] = (rc[a.reason] || 0) + 1); const e = Object.entries(rc).sort((x, y) => y[1] - x[1]), m = Math.max(1, ...e.map(x => x[1])); return e.length ? `<h2 style="margin-top:18px">สาเหตุที่ขาดนัด</h2>` + e.map(([k, n]) => `<div class="bar"><span>${REASONS[k]}</span><div class="track"><div class="fill" style="width:${n / m * 100}%;background:var(--accent)"></div></div><span class="num">${n}</span></div>`).join('') : ''; })()}
    <h2 style="margin-top:18px">สัดส่วนเสี่ยงสูงตามหัตถการ</h2>${Object.entries(byProc).map(([k, x]) => `<div class="bar"><span>${PROC_TH[k]}</span><div class="track"><div class="fill" style="width:${pct(x.high, x.n)}%;background:var(--hi)"></div></div><span class="num">${pct(x.high, x.n)}%</span></div>`).join('')}</div></div>`;
}

// ---------- ข้อความ LINE (จำลอง) ----------
const FAC = () => (settings.facility && settings.facility.name) || 'รพ.สต.';
const NAME = '‹ชื่อใน LINE›';   // ตอนส่งจริงดึงจาก LINE profile ไม่เก็บในระบบ
function lineMsgs(a, L) {
  const D = new Date(a.date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }), T = a.period === 'morning' ? 'ช่วงเช้า (08.30–12.00 น.)' : 'ช่วงบ่าย', F = FAC();
  if (L === 'low') return [{ to: 'ผู้ป่วย', when: 'ก่อนวันนัด', t: `🦷 ${F}\nสวัสดีค่ะ คุณ${NAME} 💚\nระบบตรวจสอบแล้วพบว่าคุณมีนัดตรวจฟันในวันที่ ${D} ${T}\nขอบคุณที่ดูแลสุขภาพช่องปากอย่างต่อเนื่องนะคะ\nแล้วพบกันที่ ${F} นะคะ 😊` }];
  if (L === 'medium') return [
    { to: 'ผู้ป่วย', when: 'ก่อนวันนัด', t: `🦷 ${F}\nสวัสดีค่ะ คุณ${NAME} 💛\nคุณมีนัดทันตกรรมกับ ${F}\n📅 วันที่ ${D} ${T}\nระบบพบว่าคุณอาจมีอุปสรรคบางอย่างในการมาตามนัด เช่น การเดินทางหรือภาระงาน\nเจ้าหน้าที่จะติดต่อประสานงานกับทางผู้ดูแลเพื่อช่วยเหลือนะคะ\nกรุณาเตรียมตัวไว้ล่วงหน้า และอย่าลืมพกบัตรนัดมาด้วยค่ะ 😊` },
    { to: 'ผู้ดูแล', when: 'ก่อนวันนัด', t: `⚠️ แจ้งเตือนจาก Smart Dental Alert\nผู้ป่วย คุณ${NAME} มีนัดทันตกรรม\n📅 ${D} ${T}\nขอความร่วมมือผู้ดูแลช่วยยืนยันการเดินทางและเตรียมพาผู้ป่วยมาตามกำหนด\nหากมาไม่ได้โปรดแจ้ง ${F}` }];
  const go = !!(a.done && a.done.go);
  return [
    { to: 'ผู้ป่วย', when: 'ก่อนวันนัด 2–3 วัน', t: `🦷 ${F}\n🔴 คุณ${NAME} มีความเสี่ยงสูงที่จะขาดนัด\nเจ้าหน้าที่จะประสานงานกับ อสม. เพื่อช่วยให้คุณมารับบริการในวันที่ ${D} ${T}\nกรุณาเตรียมตัวให้พร้อมและอยู่บ้านในเวลานัดหมาย\nหากมีเหตุจำเป็นไม่สามารถมาได้ โปรดแจ้งผ่านช่องนี้ทันทีนะคะ 🙏` },
    { to: 'ผู้ป่วย', when: 'วันนัด · ส่งหลัง อสม. กดออกเดินทาง', lock: !go, t: `🦷 ${F}\n🚗 อสม. กำลังเดินทางไปรับคุณที่บ้าน เพื่อไปพบทันตบุคลากรตามนัด\nวันที่ ${D} ${T}\nกรุณาเตรียมบัตรนัดและของใช้ส่วนตัวให้พร้อมค่ะ` },
    { to: 'อสม.', when: 'วันนัด', t: `🚨 แจ้งเตือนจาก Smart Dental Alert\nผู้ป่วย คุณ${NAME} ต้องการความช่วยเหลือในการมารับบริการ\nระบบได้แจ้งผู้ป่วยให้เตรียมตัวรอแล้ว\nโปรดเตรียมออกปฏิบัติงานก่อนเวลานัด และบันทึกผลการรับ–ส่งกลับระบบเมื่อเสร็จสิ้นภารกิจ` }];
}
const bubbleHtml = m => `<div class="lm${m.lock ? ' lock' : ''}"><div class="lm-h"><b>ถึง${m.to}</b> · ${m.when}${m.lock ? ' · ยังไม่ส่ง' : ''}</div><div class="bubble">${esc(m.t).replace(esc(NAME), '<mark>' + esc(NAME) + '</mark>')}</div></div>`;

// ---------- คิวนัด ----------
const dates = () => [...new Set(appts.map(a => a.date))].sort();
function defaultDate() { const d = dates(), today = new Date().toISOString().slice(0, 10); return d.find(x => x >= today) || d[d.length - 1] || ''; }
function renderQueueView() {
  const v = $('#v-q'); if (!v) return;
  if (!appts.length) { v.innerHTML = `<div class="card"><h2>ยังไม่มีนัดในระบบ</h2><p class="note">เพิ่มที่แท็บ "เพิ่มนัด"</p></div>`; return; }
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
    <span class="t">${a.period === 'morning' ? 'เช้า' : 'บ่าย'}</span><span><span class="id">${esc(a.id)}</span> <span class="meta">${esc(a.age)} ปี · ${esc(PROC_TH[a.proc])}</span></span>
    <span><span class="pill"><i class="dot"></i>${LV[lvl(a)]} <b>${score(a)}</b></span>${a.outcome ? `<span class="done-mark" ${a.outcome === 'noshow' ? 'style="color:var(--hi)"' : ''}>${a.outcome === 'came' ? 'มาตามนัด' : 'ขาดนัด'}</span>` : ''}</span></button>`).join('') + '</div></div>').join('') || '<p class="note">ไม่มีนัดในกลุ่มนี้</p>';
  document.querySelectorAll('.row').forEach(r => r.onclick = () => { sel = r.dataset.k; renderQueueView(); });
  renderPanel();
}
function renderPanel() {
  const P = $('#panel'); if (!P) return; const a = appts.find(x => x._id === sel);
  if (!a) { P.className = 'panel'; P.innerHTML = '<h2>เลือกผู้ป่วยจากคิวนัด</h2>'; return; }
  const L = lvl(a), c = cut(), done = a.done || {}; P.className = 'panel ' + L;
  P.innerHTML = `<div><h2><span class="mono">${esc(a.id)}</span> <span class="pill" style="margin-left:6px"><i class="dot"></i>${LV[L]}</span></h2>
    <p class="note">${fmtDay(a.date)} · ${a.period === 'morning' ? 'ช่วงเช้า' : 'ช่วงบ่าย'} · ${esc(PROC_TH[a.proc])}</p></div>
    <div><p class="sec">คะแนนความเสี่ยง</p><div class="gauge"><i style="width:${Math.min(100, score(a) * 1.6)}%"></i></div><p class="note" style="margin-top:4px">${score(a)} / 100 · สูง ≥ ${c.high} · ต่ำ &lt; ${c.low}</p></div>
    <div><p class="sec">ปัจจัยที่ทำให้เสี่ยง (กรอบ Andersen)</p>${explain(a).filter(x => x.d > 0.005).slice(0, 3).map(x => `<div class="act" style="align-items:flex-start"><span class="tag">${GRP_TH[x.f.grp]}</span><span><b>${x.f.label}</b> · ${esc(x.f.txt(a))}</span></div>`).join('') || '<p class="note">ไม่มีปัจจัยเด่น</p>'}</div>
    <div><p class="sec">มาตรการที่แนะนำ</p>${ACTIONS[L].map((t, i) => `<div class="act"><input type="checkbox" id="a${i}" data-i="${i}" ${done[i] ? 'checked' : ''}><label for="a${i}">${t}</label></div>`).join('')}</div>
    <div><p class="sec">ข้อความ LINE (จำลอง ยังไม่ส่งจริง)</p>${lineMsgs(a, L).map(bubbleHtml).join('')}${L === 'high' ? `<div class="act"><input type="checkbox" id="go" ${done.go ? 'checked' : ''}><label for="go">อสม. ออกเดินทางแล้ว</label></div>` : ''}</div>
    <div><p class="sec">ผลการมารับบริการ</p><div class="outc"><button data-o="came" aria-pressed="${a.outcome === 'came'}">มาตามนัด</button><button data-o="noshow" aria-pressed="${a.outcome === 'noshow'}">ขาดนัด</button></div></div>
    ${a.outcome === 'noshow' ? `<div><p class="sec">สาเหตุที่ขาดนัด</p><div class="form" style="grid-template-columns:1fr"><label>สาเหตุ<select id="rs"><option value="">ไม่ระบุ</option>${Object.entries(REASONS).map(([k, v]) => `<option value="${k}" ${a.reason === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>หมายเหตุ (ไม่เกิน 100 ตัวอักษร ห้ามใส่ชื่อ)<input type="text" id="rn" maxlength="100" value="${esc(a.reasonNote || '')}"></label></div></div>` : ''}
    <p id="p-err"></p>`;
  const fail = () => { $('#p-err').innerHTML = '<p class="msg err" role="alert">บันทึกไม่สำเร็จ ตรวจสิทธิ์หรืออินเทอร์เน็ตแล้วลองใหม่</p>'; };
  P.querySelectorAll('input[type=checkbox]').forEach(x => x.onchange = () => DB.setDone(a._id, x.id === 'go' ? 'go' : x.dataset.i, x.checked, me.email).catch(fail));
  if ($('#rs')) { const sv = () => DB.setReason(a._id, $('#rs').value, $('#rn').value.trim().slice(0, 100), me.email).catch(fail); $('#rs').onchange = sv; $('#rn').onchange = sv; }
  P.querySelectorAll('.outc button').forEach(b => b.onclick = () => DB.setOutcome(a._id, a.outcome === b.dataset.o ? null : b.dataset.o, me.email).catch(fail));
}

// ---------- เพิ่มนัด (เจ้าหน้าที่/แอดมิน) ----------
const ID_RE = /^P?\d{3,6}$/i, DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dayDiff = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5);
function mkAppt(r) {   // r: ค่าดิบจากฟอร์ม/CSV -> นัดที่ผ่านการตรวจ หรือข้อความผิดพลาด
  const id = String(r.id || '').trim(), date = String(r.date || '').trim();
  if (!ID_RE.test(id)) return 'รหัสผู้ป่วยต้องเป็นรหัสวิจัย เช่น P0123';
  if (!DATE_RE.test(date) || isNaN(new Date(date))) return 'วันที่นัดไม่ถูกต้อง';
  const dow = (new Date(date + 'T00:00:00').getDay() + 6) % 7; if (dow > 4) return 'วันนัดต้องเป็นวันจันทร์–ศุกร์';
  if (!['morning', 'afternoon'].includes(r.period)) return 'เลือกช่วงเวลานัด';
  const age = Math.round(Number(r.age)); if (!(age >= 60 && age <= 110)) return 'อายุต้องอยู่ระหว่าง 60–110 ปี';
  const sex = String(r.sex).toUpperCase(); if (!['F', 'M'].includes(sex)) return 'เลือกเพศ';
  if (!MAR_TH[r.marital]) return 'เลือกสถานภาพสมรส'; if (!SCH_TH[r.scheme]) return 'เลือกสิทธิการรักษา'; if (!PROC_TH[r.proc]) return 'เลือกหัตถการ';
  const lead = Math.round(Number(r.lead)); if (!(lead >= 0 && lead <= 365)) return 'วันที่ออกใบนัดต้องไม่หลังวันนัด และไม่เกิน 365 วันก่อนนัด';
  const ap = Math.round(Number(r.priorAp)), ns = Math.round(Number(r.priorNs));
  if (!(ap >= 0 && ap <= 500) || !(ns >= 0 && ns <= ap)) return 'จำนวนนัดย้อนหลังไม่ถูกต้อง (ขาดนัดต้องไม่มากกว่านัดทั้งหมด)';
  const idn = id.toUpperCase().startsWith('P') ? id.toUpperCase() : 'P' + id.padStart(4, '0');
  return { _id: idn + '_' + date, id: idn, date, period: r.period, age, sex, marital: r.marital, scheme: r.scheme, outArea: r.outArea ? 1 : 0, lead, dow, priorNs: ns, priorAp: ap,
    proc: r.proc, chronic: r.chronic ? 1 : 0, cont: r.cont ? 1 : 0 };
}
const REV = { scaling: 'scaling', extraction: 'extraction', filling: 'filling', denture: 'denture' };
function parseCSV(t) {   // รูปแบบเดียวกับ templates/upcoming_template.csv
  const lines = t.replace(/^﻿/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean); if (lines.length < 2) return { err: 'ไม่พบข้อมูล' };
  const h = lines[0].split(',').map(x => x.trim().toLowerCase()), need = ['patient_id', 'appt_date', 'period', 'procedure', 'age', 'sex', 'marital', 'scheme', 'distance_km', 'chronic_disease', 'continuing_care', 'lead_days', 'prior_appts', 'prior_noshows'], miss = need.filter(n => !h.includes(n));
  if (miss.length) return { err: 'ขาดคอลัมน์: ' + miss.join(', ') };
  return { rows: lines.slice(1).map(l => { const c = l.split(',').map(x => x.trim()), g = n => c[h.indexOf(n)];
    return { id: g('patient_id'), date: g('appt_date'), period: g('period'), proc: REV[g('procedure')], age: g('age'), sex: g('sex'), marital: g('marital'), scheme: g('scheme'), outArea: Number(g('distance_km')) > 8,
      lead: g('lead_days'), priorAp: g('prior_appts'), priorNs: g('prior_noshows'), chronic: g('chronic_disease') === '1', cont: g('continuing_care') === '1' }; }) };
}
const msg = (el, html, cls) => { const e = $(el); if (e) e.innerHTML = `<p class="msg ${cls}" role="status">${html}</p>`; };
async function importList(list, el) {
  const have = new Set(appts.map(a => a._id)), bad = []; const ok = [], seen = new Set();
  list.forEach((r, i) => { const a = mkAppt(r); if (typeof a === 'string') bad.push(`แถว ${i + 2}: ${a}`); else if (have.has(a._id) || seen.has(a._id)) bad.push(`แถว ${i + 2}: มีนัดของรหัสนี้ในวันเดียวกันแล้ว`); else { seen.add(a._id); ok.push(a); } });
  try { if (ok.length) await DB.addAppts(ok); } catch (e) { return msg(el, 'บันทึกไม่สำเร็จ ตรวจสิทธิ์และอินเทอร์เน็ต', 'err'); }
  msg(el, `นำเข้าสำเร็จ ${ok.length} แถว${bad.length ? ` · ข้าม ${bad.length} แถว<br>` + bad.slice(0, 5).map(esc).join('<br>') + (bad.length > 5 ? '<br>…' : '') : ''}`, bad.length && !ok.length ? 'err' : 'ok');
}
const opts = o => Object.entries(o).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
function renderAdd() {
  const v = $('#v-a'); if (!v) return;
  v.innerHTML = `<div class="card"><h2>เพิ่มนัดหมาย</h2><div class="form" style="grid-template-columns:minmax(0,260px)"><label>รหัสผู้ป่วย<input type="text" id="f-id" placeholder="P0123" autocomplete="off"></label></div>
    <p class="sec" style="margin-top:14px">ปัจจัยพื้นฐาน</p><div class="form">
      <label>อายุ (ปี)<input type="number" id="f-age" min="60" max="110" inputmode="numeric"></label>
      <label>เพศ<select id="f-sex"><option value="F">หญิง</option><option value="M">ชาย</option></select></label>
      <label>สถานภาพสมรส<select id="f-marital">${opts(MAR_TH)}</select></label>
      <label>จำนวนนัดใน 1 ปีย้อนหลัง<input type="number" id="f-ap" min="0" value="0" inputmode="numeric"></label>
      <label>ในนั้นขาดนัดกี่ครั้ง<input type="number" id="f-ns" min="0" value="0" inputmode="numeric"></label></div>
    <p class="sec" style="margin-top:14px">ปัจจัยเอื้ออำนวย</p><div class="form">
      <label>สิทธิการรักษา<select id="f-scheme">${opts(SCH_TH)}</select></label>
      <label>ที่พักอาศัย<select id="f-area"><option value="0">ในเขต รพ.สต.</option><option value="1">นอกเขต</option></select></label>
      <label>วันที่ออกใบนัด<input type="date" id="f-issued"></label>
      <label>วันที่นัด<input type="date" id="f-date"></label>
      <label>ช่วงเวลา<select id="f-period"><option value="morning">เช้า 08.30–12.00</option><option value="afternoon">บ่าย</option></select></label></div>
    <p class="sec" style="margin-top:14px">ปัจจัยด้านความจำเป็น</p><div class="form">
      <label>หัตถการ<select id="f-proc">${opts(PROC_TH)}</select></label>
      <label>โรคเรื้อรัง<select id="f-chronic"><option value="0">ไม่มี</option><option value="1">มีโรคประจำตัว</option></select></label>
      <label>ความต่อเนื่องของการรักษา<select id="f-cont"><option value="0">ตรวจใหม่</option><option value="1">นัดต่อเนื่องตามแผน</option></select></label></div>
    <div class="btns"><button class="btn" id="f-add">บันทึกและประเมินความเสี่ยง</button></div><div id="f-msg"></div></div>`;
  const today = new Date().toISOString().slice(0, 10); $('#f-issued').value = today; $('#f-date').value = today;
  $('#f-add').onclick = async () => {
    const g = i => $('#f-' + i).value, issued = g('issued'), date = g('date');
    const r = mkAppt({ id: g('id'), date, period: g('period'), age: g('age'), sex: g('sex'), marital: g('marital'), scheme: g('scheme'), outArea: g('area') === '1', lead: DATE_RE.test(issued) && DATE_RE.test(date) ? dayDiff(issued, date) : NaN,
      priorAp: g('ap'), priorNs: g('ns'), proc: g('proc'), chronic: g('chronic') === '1', cont: g('cont') === '1' });
    if (typeof r === 'string') return msg('#f-msg', esc(r), 'err');
    if (appts.some(x => x._id === r._id)) return msg('#f-msg', 'มีนัดของรหัสนี้ในวันเดียวกันแล้ว', 'err');
    try { await DB.addAppts([r]); const p = Math.round(predict(r) * 100), c = cut(), L = p >= c.high ? 'high' : p >= c.low ? 'medium' : 'low';
      msg('#f-msg', `บันทึก ${esc(r.id)} แล้ว · ${LV[L]} (${p})`, 'ok'); sel = r._id; filterDate = r.date; $('#f-id').value = ''; } catch (e) { msg('#f-msg', 'บันทึกไม่สำเร็จ ตรวจสิทธิ์และอินเทอร์เน็ต', 'err'); }
  };
}
// ---------- นำเข้า CSV (แอดมิน) ----------
function renderImport() {
  const v = $('#v-i'); if (!v) return;
  v.innerHTML = `<div class="card"><h2>นำเข้าจากไฟล์ CSV</h2><div class="form" style="grid-template-columns:1fr"><label>เลือกไฟล์ .csv<input type="file" id="c-file" accept=".csv,text/csv"></label><label>หรือวางข้อความ CSV<textarea id="c-text"></textarea></label></div>
    <div class="btns"><button class="btn" id="c-go">นำเข้า</button><button class="btn sec2" id="c-demo">โหลดข้อมูลจำลอง 40 นัด</button><button class="btn sec2" id="c-clear">${clearArmed ? 'กดอีกครั้งเพื่อยืนยันลบนัดทั้งหมด' : 'ลบนัดทั้งหมด'}</button></div><div id="c-msg"></div></div>`;
  $('#c-file').onchange = e => { const f = e.target.files[0]; if (!f) return; const fr = new FileReader(); fr.onload = () => { $('#c-text').value = fr.result; }; fr.readAsText(f); };
  $('#c-demo').onclick = async () => {
    try { const rows = await (await fetch('demo.json')).json(), days = []; const d = new Date();
      while (days.length < 10) { if (d.getDay() % 6) days.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1); }
      importList(rows.map(r => ({ ...r, date: days[r.day] })), '#c-msg'); } catch (e) { msg('#c-msg', 'โหลดข้อมูลจำลองไม่สำเร็จ', 'err'); } };
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
const NM = { continuing_care: 'ความต่อเนื่องของการรักษา', procedure: 'ประเภทหัตถการ', sex: 'เพศ', prior_noshows: 'จำนวนครั้งที่เคยขาดนัด', prior_noshow_rate: 'อัตราขาดนัดสะสม', marital: 'สถานภาพสมรส', period: 'ช่วงเวลานัด', age: 'อายุ', out_area: 'ที่พักนอกเขต', lead_days: 'นัดล่วงหน้า (วัน)', scheme: 'สิทธิการรักษา', dow: 'วันในสัปดาห์', chronic_disease: 'โรคเรื้อรัง' };
function modelHtml(m) {
  const p = x => (+x).toFixed(2), imp = [...(m.imp || [])].sort((a, b) => b.pm - a.pm).slice(0, 10), mp = Math.max(...imp.map(i => Math.max(i.pm, 0)), 1e-9), mg = Math.max(...imp.map(i => i.g), 1e-9);
  return `<div class="card" style="margin-top:18px"><h2>ประสิทธิภาพโมเดลบนชุดทดสอบ</h2><p class="note">ฝึก ${m.n.train ?? '-'} นัด · ทดสอบ ${m.n.test ?? '-'} นัด</p>
    <div class="mets">${[['AUC', m.metrics.auc], ['PR-AUC', m.metrics.pr_auc], ['Recall', m.metrics.recall], ['Precision', m.metrics.precision], ['F1', m.metrics.f1], ['Accuracy', m.metrics.accuracy]].map(([k, v]) => `<div><div class="v">${p(v)}</div><div class="k">${k}</div></div>`).join('')}</div>
    <h2 style="margin-top:18px">ความสำคัญของปัจจัยตามกรอบ Andersen</h2>
    ${imp.map(i => `<div class="bar"><span>${esc(NM[i.f] || i.f)}</span><div><div class="track"><div class="fill g-${esc(i.grp)}" style="width:${Math.max(0, i.pm) / mp * 100}%"></div></div><div class="track" style="margin-top:3px;height:8px;opacity:.55"><div class="fill g-${esc(i.grp)}" style="width:${i.g / mg * 100}%"></div></div></div><span class="num">${(+i.pm).toFixed(3)}</span></div>`).join('')}</div>`;
}

// ================= เริ่มทำงาน =================
(async () => {
  try { M = await (await fetch('model.json')).json(); DB = CONFIGURED ? await makeFirebase() : makeDemo(); } catch (e) { $('#app').innerHTML = '<p class="msg err">โหลดระบบไม่สำเร็จ ตรวจอินเทอร์เน็ต</p>'; return; }
  let unA = null, unS = null;
  DB.onUser(u => {
    me = u; if (unA) unA(), unA = null; if (unS) unS(), unS = null; appts = []; settings = {};
    renderShell();
    if (me && me.role) {
      unA = DB.subAppts(list => { appts = (list || []).map(a => ({ ...a, p: predict(a) })); if (tab === 'd') renderDash(); if (tab === 'q') renderQueueView(); if (tab === 'm') renderAdminTab(); });
      unS = DB.subSettings(s => { settings = s || {}; const keepTab = tab; renderShell(); tab = keepTab; });
    }
  });
})();
window.__app = { get appts() { return appts; } };
