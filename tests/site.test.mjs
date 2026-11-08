// Static checks for the published site (docs/). Run: npm test   (no browser needed)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const DOCS = path.join(ROOT, 'docs');
const read = (f) => fs.readFileSync(path.join(DOCS, f), 'utf8');
const BASE = 'https://conorcparis.github.io/orignal-dublin-christmas-trees/';
const html = read('index.html');

test('title and description are the right length for search results', () => {
  const title = html.match(/<title>(.*?)<\/title>/)[1];
  const desc = html.match(/<meta name="description" content="(.*?)">/)[1];
  assert.ok(title.length >= 30 && title.length <= 60, `title is ${title.length} characters`);
  assert.ok(desc.length >= 120 && desc.length <= 165, `description is ${desc.length} characters`);
});

test('canonical, Open Graph, Twitter card, language and viewport are set', () => {
  assert.match(html, /<html lang="en-IE">/);
  assert.ok(html.includes(`<link rel="canonical" href="${BASE}">`));
  for (const p of ['og:title', 'og:description', 'og:url', 'og:image', 'og:type', 'og:locale']) assert.ok(html.includes(`property="${p}"`), p);
  for (const n of ['twitter:card', 'twitter:image', 'viewport', 'theme-color']) assert.ok(html.includes(`name="${n}"`), n);
  assert.equal((html.match(/<h1[ >]/g) || []).length, 1, 'exactly one h1');
});

test('every local file the pages point at exists, and nothing loads from another company', () => {
  for (const page of ['index.html', 'privacy.html', '404.html', 'credits.html', 'celtic-tree-calendar.html']) {
    const h = read(page);
    for (const m of h.matchAll(/(?:src|href)="([^"#?]+)"/g)) {
      const u = m[1];
      if (/^(mailto:|https:\/\/www\.dataprotection\.ie|https:\/\/formsubmit\.co$|https:\/\/www\.cloudflare\.com$|https:\/\/commons\.wikimedia\.org(\/wiki\/File:.*)?$|https:\/\/creativecommons\.org\/|https:\/\/www\.dublinlandscaping\.ie\/$|https:\/\/www\.facebook\.com\/p\/Dublin-Landscaping-100063761152359\/$|https:\/\/www\.instagram\.com\/dublinlandscaping\/$)/.test(u)) continue;   // plain links the visitor can follow; nothing is loaded from them
      if (u.startsWith(BASE)) { assert.ok(fs.existsSync(path.join(DOCS, u.slice(BASE.length) || 'index.html')), `${page}: ${u}`); continue; }
      assert.ok(!/^https?:/.test(u), `${page} loads ${u} from outside the site`);
      assert.ok(fs.existsSync(path.join(DOCS, u === './' ? 'index.html' : u)), `${page}: missing ${u}`);
    }
  }
});

test('every image has an alt attribute; photos describe what they show', () => {
  for (const m of html.matchAll(/<img [^>]*>/g)) {
    const alt = m[0].match(/alt="([^"]*)"/);
    assert.ok(alt, `no alt on ${m[0].slice(0, 80)}`);
    if (!/logo-/.test(m[0])) assert.ok(alt[1].length > 15, `alt too short on ${m[0].slice(0, 80)}`);
  }
});

test('JSON-LD parses and describes the organisation without invented facts', () => {
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.deepEqual(ld['@graph'].map((x) => x['@type']), ['Organization', 'WebSite', 'WebPage']);
  assert.equal(ld['@graph'][0].email, 'theoriginaldublinchristmastree@gmail.com');
  assert.ok(!/1,480|20 years|rating|aggregate/i.test(JSON.stringify(ld)));
});

test('sitemap lists only pages that exist; robots points at the sitemap', () => {
  for (const m of read('sitemap.xml').matchAll(/<loc>(.*?)<\/loc>/g)) assert.ok(fs.existsSync(path.join(DOCS, m[1].slice(BASE.length) || 'index.html')), m[1]);
  assert.match(read('robots.txt'), new RegExp(`Sitemap: ${BASE}sitemap.xml`));
});

