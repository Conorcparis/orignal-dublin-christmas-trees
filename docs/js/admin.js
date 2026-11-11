/*
 * Owner's list of reservations. Talks to the orders service with the owner key; the key is never in this file.
 * Everything that came from a customer is put on the page with textContent (never as markup), so nothing a customer types can run as code.
 */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  var API = ((window.SITE_CONFIG || {}).ordersApi || '').replace(/\/$/, '');
  var KEY_NAME = 'dct-owner-key';
  var STATUSES = ['new', 'confirmed', 'paid', 'done', 'cancelled'];
  var $ = function (s) { return document.querySelector(s); };
  var key = '', timer = null;
  var all = [], view = 'orders', sortKey = 'name', sortDir = 1;

  function el(tag, props, children) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === 'text') n.textContent = props[k]; else if (k === 'class') n.className = props[k]; else n.setAttribute(k, props[k]);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  // The key lives in sessionStorage only: it is gone when the tab closes, and never in long-term storage that other pages on this address could read.
  function stored() { try { return sessionStorage.getItem(KEY_NAME) || ''; } catch (e) { return ''; } }
  function store(k) { try { sessionStorage.setItem(KEY_NAME, k); } catch (e) { /* private mode: stays signed in for this page only */ } }
  function forget() { try { sessionStorage.removeItem(KEY_NAME); localStorage.removeItem(KEY_NAME); } catch (e) { /* nothing stored */ } }

  function api(path, opts) {
    opts = opts || {};
    return fetch(API + path, { method: opts.method || 'GET', headers: Object.assign({ Authorization: 'Bearer ' + key }, opts.body ? { 'Content-Type': 'application/json' } : {}), body: opts.body ? JSON.stringify(opts.body) : undefined, cache: 'no-store' });
  }
  function fail(r) {
    if (r.status === 401) { signOut('That key was not accepted.'); return 'Signed out.'; }
    if (r.status === 429) return 'Too many wrong keys from this connection. Try again in an hour.';
    return 'Something went wrong (' + r.status + '). Try again.';
  }

  function signOut(msg) {
    key = ''; forget(); clearInterval(timer);
    $('#panel').classList.add('hidden'); $('#logout').classList.add('hidden'); $('#login').classList.remove('hidden');
    $('#login-msg').textContent = msg || ''; $('#key').value = '';
  }
  function signedIn() { $('#login').classList.add('hidden'); $('#panel').classList.remove('hidden'); $('#logout').classList.remove('hidden'); }

  // address of the certificate maker, filled in for this order
  function certLink(r, kind) {
    var am = /Amount: \u20AC([0-9.]+)/.exec(r.notes || '');
    var p = new URLSearchParams({ email: r.email || '', cust: r.name || '', int: r.interests || '', treetext: r.tree || '', paid: r.paid_eur || '', settled: r.paid_at ? '1' : '',
      kind: kind, amount: am ? am[1] : '', to: r.cert_name || r.name, from: r.cert_from || '', msg: r.cert_message || '', tree: (r.tree || '').split(/[\s·]/)[0].toLowerCase(), no: r.ref, born: ((r.tree || '').match(/born (\d{1,2} [A-Za-z]+)/) || [])[1] || '' });
    return 'certificates.html#' + p.toString();
  }
  function fmt(iso) { var d = new Date(iso); return isNaN(d) ? iso : d.toLocaleString('en-IE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  function line(label, value) { return value ? el('p', { class: 'font-body-sm text-body-sm' }, [el('span', { class: 'font-label-mono-xs text-label-mono-xs text-on-surface-variant uppercase', text: label + ' ' }), el('span', { text: value })]) : null; }

  // The offerings: each order is one kind, with its own label, colour and certificate.
  var KINDS = {
    astro: { label: 'Celtic astrology certificate', cls: 'kind-astro', button: 'Astrology certificate', cert: 'astro' },
    gift: { label: 'Gift certificate', cls: 'kind-gift', button: 'Gift certificate', cert: 'cert' },
    sponsor: { label: 'Tree sponsorship', cls: 'kind-sponsor', button: 'Sponsorship certificate', cert: 'cert' },
    tree: { label: 'Christmas tree', cls: 'kind-tree', button: '', cert: '' }
  };
  function kindOf(r) {
    var i = r.interests || '';
    return /astrology/i.test(i) ? 'astro' : /gift/i.test(i) ? 'gift' : /sponsorship/i.test(i) ? 'sponsor' : 'tree';
  }
  // The birth date travels inside the tree text ("Oak · Duir (meaning) · born 15 June"): shown on its own line.
  function splitTree(t) { var m = String(t || '').match(/^(.*?)\s*\u00b7\s*born (.+)$/); return m ? { tree: m[1], born: m[2] } : { tree: t || '', born: '' }; }

  function card(r) {
    var k = KINDS[kindOf(r)], tb = splitTree(r.tree);
    var sel = el('select', { class: 'h-10 px-2 rounded bg-surface-container border border-outline-variant/40', 'aria-label': 'Status of ' + r.ref });
    STATUSES.forEach(function (s) { if (s === 'paid' && r.status !== 'paid') return; var o = el('option', { value: s, text: s[0].toUpperCase() + s.slice(1) }); if (s === r.status) o.selected = true; sel.appendChild(o); });
    var notes = el('textarea', { class: 'w-full px-3 py-2 rounded bg-surface-container text-on-surface font-body-sm', rows: '2', maxlength: '1000', placeholder: 'Private notes (paid by transfer, delivery slot…)', 'aria-label': 'Notes for ' + r.ref });
    notes.value = r.notes || '';
    var state = el('span', { class: 'font-label-mono-xs text-label-mono-xs text-secondary', role: 'status' });
    var save = function (body) {
      state.textContent = 'Saving…';
      api('/api/admin/reservations/' + encodeURIComponent(r.ref), { method: 'PATCH', body: body }).then(function (res) { state.textContent = res.ok ? 'Saved' : fail(res); }, function () { state.textContent = 'Could not save'; });
    };
    sel.addEventListener('change', function () { save({ status: sel.value }); });
    var saveNotes = el('button', { type: 'button', class: 'px-3 py-2 rounded bg-surface-container text-primary font-button-text text-button-text hover:bg-surface-container-high', text: 'Save notes' });
    saveNotes.addEventListener('click', function () { save({ notes: notes.value }); });
    var del = el('button', { type: 'button', class: 'px-3 py-2 rounded text-error font-button-text text-button-text hover:bg-error-container', text: 'Erase' });
    del.addEventListener('click', function () {
      if (!confirm('Erase ' + r.ref + ' (' + r.name + ') for good? This cannot be undone.')) return;
      api('/api/admin/reservations/' + encodeURIComponent(r.ref), { method: 'DELETE' }).then(function (res) { if (res.ok) load(); else $('#msg').textContent = fail(res); });
    });
    // ---- The four steps: 1 payment, 2 certificate (then Download PDF there), 3 email it, 4 mark it sent ----
    var BTN = 'px-3 py-2 rounded font-button-text text-button-text ';
    var due = +r.due_eur || 0;
    var settled = function () { return !!r.paid_at; };
    var patch = function (body, after) {
      state.textContent = 'Saving…';
      api('/api/admin/reservations/' + encodeURIComponent(r.ref), { method: 'PATCH', body: body }).then(function (res) {
        if (!res.ok) { state.textContent = fail(res); return; }
        state.textContent = 'Saved'; after(); draw(); totals();
      }, function () { state.textContent = 'Could not save'; });
    };
    var step = function (n, title) { return el('div', { class: 'step' }, [el('span', { class: 'step-n', text: String(n) }), el('span', { class: 'step-t', text: title })]); };
    var s1 = el('div', { class: 'step-body' }), s2 = el('div', { class: 'step-body' }), s3 = el('div', { class: 'step-body' }), s4 = el('div', { class: 'step-body' });
    var stepsBox = null;
    function draw() {
      [s1, s2, s3, s4].forEach(function (s) { s.textContent = ''; });
      // 1 payment
      if (!due) s1.appendChild(el('span', { class: 'ok', text: 'No payment for this order' }));
      else if (!settled()) {
        s1.appendChild(el('span', { class: 'todo', text: '€' + due + ' due, not received yet' }));
        var paidBtn = el('button', { type: 'button', class: BTN + 'bg-secondary-container text-on-secondary-container hover:bg-secondary-fixed', text: 'Mark €' + due + ' received' });
        paidBtn.addEventListener('click', function () { patch({ paid: true }, function () { r.paid_eur = due; r.paid_at = new Date().toISOString(); }); });
        s1.appendChild(paidBtn);
        if (kindOf(r) === 'sponsor') {
          var freeBtn = el('button', { type: 'button', class: BTN + 'bg-surface-container text-primary hover:bg-surface-container-high', text: 'Free with a Christmas tree' });
          freeBtn.addEventListener('click', function () { patch({ paid: 'free' }, function () { r.paid_eur = 0; r.paid_at = new Date().toISOString(); }); });
          s1.appendChild(freeBtn);
        }
      } else {
        s1.appendChild(el('span', { class: 'ok', text: (+r.paid_eur ? 'Paid €' + r.paid_eur : 'Free with a Christmas tree') + ' · ' + fmt(r.paid_at) }));
        var undo = el('button', { type: 'button', class: BTN + 'text-primary underline', text: 'Undo' });
        undo.addEventListener('click', function () { patch({ paid: false }, function () { r.paid_eur = 0; r.paid_at = ''; }); });
        s1.appendChild(undo);
      }
      // 2 certificate: opens filled in; Download PDF is on that page
      var ready = !due || settled();
      if (ready) {
        s2.appendChild(el('a', { class: BTN + 'bg-tertiary-container text-on-tertiary hover:bg-tertiary', href: certLink(r, k.cert), target: '_blank', rel: 'noopener', text: 'Open ' + k.button.toLowerCase() }));
        s2.appendChild(el('span', { class: 'hint', text: 'check it, then press Download PDF' }));
      } else s2.appendChild(el('span', { class: 'hint', text: 'Opens once the payment is marked (step 1).' }));
      // 3 email
      s3.appendChild(copyButton(r)); s3.appendChild(emailButton(r.email, r.name, r.ref, r.cert_name, r));
      s3.appendChild(el('span', { class: 'hint', text: 'paste it, attach the PDF, send' }));
      // 4 sent
      if (r.cert_sent_at) {
        s4.appendChild(el('span', { class: 'ok', text: 'Certificate sent · ' + fmt(r.cert_sent_at) }));
        var unsent = el('button', { type: 'button', class: BTN + 'text-primary underline', text: 'Undo' });
        unsent.addEventListener('click', function () { patch({ cert_sent: false }, function () { r.cert_sent_at = ''; }); });
        s4.appendChild(unsent);
      } else {
        var sent = el('button', { type: 'button', class: BTN + 'bg-surface-container text-primary hover:bg-surface-container-high', text: 'Mark certificate sent' });
        sent.addEventListener('click', function () { patch({ cert_sent: true }, function () { r.cert_sent_at = new Date().toISOString(); }); });
        s4.appendChild(sent);
      }
      if (stepsBox) stepsBox.classList.toggle('all-done', !!r.cert_sent_at);
    }
    if (r.cert_name && k.cert) {
      draw();
      stepsBox = el('div', { class: 'steps' + (r.cert_sent_at ? ' all-done' : '') }, [
        step(1, 'Payment'), s1, step(2, 'Certificate'), s2, step(3, 'Email'), s3, step(4, 'Sent'), s4]);
    }
    var mail = el('a', { class: 'underline text-primary', href: 'mailto:' + encodeURIComponent(r.email).replace('%40', '@'), text: r.email });
    return el('li', { class: 'bg-surface-container-lowest rounded-lg shadow-sm p-5 flex flex-col gap-2' }, [
      el('div', { class: 'flex flex-wrap items-center justify-between gap-2' }, [
        el('div', { class: 'flex flex-wrap items-center gap-3' }, [el('span', { class: 'kind-badge ' + k.cls, text: k.label }), el('span', { class: 'font-label-mono-sm text-label-mono-sm font-bold text-primary', text: r.ref }), el('span', { class: 'font-label-mono-xs text-label-mono-xs text-on-surface-variant', text: fmt(r.created_at) })]),
        el('div', { class: 'flex items-center gap-2' }, [sel, state])]),
      el('h2', { class: 'font-headline-sm text-headline-sm text-primary', text: r.name }),
      el('p', { class: 'font-body-sm text-body-sm' }, [mail]),
      kindOf(r) === 'tree' || /,/.test(r.interests || '') ? line('Ordered', r.interests) : null,
      line(kindOf(r) === 'astro' ? 'Birth tree' : 'Tree', tb.tree), line('Born', tb.born), line('Area', r.area),
      line('Name on certificate', r.cert_name), line('From', r.cert_from), line('Message', r.cert_message),
      stepsBox, notes,
      el('div', { class: 'flex flex-wrap items-center gap-2' }, [saveNotes, del])]);
  }

  // Money: received and still due (15 euro per certificate), for the orders shown.
  function totals() {
    var box = $('#money'); if (!box) { box = el('p', { id: 'money', class: 'font-body-md text-body-md font-semibold text-primary' }); $('#summary').insertAdjacentElement('afterend', box); }
    var got = 0, owed = 0, open = 0;
    all.forEach(function (x) { if (x.status === 'cancelled') return; var due = +x.due_eur || 0, paid = +x.paid_eur || 0; got += paid; if (due && !x.paid_at) { owed += due; open++; } });
    box.textContent = all.length ? 'Payments received: \u20AC' + got + ' \u00b7 still due: \u20AC' + owed + ' (' + open + ' order' + (open === 1 ? '' : 's') + ')' : '';
  }

  function load() {
    if (!API) { $('#msg').textContent = 'The orders service is not connected yet.'; return; }
    var qs = new URLSearchParams(); if ($('#f-status').value) qs.set('status', $('#f-status').value); if ($('#f-q').value.trim()) qs.set('q', $('#f-q').value.trim());
    api('/api/admin/reservations' + (qs.toString() ? '?' + qs : '')).then(function (r) {
      if (!r.ok) { $('#msg').textContent = fail(r); return; }
      return r.json().then(function (j) {
        $('#msg').textContent = '';
        var list = $('#list'); list.textContent = '';
        var want = ($('#f-kind') || {}).value || '';
        if (want) j.reservations = j.reservations.filter(function (x) { return kindOf(x) === want; });
        j.reservations.forEach(function (x) { list.appendChild(card(x)); });
        all = j.reservations; renderCustomers(); totals();
        var count = function (s) { return j.reservations.filter(function (x) { return x.status === s; }).length; };
        $('#summary').textContent = j.reservations.length ? j.reservations.length + ' shown: ' + count('new') + ' new, ' + count('confirmed') + ' confirmed, ' + count('paid') + ' paid, ' + count('done') + ' done, ' + count('cancelled') + ' cancelled.' : 'No reservations yet.';
      });
    }, function () { $('#msg').textContent = 'Could not reach the orders service.'; });
  }


  // ---- Customers: one row per email address, sortable; Email opens a ready-written message in the owner's own Gmail or mail app ----
  // The email Ronan sends with the certificate attached (payment received). r = the order; the wording follows the kind of certificate.
  function mailText(name, ref, certName, r) { return window.DCTMail(name, ref, certName, r); }   // js/mailtext.js
  // "Copy email": puts the subject and the text on the clipboard, ready to paste into any mail program with the certificate attached.
  function copyButton(r) {
    var b = el('button', { type: 'button', class: 'px-3 py-2 rounded bg-surface-container text-primary font-button-text text-button-text hover:bg-surface-container-high', text: 'Copy email' });
    b.addEventListener('click', function () {
      var m = mailText(r.name, r.ref, r.cert_name, r), all = 'To: ' + r.email + '\nSubject: ' + m.subject + '\n\n' + m.body;
      var ok = function () { b.textContent = 'Copied: paste it into your email'; setTimeout(function () { b.textContent = 'Copy email'; }, 4000); };
      window.DCTCopy(all, ok);
    });
    return b;
  }
  function emailButton(to, name, ref, certName, r) {
    var t = mailText(name, ref, certName, r);
    var q = 'view=cm&fs=1&to=' + encodeURIComponent(to) + '&su=' + encodeURIComponent(t.subject) + '&body=' + encodeURIComponent(t.body);
    return el('a', { class: 'px-3 py-2 rounded bg-surface-container text-primary font-button-text text-button-text hover:bg-surface-container-high', href: 'https://mail.google.com/mail/?' + q, target: '_blank', rel: 'noopener noreferrer', text: 'Open in Gmail' });
  }
  function customersOf(rows) {
    var map = {};
    rows.forEach(function (r) {
      var k = (r.email || '').toLowerCase(), c = map[k];
      if (!c) c = map[k] = { name: r.name, email: r.email, orders: 0, latest: '', tree: '', status: '', ref: '', certName: '', area: '' };
      c.orders++;
      if (!c.latest || r.created_at > c.latest) { c.latest = r.created_at; c.name = r.name; c.tree = r.tree || ''; c.status = r.status; c.ref = r.ref; c.certName = r.cert_name || ''; c.area = r.area || ''; }
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }
  function renderCustomers() {
    var box = $('#customers'); if (!box) return;
    box.textContent = '';
    var list = customersOf(all).sort(function (a, b) {
      var x = a[sortKey], y = b[sortKey];
      if (typeof x === 'number') return (x - y) * sortDir;
      return String(x || '').toLowerCase().localeCompare(String(y || '').toLowerCase()) * sortDir;
    });
    var cols = [['name', 'Name'], ['email', 'Email'], ['orders', 'Orders'], ['latest', 'Latest order'], ['tree', 'Tree'], ['status', 'Status'], ['area', 'Area']];
    var head = el('tr', {}, cols.map(function (c) {
      var b = el('button', { type: 'button', class: 'font-label-mono-xs text-label-mono-xs uppercase font-bold text-primary', text: c[1] + (sortKey === c[0] ? (sortDir > 0 ? ' \u25B2' : ' \u25BC') : '') });
      b.addEventListener('click', function () { if (sortKey === c[0]) sortDir = -sortDir; else { sortKey = c[0]; sortDir = c[0] === 'latest' || c[0] === 'orders' ? -1 : 1; } renderCustomers(); });
      return el('th', { class: 'text-left px-3 py-2' }, [b]);
    }).concat([el('th', { class: 'px-3 py-2' })]));
    var body = list.map(function (c) {
      var open = el('button', { type: 'button', class: 'px-3 py-2 rounded bg-surface-container text-primary font-button-text text-button-text hover:bg-surface-container-high', text: 'Orders' });
      open.addEventListener('click', function () { $('#f-q').value = c.email; setView('orders'); load(); });
      return el('tr', { class: 'border-t border-outline-variant/30' }, [
        el('td', { class: 'px-3 py-2 font-bold', text: c.name }), el('td', { class: 'px-3 py-2', text: c.email }), el('td', { class: 'px-3 py-2', text: String(c.orders) }),
        el('td', { class: 'px-3 py-2', text: fmt(c.latest) }), el('td', { class: 'px-3 py-2', text: c.tree }), el('td', { class: 'px-3 py-2', text: c.status }), el('td', { class: 'px-3 py-2', text: c.area }),
        el('td', { class: 'px-3 py-2' }, [el('div', { class: 'flex gap-2' }, [emailButton(c.email, c.name, c.ref, c.certName), open])])]);
    });
    box.appendChild(el('table', { class: 'w-full bg-surface-container-lowest rounded-lg shadow-sm font-body-sm text-body-sm' }, [el('thead', {}, [head]), el('tbody', {}, body)]));
    if (!list.length) box.appendChild(el('p', { class: 'font-body-sm text-body-sm text-on-surface-variant mt-2', text: 'No customers yet.' }));
  }
  function setView(v) {
    view = v;
    $('#list').classList.toggle('hidden', v !== 'orders'); $('#customers').classList.toggle('hidden', v !== 'customers');
    [['orders', '#v-orders'], ['customers', '#v-customers']].forEach(function (p) {
      var b = $(p[1]), on = v === p[0];
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.className = 'h-11 px-5 rounded font-button-text text-button-text ' + (on ? 'bg-primary text-on-primary' : 'bg-surface-container text-primary');
    });
  }
  $('#v-orders').addEventListener('click', function () { setView('orders'); });
  $('#v-customers').addEventListener('click', function () { setView('customers'); });

  $('#login-form').addEventListener('submit', function (e) {
    e.preventDefault(); key = $('#key').value.trim(); if (!key) return;
    if (!API) { $('#login-msg').textContent = 'The orders service is not connected yet.'; return; }
    $('#login-msg').textContent = 'Checking…';
    api('/api/admin/reservations').then(function (r) {
      if (r.status === 401) { key = ''; $('#login-msg').textContent = 'That key was not accepted.'; return; }
      if (!r.ok) { $('#login-msg').textContent = fail(r); return; }
      store(key); $('#login-msg').textContent = ''; signedIn(); load(); timer = setInterval(function () { if (!document.hidden) load(); }, 60000);
    }, function () { $('#login-msg').textContent = 'Could not reach the orders service.'; });
  });
  // Paste an order email: the service saves it as an order (its reference is the certificate code) and the certificate opens filled in.
  $('#paste-go').addEventListener('click', function () {
    var text = $('#paste').value.trim(), msg = $('#paste-msg'); if (!text) { msg.textContent = 'Paste the order email first.'; return; }
    msg.textContent = 'Reading\u2026';
    api('/api/admin/import', { method: 'POST', body: { text: text } }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401) { msg.textContent = fail(r); return; }
        if (r.status === 409 && j.reservation) { msg.textContent = 'This order is already in the list as ' + j.reservation.ref + '.'; $('#f-q').value = j.reservation.ref; load(); return; }
        var NAMES = { name: 'the customer name', email: 'the customer email', cert_name: 'the name on the certificate' };
        if (!r.ok) { msg.textContent = j.error === 'invalid' ? 'Could not find ' + Object.keys(j.fields || {}).map(function (f) { return NAMES[f] || f; }).join(', ') + '. Paste the whole order email, with its headings.' : fail(r); return; }
        msg.textContent = 'Added as ' + j.reservation.ref + '.'; $('#paste').value = ''; load();
        window.location.href = certLink(j.reservation, j.kind);
      });
    }, function () { msg.textContent = 'Could not reach the orders service.'; });
  });
  $('#showkey').addEventListener('change', function () { $('#key').type = this.checked ? 'text' : 'password'; });
  $('#logout').addEventListener('click', function () { signOut('Signed out.'); });
  $('#refresh').addEventListener('click', load);
  $('#f-status').addEventListener('change', load);
  if ($('#f-kind')) $('#f-kind').addEventListener('change', load);
  $('#f-q').addEventListener('input', function () { clearTimeout($('#f-q')._t); $('#f-q')._t = setTimeout(load, 300); });
  $('#export').addEventListener('click', function () {
    api('/api/admin/export.csv').then(function (r) { if (!r.ok) { $('#msg').textContent = fail(r); return null; } return r.blob(); }).then(function (b) {
      if (!b) return; var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'reservations.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });
  });

  var saved = stored();
  if (saved && API) {
    key = saved;
    api('/api/admin/reservations').then(function (r) { if (r.ok) { signedIn(); load(); timer = setInterval(function () { if (!document.hidden) load(); }, 60000); } else { signOut(r.status === 401 ? 'Please sign in again.' : ''); } }, function () { signOut(''); });
  }
})();
