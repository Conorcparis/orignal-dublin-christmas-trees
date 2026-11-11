/**
 * Orders service for The Original Dublin Christmas Trees (a Cloudflare Worker with a D1 database).
 *
 *   POST   /api/reservations            public, from the website only: validates and stores a reservation, returns its reference
 *   GET    /api/admin/reservations      owner: list (?status=&q=), newest 500
 *   PATCH  /api/admin/reservations/:ref owner: change status or notes
 *   DELETE /api/admin/reservations/:ref owner: erase one reservation (data-protection requests)
 *   POST   /api/admin/import            owner: paste an order email, it becomes an order with a unique certificate code
 *   GET    /api/admin/export.csv        owner: everything as CSV
 *
 * The owner routes need "Authorization: Bearer <ADMIN_TOKEN>" (a long random secret set with `wrangler secret put`, never in the repository).
 * No cookies, no tracking. IP addresses are never stored: only a salted one-way hash is kept, and a row is deleted as soon as its window (an hour, or a day for an email address) is over.
 */

const ALLOWED_ORIGINS = ['https://conorcparis.github.io', 'https://temp-llxnuoadqiiujerfpvlv.webadorsite.com', 'https://www.theoriginaldublinchristmastrees.ie', 'https://theoriginaldublinchristmastrees.ie'];  // the GitHub site and the Webador site (temporary address + its real domain)
// localhost is added by the ALLOW_LOCAL variable for local testing only
const INTERESTS = ['Christmas tree', 'Tree sponsorship', 'Gift certificate', 'Celtic astrology certificate'];   // astrology (birth-tree) certificates are a separate kind from sponsorship ones
const STATUSES = ['new', 'confirmed', 'paid', 'done', 'cancelled'];
const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';                   // no 0, O, 1, I, L: references are read out and typed
const MAX_BODY = 8192;
const LIMITS = { name: 80, email: 120, tree: 90, area: 40, cert_name: 60, cert_from: 60, cert_message: 160, notes: 1000 };
const SUBMIT_PER_IP_HOUR = 5, SUBMIT_ALL_HOUR = 60, SUBMIT_PER_EMAIL_DAY = 3, ADMIN_FAILS_PER_HOUR = 10;
const HOUR = 3600, DAY = 86400;

const enc = new TextEncoder();
const json = (obj, status = 200, headers = {}) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', ...headers } });

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const ok = ALLOWED_ORIGINS.includes(origin) || (env.ALLOW_LOCAL === '1' && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin));
  return ok ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '86400' } : null;
}

const CTRL = new RegExp('[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f\\u2028\\u2029]', 'g');          // control characters and line/paragraph separators
const CTRL_KEEP_NL = new RegExp('[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f]', 'g');
const clean = (v, max) => String(v == null ? '' : v).replace(CTRL, '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanMultiline = (v, max) => String(v == null ? '' : v).replace(CTRL_KEEP_NL, '').trim().slice(0, max);
// No ? & = % # / or quotes in an address: they would let a typed address add extra parts (a hidden recipient, a subject) to the mailto: link the owner clicks.
const EMAIL = /^[^\s@<>"',;:()\[\]\\?&=%#\/]+@[^\s@<>"',;:()\[\]\\?&=%#\/]+\.[^\s@<>"',;:()\[\]\\?&=%#\/]{2,}$/;

async function sha256Hex(text) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function timingSafeEqual(a, b) {
  const x = enc.encode(String(a)), y = enc.encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}
function newRef() {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return 'R-' + [...b].map((x) => REF_ALPHABET[x % REF_ALPHABET.length]).join('');
}

// An IPv6 visitor can rotate through millions of addresses in one /64, so the first four groups stand for the whole range.
function ipBucket(request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  return ip.includes(':') ? ip.split(':').slice(0, 4).join(':') : ip;
}
const salt = (env) => env.RATE_SALT || env.ADMIN_TOKEN || 'dev-salt';
async function ipKey(env, kind, request) { return kind + ':' + (await sha256Hex(`${salt(env)}|${ipBucket(request)}`)).slice(0, 32); }

/** Counts hits on a key; a row lives only for its window (ttl seconds) and expired rows are deleted on every call. Returns the count including this hit. */
async function bump(env, key, ttl) {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare('DELETE FROM rate WHERE exp <= ?').bind(now).run();
  const r = await env.DB.prepare('INSERT INTO rate(key, n, exp) VALUES(?, 1, ?) ON CONFLICT(key) DO UPDATE SET n = n + 1 RETURNING n').bind(key, now + ttl).first();
  return r ? r.n : 1;
}
async function count(env, key) {
  const r = await env.DB.prepare('SELECT n FROM rate WHERE key = ? AND exp > ?').bind(key, Math.floor(Date.now() / 1000)).first();
  return r ? r.n : 0;
}

/** Reads the body but gives up as soon as it passes `max` bytes, whether or not the sender declared a length. Returns null when too big. */
async function readLimited(request, max) {
  if (!request.body) return '';
  const reader = request.body.getReader(), chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) { try { await reader.cancel(); } catch { /* already closed */ } return null; }
    chunks.push(value);
  }
  const all = new Uint8Array(total); let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.length; }
  return new TextDecoder().decode(all);
}

