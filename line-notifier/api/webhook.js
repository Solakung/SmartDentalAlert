// POST /api/webhook  ตั้งเป็น Webhook URL ใน LINE Developers Console
// ตรวจลายเซ็น x-line-signature แล้วตอบกลับตอนเพิ่มเพื่อน (ยังไม่เก็บ userId ใดๆ)
const { verifySignature, readRaw } = require('../lib/line');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const raw = await readRaw(req);
  if (!verifySignature(raw, req.headers['x-line-signature'], process.env.LINE_CHANNEL_SECRET)) return res.status(401).end();
  const events = (JSON.parse(raw.toString('utf8')).events) || [];
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  for (const e of events) {
    if (e.type === 'follow' && e.replyToken && token) {
      await fetch('https://api.line.me/v2/bot/message/reply', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ replyToken: e.replyToken, messages: [{ type: 'text', text: 'ขอบคุณที่เพิ่มเพื่อน รพ.สต.บ้านเตาถ่าน\nกรุณาแจ้งเจ้าหน้าที่เพื่อลงทะเบียนรับการแจ้งเตือน' }] }) });
    }
    // postback ยืนยัน/ขอเลื่อน: ต่อยอดเก็บเป็นผลการนัด (ยังไม่ทำ)
  }
  return res.status(200).json({ ok: true });
};
