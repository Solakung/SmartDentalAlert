// POST /api/send  header: x-api-key   body: {appts:[...], recipients:{...}}
// ค่าเริ่มต้น dryrun: ไม่ส่งจริง คืนรายการข้อความที่จะส่ง
const { buildPlan } = require('../lib/plan');
const { push, readRaw } = require('../lib/line');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.SEND_API_KEY;
  if (!key || req.headers['x-api-key'] !== key) return res.status(401).json({ error: 'unauthorized' });
  let body; try { body = JSON.parse((await readRaw(req)).toString('utf8')); } catch { return res.status(400).json({ error: 'invalid JSON' }); }
  if (!Array.isArray(body.appts)) return res.status(400).json({ error: 'appts required' });
  const mode = process.env.SEND_MODE || 'dryrun', allowPatient = process.env.ALLOW_PATIENT_MESSAGES === 'true';
  const recipients = { ...(body.recipients || {}), staff: (process.env.STAFF_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean) };
  if (mode === 'dryrun' && body.recipients && body.recipients.staff) recipients.staff = body.recipients.staff; // ทดสอบรูปแบบเท่านั้น
  const plan = buildPlan(body.appts, recipients, mode, allowPatient);
  if (mode === 'dryrun') return res.status(200).json({ mode, sent: 0, plan: plan.map((p) => ({ ...p, to: '(masked)', blocked: undefined })) });
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN; if (!token) return res.status(500).json({ error: 'token missing' });
  const results = [];
  for (const p of plan) {
    if (p.blocked || (mode === 'staff_only' && p.group !== 'staff')) { results.push({ group: p.group, skipped: true }); continue; }
    results.push({ group: p.group, ...(await push(p.to, p.message, token)) });
  }
  return res.status(200).json({ mode, sent: results.filter((r) => r.ok).length, results });
};
