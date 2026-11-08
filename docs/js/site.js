/*
 * The Original Dublin Christmas Trees: page behaviour (no libraries, no cookies, no tracking).
 *  1. Guardian tree finder: month + day -> one of the 13 Celtic tree signs.
 *  2. Tree chips and cards: click or press Enter to show that tree.
 *  3. "Sponsor the X tree" buttons fill the reservation form.
 *  4. Reservation form: checked in the browser, then sent (FORM_ENDPOINT) or opened in the visitor's email app.
 *  5. Mobile menu.
 */
(function () {
  'use strict';

  var EMAIL = 'romacsweeney@gmail.com';
  // Reservations are sent to the owner by FormSubmit (formsubmit.co), a free form-to-email service: no account and no key.
  // The first submission makes FormSubmit email the owner once to confirm the address; submissions sent before that are held and delivered after it.
  // If the service cannot be reached, the form falls back to opening the visitor's own email app with the request written out.
  // Empty string = always use the email app. To switch service, change this address and the payload in sendToService() below.
  var FORM_ENDPOINT = 'https://formsubmit.co/ajax/' + EMAIL;

  var TREES = [
    { name: 'Birch', irish: 'Beith', dates: 'Dec 24 – Jan 20', trait: 'New Beginnings & Renewal', ogham: 'ᚁ', desc: 'Birch pioneers new ground with resilience, inspiring those born in deep midwinter to forge paths of hope.' },
    { name: 'Rowan', irish: 'Luis', dates: 'Jan 21 – Feb 17', trait: 'Vision & Protection', ogham: 'ᚂ', desc: 'Rowan guards the flame of seasonal awakening, sparking artistic clarity and spiritual strength.' },
    { name: 'Ash', irish: 'Nion', dates: 'Feb 18 – Mar 17', trait: 'Spiritual Connection', ogham: 'ᚅ', desc: 'Rooted deep in sacred Irish soil, the ash bridges celestial wonder with grounded daily focus.' },
    { name: 'Alder', irish: 'Fearn', dates: 'Mar 18 – Apr 14', trait: 'Courage & Steadfastness', ogham: 'ᚃ', desc: 'Resilient in wet soils, alder stands unwavering, lending steadfast leadership to early spring.' },
    { name: 'Willow', irish: 'Saille', dates: 'Apr 15 – May 12', trait: 'Intuition & Flexibility', ogham: 'ᚄ', desc: 'Closely bonded to water cycles, the willow guardian moves gracefully through life’s shifting seasons.' },
    { name: 'Hawthorn', irish: 'Huath', dates: 'May 13 – Jun 9', trait: 'Patience & Fairy Lore', ogham: 'ᚆ', desc: 'The fairy tree of Bealtaine embodies patience, guarded strength, and abundant bloom.' },
    { name: 'Oak', irish: 'Duir', dates: 'Jun 10 – Jul 7', trait: 'Strength & Sanctuary', ogham: 'ᚇ', desc: 'Mighty sovereign of the summer solstice, oak offers unwavering sanctuary, stamina, and enduring wisdom.' },
    { name: 'Holly', irish: 'Tinne', dates: 'Jul 8 – Aug 4', trait: 'Nobility & Resilience', ogham: 'ᚈ', desc: 'Unyielding even in the harshest frost, holly champions noble intent and practical determination.' },
    { name: 'Hazel', irish: 'Coll', dates: 'Aug 5 – Sep 1', trait: 'Wisdom & Creativity', ogham: 'ᚉ', desc: 'Keeper of the Well of Segais, the hazel brings analytical sharpness, poetic skill, and profound clarity.' },
    { name: 'Vine', irish: 'Muin', dates: 'Sep 2 – Sep 29', trait: 'Harvest & Balance', ogham: 'ᚋ', desc: 'Gathering autumn fruitfulness, vine personalities orchestrate balance and sensory appreciation.' },
    { name: 'Ivy', irish: 'Gort', dates: 'Sep 30 – Oct 27', trait: 'Tenacity & Loyalty', ogham: 'ᚌ', desc: 'Climbing through every challenge, ivy exhibits unwavering determination and deep personal loyalty.' },
    { name: 'Reed', irish: 'Ngetal', dates: 'Oct 28 – Nov 24', trait: 'Truth & Expression', ogham: 'ᚍ', desc: 'Flexible yet unbreakable in winter winds, the reed digs deep into underground currents of truth.' },
    { name: 'Elder', irish: 'Ruis', dates: 'Nov 25 – Dec 23', trait: 'Renewal & Cycle Transformation', ogham: 'ᚏ', desc: 'The tree of cyclic completion, elder honours the quiet transformation before light returns.' }
  ];

  // First day of each sign from Rowan to Elder. Birch runs Dec 24 to Jan 20, so it wraps over the new year.
  var STARTS = [[1, 21], [2, 18], [3, 18], [4, 15], [5, 13], [6, 10], [7, 8], [8, 5], [9, 2], [9, 30], [10, 28], [11, 25]];
  var DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  function signIndexFor(month, day) {
    var md = month * 100 + day, idx = 0;
    if (md >= 1224 || md < 121) return 0;
    for (var i = 0; i < STARTS.length; i++) if (md >= STARTS[i][0] * 100 + STARTS[i][1]) idx = i + 1;
    return idx;
  }

  if (typeof document === 'undefined') {            // loaded by the tests, not by a browser
    if (typeof module !== 'undefined') module.exports = { TREES: TREES, signIndexFor: signIndexFor, DAYS_IN_MONTH: DAYS_IN_MONTH };
    return;
  }

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  /* ---------- 1 + 2: guardian tree finder, chips, cards ---------- */
  var spotlight = $('#tree-spotlight'), monthSel = $('#birth-month'), daySel = $('#birth-day');
  var PILL_ON = ['bg-[#004B87]', 'text-white', 'border-[#004B87]', 'shadow-sm'];
  var PILL_OFF = ['bg-surface-container', 'text-on-surface', 'border-outline-variant/30', 'hover:border-secondary'];
  var CARD_ON = ['bg-[#004B87]/5', 'border-2', 'border-[#004B87]'];
  var CARD_OFF = ['bg-surface-container-lowest', 'border', 'border-outline-variant/20', 'hover:border-secondary', 'hover:shadow-md'];

  function swap(el, on, off, isOn) {
    (isOn ? off : on).forEach(function (c) { el.classList.remove(c); });
    (isOn ? on : off).forEach(function (c) { el.classList.add(c); });
  }

  // Each tree's photo, description and credit live once, on its carousel slide (data-* attributes, written into the page at build time).
  function slideFor(i) { return document.querySelector('.tree-slide[data-tree="' + i + '"]'); }
  function treePicture(i, t) {
    var sl = slideFor(i);
    if (sl && sl.dataset.photo) {
      return '<img src="' + esc(sl.dataset.photo) + '" alt="' + esc(sl.dataset.alt) + '" width="' + esc(sl.dataset.photoW) + '" height="' + esc(sl.dataset.photoH) + '" class="w-full h-full object-cover">' +
        '<div class="absolute inset-0 bg-gradient-to-t from-primary/70 via-transparent to-transparent"></div>';
    }
    return '<div class="absolute inset-0 flex items-center justify-center"><span class="text-[110px] leading-none text-secondary-fixed" aria-hidden="true">' + t.ogham + '</span></div>';
  }
  function creditLine(i) {
    var sl = slideFor(i);
    return sl && sl.dataset.creditUrl ? '<p class="tree-credit mt-2 font-label-mono-xs text-[10px] leading-snug text-on-surface-variant">Photo: <a class="underline" href="' + esc(sl.dataset.creditUrl) + '" rel="noopener">' + esc(sl.dataset.creditAuthor) + '</a>, ' + esc(sl.dataset.creditLicense) + '</p>' : '';
  }

  function showTree(i, opts) {
    var t = TREES[i]; if (!t || !spotlight) return;
    spotlight.innerHTML =
      '<div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">' +
        '<div class="lg:col-span-5"><div class="relative rounded-xl overflow-hidden shadow-md h-72 bg-primary">' + treePicture(i, t) +
          '<div class="absolute top-3 left-3 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-[#004B87] font-bold font-label-mono-xs text-label-mono-xs shadow-sm flex items-center gap-1.5"><span class="text-[14px]" aria-hidden="true">' + t.ogham + '</span> Ogham letter ' + esc(t.irish) + '</div></div>' + creditLine(i) + '</div>' +
        '<div class="lg:col-span-7 flex flex-col gap-3.5">' +
          '<div class="flex flex-wrap items-center gap-2"><span class="px-3 py-1 rounded-full bg-secondary-container text-on-secondary-container font-label-mono-xs text-label-mono-xs font-bold uppercase tracking-wider">Guardian tree sign</span>' +
            '<span class="px-3 py-1 rounded-full bg-[#004B87]/10 text-[#004B87] font-label-mono-xs text-label-mono-xs font-semibold">' + esc(t.dates) + '</span>' +
            '<span class="px-2.5 py-1 rounded-full bg-surface-container text-on-surface-variant font-label-mono-xs text-label-mono-xs">Celtic moon ' + (i + 1) + ' of 13</span></div>' +
          '<h3 class="font-headline-lg text-headline-lg text-primary tracking-tight">' + esc(t.name) + ' · ' + esc(t.irish) + '</h3>' +
          '<p class="font-label-mono-xs text-label-mono-xs text-secondary font-bold uppercase tracking-wider">' + esc(t.trait) + '</p>' +
          '<p class="font-body-md text-body-md text-on-surface leading-relaxed">' + esc(t.desc) + '</p>' +
          '<div class="flex flex-wrap items-center gap-4 pt-2 border-t border-outline-variant/30"><a class="px-6 py-3 rounded-lg bg-[#004B87] text-white font-button-text text-button-text shadow hover:bg-[#003460] transition-colors flex items-center gap-2" href="#signup-form" data-sponsor-tree="' + i + '"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">spa</span> Sponsor the ' + esc(t.name) + ' tree</a>' +
          '<a class="px-5 py-3 rounded-lg bg-surface-container text-primary font-button-text text-button-text hover:bg-surface-container-high transition-colors" href="#sponsor">View certificate preview</a></div>' +
        '</div></div>';
    $$('.zodiac-pill').forEach(function (b) { var on = +b.dataset.tree === i; swap(b, PILL_ON, PILL_OFF, on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    $$('.calendar-tree-card, .tree-slide').forEach(function (c) { swap(c, CARD_ON, CARD_OFF, +c.dataset.tree === i); c.setAttribute('aria-pressed', +c.dataset.tree === i ? 'true' : 'false'); });
    if (opts && opts.scroll) spotlight.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  }

  function fillDays() {
    if (!monthSel || !daySel) return;
    var m = +monthSel.value, keep = +daySel.value || 15, n = DAYS_IN_MONTH[m - 1], html = '';
    for (var d = 1; d <= n; d++) html += '<option value="' + d + '">' + d + '</option>';
    daySel.innerHTML = html; daySel.value = String(Math.min(keep, n));
  }
  if (monthSel) monthSel.addEventListener('change', fillDays);
  fillDays();

  var reveal = $('#reveal-tree-btn');
  if (reveal) reveal.addEventListener('click', function () { showTree(signIndexFor(+monthSel.value, +daySel.value), { scroll: true }); });

  $$('.zodiac-pill').forEach(function (b) { b.addEventListener('click', function () { showTree(+b.dataset.tree); }); });
  $$('.calendar-tree-card').forEach(function (c) {
    c.addEventListener('click', function () { showTree(+c.dataset.tree, { scroll: true }); });
    c.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showTree(+c.dataset.tree, { scroll: true }); } });
  });

  /* ---------- carousel of all 13 trees ---------- */
  var track = $('#tree-carousel-track'), prevBtn = $('#carousel-prev'), nextBtn = $('#carousel-next');
  if (track && prevBtn && nextBtn) {
    var cardStep = function () { var f = track.firstElementChild; return f ? f.getBoundingClientRect().width + 16 : 300; };
    var syncArrows = function () { prevBtn.disabled = track.scrollLeft <= 2; nextBtn.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2; };
    var page = function (dir) { track.scrollBy({ left: dir * cardStep() * Math.max(1, Math.floor(track.clientWidth / cardStep())), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); };
    prevBtn.addEventListener('click', function () { page(-1); });
    nextBtn.addEventListener('click', function () { page(1); });
    track.addEventListener('scroll', syncArrows, { passive: true });
    window.addEventListener('resize', syncArrows);
    $$('.tree-slide').forEach(function (b) { b.addEventListener('click', function () { showTree(+b.dataset.tree, { scroll: true }); }); });
    syncArrows();
  }

  /* ---------- 3: "Sponsor the X tree" fills the form ---------- */
  var treeSel = $('#tree-sign-select');
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('[data-sponsor-tree]') : null; if (!a || !treeSel) return;
    treeSel.value = TREES[+a.dataset.sponsorTree].name.toLowerCase();
    var boxes = $$('input[name="interest"]'); boxes.forEach(function (b) { b.checked = b.value === 'Tree sponsorship'; }); if (typeof syncCert === 'function') syncCert();
  });

  /* ---------- 4: reservation form ---------- */
  var form = $('#order-form'), formBox = $('#form-content'), okBox = $('#form-success'), status = $('#form-status');
  var certBox = $('#cert-fields');
  // The certificate details (who it is for, who it is from, a message) are asked only when sponsorship or a gift is ticked.
  function wantsCert() { return !!$$('input[name="interest"]:checked').filter(function (b) { return b.value !== 'Christmas tree'; }).length; }
  function syncCert() {
    if (!certBox) return;
    var on = wantsCert(); certBox.classList.toggle('hidden', !on);
    $('#cert-name').required = on;
  }
  function certDetails() {
    if (!certBox || certBox.classList.contains('hidden')) return {};
    var o = { cert_name: $('#cert-name').value.trim() }, f = $('#cert-from').value.trim(), m = $('#cert-message').value.trim();
    if (f) o.cert_from = f; if (m) o.cert_message = m; return o;
  }
  function certText(c) {
    if (!c || !c.cert_name) return '';
    return '\n\nCertificate / gift card details\nName on it: ' + c.cert_name + (c.cert_from ? '\nFrom: ' + c.cert_from : '') + (c.cert_message ? '\nMessage: ' + c.cert_message : '');
  }
  $$('input[name="interest"]').forEach(function (b) { b.addEventListener('change', syncCert); });
  function say(msg) { if (status) status.textContent = msg || ''; }

  function showDone(title, text, details) {
    formBox.classList.add('hidden'); okBox.classList.remove('hidden');
    $('#form-success-title').textContent = title; $('#form-success-text').textContent = text;
    var box = $('#form-summary'); box.value = details; box.classList.toggle('hidden', !details);
    ['#form-copy', '#form-gmail', '#form-outlook', '#form-mail-again'].forEach(function (id) { $(id).classList.toggle('hidden', !details); });
    okBox.scrollIntoView({ block: 'center' }); okBox.setAttribute('tabindex', '-1'); okBox.focus({ preventScroll: true });
  }

  var ctl = null;
  // FormSubmit AJAX: JSON in, JSON out. Fields starting with _ are its settings; "email" becomes the reply-to address.
  function sendToService(d, interests, treeName, text) {
    ctl = new AbortController();
    return fetch(FORM_ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, signal: ctl.signal,
      body: JSON.stringify(Object.assign({ _subject: 'Tree reservation 2026: ' + d.name, _template: 'table', _captcha: 'false', name: d.name, email: d.email, interests: interests.join(', '), tree: treeName, area: d.area || '(not given)' }, d.cert, { message: text }))
    }).then(function (r) { if (!r.ok) throw new Error('status ' + r.status); return r.json(); })
      .then(function (j) {
        if (j && (j.success === true || j.success === 'true')) return;
        if (j && /activation/i.test(String(j.message || ''))) return;   // first ever submission: FormSubmit holds it until the owner confirms its one-time email, then delivers it
        throw new Error('not accepted');
      });
  }

  function mailtoFor(d, text) {
    return 'mailto:' + EMAIL + '?subject=' + encodeURIComponent('Tree reservation 2026: ' + d.name) + '&body=' + encodeURIComponent(text);
  }

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault(); say('');
      if (form.elements.website && form.elements.website.value) { showDone('Go raibh maith agat!', 'Thank you.', ''); return; }   // hidden field filled in: a bot
      var interests = $$('input[name="interest"]:checked').map(function (b) { return b.value; });
      if (!interests.length) { say('Please tick at least one thing you are interested in.'); var first = $('input[name="interest"]'); if (first) first.focus(); return; }
      var treeName = treeSel.options[treeSel.selectedIndex].text;
      var d = { name: form.elements.name.value.trim(), email: form.elements.email.value.trim(), interests: interests, tree: treeName, area: form.elements.area.value.trim(), cert: certDetails() };
      var text = 'Tree reservation request from the website\n\nName: ' + d.name + '\nEmail: ' + d.email + '\nInterested in: ' + interests.join(', ') +
        '\nCircle of Life tree: ' + treeName + '\nDublin area or Eircode: ' + (d.area || '(not given)') + certText(d.cert) +
        '\n\nThe sender agreed to be contacted about tree delivery and woodland certification.\nSent: ' + new Date().toISOString();
      var btn = form.querySelector('button[type="submit"]');

      function viaEmailApp(prefix) {
        var link = mailtoFor(d, text), subj = 'Tree reservation 2026: ' + d.name;
        $('#form-mail-again').setAttribute('href', link);
        $('#form-gmail').setAttribute('href', 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(EMAIL) + '&su=' + encodeURIComponent(subj) + '&body=' + encodeURIComponent(text));
        $('#form-outlook').setAttribute('href', 'https://outlook.live.com/mail/0/deeplink/compose?to=' + encodeURIComponent(EMAIL) + '&subject=' + encodeURIComponent(subj) + '&body=' + encodeURIComponent(text));
        showDone('One more step: send the email', (prefix || '') + 'Your request is written out below. Send it with Gmail or Outlook, or with your computer\'s email app, whichever you use. Or copy the text and email it to ' + EMAIL + '.', text);
        window.location.href = link;
      }

      if (!FORM_ENDPOINT) { viaEmailApp(''); return; }
      btn.disabled = true; say('Sending…');
      var timer = setTimeout(function () { ctl.abort(); }, 10000);
      sendToService(d, interests, treeName, text)
        .then(function () { clearTimeout(timer); btn.disabled = false; say(''); showDone('Go raibh maith agat!', 'Your reservation request has been received. We will email you at ' + d.email + ' to confirm.', ''); })
        .catch(function () { clearTimeout(timer); btn.disabled = false; say(''); viaEmailApp('We could not send it from this page. '); });
    });
    var copy = $('#form-copy');
    if (copy) copy.addEventListener('click', function () {
      var box = $('#form-summary'), done = function () { copy.textContent = 'Copied'; }, fail = function () { copy.textContent = 'Press Ctrl+C'; }, legacy = false;
      box.focus(); box.select();
      try { legacy = document.execCommand('copy'); } catch (_) { legacy = false; }       // works straight from the click in every browser
      if (legacy) { done(); return; }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(box.value).then(done, fail); else fail();
    });
  }

  /* ---------- 5: mobile menu ---------- */
  var menuBtn = $('#menu-btn'), menu = $('#mobile-nav');
  if (menuBtn && menu) {
    var setMenu = function (open) { menu.classList.toggle('hidden', !open); menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false'); menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu'); menuBtn.firstElementChild.textContent = open ? 'close' : 'menu'; };
    menuBtn.addEventListener('click', function () { setMenu(menu.classList.contains('hidden')); });
    menu.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });
  }
})();
