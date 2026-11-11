/*
 * Owner's orders page (Ronan). Talks to the orders service with the owner key; the key is never in this file.
 * Everything that came from a customer is put on the page with textContent (never as markup), so nothing a customer types can run as code.
 *
 * Layout (12 Nov 2026): the "add an order that came by email" box on top; then three views of the same orders:
 *   By day   - one fold-out group per order date (today open), each order with its four steps (payment, certificate, email, sent)
 *   Board    - columns by stage: To be paid / Make & send certificate / Sent / Cancelled (buttons, or drag on a computer)
 *   Customers- one row per email address
 * The stage is worked out from the order itself (paid_at, cert_sent_at, status 'cancelled'), so the board and the list can never disagree.
 */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  var API = ((window.SITE_CONFIG || {}).ordersApi || '').replace(/\/$/, '');
  var KEY_NAME = 'dct-owner-key';
  var $ = function (s) { return document.querySelector(s); };
  var key = '', timer = null;
  var all = [], view = 'days', sortKey = 'name', sortDir = 1;
  var openDays = null;            // the day groups the owner has open (kept across refreshes); null = not chosen yet (today opens)
  var BTN = 'px-3 py-2 rounded font-button-text text-button-text ';

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

  // address of the certificate maker, filled in for this order (the part after # never leaves the browser)
  function certLink(r, kind) {
    var am = /Amount: €([0-9.]+)/.exec(r.notes || '');
    var p = new URLSearchParams({ email: r.email || '', cust: r.name || '', int: r.interests || '', treetext: r.tree || '', paid: r.paid_eur || '', settled: r.paid_at ? '1' : '',
      kind: kind, amount: am ? am[1] : '', to: r.cert_name || r.name, from: r.cert_from || '', msg: r.cert_message || '', tree: (r.tree || '').split(/[\s·]/)[0].toLowerCase(), no: r.ref, born: ((r.tree || '').match(/born (\d{1,2} [A-Za-z]+)/) || [])[1] || '' });
    return 'certificates.html#' + p.toString();
  }
  function fmt(iso) { var d = new Date(iso); return isNaN(d) ? iso : d.toLocaleString('en-IE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  function fmtShort(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' }); }
  function line(label, value) { return value ? el('p', { class: 'font-body-sm text-body-sm' }, [el('span', { class: 'font-label-mono-xs text-label-mono-xs text-on-surface-variant uppercase', text: label + ' ' }), el('span', { text: value })]) : null; }

  // ---- the offerings and the stages ----
  var KINDS = {
    astro: { label: 'Celtic astrology certificate', short: 'Astrology', cls: 'kind-astro', button: 'Astrology certificate', cert: 'astro' },
    gift: { label: 'Gift certificate', short: 'Gift', cls: 'kind-gift', button: 'Gift certificate', cert: 'cert' },
    sponsor: { label: 'Tree sponsorship', short: 'Sponsorship', cls: 'kind-sponsor', button: 'Sponsorship certificate', cert: 'cert' },
    tree: { label: 'Christmas tree', short: 'Tree', cls: 'kind-tree', button: '', cert: '' }
  };
  function kindOf(r) {
    var i = r.interests || '';
    return /astrology/i.test(i) ? 'astro' : /gift/i.test(i) ? 'gift' : /sponsorship/i.test(i) ? 'sponsor' : 'tree';
  }
  var STAGES = [['pay', 'To be paid'], ['make', 'Make & send certificate'], ['sent', 'Sent'], ['cancelled', 'Cancelled']];
  var STAGE_NAME = { pay: 'To be paid', make: 'Make & send', sent: 'Sent', cancelled: 'Cancelled' };
  function stageOf(r) {
    if (r.status === 'cancelled') return 'cancelled';
    if (kindOf(r) === 'tree') return r.status === 'done' ? 'sent' : 'pay';   // a Christmas tree on its own has no certificate
    if (r.cert_sent_at || r.status === 'done') return 'sent';
    if ((+r.due_eur || 0) && !r.paid_at) return 'pay';
    return 'make';
  }
  var isTodo = function (r) { var s = stageOf(r); return s === 'pay' || s === 'make'; };
  // The birth date travels inside the tree text ("Oak · Duir (meaning) · born 15 June"): shown on its own line.
  function splitTree(t) { var m = String(t || '').match(/^(.*?)\s*·\s*born (.+)$/); return m ? { tree: m[1], born: m[2] } : { tree: t || '', born: '' }; }

  // one change to an order, then the page is redrawn from the service (so every view agrees)
  function patch(r, body, stateEl) {
    if (stateEl) stateEl.textContent = 'Saving…';
    return api('/api/admin/reservations/' + encodeURIComponent(r.ref), { method: 'PATCH', body: body }).then(function (res) {
      if (!res.ok) { var m = fail(res); if (stateEl) stateEl.textContent = m; else $('#msg').textContent = m; return; }
      load();
    }, function () { var m = 'Could not save. Check the connection and try again.'; if (stateEl) stateEl.textContent = m; else $('#msg').textContent = m; });
  }
  function payButtons(r, stateEl) {
    var due = +r.due_eur || 0, out = [];
    var paid = el('button', { type: 'button', class: BTN + 'bg-secondary-container text-on-secondary-container hover:bg-secondary-fixed', text: 'Mark €' + due + ' received' });
    paid.addEventListener('click', function () { patch(r, { paid: true }, stateEl); });
    out.push(paid);
    if (kindOf(r) === 'sponsor') {
      var free = el('button', { type: 'button', class: BTN + 'bg-surface-container text-primary hover:bg-surface-container-high', text: 'Free with a Christmas tree' });
      free.addEventListener('click', function () { patch(r, { paid: 'free' }, stateEl); });
      out.push(free);
    }
    return out;
  }
  function certButton(r, label) {
    var k = KINDS[kindOf(r)];
    return el('a', { class: BTN + 'bg-tertiary-container text-on-tertiary hover:bg-tertiary', href: certLink(r, k.cert), target: '_blank', rel: 'noopener', text: label || 'Open ' + k.button.toLowerCase() });
  }

  // ---- the full order card (By day view) ----
  function card(r) {
    var k = KINDS[kindOf(r)], tb = splitTree(r.tree), stage = stageOf(r), due = +r.due_eur || 0;
    var state = el('span', { class: 'font-label-mono-xs text-label-mono-xs text-secondary', role: 'status' });
    var notes = el('textarea', { class: 'w-full px-3 py-2 rounded bg-surface-container text-on-surface font-body-sm', rows: '2', maxlength: '1000', placeholder: 'Private notes (paid by Revolut, posted 3 Dec…)', 'aria-label': 'Notes for ' + r.ref });
    notes.value = r.notes || '';
    var saveNotes = el('button', { type: 'button', class: BTN + 'bg-surface-container text-primary hover:bg-surface-container-high', text: 'Save notes' });
    saveNotes.addEventListener('click', function () {
      state.textContent = 'Saving…';
      api('/api/admin/reservations/' + encodeURIComponent(r.ref), { method: 'PATCH', body: { notes: notes.value } }).then(function (res) { if (res.ok) { r.notes = notes.value; notes.dataset.dirty = ''; state.textContent = 'Notes saved'; } else state.textContent = fail(res); }, function () { state.textContent = 'Could not save'; });
    });
    notes.addEventListener('input', function () { notes.dataset.dirty = '1'; });
    var cancel = el('button', { type: 'button', class: BTN + 'text-primary hover:bg-surface-container-high', text: stage === 'cancelled' ? 'Restore order' : 'Cancel order' });
    cancel.addEventListener('click', function () {
      if (stage !== 'cancelled' && !confirm('Cancel ' + r.ref + ' (' + r.name + ')? It moves to Cancelled; you can restore it.')) return;
      patch(r, { status: stage === 'cancelled' ? 'new' : 'cancelled' }, state);
    });
    var del = el('button', { type: 'button', class: BTN + 'text-error hover:bg-error-container', text: 'Erase' });
    del.addEventListener('click', function () {
      if (!confirm('Erase ' + r.ref + ' (' + r.name + ') for good? This cannot be undone.')) return;
      api('/api/admin/reservations/' + encodeURIComponent(r.ref), { method: 'DELETE' }).then(function (res) { if (res.ok) load(); else $('#msg').textContent = fail(res); });
    });

    // the four steps: 1 payment, 2 certificate (Download PDF is on that page), 3 email it, 4 mark it sent
    var stepsBox = null;
    if (r.cert_name && k.cert && stage !== 'cancelled') {
      var step = function (n, title) { return el('div', { class: 'step' }, [el('span', { class: 'step-n', text: String(n) }), el('span', { class: 'step-t', text: title })]); };
      var s1 = el('div', { class: 'step-body' }), s2 = el('div', { class: 'step-body' }), s3 = el('div', { class: 'step-body' }), s4 = el('div', { class: 'step-body' });
      if (!due) s1.appendChild(el('span', { class: 'ok', text: 'No payment for this order' }));
      else if (!r.paid_at) { s1.appendChild(el('span', { class: 'todo', text: '€' + due + ' due, not received yet' })); payButtons(r, state).forEach(function (b) { s1.appendChild(b); }); }
      else {
        s1.appendChild(el('span', { class: 'ok', text: (+r.paid_eur ? 'Paid €' + r.paid_eur : 'Free with a Christmas tree') + ' · ' + fmt(r.paid_at) }));
        var undo = el('button', { type: 'button', class: BTN + 'text-primary underline', text: 'Undo' });
        undo.addEventListener('click', function () { patch(r, { paid: false }, state); });
        s1.appendChild(undo);
      }
      if (!due || r.paid_at) { s2.appendChild(certButton(r)); s2.appendChild(el('span', { class: 'hint', text: 'check it, press Download PDF; the email buttons are under it too' })); }
      else s2.appendChild(el('span', { class: 'hint', text: 'Opens once the payment is marked (step 1).' }));
      s3.appendChild(copyButton(r)); s3.appendChild(emailButton(r.email, r.name, r.ref, r.cert_name, r));
      s3.appendChild(el('span', { class: 'hint', text: 'paste it, attach the PDF, send' }));
      if (r.cert_sent_at) {
        s4.appendChild(el('span', { class: 'ok', text: 'Certificate sent · ' + fmt(r.cert_sent_at) }));
        var unsent = el('button', { type: 'button', class: BTN + 'text-primary underline', text: 'Undo' });
        unsent.addEventListener('click', function () { patch(r, { cert_sent: false }, state); });
        s4.appendChild(unsent);
      } else {
        var sent = el('button', { type: 'button', class: BTN + 'bg-surface-container text-primary hover:bg-surface-container-high', text: 'Mark certificate sent' });
        sent.addEventListener('click', function () { patch(r, { cert_sent: true }, state); });
        s4.appendChild(sent);
      }
      stepsBox = el('div', { class: 'steps' + (r.cert_sent_at ? ' all-done' : '') }, [step(1, 'Payment'), s1, step(2, 'Certificate'), s2, step(3, 'Email'), s3, step(4, 'Sent'), s4]);
    }
    var mail = el('a', { class: 'underline text-primary', href: 'mailto:' + encodeURIComponent(r.email).replace('%40', '@'), text: r.email });
    return el('li', { class: 'order bg-surface-container-lowest rounded-lg shadow-sm p-5 flex flex-col gap-2' + (stage === 'cancelled' ? ' is-cancelled' : ''), id: 'order-' + r.ref }, [
      el('div', { class: 'flex flex-wrap items-center justify-between gap-2' }, [
        el('div', { class: 'flex flex-wrap items-center gap-3' }, [el('span', { class: 'kind-badge ' + k.cls, text: k.label }), el('span', { class: 'font-label-mono-sm text-label-mono-sm font-bold text-primary', text: r.ref }), el('span', { class: 'font-label-mono-xs text-label-mono-xs text-on-surface-variant', text: fmt(r.created_at) })]),
        el('div', { class: 'flex items-center gap-2' }, [el('span', { class: 'stage-pill stage-' + stage, text: STAGE_NAME[stage] }), state])]),
      el('h2', { class: 'font-headline-sm text-headline-sm text-primary', text: r.name }),
      el('p', { class: 'font-body-sm text-body-sm' }, [mail]),
      kindOf(r) === 'tree' || /,/.test(r.interests || '') ? line('Ordered', r.interests) : null,
      line(kindOf(r) === 'astro' ? 'Birth tree' : 'Tree', tb.tree), line('Born', tb.born), line('Area', r.area),
      line('Name on certificate', r.cert_name), line('From', r.cert_from), line('Message', r.cert_message),
      stepsBox, notes,
      el('div', { class: 'flex flex-wrap items-center gap-2' }, [saveNotes, cancel, del])]);
  }

  // ---- By day: one fold-out group per order date, newest first ----
  var dayKey = function (iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-CA', { timeZone: 'Europe/Dublin' }); };   // 2026-11-12
  function dayLabel(k) {
    var today = dayKey(new Date().toISOString()), yest = dayKey(new Date(Date.now() - 864e5).toISOString());
    var d = new Date(k + 'T12:00:00Z'), name = d.toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Dublin' });
    return k === today ? 'Today · ' + name : k === yest ? 'Yesterday · ' + name : name;
  }
  function renderDays(rows) {
    var box = $('#list'); box.textContent = '';
    if (!rows.length) { box.appendChild(el('p', { class: 'font-body-sm text-body-sm text-on-surface-variant', text: 'No orders to show.' })); return; }
    var groups = {}, order = [];
    rows.forEach(function (r) { var k = dayKey(r.created_at); if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(r); });
    order.sort().reverse();
    if (openDays === null) { openDays = {}; openDays[order[0]] = true; }   // first visit: the newest day is open
    var searching = !!$('#f-q').value.trim();
    order.forEach(function (k) {
      var list = groups[k], todo = list.filter(isTodo).length, n = list.length;
      var summary = el('summary', { class: 'day-sum' }, [
        el('span', { class: 'day-name', text: dayLabel(k) }),
        el('span', { class: 'day-count', text: n + ' order' + (n === 1 ? '' : 's') }),
        el('span', { class: todo ? 'day-todo' : 'day-done', text: todo ? todo + ' to do' : 'all done ✓' })]);
      var d = el('details', { class: 'day', 'data-day': k }, [summary, el('ul', { class: 'flex flex-col gap-4 mt-3' }, list.map(card))]);
      if (openDays[k] || searching) d.open = true;
      d.addEventListener('toggle', function () { openDays[k] = d.open; });
      box.appendChild(d);
    });
  }

  // ---- Board: columns by stage; buttons on each card, or drag a card to another column (computer) ----
  var MOVES = {   // what moving a card from one column to another does
    'pay>make': function (r) { return { paid: true }; },
    'make>pay': function (r) { return { paid: false }; },
    'make>sent': function (r) { return { cert_sent: true }; },
    'sent>make': function (r) { return { cert_sent: false }; }
  };
  function moveTo(r, to) {
    var from = stageOf(r); if (from === to) return;
    if (to === 'cancelled') { if (confirm('Cancel ' + r.ref + ' (' + r.name + ')?')) patch(r, { status: 'cancelled' }); return; }
    if (from === 'cancelled') { patch(r, { status: 'new' }); return; }
    var f = MOVES[from + '>' + to];
    if (kindOf(r) === 'tree') { patch(r, { status: to === 'sent' ? 'done' : 'new' }); return; }
    if (!f) { $('#msg').textContent = 'Move ' + r.ref + ' one column at a time (payment first, then the certificate).'; return; }
    patch(r, f(r));
  }
  function mini(r) {
    var k = KINDS[kindOf(r)], stage = stageOf(r), tb = splitTree(r.tree), due = +r.due_eur || 0;
    var acts = [];
    if (stage === 'pay' && due) acts = payButtons(r);
    else if (stage === 'make') {
      acts.push(certButton(r, 'Certificate'));
      var sent = el('button', { type: 'button', class: BTN + 'bg-surface-container text-primary hover:bg-surface-container-high', text: 'Mark sent' });
      sent.addEventListener('click', function () { patch(r, { cert_sent: true }); }); acts.push(sent);
    } else if (stage === 'sent' && r.cert_sent_at) acts.push(el('span', { class: 'hint', text: 'sent ' + fmtShort(r.cert_sent_at) }));
    else if (stage === 'cancelled') {
      var back = el('button', { type: 'button', class: BTN + 'bg-surface-container text-primary hover:bg-surface-container-high', text: 'Restore' });
      back.addEventListener('click', function () { patch(r, { status: 'new' }); }); acts.push(back);
    }
    var open = el('button', { type: 'button', class: 'mini-name', text: r.name });
    open.addEventListener('click', function () { showOrder(r.ref); });
    var m = el('div', { class: 'mini', draggable: 'true', 'data-ref': r.ref }, [
      el('div', { class: 'flex items-center justify-between gap-2' }, [el('span', { class: 'kind-badge ' + k.cls, text: k.short }), el('span', { class: 'mini-ref', text: r.ref })]),
      open,
      el('p', { class: 'mini-line', text: [tb.tree.split(' (')[0], tb.born ? 'born ' + tb.born : '', r.cert_name ? 'for ' + r.cert_name : ''].filter(Boolean).join(' · ') }),
      el('p', { class: 'mini-line', text: (due ? (r.paid_at ? (+r.paid_eur ? 'Paid €' + r.paid_eur : 'Free with a tree') : '€' + due + ' due') : 'No payment') + ' · ordered ' + fmtShort(r.created_at) }),
      acts.length ? el('div', { class: 'mini-acts' }, acts) : null]);
    m.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', r.ref); e.dataTransfer.effectAllowed = 'move'; m.classList.add('dragging'); });
    m.addEventListener('dragend', function () { m.classList.remove('dragging'); });
    return m;
  }
  function renderBoard(rows) {
    var box = $('#board'); box.textContent = '';
    var cutoff = Date.now() - 30 * 864e5;
    STAGES.forEach(function (s) {
      var list = rows.filter(function (r) { return stageOf(r) === s[0]; }), hidden = 0;
      if (s[0] === 'sent' || s[0] === 'cancelled') { var keep = list.filter(function (r) { return new Date(r.cert_sent_at || r.created_at).getTime() >= cutoff; }); hidden = list.length - keep.length; list = keep; }
      list.sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
      var col = el('section', { class: 'col col-' + s[0], 'data-stage': s[0], 'aria-label': s[1] }, [
        el('h3', { class: 'col-h', text: s[1] + ' (' + list.length + ')' }),
        el('div', { class: 'col-cards' }, list.length ? list.map(mini) : [el('p', { class: 'hint', text: 'Nothing here.' })]),
        hidden ? el('p', { class: 'hint', text: '+ ' + hidden + ' older (see By day)' }) : null]);
      col.addEventListener('dragover', function (e) { e.preventDefault(); col.classList.add('drop'); });
      col.addEventListener('dragleave', function () { col.classList.remove('drop'); });
      col.addEventListener('drop', function (e) {
        e.preventDefault(); col.classList.remove('drop');
        var ref = e.dataTransfer.getData('text/plain'), r = all.filter(function (x) { return x.ref === ref; })[0];
        if (r) moveTo(r, s[0]);
      });
      box.appendChild(col);
    });
  }
  // from the board (or anywhere): show one order in full in the By day view
  function showOrder(ref) {
    var r = all.filter(function (x) { return x.ref === ref; })[0]; if (!r) return;
    openDays = openDays || {}; openDays[dayKey(r.created_at)] = true;
    setView('days'); renderDays(all);
    var li = document.getElementById('order-' + ref);
    if (li) { li.scrollIntoView({ behavior: 'smooth', block: 'start' }); li.classList.add('flash'); setTimeout(function () { li.classList.remove('flash'); }, 2000); }
  }

  // ---- totals and the summary line ----
  function totals(rows) {
    var got = 0, owed = 0, open = 0;
    rows.forEach(function (x) { if (x.status === 'cancelled') return; var due = +x.due_eur || 0; got += +x.paid_eur || 0; if (due && !x.paid_at) { owed += due; open++; } });
    $('#money').textContent = rows.length ? 'Payments received: €' + got + ' · still due: €' + owed + ' (' + open + ' order' + (open === 1 ? '' : 's') + ')' : '';
    var c = function (s) { return rows.filter(function (r) { return stageOf(r) === s; }).length; };
    $('#summary').textContent = rows.length ? rows.length + ' orders: ' + c('pay') + ' to be paid, ' + c('make') + ' to make & send, ' + c('sent') + ' sent' + (c('cancelled') ? ', ' + c('cancelled') + ' cancelled' : '') + '.' : 'No orders yet.';
  }

  // ---- loading: the list is redrawn from the service; a refresh never wipes notes being typed or the scroll position ----
  function busy() {
    var a = document.activeElement;
    if (a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && a.type !== 'checkbox'))) return true;
    return !![].slice.call(document.querySelectorAll('#list textarea')).filter(function (t) { return t.dataset.dirty; }).length || !!document.querySelector('.mini.dragging');
  }
  function render() {
    var want = ($('#f-kind') || {}).value || '';
    var rows = want ? all.filter(function (x) { return kindOf(x) === want; }) : all;
    var y = window.scrollY;
    renderDays(rows); renderBoard(rows); renderCustomers(rows); totals(rows);
    window.scrollTo(0, y);
  }
  function load(auto) {
    if (!API) { $('#msg').textContent = 'The orders service is not connected yet.'; return; }
    if (auto && busy()) return;
    var qs = new URLSearchParams(); if ($('#f-q').value.trim()) qs.set('q', $('#f-q').value.trim());
    api('/api/admin/reservations' + (qs.toString() ? '?' + qs : '')).then(function (r) {
      if (!r.ok) { $('#msg').textContent = fail(r); return; }
      return r.json().then(function (j) { $('#msg').textContent = ''; all = j.reservations || []; render(); });
    }, function () { $('#msg').textContent = 'Could not reach the orders service.'; });
  }

  // ---- the email to the customer (wording in js/mailtext.js, shared with the certificate page) ----
  function mailText(name, ref, certName, r) { return window.DCTMail(name, ref, certName, r); }
  function copyButton(r) {
    var b = el('button', { type: 'button', class: BTN + 'bg-surface-container text-primary hover:bg-surface-container-high', text: 'Copy email' });
    b.addEventListener('click', function () {
      var m = mailText(r.name, r.ref, r.cert_name, r);
      window.DCTCopy('To: ' + r.email + '\nSubject: ' + m.subject + '\n\n' + m.body, function () { b.textContent = 'Copied: paste it into your email'; setTimeout(function () { b.textContent = 'Copy email'; }, 4000); });
    });
    return b;
  }
  function emailButton(to, name, ref, certName, r) {
    return el('a', { class: BTN + 'bg-surface-container text-primary hover:bg-surface-container-high', href: window.DCTGmail(to, mailText(name, ref, certName, r)), target: '_blank', rel: 'noopener noreferrer', text: 'Open in Gmail' });
  }

  // ---- Customers: one row per email address, sortable ----
  function customersOf(rows) {
    var map = {};
    rows.forEach(function (r) {
      var k = (r.email || '').toLowerCase(), c = map[k];
      if (!c) c = map[k] = { name: r.name, email: r.email, orders: 0, latest: '', tree: '', stage: '', ref: '', certName: '', row: r };
      c.orders++;
      if (!c.latest || r.created_at > c.latest) { c.latest = r.created_at; c.name = r.name; c.tree = splitTree(r.tree).tree.split(' (')[0]; c.stage = STAGE_NAME[stageOf(r)]; c.ref = r.ref; c.certName = r.cert_name || ''; c.row = r; }
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }
  function renderCustomers(rows) {
    var box = $('#customers'); box.textContent = '';
    var list = customersOf(rows).sort(function (a, b) {
      var x = a[sortKey], y = b[sortKey];
      if (typeof x === 'number') return (x - y) * sortDir;
      return String(x || '').toLowerCase().localeCompare(String(y || '').toLowerCase()) * sortDir;
    });
    var cols = [['name', 'Name'], ['email', 'Email'], ['orders', 'Orders'], ['latest', 'Latest order'], ['tree', 'Tree'], ['stage', 'Stage']];
    var head = el('tr', {}, cols.map(function (c) {
      var b = el('button', { type: 'button', class: 'font-label-mono-xs text-label-mono-xs uppercase font-bold text-primary', text: c[1] + (sortKey === c[0] ? (sortDir > 0 ? ' ▲' : ' ▼') : '') });
      b.addEventListener('click', function () { if (sortKey === c[0]) sortDir = -sortDir; else { sortKey = c[0]; sortDir = c[0] === 'latest' || c[0] === 'orders' ? -1 : 1; } renderCustomers(rows); });
      return el('th', { class: 'text-left px-3 py-2' }, [b]);
    }).concat([el('th', { class: 'px-3 py-2' })]));
    var body = list.map(function (c) {
      var open = el('button', { type: 'button', class: BTN + 'bg-surface-container text-primary hover:bg-surface-container-high', text: 'Latest order' });
      open.addEventListener('click', function () { showOrder(c.ref); });
      return el('tr', { class: 'border-t border-outline-variant/30' }, [
        el('td', { class: 'px-3 py-2 font-bold', text: c.name }), el('td', { class: 'px-3 py-2', text: c.email }), el('td', { class: 'px-3 py-2', text: String(c.orders) }),
        el('td', { class: 'px-3 py-2', text: fmt(c.latest) }), el('td', { class: 'px-3 py-2', text: c.tree }), el('td', { class: 'px-3 py-2', text: c.stage }),
        el('td', { class: 'px-3 py-2' }, [el('div', { class: 'flex gap-2' }, [emailButton(c.email, c.name, c.ref, c.certName, c.row), open])])]);
    });
    box.appendChild(el('table', { class: 'w-full bg-surface-container-lowest rounded-lg shadow-sm font-body-sm text-body-sm' }, [el('thead', {}, [head]), el('tbody', {}, body)]));
    if (!list.length) box.appendChild(el('p', { class: 'font-body-sm text-body-sm text-on-surface-variant mt-2', text: 'No customers yet.' }));
  }

  // ---- views ----
  var VIEWS = [['days', '#v-days', '#list'], ['board', '#v-board', '#board'], ['customers', '#v-customers', '#customers']];
  function setView(v) {
    view = v;
    VIEWS.forEach(function (p) {
      var on = v === p[0], b = $(p[1]);
      $(p[2]).classList.toggle('hidden', !on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.className = 'h-11 px-5 rounded font-button-text text-button-text ' + (on ? 'bg-primary text-on-primary' : 'bg-surface-container text-primary');
    });
  }
  VIEWS.forEach(function (p) { $(p[1]).addEventListener('click', function () { setView(p[0]); }); });

  function start() { signedIn(); setView(view); load(); clearInterval(timer); timer = setInterval(function () { if (!document.hidden) load(true); }, 60000); }
  $('#login-form').addEventListener('submit', function (e) {
    e.preventDefault(); key = $('#key').value.trim(); if (!key) return;
    if (!API) { $('#login-msg').textContent = 'The orders service is not connected yet.'; return; }
    $('#login-msg').textContent = 'Checking…';
    api('/api/admin/reservations').then(function (r) {
      if (r.status === 401) { key = ''; $('#login-msg').textContent = 'That key was not accepted.'; return; }
      if (!r.ok) { $('#login-msg').textContent = fail(r); return; }
      store(key); $('#login-msg').textContent = ''; start();
    }, function () { $('#login-msg').textContent = 'Could not reach the orders service.'; });
  });

  // Add an order that came by email: the service saves it (its reference is the certificate code); it then shows in today's orders.
  $('#paste-go').addEventListener('click', function () {
    var text = $('#paste').value.trim(), msg = $('#paste-msg'); if (!text) { msg.textContent = 'Paste the order email first.'; return; }
    msg.textContent = 'Reading…';
    api('/api/admin/import', { method: 'POST', body: { text: text } }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401) { msg.textContent = fail(r); return; }
        if (r.status === 409 && j.reservation) { msg.textContent = 'This order is already in the list as ' + j.reservation.ref + '.'; $('#paste').value = ''; all.some(function (x) { return x.ref === j.reservation.ref; }) ? showOrder(j.reservation.ref) : load(); return; }
        var NAMES = { name: 'the customer name', email: 'the customer email', cert_name: 'the name on the certificate' };
        if (!r.ok) { msg.textContent = j.error === 'invalid' ? 'Could not find ' + Object.keys(j.fields || {}).map(function (f) { return NAMES[f] || f; }).join(', ') + '. Paste the whole order email, with its headings.' : fail(r); return; }
        msg.textContent = 'Added as ' + j.reservation.ref + '. It is in today’s orders below.'; $('#paste').value = '';
        api('/api/admin/reservations').then(function (x) { return x.ok ? x.json() : null; }).then(function (k) { if (k) { all = k.reservations || []; render(); showOrder(j.reservation.ref); } });
      });
    }, function () { msg.textContent = 'Could not reach the orders service.'; });
  });
  $('#showkey').addEventListener('change', function () { $('#key').type = this.checked ? 'text' : 'password'; });
  $('#logout').addEventListener('click', function () { signOut('Signed out.'); });
  $('#refresh').addEventListener('click', function () { load(); });
  if ($('#f-kind')) $('#f-kind').addEventListener('change', render);
  $('#f-q').addEventListener('input', function () { clearTimeout($('#f-q')._t); $('#f-q')._t = setTimeout(function () { load(); }, 300); });
  $('#export').addEventListener('click', function () {
    api('/api/admin/export.csv').then(function (r) { if (!r.ok) { $('#msg').textContent = fail(r); return null; } return r.blob(); }).then(function (b) {
      if (!b) return; var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'orders.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });
  });

  var saved = stored();
  if (saved && API) {
    key = saved;
    api('/api/admin/reservations').then(function (r) { if (r.ok) start(); else signOut(r.status === 401 ? 'Please sign in again.' : ''); }, function () { signOut(''); });
  }
})();
