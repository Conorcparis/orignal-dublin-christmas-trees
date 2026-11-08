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
  for (const page of ['index.html', 'privacy.html', '404.html']) {
    const h = read(page);
    for (const m of h.matchAll(/(?:src|href)="([^"#?]+)"/g)) {
      const u = m[1];
      if (/^(mailto:|https:\/\/www\.dataprotection\.ie)/.test(u)) continue;
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
    if (!/crest/.test(m[0])) assert.ok(alt[1].length > 15, `alt too short on ${m[0].slice(0, 80)}`);
  }
});

test('JSON-LD parses and describes the organisation without invented facts', () => {
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.deepEqual(ld['@graph'].map((x) => x['@type']), ['Organization', 'WebSite', 'WebPage']);
  assert.equal(ld['@graph'][0].email, 'romacsweeney@gmail.com');
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