test('the published beacon is exactly what the beacon kit generated', () => {
  const out = path.join(ROOT, 'beacon-kit', 'out');
  if (!fs.existsSync(out)) return;                                    // kit output is not committed; skip when absent
  assert.equal(read('.well-known/beacon.json'), fs.readFileSync(path.join(out, 'beacon.json'), 'utf8'));
  for (const f of ['beacon.md', 'llms.txt', 'agent.txt']) { if (!fs.existsSync(path.join(out, f))) { assert.ok(!fs.existsSync(path.join(DOCS, f)), `${f} is published but the kit did not generate it`); continue; } assert.equal(read(f), fs.readFileSync(path.join(out, f), 'utf8'), f); }
});

test('guardian tree finder: 28 boundary dates give the right tree', () => {
  const { signIndexFor, TREES, DAYS_IN_MONTH } = require('../docs/js/site.js');
  const want = { '1/1': 'Birch', '1/20': 'Birch', '1/21': 'Rowan', '2/17': 'Rowan', '2/18': 'Ash', '3/17': 'Ash', '3/18': 'Alder', '4/14': 'Alder', '4/15': 'Willow', '5/12': 'Willow', '5/13': 'Hawthorn', '6/9': 'Hawthorn', '6/10': 'Oak', '7/7': 'Oak', '7/8': 'Holly', '8/4': 'Holly', '8/5': 'Hazel', '9/1': 'Hazel', '9/2': 'Vine', '9/29': 'Vine', '9/30': 'Ivy', '10/27': 'Ivy', '10/28': 'Reed', '11/24': 'Reed', '11/25': 'Elder', '12/23': 'Elder', '12/24': 'Birch', '12/31': 'Birch' };
  for (const [k, name] of Object.entries(want)) { const [m, d] = k.split('/').map(Number); assert.equal(TREES[signIndexFor(m, d)].name, name, k); }
  assert.equal(TREES.length, 13);
  assert.equal(DAYS_IN_MONTH[1], 29);
  for (let m = 1; m <= 12; m++) for (let d = 1; d <= DAYS_IN_MONTH[m - 1]; d++) assert.ok(TREES[signIndexFor(m, d)], `${m}/${d} has a tree`);
});

test('published claims stay out of the beacon until the owner confirms them', () => {
  for (const f of ['.well-known/beacon.json', 'llms.txt', 'agent.txt']) assert.ok(!/1,480|20 years|civic partnership|BATCH CERTIFIED|Sustainable Forestry|zero-emission|2035/i.test(read(f)), f);
});

