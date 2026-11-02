// แม่แบบข้อความ 3 กลุ่มผู้รับ (ตรงกับแท็บ "ข้อความ LINE" ใน mock-up)
// ข้อความถึงผู้ป่วยไม่แสดงระดับความเสี่ยง
const SLOT = { morning: 'ช่วงเช้า', afternoon: 'ช่วงบ่าย' };
const fmtDay = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
const quick = (labels) => ({ items: labels.map((l) => ({ type: 'action', action: { type: 'postback', label: l, data: 'a=' + encodeURIComponent(l), displayText: l } })) });
const text = (t, labels) => ({ type: 'text', text: t, ...(labels ? { quickReply: quick(labels) } : {}) });

function patientMessage(a) {
  return text(`รพ.สต.บ้านเตาถ่าน แจ้งนัดทันตกรรม\n${fmtDay(a.date)}\n${SLOT[a.period]} · ${a.proc}\nกรุณามาตามนัด หากไม่สะดวกกดขอเลื่อนนัดได้`, ['ยืนยันว่าจะมา', 'ขอเลื่อนนัด']);
}
function caregiverMessage(a, level) {
  if (level === 'high') return text(`ขอความร่วมมือเตือนและช่วยพาผู้ป่วยรหัส ${a.id} มารับบริการทันตกรรม\n${fmtDay(a.date)} ${SLOT[a.period]}\nหากเดินทางลำบาก แจ้ง รพ.สต. เพื่อประสานรถรับส่ง`, ['รับทราบ', 'ต้องการรถรับส่ง']);
  if (level === 'medium') return text(`ขอให้ช่วยยืนยันการเดินทางของผู้ป่วยรหัส ${a.id}\nนัดทันตกรรม ${fmtDay(a.date)} ${SLOT[a.period]}`, ['ยืนยันแล้ว', 'ไม่สะดวก']);
  return null; // เสี่ยงต่ำ ไม่ส่งถึงผู้ดูแล
}
function staffSummary(date, appts) {
  const day = appts.filter((x) => x.date === date), c = { high: 0, medium: 0, low: 0 };
  day.forEach((x) => c[x.level]++);
  const hi = day.filter((x) => x.level === 'high').slice(0, 5);
  return text(`สรุปนัดทันตกรรม ${fmtDay(date)}\nทั้งหมด ${day.length} นัด · สูง ${c.high} · กลาง ${c.medium} · ต่ำ ${c.low}\n` +
    (hi.length ? 'ต้องตามเป็นพิเศษ:\n' + hi.map((x) => `• ${x.id} ${x.proc} (${x.period === 'morning' ? 'เช้า' : 'บ่าย'})`).join('\n') : 'ไม่มีนัดเสี่ยงสูง'));
}
module.exports = { patientMessage, caregiverMessage, staffSummary };