// The headings of the website order form (the Webador form), exactly as they appear in the email it sends.
const ORDER_LABELS = ['What would you like?', 'Name on the certificate', 'Tree', 'From', 'Personal message', 'Your name', 'Your email', 'Your phone', 'Dublin area or Eircode', 'Needed by', 'Gift amount', 'How should it reach them?', 'Consent', 'email'];
/** Reads a pasted order email: each heading on its own line with the value on the next line (or after a tab or a colon on the same line). */
function parseOrderEmail(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').map((l) => l.trim());
  const byLower = new Map(ORDER_LABELS.map((l) => [l.toLowerCase(), l]));
  const found = {};
  for (let i = 0; i < lines.length; i++) {
    let label = byLower.get(lines[i].toLowerCase()), value = '';
    if (label) {
      let j = i + 1; while (j < lines.length && lines[j] === '') j++;
      if (j < lines.length && !byLower.has(lines[j].toLowerCase())) { value = lines[j]; i = j; }
    } else {
      const m = lines[i].match(/^(.{2,40}?)\s*(?:\t|:\s)\s*(.*)$/);
      if (m && byLower.has(m[1].trim().toLowerCase())) { label = byLower.get(m[1].trim().toLowerCase()); value = m[2]; }
    }
    if (label && found[label] === undefined) found[label] = value;
  }
  return found;
}
/** Turns the pasted fields into a reservation, or says what is missing. */
function orderFromEmail(found) {
  const gift = (found['What would you like?'] || '').toLowerCase().includes('gift');
  const o = { name: clean(found['Your name'] || found['From'], LIMITS.name), email: clean(found['Your email'] || found['email'], LIMITS.email).toLowerCase(),
    tree: clean(found['Tree'], LIMITS.tree), area: clean(found['Dublin area or Eircode'], LIMITS.area),
    cert_name: clean(found['Name on the certificate'], LIMITS.cert_name), cert_from: clean(found['From'], LIMITS.cert_from), cert_message: clean(found['Personal message'], LIMITS.cert_message),
    interests: gift ? 'Gift certificate' : 'Tree sponsorship' };
  const notes = [];
  if (clean(found['Your phone'], 40)) notes.push('Phone: ' + clean(found['Your phone'], 40));
  const amt = clean(found['Gift amount'], 20).replace(',', '.').replace(/[^0-9.]/g, '');
  if (gift && amt && +amt > 0) notes.push('Amount: \u20AC' + amt);
  if (clean(found['Needed by'], 20)) notes.push('Needed by: ' + clean(found['Needed by'], 20));
  if (clean(found['How should it reach them?'], 40)) notes.push('Delivery: ' + clean(found['How should it reach them?'], 40));
  o.notes = notes.join('\n');
  const errors = {};
  if (!o.name) errors.name = 'required';
  if (!EMAIL.test(o.email)) errors.email = 'invalid';
  if (!o.cert_name) errors.cert_name = 'required';
  return { o, errors, kind: gift ? 'gift' : 'cert' };
}

function validate(b) {
  const errors = {};
  const out = { name: clean(b.name, LIMITS.name), email: clean(b.email, LIMITS.email).toLowerCase(), tree: clean(b.tree, LIMITS.tree), area: clean(b.area, LIMITS.area),
    cert_name: clean(b.cert_name, LIMITS.cert_name), cert_from: clean(b.cert_from, LIMITS.cert_from), cert_message: cleanMultiline(b.cert_message, LIMITS.cert_message).replace(/\s*\n\s*/g, ' ') };
  const wanted = Array.isArray(b.interests) ? b.interests : (typeof b.interests === 'string' ? b.interests.split(',') : []);
  out.interests = [...new Set(wanted.map((x) => clean(x, 40)).filter((x) => INTERESTS.includes(x)))];
  if (!out.name) errors.name = 'required';
  if (!EMAIL.test(out.email)) errors.email = 'invalid';
  if (!out.interests.length) errors.interests = 'required';
  if (b.consent !== true && b.consent !== 'true' && b.consent !== 'yes') errors.consent = 'required';
  if (out.interests.some((i) => i !== 'Christmas tree') && !out.cert_name) errors.cert_name = 'required';
  return { out, errors };
}

