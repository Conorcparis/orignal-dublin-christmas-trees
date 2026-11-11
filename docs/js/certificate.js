/*
 * Certificate and gift card maker (owner's tool). Fill in the form, check the preview, press Print or Save as PDF.
 * Nothing is sent anywhere and nothing is stored: the sheet is built in the page from what is typed.
 * Tree details (name, Ogham letter, dates, photo and its credit) come from the <option> tags of the tree menu, written into the page at build time.
 */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  var EMAIL = 'theoriginaldublinchristmastree@gmail.com', SITE = 'www.theoriginaldublinchristmastrees.ie';
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var sheet = $('#sheet'), form = $('#maker'), treeSel = $('#f-tree');

  function longDate(iso) {
    if (!iso) return '';
    var p = iso.split('-'); var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return isNaN(d) ? '' : d.toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function mode() { return (form.querySelector('input[name="kind"]:checked') || {}).value || 'cert'; }
  function field(id) { return ($('#f-' + id).value || '').trim(); }
  // Amount: digits and one decimal point only, shown as euro (50 -> EUR 50, 12.5 -> EUR 12.50). Anything else typed is dropped.
  function money(v) {
    var n = String(v || '').replace(',', '.').replace(/[^0-9.]/g, ''); var parts = n.split('.'); n = parts[0] + (parts.length > 1 ? '.' + parts[1].slice(0, 2) : '');
    if (!n || isNaN(+n) || +n <= 0) return '';
    return '\u20AC' + (n.indexOf('.') >= 0 ? (+n).toFixed(2) : String(+n));
  }
  function blank(text, width) { return text ? '<b>' + esc(text) + '</b>' : '<span class="blank" style="width:' + (width || '9em') + '"></span>'; }

  function treeInfo() {
    var o = treeSel.options[treeSel.selectedIndex];
    if (!o || !o.dataset.name) return null;
    return { name: o.dataset.name, meaning: o.dataset.meaning || o.dataset.trait, irish: o.dataset.irish, ogham: o.dataset.ogham, dates: o.dataset.dates, trait: o.dataset.trait, photo: o.dataset.photo, alt: o.dataset.alt, author: o.dataset.creditAuthor, lic: o.dataset.creditLicense };
  }

  // Sponsorship and gift: the tree that is planted (no astrology). The astrology certificate has its own block (astroBlock).
  function treeBlock(t, cls) {
    return '<div class="treebox ' + cls + '"><img src="' + esc(t.photo) + '" alt="' + esc(t.alt) + '"><div class="treetext">' +
      '<p class="kicker">Native tree planted · Co. Wicklow woodland</p><p class="treename">' + esc(t.name) + ' · ' + esc(t.irish) + '</p>' +
      '<p class="trait">Planted and cared for as part of our native woodland restoration</p><p class="dates">One Christmas tree bought, one native tree planted</p></div></div>';
  }
  function astroBlock(t) {
    return '<div class="treebox cert-tree astro-tree"><img src="' + esc(t.photo) + '" alt="' + esc(t.alt) + '"><div class="treetext">' +
      '<p class="kicker">Birth tree · Celtic tree calendar · Ogham</p><p class="treename">' + esc(t.name) + ' · ' + esc(t.irish) + '</p>' +
      '<p class="ogham" aria-hidden="true">' + esc(t.ogham) + '</p><p class="trait">' + esc(t.meaning) + '</p><p class="dates">' + esc(t.dates) + '</p></div></div>';
  }

  function render() {
    var kindNow = mode();
    // "Recipient chooses" only makes sense for a gift card; a certificate always names a tree
    var needsTree = kindNow !== 'gift';
    treeSel.options[0].hidden = needsTree; treeSel.options[0].disabled = needsTree;
    if (needsTree && !treeSel.value) treeSel.selectedIndex = 1;
    var kind = mode(), t = treeInfo(), to = field('to'), from = field('from'), msg = field('msg'), date = longDate($('#f-date').value), no = field('no');
    document.body.classList.toggle('is-gift', kind === 'gift'); document.body.classList.toggle('is-astro', kind === 'astro');
    sheet.className = 'sheet ' + (kind === 'gift' ? 'sheet-gift' : 'sheet-cert');
    var brand = '<div class="brand"><img class="logo" src="images/logo-512.png" alt="" width="512" height="512"><span>The Original Dublin Christmas Trees</span></div>';
    var credit = t ? '<p class="fine">Photo: ' + esc(t.author) + ', ' + esc(t.lic) + '</p>' : '';
    var message = msg ? '<p class="msg">“' + esc(msg) + '”</p>' : '';
    if (kind === 'astro') {
      var born = field('born');
      sheet.innerHTML = '<div class="frame"><div class="brand astro-brand"><img class="wheel" src="images/logo-astro.webp" alt=""><span>The Original Dublin Christmas Trees</span></div><h2>Celtic Tree Astrology Certificate</h2><p class="lead">The Celtic birth tree of</p>' +
        '<p class="name">' + (to ? esc(to) : '<span class="blank" style="width:14em"></span>') + '</p>' + (born ? '<p class="born">born ' + esc(born) + '</p>' : '') + (t ? astroBlock(t) : '') +
        (msg ? message : '<p class="msg astro-note">Its symbolic tree stands in our Circle of Life, the Celtic tree astrology circle in the Wicklow Mountains.</p>') +
        '<div class="foot"><div><span>From</span>' + blank(from, '9em') + '</div><div><span>Date</span>' + blank(date, '9em') + '</div><div><span>Certificate no.</span>' + blank(no, '6em') + '</div></div>' +
        '<p class="fine">The Original Dublin Christmas Trees · ' + EMAIL + '</p>' + credit + '</div>';
    } else if (kind === 'cert') {
      sheet.innerHTML = '<div class="frame">' + brand + '<h2>Certificate of Sponsorship</h2><p class="lead">A native Irish tree has been planted in the Wicklow Mountains in honour of</p>' +
        '<p class="name">' + (to ? esc(to) : '<span class="blank" style="width:14em"></span>') + '</p>' + (t ? treeBlock(t, 'cert-tree') : '') + message +
        '<div class="foot"><div><span>From</span>' + blank(from, '9em') + '</div><div><span>Date</span>' + blank(date, '9em') + '</div><div><span>Certificate no.</span>' + blank(no, '6em') + '</div></div>' +
        '<p class="fine">The Original Dublin Christmas Trees · ' + EMAIL + '</p>' + credit + '</div>';
    } else {
      var amount = money(field('amount')), covers = field('covers') || (amount ? 'To spend on a native Irish tree, sponsored in your name' : 'A native Irish tree, sponsored in your name'), until = longDate($('#f-until').value);
      sheet.innerHTML = '<div class="frame">' + brand + '<h2>Gift Card</h2><p class="lead">For</p><p class="name">' + (to ? esc(to) : '<span class="blank" style="width:12em"></span>') + '</p>' +
        (amount ? '<p class="amount">' + esc(amount) + '</p>' : '<p class="amount"><span class="blank" style="width:5em"></span></p>') + '<p class="covers">' + esc(covers) + '</p>' + (t ? treeBlock(t, 'gift-tree') : '<p class="choose">Choose your own native tree from the 13 trees of the Celtic calendar.</p>') + message +
        '<div class="foot"><div><span>From</span>' + blank(from, '8em') + '</div><div><span>Voucher no.</span>' + blank(no, '6em') + '</div><div><span>Valid until</span>' + blank(until, '8em') + '</div></div>' +
        '<p class="how">To redeem, reserve at ' + SITE + ' or email ' + EMAIL + ' quoting the voucher number.</p>' + credit + '</div>';
    }
  }

  // today's date as the default
  var now = new Date(), pad = function (n) { return (n < 10 ? '0' : '') + n; };
  $('#f-date').value = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
  // Opened from an order on the admin page: #kind=gift&amount=50&to=...&from=...&msg=...&tree=hazel&no=R-7KQ2MX fills the form in (the hash never leaves the browser)
  (function prefill() {
    var h = (location.hash || '').replace(/^#/, ''); if (!h) return;
    var q = new URLSearchParams(h), set = function (id, v) { if (v) $('#f-' + id).value = v.slice(0, 160); };
    var kind = q.get('kind') === 'gift' ? 'gift' : q.get('kind') === 'astro' ? 'astro' : 'cert'; var r = form.querySelector('input[name="kind"][value="' + kind + '"]'); if (r) r.checked = true;
    var tree = (q.get('tree') || '').toLowerCase(); if (tree && treeSel.querySelector('option[value="' + tree.replace(/[^a-z]/g, '') + '"]')) treeSel.value = tree.replace(/[^a-z]/g, '');
    set('amount', q.get('amount')); set('to', q.get('to')); set('from', q.get('from')); set('msg', q.get('msg')); set('no', q.get('no')); set('born', q.get('born'));
  })();
  form.addEventListener('input', render); form.addEventListener('change', render);
  $('#btn-print').addEventListener('click', function () {
    var who = field('to') || 'recipient', old = document.title;
    document.title = (mode() === 'gift' ? 'Gift card' : mode() === 'astro' ? 'Astrology certificate' : 'Certificate') + ' - ' + who;     // becomes the suggested PDF file name
    // The gift card is A5; the certificate is A4. The paper size is set through the stylesheet object (allowed by the page's security rules), then put back.
    var css = null, added = false;
    for (var i = 0; i < document.styleSheets.length; i++) { if (/certificate\.css/.test(document.styleSheets[i].href || '')) css = document.styleSheets[i]; }
    try { if (css && mode() === 'gift') { css.insertRule('@media print { @page { size: A5 landscape; margin: 0; } }', css.cssRules.length); added = true; } } catch (e) { /* prints on A4 */ }
    window.print(); document.title = old;
    try { if (added) css.deleteRule(css.cssRules.length - 1); } catch (e) { /* nothing to undo */ }
  });
  $('#btn-reset').addEventListener('click', function () { setTimeout(function () { $('#f-date').value = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()); render(); }, 0); });
  render();
})();
