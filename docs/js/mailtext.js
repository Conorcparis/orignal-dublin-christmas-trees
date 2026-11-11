/*
 * The email Ronan sends to the customer with the certificate PDF attached. One copy of the wording, used by the admin page (step 3 of an order)
 * and by the certificate page (right after Download PDF). r = the order: interests, tree, paid_eur, paid_at.
 */
(function () {
  'use strict';
  window.DCTMail = function (name, ref, certName, r) {
    r = r || {};
    var first = (name || '').split(' ')[0] || 'there', interests = r.interests || '', tree = (r.tree || '').split(' (')[0];
    var kind = /astrology/i.test(interests) ? 'astro' : /gift/i.test(interests) ? 'gift' : 'sponsor';
    var what = { astro: 'Celtic astrology certificate', gift: 'gift certificate', sponsor: 'tree sponsorship certificate' }[kind];
    var paid = +r.paid_eur || 0, free = !!r.paid_at && !paid && kind === 'sponsor';
    var lines = ['Hi ' + first + ',', '',
      (paid ? 'Thank you, we have received your payment of €' + paid + '. ' : free ? 'Thank you for buying your Christmas tree with us. ' : 'Thank you for your order. ') +
      'Your ' + what + (certName ? ' for ' + certName : '') + (free ? ', free with your Christmas tree,' : '') + ' is attached.'];
    if (kind === 'astro') lines.push('', 'It shows the Celtic birth tree' + (tree ? ', ' + tree : '') + ', with its Ogham sign and meaning. Its symbolic tree stands in our Circle of Life, the Celtic tree astrology circle in the Wicklow Mountains.');
    else lines.push('', 'A native Irish tree' + (tree && !/not sure/i.test(tree) ? ' (' + tree + ')' : '') + ' is planted ' + (kind === 'gift' && certName ? 'in honour of ' + certName : 'in your name') + ' in our woodland in the Wicklow Mountains, and cared for as part of our native woodland restoration.');
    if (ref) lines.push('', 'Your certificate number is ' + ref + '. Keep it: it is how we find your tree.');
    lines.push('', 'Print it on A4 or keep it as a PDF. If anything on it needs changing, just reply to this email.', '', 'Happy Christmas,', 'Ronan', 'The Original Dublin Christmas Trees', 'theoriginaldublinchristmastree@gmail.com');
    return { subject: 'Your ' + what + ' from The Original Dublin Christmas Trees' + (ref ? ' (' + ref + ')' : ''), body: lines.join('\n') };
  };
  // Puts text on the clipboard (with an old-browser fallback); calls ok() when done.
  window.DCTCopy = function (text, ok) {
    var old = function () {
      var ta = document.createElement('textarea'); ta.style.position = 'fixed'; ta.style.opacity = '0'; ta.value = text; document.body.appendChild(ta); ta.select();
      var done = false; try { done = document.execCommand('copy'); } catch (e) { done = false; }
      ta.remove(); if (done) ok(); else window.prompt('Copy this email (Ctrl+C):', text);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, old); else old();
  };
  window.DCTGmail = function (to, m) { return 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(to) + '&su=' + encodeURIComponent(m.subject) + '&body=' + encodeURIComponent(m.body); };
})();
