process.env.SEND_MODE = 'dryrun'; process.env.SEND_API_KEY = 'test-key';
const send = require('./api/send');
const { Readable } = require('stream');
const body = JSON.stringify({
  appts: [
    { id: 'P0826', date: '2026-11-03', period: 'afternoon', proc: 'ฟันเทียม', level: 'high' },
    { id: 'P0192', date: '2026-11-03', period: 'morning', proc: 'อุดฟัน', level: 'medium' },
    { id: 'P0045', date: '2026-11-03', period: 'morning', proc: 'ขูดหินปูน', level: 'low' }],
  recipients: { patient: { P0826: 'Ufake1', P0192: 'Ufake2', P0045: 'Ufake3' }, caregiver: { P0826: 'Ufake4', P0192: 'Ufake5', P0045: 'Ufake6' }, staff: ['Ustaff1'] } });
const req = Object.assign(Readable.from([Buffer.from(body)]), { method: 'POST', headers: { 'x-api-key': 'test-key' } });
const res = { status(c) { this.c = c; return this; }, json(o) { console.log(this.c, JSON.stringify(o.plan ? o.plan.map((p) => p.group + ': ' + p.message.text.split('\n')[0]) : o, null, 1)); } };
send(req, res);