async function handleSubmit(request, env, cors) {
  const limited = () => json({ ok: false, error: 'rate_limited' }, 429, { ...cors, 'Retry-After': String(HOUR) });
  if (+(request.headers.get('Content-Length') || 0) > MAX_BODY) return json({ ok: false, error: 'too_large' }, 413, cors);
  // limits come first, so junk and oversized requests are counted too
  if ((await bump(env, await ipKey(env, 'submit', request), HOUR)) > SUBMIT_PER_IP_HOUR) return limited();
  if ((await bump(env, 'submit:all', HOUR)) > SUBMIT_ALL_HOUR) return limited();
  let raw; try { raw = await readLimited(request, MAX_BODY); } catch { return json({ ok: false, error: 'bad_request' }, 400, cors); }
  if (raw === null) return json({ ok: false, error: 'too_large' }, 413, cors);
  let body; try { body = JSON.parse(raw); } catch { return json({ ok: false, error: 'bad_json' }, 400, cors); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ ok: false, error: 'bad_json' }, 400, cors);
  if (body.website) return json({ ok: true, ref: newRef() }, 200, cors);               // hidden field filled in: a bot. Pretend it worked, store nothing.
  const { out, errors } = validate(body);
  if (Object.keys(errors).length) return json({ ok: false, error: 'invalid', fields: errors }, 400, cors);
  if ((await bump(env, 'email:' + (await sha256Hex(`${salt(env)}|${out.email}`)).slice(0, 32), DAY)) > SUBMIT_PER_EMAIL_DAY) return limited();   // one address cannot be used to fill the list
  const now = new Date().toISOString();
  for (let attempt = 0; attempt < 5; attempt++) {
    const ref = newRef();
    try {
      await env.DB.prepare('INSERT INTO reservations(ref, created_at, name, email, interests, tree, area, cert_name, cert_from, cert_message, status, notes, consent_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'new\', \'\', ?)')
        .bind(ref, now, out.name, out.email, out.interests.join(', '), out.tree, out.area, out.cert_name, out.cert_from, out.cert_message, now).run();
      return json({ ok: true, ref }, 201, cors);
    } catch (e) {
      if (!/UNIQUE/i.test(String(e && e.message))) return json({ ok: false, error: 'server' }, 500, cors);   // a clashing reference: try another
    }
  }
  return json({ ok: false, error: 'server' }, 500, cors);
}

async function authorised(request, env) {
  // ADMIN_TOKEN is the owner's key; RONAN_TOKEN (optional) is a second key for the person who makes the certificates. Both are long random Worker secrets.
  const h = request.headers.get('Authorization') || ''
  if (!h.startsWith('Bearer ')) return false;
  let ok = false;
  for (const t of [env.ADMIN_TOKEN, env.RONAN_TOKEN]) if (t && String(t).length >= 24 && timingSafeEqual(h.slice(7), t)) ok = true;   // a weak or missing token never matches
  return ok;
}

const csvCell = (v) => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };    // a cell starting with = + - @ would run as a formula in a spreadsheet