test('carousel: 13 slides in calendar order, each with an existing, described, credited photo', () => {
  const { TREES } = require('../docs/js/site.js');
  const slides = [...html.matchAll(/<button type="button" class="tree-slide[^>]*data-tree="(\d+)" data-photo="([^"]+)"[^>]*data-alt="([^"]+)" data-credit-author="([^"]+)" data-credit-license="([^"]+)" data-credit-url="(https:\/\/commons\.wikimedia\.org[^"]+)">/g)];
  assert.equal(slides.length, 13);
  slides.forEach((m, i) => {
    assert.equal(+m[1], i);
    assert.ok(fs.existsSync(path.join(DOCS, m[2])), `${m[2]} is missing`);
    assert.ok(m[3].length > 15, `alt too short for slide ${i}`);
    assert.match(m[5], /^(CC BY(-SA)? [0-9.]+|CC0)/, `licence for slide ${i}`);
    assert.ok(html.includes(`aria-label="${TREES[i].name}, ${i + 1} of 13"`), `slide label ${TREES[i].name}`);
  });
  assert.ok(html.includes('aria-roledescription="carousel"') && html.includes('id="carousel-prev"') && html.includes('id="carousel-next"'));
});

test('credits page names the photographer and licence for all 13 photos, and is in the sitemap', () => {
  const c = read('credits.html');
  assert.equal((c.match(/<li class="flex/g) || []).length, 13);
  assert.equal((c.match(/Original on Wikimedia Commons/g) || []).length, 13);
  assert.ok(read('sitemap.xml').includes('credits.html'));
  assert.ok(html.includes('href="credits.html"'));
  for (const f of fs.readdirSync(path.join(DOCS, 'images', 'trees'))) assert.ok(c.includes(`images/trees/${f}`), `${f} is not credited`);
});

test('new round logo is used everywhere; the old city shield is not referenced', () => {
  for (const f of ['logo-128.png', 'logo-512.png', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'og-image.jpg']) assert.ok(fs.existsSync(path.join(DOCS, 'images', f)), f);
  for (const page of ['index.html', 'privacy.html', '404.html', 'credits.html', 'certificates.html']) assert.ok(!read(page).includes('dublin-city-crest'), `${page} still shows the city shield`);
  assert.ok(html.includes('images/logo-128.png'));
  assert.ok(JSON.stringify(JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1])).includes('images/logo-512.png'));
});

test('Dublin Landscaping website, Facebook and Instagram are linked and in the beacon', () => {
  for (const u of ['https://www.dublinlandscaping.ie/', 'https://www.facebook.com/p/Dublin-Landscaping-100063761152359/', 'https://www.instagram.com/dublinlandscaping/']) {
    assert.ok(new RegExp(`href="${u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" rel="noopener"`).test(html), u);
    assert.ok(read('.well-known/beacon.json').includes(u), `${u} missing from the beacon`);
  }
});

test('certificate maker: noindex, not in the sitemap, 13 trees with photos, scripts exist', () => {
  const c = read('certificates.html');
  assert.ok(c.includes('<meta name="robots" content="noindex, nofollow">'));
  assert.ok(!read('sitemap.xml').includes('certificates.html') && !html.includes('certificates.html'));
  const opts = [...c.matchAll(/<option value="(\w+)" data-name="[^"]+"[^>]*data-photo="([^"]+)"/g)];
  assert.equal(opts.length, 13);
  for (const o of opts) assert.ok(fs.existsSync(path.join(DOCS, o[2])), o[2]);
  for (const f of ['js/certificate.js', 'css/certificate.css']) assert.ok(fs.existsSync(path.join(DOCS, f)), f);
});

test('admin page: not indexed, strict security policy, key never in the page, no long-term key storage', () => {
  const a = read('admin.html'), js = read('js/admin.js');
  assert.ok(a.includes('<meta name="robots" content="noindex, nofollow, noarchive">') && a.includes('name="referrer" content="no-referrer"'));
  assert.match(a, /Content-Security-Policy" content="default-src 'none'; script-src 'self'/);
  assert.ok(!/Bearer [A-Za-z0-9_-]{20,}/.test(a + js), 'no key in the page');
  assert.ok(!js.includes('localStorage.setItem'), 'the owner key is never put in long-term storage');
  assert.ok(!read('sitemap.xml').includes('admin.html') && !html.includes('admin.html'));
});

test('the orders service address comes from one small config file, and the privacy notice names both services', () => {
  assert.match(read('js/config.js'), /window\.SITE_CONFIG = \{ ordersApi: '(https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev)?' \};/);
  const p = read('privacy.html');
  assert.ok(p.includes('Cloudflare') && p.includes('FormSubmit') && /erase/i.test(p));
});

test('no secret is in the public repository', () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.name === 'node_modules' || e.name === '.git' ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of walk(ROOT)) {
    if (/\.(png|jpe?g|ico|woff2|pdf)$/i.test(f)) continue;
    const t = fs.readFileSync(f, 'utf8');
    assert.ok(!/ADMIN_TOKEN\s*[=:]\s*['"][A-Za-z0-9_\-+/=]{24,}['"]/.test(t), `${f} looks like it holds the owner key`);
    assert.ok(!/Bearer [A-Za-z0-9_\-]{30,}/.test(t) || f.includes('tests'), `${f} holds a bearer token`);
  }
  assert.ok(!fs.existsSync(path.join(ROOT, 'worker', '.admin-key.txt')) || /\.admin-key/.test(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8')), 'the key file must be git-ignored');
  assert.match(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8'), /\.admin-key\.txt/);
  assert.match(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8'), /\.dev\.vars/);
});

const INDEXED = ['index.html', 'credits.html', 'privacy.html', 'celtic-tree-calendar.html'];
test('SEO: every indexed page has a right-length title and description, one H1, a canonical and Open Graph tags, and links to three or more other pages', () => {
  for (const f of INDEXED) {
    const h = read(f);
    const title = h.match(/<title>(.*?)<\/title>/)[1], desc = h.match(/name="description" content="(.*?)"/)[1];
    assert.ok(title.length >= 30 && title.length <= 60, `${f}: title is ${title.length}`);
    assert.ok(desc.length >= 70 && desc.length <= 160, `${f}: description is ${desc.length}`);
    assert.equal((h.match(/<h1[ >]/g) || []).length, 1, `${f}: one h1`);
    assert.ok(h.includes('rel="canonical"'), `${f}: canonical`);
    for (const k of ['og:title', 'og:description', 'og:image', 'og:url']) assert.ok(h.includes(`property="${k}"`), `${f}: ${k}`);
    const others = new Set([...h.matchAll(/href="(\.\/|index\.html|credits\.html|privacy\.html|celtic-tree-calendar\.html)(?:#[^"]*)?"/g)].map((m) => m[1] === './' ? 'index.html' : m[1]));
    others.delete(f);
    assert.ok(others.size >= 3, `${f} links to ${others.size} other pages`);
  }
  for (const f of INDEXED) assert.ok(read('sitemap.xml').includes(f === 'index.html' ? BASE + '</loc>' : BASE + f), `${f} is in the sitemap`);
});

test('GEO: robots.txt, content signals, TDM rights, llms-full.txt, IndexNow key and keywords are all in place', () => {
  const rb = read('robots.txt');
  for (const bot of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended']) assert.match(rb, new RegExp(`^User-agent: ${bot}$`, 'm'), bot);
  assert.match(rb, /Content-Signal: search=yes, ai-input=yes, ai-train=(yes|no)/);
  assert.ok(rb.includes(`Sitemap: ${BASE}sitemap.xml`));
  const td = JSON.parse(read('.well-known/tdmrep.json'));
  assert.ok(Array.isArray(td) && 'tdm-reservation' in td[0]);
  assert.ok(read('llms-full.txt').length > 500 && read('llms.txt').length > 200);
  const bj = JSON.parse(read('.well-known/beacon.json'));
  const loc = bj.beacon.indexnow.key_location, key = loc.split('/').pop().replace('.txt', '');
  assert.equal(read(key + '.txt').trim(), key, 'the IndexNow key file holds its key');
  assert.ok(rb.includes(`IndexNow-Key: ${loc}`));
  assert.ok(bj.keywords.length > 0 && bj.keywords.length <= 30 && bj.keywords.every((k) => k.length >= 2 && k.length <= 60));
  const ld = JSON.parse(read('index.html').match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.ok(ld['@graph'][0].keywords.includes('Christmas trees Dublin'));
  assert.ok(Array.isArray(ld['@graph'][0].sameAs) && ld['@graph'][0].sameAs.some((u) => u.includes('dublinlandscaping.ie')));
});

test('Celtic tree calendar page: 13 trees, each with a photo that exists, an Ogham letter and dates', () => {
  const c = read('celtic-tree-calendar.html');
  const secs = [...c.matchAll(/<section id="(\w+)"[^>]*>.*?<img src="(images\/trees\/\w+\.jpg)"/gs)];
  assert.equal(secs.length, 13);
  for (const m of secs) assert.ok(fs.existsSync(path.join(DOCS, m[2])), m[2]);
  assert.ok(c.includes('Ogham letter') && c.includes('Dec 24') && c.includes('Elder'));
});
