// แม่แบบข้อความ 3 กลุ่มผู้รับ (ตรงกับแท็บ "ข้อความ LINE" ใน mock-up)
// ข้อความถึงผู้ป่วยไม่แสดงระดับความเสี่ยง
const FACILITY = process.env.FACILITY_NAME || 'รพ.สต.'; // ตั้งใน Vercel ต่อหน่วยบริการ
const SLOT = { morning: 'ช่วงเช้า', afternoon: 'ช่วงบ่าย' };
const fmtDay = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
const quick = (labels) => ({ items: labels.map((l) => ({ type: 'action', action: { type: 'postback', label: l, data: 'a=' + encodeURIComponent(l), displayText: l } })) });
const text = (t, labels) => ({ type: 'text', text: t, ...(labels ? { quickReply: quick(labels) } : {}) });

function patientMessage(a) {
  return text(`${FACILITY} แจ้งนัดทันตกรรม\n${fmtDay(a.date)}\n${SLOT[a.period]} · ${a.proc}\nกรุณามาตามนัด หากไม่สะดวกกดขอเลื่อนนัดได้`, ['ยืนยันว่าจะมา', 'ขอเลื่อนนัด']);
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

// ---- แม่แบบ 6 แบบ (ตรงกับแท็บ "ข้อความ LINE (จำลอง)" ในแอป) ----
// name = ชื่อที่ดึงจาก LINE profile ตอนส่ง (ไม่เก็บในระบบ)  ข้อความถึงผู้ดูแล/อสม. ไม่ระบุระดับความเสี่ยง
const longDay = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
const slotText = (p) => (p === 'morning' ? 'ช่วงเช้า (08.30–12.00 น.)' : 'ช่วงบ่าย');
const T = {
  low: (a, n) => [`🦷 ${FACILITY}\nสวัสดีค่ะ คุณ${n} 💚\nระบบตรวจสอบแล้วพบว่าคุณมีนัดตรวจฟันในวันที่ ${longDay(a.date)} ${slotText(a.period)}\nขอบคุณที่ดูแลสุขภาพช่องปากอย่างต่อเนื่องนะคะ\nแล้วพบกันที่ ${FACILITY} นะคะ 😊`],
  mediumPatient: (a, n) => `🦷 ${FACILITY}\nสวัสดีค่ะ คุณ${n} 💛\nคุณมีนัดทันตกรรมกับ ${FACILITY}\n📅 วันที่ ${longDay(a.date)} ${slotText(a.period)}\nระบบพบว่าคุณอาจมีอุปสรรคบางอย่างในการมาตามนัด เช่น การเดินทางหรือภาระงาน\nเจ้าหน้าที่จะติดต่อประสานงานกับทางผู้ดูแลเพื่อช่วยเหลือนะคะ\nกรุณาเตรียมตัวไว้ล่วงหน้า และอย่าลืมพกบัตรนัดมาด้วยค่ะ 😊`,
  mediumCaregiver: (a, n) => `⚠️ แจ้งเตือนจาก Smart Dental Alert\nผู้ป่วย คุณ${n} มีนัดทันตกรรม\n📅 ${longDay(a.date)} ${slotText(a.period)}\nขอความร่วมมือผู้ดูแลช่วยยืนยันการเดินทางและเตรียมพาผู้ป่วยมาตามกำหนด\nหากมาไม่ได้โปรดแจ้ง ${FACILITY}`,
  highPatientBefore: (a, n) => `🦷 ${FACILITY}\n🔴 คุณ${n} มีความเสี่ยงสูงที่จะขาดนัด\nเจ้าหน้าที่จะประสานงานกับ อสม. เพื่อช่วยให้คุณมารับบริการในวันที่ ${longDay(a.date)} ${slotText(a.period)}\nกรุณาเตรียมตัวให้พร้อมและอยู่บ้านในเวลานัดหมาย\nหากมีเหตุจำเป็นไม่สามารถมาได้ โปรดแจ้งผ่านช่องนี้ทันทีนะคะ 🙏`,
  highPatientDay: (a) => `🦷 ${FACILITY}\n🚗 อสม. กำลังเดินทางไปรับคุณที่บ้าน เพื่อไปพบทันตบุคลากรตามนัด\nวันที่ ${longDay(a.date)} ${slotText(a.period)}\nกรุณาเตรียมบัตรนัดและของใช้ส่วนตัวให้พร้อมค่ะ`,   // ส่งหลัง อสม. กดยืนยันออกเดินทางเท่านั้น
  highVolunteer: (a, n) => `🚨 แจ้งเตือนจาก Smart Dental Alert\nผู้ป่วย คุณ${n} ต้องการความช่วยเหลือในการมารับบริการ\nระบบได้แจ้งผู้ป่วยให้เตรียมตัวรอแล้ว\nโปรดเตรียมออกปฏิบัติงานก่อนเวลานัด และบันทึกผลการรับ–ส่งกลับระบบเมื่อเสร็จสิ้นภารกิจ`,
};
module.exports = { patientMessage, caregiverMessage, staffSummary, templates: T };
