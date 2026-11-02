const crypto = require('crypto');
async function push(to, message, token) {
  const r = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ to, messages: [message] }),
  });
  return { status: r.status, ok: r.ok, body: r.ok ? '' : await r.text() };
}
const verifySignature = (raw, sig, secret) => {
  if (!sig || !secret) return false;
  const h = crypto.createHmac('sha256', secret).update(raw).digest('base64');
  const a = Buffer.from(h), b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const readRaw = async (req) => { const c = []; for await (const x of req) c.push(Buffer.from(x)); return Buffer.concat(c); };
module.exports = { push, verifySignature, readRaw };