async function handleAdmin(request, env, url, cors) {
  const nostore = { ...cors, 'Cache-Control': 'no-store' };
  if (!(await authorised(request, env))) {
    // wrong or missing token: after 10 in an hour from one address, stop even looking (the right token, 24+ random characters, is never locked out)
    const key = await ipKey(env, 'adminfail', request);
    if ((await count(env, key)) >= ADMIN_FAILS_PER_HOUR) return json({ ok: false, error: 'rate_limited' }, 429, { ...nostore, 'Retry-After': String(HOUR) });
    await bump(env, key, HOUR);
    return json({ ok: false, error: 'unauthorised' }, 401, nostore);
  }
  const path = url.pathname, m = path.match(/^\/api\/admin\/reservations\/(R-[A-Z2-9]{6})$/);
  if (path === '/api/admin/reservations' && request.method === 'GET') {
    const status = url.searchParams.get('status') || '', q = clean(url.searchParams.get('q') || '', 60).toLowerCase();
    const where = [], args = [];
    if (STATUSES.includes(status)) { where.push('status = ?'); args.push(status); }
    if (q) { where.push('(lower(name) LIKE ? OR lower(email) LIKE ? OR lower(ref) LIKE ? OR lower(cert_name) LIKE ?)'); const like = '%' + q.replace(/[%_]/g, '') + '%'; args.push(like, like, like, like); }
    const rows = await env.DB.prepare('SELECT ref, created_at, name, email, interests, tree, area, cert_name, cert_from, cert_message, status, notes FROM reservations' + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY created_at DESC LIMIT 500').bind(...args).all();
    return json({ ok: true, reservations: rows.results || [] }, 200, nostore);
  }
  if (path === '/api/admin/import' && request.method === 'POST') {
    // Paste in an order email: it becomes an order with its own unique certificate code (the reference).
    let raw; try { raw = await readLimited(request, MAX_BODY); } catch { return json({ ok: false, error: 'bad_request' }, 400, nostore); }
    if (raw === null) return json({ ok: false, error: 'too_large' }, 413, nostore);
    let b; try { b = JSON.parse(raw); } catch { return json({ ok: false, error: 'bad_json' }, 400, nostore); }
    const { o, errors, kind } = orderFromEmail(parseOrderEmail(b && b.text));
    if (Object.keys(errors).length) return json({ ok: false, error: 'invalid', fields: errors }, 400, nostore);
    const now = new Date().toISOString();
    for (let attempt = 0; attempt < 5; attempt++) {
      const ref = newRef();
      try {
        await env.DB.prepare('INSERT INTO reservations(ref, created_at, name, email, interests, tree, area, cert_name, cert_from, cert_message, status, notes, consent_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'new\', ?, ?)')
          .bind(ref, now, o.name, o.email, o.interests, o.tree, o.area, o.cert_name, o.cert_from, o.cert_message, o.notes, now).run();
        return json({ ok: true, kind, reservation: { ref, created_at: now, name: o.name, email: o.email, interests: o.interests, tree: o.tree, area: o.area, cert_name: o.cert_name, cert_from: o.cert_from, cert_message: o.cert_message, status: 'new', notes: o.notes } }, 201, nostore);
      } catch (e) {
        if (!/UNIQUE/i.test(String(e && e.message))) return json({ ok: false, error: 'server' }, 500, nostore);
      }
    }
    return json({ ok: false, error: 'server' }, 500, nostore);
  }
  if (path === '/api/admin/export.csv' && request.method === 'GET') {
    const rows = (await env.DB.prepare('SELECT ref, created_at, name, email, interests, tree, area, cert_name, cert_from, cert_message, status, notes FROM reservations ORDER BY created_at DESC').all()).results || [];
    const head = ['ref', 'created_at', 'name', 'email', 'interests', 'tree', 'area', 'cert_name', 'cert_from', 'cert_message', 'status', 'notes'];
    const csv = [head.join(','), ...rows.map((r) => head.map((k) => csvCell(r[k])).join(','))].join('\r\n') + '\r\n';
    return new Response(csv, { status: 200, headers: { ...nostore, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="reservations.csv"', 'X-Content-Type-Options': 'nosniff' } });
  }
  if (m && request.method === 'PATCH') {
    let b; try { b = await request.json(); } catch { return json({ ok: false, error: 'bad_json' }, 400, nostore); }
    const sets = [], args = [];
    if (b && b.status !== undefined) { if (!STATUSES.includes(b.status)) return json({ ok: false, error: 'bad_status' }, 400, nostore); sets.push('status = ?'); args.push(b.status); }
    if (b && b.notes !== undefined) { sets.push('notes = ?'); args.push(cleanMultiline(b.notes, LIMITS.notes)); }
    if (!sets.length) return json({ ok: false, error: 'nothing_to_change' }, 400, nostore);
    const r = await env.DB.prepare('UPDATE reservations SET ' + sets.join(', ') + ' WHERE ref = ?').bind(...args, m[1]).run();
    return (r.meta && r.meta.changes === 0) ? json({ ok: false, error: 'not_found' }, 404, nostore) : json({ ok: true }, 200, nostore);
  }
  if (m && request.method === 'DELETE') {
    const r = await env.DB.prepare('DELETE FROM reservations WHERE ref = ?').bind(m[1]).run();
    return (r.meta && r.meta.changes === 0) ? json({ ok: false, error: 'not_found' }, 404, nostore) : json({ ok: true }, 200, nostore);
  }
  return json({ ok: false, error: 'not_found' }, 404, nostore);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    try {
      if (request.method === 'OPTIONS') return cors ? new Response(null, { status: 204, headers: cors }) : new Response(null, { status: 403 });
      if (url.pathname === '/' && request.method === 'GET') return new Response('The Original Dublin Christmas Trees: orders service.\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      if (!cors && request.method !== 'GET') return json({ ok: false, error: 'origin_not_allowed' }, 403);          // writes only from the website
      if (url.pathname === '/api/reservations' && request.method === 'POST') return handleSubmit(request, env, cors || {});
      if (url.pathname.startsWith('/api/admin/')) return handleAdmin(request, env, url, cors || {});
      return json({ ok: false, error: 'not_found' }, 404, cors || {});
    } catch (e) {
      return json({ ok: false, error: 'server' }, 500, cors || {});
    }
  },
};
