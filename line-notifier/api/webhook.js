// POST /api/webhook  ตั้งเป็น Webhook URL ใน LINE Developers Console
// ตรวจลายเซ็น x-line-signature แล้วตอบกลับตอนเพิ่มเพื่อน (ยังไม่เก็บ userId ใดๆ)
const { verifySignature, readRaw } = require('../lib/line');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) { console.error('LINE_CHANNEL_SECRET is not set (add it in Vercel env vars, then Redeploy)'); return res.status(500).json({ error: 'secret not configured' }); }
  const raw = await readRaw(req);
  const sig = req.headers['x-line-signature'];
  if (!verifySignature(raw, sig, secret)) {
    // ไม่บันทึกค่า secret หรือเนื้อหา เฉพาะข้อมูลวินิจฉัย
    console.error('signature mismatch', { hasSignature: !!sig, rawBytes: raw.length, secretLength: secret.length });
    return res.status(401).json({ error: 'invalid signature' });
  }
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
