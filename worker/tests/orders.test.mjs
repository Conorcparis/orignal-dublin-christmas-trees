// Run: node --test worker/tests/orders.test.mjs   (uses Node's built-in SQLite, the same engine as Cloudflare D1)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/index.js';

const SCHEMA = fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
class FakeD1 {
  constructor() { this.db = new DatabaseSync(':memory:'); this.db.exec(SCHEMA); }
  prepare(sql) {
    const st = this.db.prepare(sql);
    const run = (a) => ({ run: async () => { const r = st.run(...a); return { meta: { changes: Number(r.changes) } }; }, first: async () => st.get(...a) || null, all: async () => ({ results: st.all(...a) }) });
    return { ...run([]), bind: (...a) => run(a) };
  }
}
const TOKEN = 'T'.repeat(40);
const SITE = 'https://conorcparis.github.io';
const mkEnv = (over = {}) => ({ DB: new FakeD1(), ADMIN_TOKEN: TOKEN, ...over });
const GOOD = { name: 'Aoife Ní Cheallaigh', email: 'Aoife@Example.IE', interests: ['Christmas tree'], tree: 'Hazel · Coll', area: 'D06 W2N8', consent: true };
const post = (env, body, h = {}) => worker.fetch(new Request('https://api.test/api/reservations', { method: 'POST', headers: { Origin: SITE, 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.1.1.1', ...h }, body: typeof body === 'string' ? body : JSON.stringify(body) }), env);
const admin = (env, path, { method = 'GET', body, token = TOKEN, ip = '9.9.9.9' } = {}) => worker.fetch(new Request('https://api.test' + path, { method, headers: { Origin: SITE, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: body ? JSON.stringify(body) : undefined }), env);
const rows = (env) => env.DB.db.prepare('SELECT * FROM reservations ORDER BY id').all();

test('CORS: only the website may call; preflight answered; strangers refused', async () => {
  const env = mkEnv();
  const ok = await worker.fetch(new Request('https://api.test/api/reservations', { method: 'OPTIONS', headers: { Origin: SITE } }), env);
  assert.equal(ok.status, 204); assert.equal(ok.headers.get('Access-Control-Allow-Origin'), SITE);
  const bad = await worker.fetch(new Request('https://api.test/api/reservations', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), env);
  assert.equal(bad.status, 403);
  assert.equal((await post(env, GOOD, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await post(env, GOOD, { Origin: '' })).status, 403);
  assert.equal(rows(env).length, 0);
  assert.equal((await post(env, GOOD, { Origin: 'http://localhost:8765' })).status, 403, 'localhost is refused unless ALLOW_LOCAL is set');
  assert.equal((await post(mkEnv({ ALLOW_LOCAL: '1' }), GOOD, { Origin: 'http://localhost:8765' })).status, 201);
  assert.equal((await post(env, GOOD, { Origin: 'https://temp-llxnuoadqiiujerfpvlv.webadorsite.com', 'CF-Connecting-IP': '1.1.1.7' })).status, 201, 'the Webador page may send orders');
  assert.equal((await post(env, GOOD, { Origin: 'https://www.theoriginaldublinchristmastrees.ie', 'CF-Connecting-IP': '1.1.1.9' })).status, 201, 'the real domain may send orders');
  const astro = await post(env, { ...GOOD, interests: ['Celtic astrology certificate'], cert_name: 'Mam' }, { 'CF-Connecting-IP': '1.1.1.10' });
  assert.equal(astro.status, 201, 'an astrology certificate is its own kind of order');
  assert.equal((await post(env, GOOD, { Origin: 'https://other-site.webadorsite.com', 'CF-Connecting-IP': '1.1.1.8' })).status, 403, 'another Webador site may not');
});

test('a good reservation is stored and answered with a reference', async () => {
  const env = mkEnv(); const r = await post(env, GOOD); const j = await r.json();
  assert.equal(r.status, 201); assert.match(j.ref, /^R-[A-Z2-9]{6}$/);
  const [row] = rows(env);
  assert.equal(row.ref, j.ref); assert.equal(row.email, 'aoife@example.ie'); assert.equal(row.status, 'new'); assert.equal(row.interests, 'Christmas tree'); assert.equal(row.area, 'D06 W2N8'); assert.ok(row.consent_at);
});

test('validation: what is required, and what is refused', async () => {
  const env = mkEnv();
  const bad = async (over) => { const r = await post(env, { ...GOOD, ...over }, { 'CF-Connecting-IP': String(Math.random()) }); return [r.status, (await r.json()).fields || {}]; };
  assert.deepEqual(await bad({ name: '  ' }), [400, { name: 'required' }]);
  assert.equal((await bad({ email: 'nope' }))[1].email, 'invalid');
  assert.equal((await bad({ email: 'a@b.c' }))[1].email, 'invalid');
  assert.equal((await bad({ email: 'a b@c.ie' }))[1].email, 'invalid');
  assert.equal((await bad({ interests: [] }))[1].interests, 'required');
  assert.equal((await bad({ interests: ['Hack'] }))[1].interests, 'required');
  assert.equal((await bad({ consent: false }))[1].consent, 'required');
  assert.equal((await bad({ interests: ['Tree sponsorship'] }))[1].cert_name, 'required');
  assert.equal((await bad({ interests: ['Gift certificate', 'Christmas tree'], cert_name: '' }))[1].cert_name, 'required');
  assert.equal((await post(env, { ...GOOD, interests: ['Tree sponsorship'], cert_name: 'Maeve Murphy', cert_from: 'The Murphys', cert_message: 'Merry Christmas' }, { 'CF-Connecting-IP': '5.5.5.5' })).status, 201);
  assert.equal(rows(env).length, 1, 'only the valid one was stored');
});

test('input is cleaned and cut to length; markup is stored as plain text, never interpreted', async () => {
  const env = mkEnv();
  await post(env, { ...GOOD, name: 'A\u0000B\u0007C ' + 'x'.repeat(200), area: '<script>alert(1)</script>', cert_message: 'line1\nline2' + 'y'.repeat(300), interests: ['Gift certificate'], cert_name: 'Z' });
  const [r] = rows(env);
  assert.ok(!/[\u0000-\u0008]/.test(r.name) && r.name.length <= 80); assert.equal(r.area, '<script>alert(1)</script>'.slice(0, 40)); assert.ok(r.cert_message.length <= 160 && !r.cert_message.includes('\n'));
});

test('a bot (hidden field filled) gets a normal-looking answer and nothing is stored', async () => {
  const env = mkEnv(); const r = await post(env, { ...GOOD, website: 'http://spam' }); const j = await r.json();
  assert.equal(r.status, 200); assert.match(j.ref, /^R-/); assert.equal(rows(env).length, 0);
});

test('bad bodies: too big, not JSON, not an object', async () => {
  const env = mkEnv();
  assert.equal((await post(env, 'x'.repeat(9000))).status, 413);
  assert.equal((await post(env, '{nope')).status, 400);
  assert.equal((await post(env, '[1,2]')).status, 400);
  assert.equal((await post(env, 'null')).status, 400);
});

test('rate limit: 5 an hour from one address, then 429; another address is unaffected; nothing identifying is stored', async () => {
  const env = mkEnv();
  for (let i = 0; i < 5; i++) assert.equal((await post(env, { ...GOOD, email: `p${i}@example.ie` }, { 'CF-Connecting-IP': '7.7.7.7' })).status, 201);
  const r = await post(env, { ...GOOD, email: 'p9@example.ie' }, { 'CF-Connecting-IP': '7.7.7.7' });
  assert.equal(r.status, 429); assert.equal(r.headers.get('Retry-After'), '3600');
  assert.equal((await post(env, { ...GOOD, email: 'q1@example.ie' }, { 'CF-Connecting-IP': '8.8.8.8' })).status, 201);
  const k = env.DB.db.prepare('SELECT key FROM rate').all().map((x) => x.key).join(' ');
  assert.ok(!k.includes('7.7.7.7') && !k.includes('example.ie'), 'neither the address nor the email is stored, only salted hashes');
});

test('rate limit: a whole IPv6 /64 counts as one visitor', async () => {
  const env = mkEnv();
  for (let i = 0; i < 5; i++) assert.equal((await post(env, { ...GOOD, email: `v${i}@example.ie` }, { 'CF-Connecting-IP': `2001:db8:1:2:${i}::${i + 1}` })).status, 201);
  assert.equal((await post(env, { ...GOOD, email: 'v9@example.ie' }, { 'CF-Connecting-IP': '2001:db8:1:2:ffff::1' })).status, 429);
  assert.equal((await post(env, { ...GOOD, email: 'v10@example.ie' }, { 'CF-Connecting-IP': '2001:db8:1:3::1' })).status, 201, 'a different /64 is a different visitor');
});

test('rate limit: one email address can be used 3 times a day, from any number of addresses', async () => {
  const env = mkEnv();
  for (let i = 0; i < 3; i++) assert.equal((await post(env, GOOD, { 'CF-Connecting-IP': `10.0.0.${i}` })).status, 201);
  assert.equal((await post(env, GOOD, { 'CF-Connecting-IP': '10.0.0.9' })).status, 429);
  assert.equal(rows(env).length, 3);
});

test('rate limit: the whole list accepts at most 60 an hour, however many addresses', async () => {
  const env = mkEnv();
  for (let i = 0; i < 60; i++) assert.equal((await post(env, { ...GOOD, email: `g${i}@example.ie` }, { 'CF-Connecting-IP': `10.1.${i}.1` })).status, 201);
  assert.equal((await post(env, { ...GOOD, email: 'g99@example.ie' }, { 'CF-Connecting-IP': '10.1.99.1' })).status, 429);
});

test('expired limit rows are deleted on the next request', async () => {
  const env = mkEnv();
  env.DB.db.prepare('INSERT INTO rate(key, n, exp) VALUES(?, 3, ?)').run('old:row', Math.floor(Date.now() / 1000) - 5);
  await post(env, GOOD);
  assert.equal(env.DB.db.prepare("SELECT COUNT(*) c FROM rate WHERE key = 'old:row'").get().c, 0);
  assert.ok(env.DB.db.prepare('SELECT MAX(exp - ?) m FROM rate').get(Math.floor(Date.now() / 1000)).m <= 86400, 'no row outlives a day');
});

test('an address that could add a hidden recipient or subject to a mailto: link is refused', async () => {
  const env = mkEnv(); let i = 0;
  for (const bad of ['a@b.cc?bcc=evil@x.com', 'a@b.cc&subject=x', 'a=b@c.ie', 'a%40b@c.ie', 'a@b.cc#x', 'a/b@c.ie']) {
    const r = await post(env, { ...GOOD, email: bad }, { 'CF-Connecting-IP': `11.0.0.${i++}` });
    assert.equal(r.status, 400, bad); assert.equal((await r.json()).fields.email, 'invalid');
  }
  assert.equal(rows(env).length, 0);
});

test('an oversized body is cut off while it is being read, even with no declared length', async () => {
  const env = mkEnv();
  const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"name":"' + 'x'.repeat(5000))); c.enqueue(new TextEncoder().encode('y'.repeat(5000) + '"}')); c.close(); } });
  const r = await worker.fetch(new Request('https://api.test/api/reservations', { method: 'POST', headers: { Origin: SITE, 'Content-Type': 'application/json', 'CF-Connecting-IP': '12.0.0.1' }, body: stream, duplex: 'half' }), env);
  assert.equal(r.status, 413); assert.equal(rows(env).length, 0);
});

test('owner routes need the token; a weak or missing server token locks everything', async () => {
  const env = mkEnv();
  assert.equal((await admin(env, '/api/admin/reservations', { token: 'wrong' })).status, 401);
  assert.equal((await worker.fetch(new Request('https://api.test/api/admin/reservations', { headers: { Origin: SITE } }), env)).status, 401);
  assert.equal((await admin(env, '/api/admin/reservations')).status, 200);
  assert.equal((await admin(mkEnv({ ADMIN_TOKEN: 'short' }), '/api/admin/reservations', { token: 'short' })).status, 401);
  assert.equal((await admin(mkEnv({ ADMIN_TOKEN: undefined }), '/api/admin/reservations', { token: '' })).status, 401);
  const r = await admin(env, '/api/admin/reservations'); assert.equal(r.headers.get('Cache-Control'), 'no-store');
});

test('lock-out: after 10 wrong tokens from one address, wrong tokens get 429; the right token still works', async () => {
  const env = mkEnv();
  for (let i = 0; i < 10; i++) assert.equal((await admin(env, '/api/admin/reservations', { token: 'wrong' + i, ip: '3.3.3.3' })).status, 401);
  assert.equal((await admin(env, '/api/admin/reservations', { token: 'wrong-again', ip: '3.3.3.3' })).status, 429);
  assert.equal((await admin(env, '/api/admin/reservations', { ip: '3.3.3.3' })).status, 200, 'the real owner behind a shared address is never locked out');
  assert.equal((await admin(env, '/api/admin/reservations', { token: 'wrong', ip: '4.4.4.4' })).status, 401);
});

test('owner: list newest first, filter, change status and notes, erase', async () => {
  const env = mkEnv(); const refs = [];
  for (const [n, ip] of [['First Person', '1.0.0.1'], ['Second Person', '1.0.0.2'], ['Third Person', '1.0.0.3']]) {
    await new Promise((r) => setTimeout(r, 5)); refs.push((await (await post(env, { ...GOOD, name: n, email: n.split(' ')[0].toLowerCase() + '@x.ie' }, { 'CF-Connecting-IP': ip })).json()).ref);
  }
  let list = (await (await admin(env, '/api/admin/reservations')).json()).reservations;
  assert.deepEqual(list.map((r) => r.name), ['Third Person', 'Second Person', 'First Person']);
  assert.equal((await (await admin(env, '/api/admin/reservations?q=second')).json()).reservations.length, 1);
  assert.equal((await (await admin(env, '/api/admin/reservations?q=%25')).json()).reservations.length, 3, 'a % in the search is not a wildcard');
  assert.equal((await admin(env, '/api/admin/reservations/' + refs[0], { method: 'PATCH', body: { status: 'paid', notes: 'Paid by bank transfer' } })).status, 200);
  assert.equal((await (await admin(env, '/api/admin/reservations?status=paid')).json()).reservations[0].notes, 'Paid by bank transfer');
  assert.equal((await admin(env, '/api/admin/reservations/' + refs[0], { method: 'PATCH', body: { status: 'bogus' } })).status, 400);
  assert.equal((await admin(env, '/api/admin/reservations/' + refs[0], { method: 'PATCH', body: {} })).status, 400);
  assert.equal((await admin(env, '/api/admin/reservations/R-ZZZZZZ', { method: 'PATCH', body: { status: 'paid' } })).status, 404);
  assert.equal((await admin(env, '/api/admin/reservations/' + refs[1], { method: 'DELETE' })).status, 200);
  assert.equal((await admin(env, '/api/admin/reservations/' + refs[1], { method: 'DELETE' })).status, 404);
  assert.equal(rows(env).length, 2);
  assert.equal((await admin(env, '/api/admin/reservations/not-a-ref', { method: 'DELETE' })).status, 404);
});

test('CSV export: one row each, quotes escaped, spreadsheet formulas defused', async () => {
  const env = mkEnv();
  await post(env, { ...GOOD, name: '=HYPERLINK("http://evil","x")', area: '+cmd|calc' });
  const r = await admin(env, '/api/admin/export.csv'); const t = await r.text();
  assert.match(r.headers.get('Content-Type'), /text\/csv/);
  assert.ok(t.includes(`"'=HYPERLINK(""http://evil"",""x"")"`) && t.includes(`"'+cmd|calc"`), t);
  assert.equal(t.trim().split('\r\n').length, 2);
});

test('the admin page never puts reservation data into the page as markup', () => {
  const js = fs.readFileSync(new URL('../../docs/js/admin.js', import.meta.url), 'utf8');
  assert.ok(!/innerHTML\s*[+]?=\s*[^;]*\b(r|row|res|reservation|data|d)\./.test(js), 'reservation fields must go in with textContent');
  assert.ok(!js.includes('eval(') && !js.includes('document.write'));
});

test('pasting an order email makes an order with its own certificate code (owner key or Ronan key)', async () => {
  const EMAILTXT = ['What would you like?', '', 'Sponsorship certificate', 'Name on the certificate', '', 'Anne Doyle', 'Tree', '', 'Reed (Ngetal)', 'From', '', 'Tommy boy',
    'Personal message', '', 'happy christmas', 'Your name', '', 'Tommy boy', 'Your email', '', 'conorc33@gmail.com', 'Your phone', '', 'Dublin area or Eircode', '', 'D4',
    'Needed by', '', '2026-12-15', 'email', '', 'conorc33@gmail.com', 'Consent', '', 'Yes'].join('\n');
  const env = mkEnv({ RONAN_TOKEN: 'R'.repeat(40) });
  const r = await admin(env, '/api/admin/import', { method: 'POST', body: { text: EMAILTXT }, token: 'R'.repeat(40) });
  const j = await r.json();
  assert.equal(r.status, 201); assert.match(j.reservation.ref, /^R-[A-Z2-9]{6}$/); assert.equal(j.kind, 'cert');
  assert.equal(j.reservation.cert_name, 'Anne Doyle'); assert.equal(j.reservation.tree, 'Reed (Ngetal)'); assert.equal(j.reservation.cert_from, 'Tommy boy'); assert.equal(j.reservation.area, 'D4');
  assert.equal(j.reservation.email, 'conorc33@gmail.com'); assert.match(j.reservation.notes, /Needed by: 2026-12-15/); assert.doesNotMatch(j.reservation.notes, /Phone/, 'empty phone is left out');
  assert.equal(rows(env).length, 1);
  const again = await (await admin(env, '/api/admin/import', { method: 'POST', body: { text: EMAILTXT } })).json();
  assert.notEqual(again.reservation.ref, j.reservation.ref, 'every certificate gets its own code');
  assert.equal((await admin(env, '/api/admin/import', { method: 'POST', body: { text: EMAILTXT }, token: 'x'.repeat(40) })).status, 401);
  assert.equal((await admin(env, '/api/admin/import', { method: 'POST', body: { text: 'hello' } })).status, 400, 'no headings found: refused, nothing stored');
  const gift = await (await admin(env, '/api/admin/import', { method: 'POST', body: { text: EMAILTXT.replace('Sponsorship certificate', 'Gift card') } })).json();
  assert.equal(gift.kind, 'gift'); assert.equal(rows(env).length, 3);
  const tab = await (await admin(env, '/api/admin/import', { method: 'POST', body: { text: 'Name on the certificate\tBen\nYour name\tAmy\nYour email\tamy@example.ie' } })).json();
  assert.equal(tab.reservation.cert_name, 'Ben', 'heading and value on one line also works');
});

test('a gift card order carries its amount; a certificate ignores it', async () => {
  const mail = (kind, amount) => ['What would you like?', '', kind, 'Name on the certificate', '', 'Mia', 'Tree', '', 'Let them choose (gift card only)', 'From', '', 'Zoe', 'Your name', '', 'Zoe', 'Your email', '', 'zoe@example.ie', 'Gift amount', '', amount].join('\n');
  const env = mkEnv();
  const g = await (await admin(env, '/api/admin/import', { method: 'POST', body: { text: mail('Gift card', '\u20AC 75,50') } })).json();
  assert.equal(g.kind, 'gift'); assert.match(g.reservation.notes, /Amount: \u20AC75\.50/);
  const c = await (await admin(env, '/api/admin/import', { method: 'POST', body: { text: mail('Sponsorship certificate', '50') } })).json();
  assert.doesNotMatch(c.reservation.notes, /Amount/);
  const bad = await (await admin(env, '/api/admin/import', { method: 'POST', body: { text: mail('Gift card', 'lots') } })).json();
  assert.doesNotMatch(bad.reservation.notes, /Amount/, 'a non-number is left out');
});

test('payment received: 15 euro per certificate, marked and undone by the owner, in the list and the CSV', async () => {
  const env = mkEnv();
  const one = await (await post(env, { ...GOOD, interests: ['Celtic astrology certificate'], cert_name: 'Mam' })).json();
  const two = await (await post(env, { ...GOOD, email: 'b@example.ie', interests: ['Christmas tree'] }, { 'CF-Connecting-IP': '2.2.2.2' })).json();
  let list = (await (await admin(env, '/api/admin/reservations')).json());
  const byRef = (l, ref) => l.reservations.find((r) => r.ref === ref);
  assert.equal(list.price_eur, 15);
  assert.equal(byRef(list, one.ref).due_eur, 15, 'a certificate costs 15');
  assert.equal(byRef(list, two.ref).due_eur, 0, 'a Christmas tree alone has no certificate price');
  assert.equal(byRef(list, one.ref).paid_eur, 0);
  assert.equal((await admin(env, '/api/admin/reservations/' + one.ref, { method: 'PATCH', body: { paid: true } })).status, 200);
  list = await (await admin(env, '/api/admin/reservations')).json();
  assert.equal(byRef(list, one.ref).paid_eur, 15); assert.ok(byRef(list, one.ref).paid_at);
  assert.equal((await admin(env, '/api/admin/reservations/' + one.ref, { method: 'PATCH', body: { paid: true, paid_eur: 'x' } })).status, 400);
  assert.equal((await admin(env, '/api/admin/reservations/' + one.ref, { method: 'PATCH', body: { paid: false } })).status, 200);
  list = await (await admin(env, '/api/admin/reservations')).json();
  assert.equal(byRef(list, one.ref).paid_eur, 0); assert.equal(byRef(list, one.ref).paid_at, '');
  assert.equal((await admin(env, '/api/admin/reservations/R-NOPE00', { method: 'PATCH', body: { paid: true } })).status, 404);
  const csv = await (await admin(env, '/api/admin/export.csv')).text();
  assert.ok(csv.split('\r\n')[0].endsWith('due_eur,paid_eur,paid_at,cert_sent_at'));
});

test('a sponsorship with a Christmas tree is settled free; the certificate is stamped sent', async () => {
  const env = mkEnv();
  const o = await (await post(env, { ...GOOD, interests: ['Tree sponsorship'], cert_name: 'Mam' })).json();
  const get = async () => (await (await admin(env, '/api/admin/reservations')).json()).reservations.find((r) => r.ref === o.ref);
  assert.equal((await get()).due_eur, 15);
  assert.equal((await admin(env, '/api/admin/reservations/' + o.ref, { method: 'PATCH', body: { paid: 'free' } })).status, 200);
  let r = await get(); assert.equal(r.paid_eur, 0); assert.ok(r.paid_at, 'free is settled: it has a date');
  assert.equal((await admin(env, '/api/admin/reservations/' + o.ref, { method: 'PATCH', body: { paid: false } })).status, 200);
  r = await get(); assert.equal(r.paid_at, '');
  assert.equal((await admin(env, '/api/admin/reservations/' + o.ref, { method: 'PATCH', body: { cert_sent: true } })).status, 200);
  assert.ok((await get()).cert_sent_at);
  assert.equal((await admin(env, '/api/admin/reservations/' + o.ref, { method: 'PATCH', body: { cert_sent: 'yes' } })).status, 400);
  assert.equal((await admin(env, '/api/admin/reservations/' + o.ref, { method: 'PATCH', body: { cert_sent: false } })).status, 200);
  assert.equal((await get()).cert_sent_at, '');
  assert.ok((await (await admin(env, '/api/admin/export.csv')).text()).split('\r\n')[0].endsWith(',cert_sent_at'));
});

test('import reads the order boxes\' FormSubmit email too (label line, then value line), and never copies an order already in the list', async () => {
  const env = mkEnv();
  const mail = 'Name\tValue\nreference\n(none)\ncertificate_type\nCeltic astrology certificate\nname\nTom Barry\nemail\ntom@example.ie\nborn\n15 June\n' +
    'celtic_tree\nOak \u00b7 Duir (Loyalty, generosity and stability)\ncertificate_name\nSean\ncertificate_from\nTom\ncertificate_message\nHappy birthday\n';
  const r = await admin(env, '/api/admin/import', { method: 'POST', body: { text: mail } });
  assert.equal(r.status, 201); const j = await r.json();
  assert.equal(j.kind, 'astro');
  assert.equal(j.reservation.interests, 'Celtic astrology certificate');
  assert.equal(j.reservation.tree, 'Oak \u00b7 Duir (Loyalty, generosity and stability) \u00b7 born 15 June');
  assert.equal(j.reservation.cert_name, 'Sean'); assert.equal(j.reservation.cert_from, 'Tom'); assert.equal(j.reservation.cert_message, 'Happy birthday');
  const gift = await (await admin(env, '/api/admin/import', { method: 'POST', body: { text: 'what\tGift certificate\nname\tAnn\nemail\tann@example.ie\ncertificate_name\tGranny\n' } })).json();
  assert.equal(gift.reservation.interests, 'Gift certificate');
  const again = await admin(env, '/api/admin/import', { method: 'POST', body: { text: mail.replace('(none)', j.reservation.ref) } });
  assert.equal(again.status, 409); assert.equal((await again.json()).reservation.ref, j.reservation.ref);
});
