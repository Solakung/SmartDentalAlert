// สร้างรายการข้อความที่ "จะส่ง" จากนัดหมาย โดยกรองตามโหมดการส่ง
const { patientMessage, caregiverMessage, staffSummary } = require('./messages');

function buildPlan(appts, recipients, mode, allowPatient) {
  // appts: [{id,date,period,proc,level:'high'|'medium'|'low'}]  (ใช้รหัสวิจัย ไม่ใช่ชื่อ)
  // recipients: { patient:{P0001:'Uxxx'}, caregiver:{P0001:'Uyyy'}, staff:['Uzzz'] }
  const out = [], dates = [...new Set(appts.map((a) => a.date))];
  for (const d of dates) for (const to of recipients.staff || []) out.push({ group: 'staff', to, message: staffSummary(d, appts) });
  const patientOk = mode === 'live' && allowPatient;
  for (const a of appts) {
    const p = recipients.patient && recipients.patient[a.id], g = recipients.caregiver && recipients.caregiver[a.id];
    const cg = caregiverMessage(a, a.level);
    if (p) out.push({ group: 'patient', to: p, message: patientMessage(a), blocked: !patientOk });
    if (g && cg) out.push({ group: 'caregiver', to: g, message: cg, blocked: !patientOk });
  }
  return out;
}
module.exports = { buildPlan };
