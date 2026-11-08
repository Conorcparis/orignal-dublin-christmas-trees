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
    var p = new URLSearchParams({ kind: kind, to: r.cert_name || r.name, from: r.cert_from || '', msg: r.cert_message || '', tree: (r.tree || '').split(/[\s·]/)[0].toLowerCase(), no: r.ref });
    return 'certificates.html#' + p.toString();
  }
  function fmt(iso) { var d = new Date(iso); return isNaN(d) ? iso : d.toLocaleString('en-IE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  function line(label, value) { return value ? el('p', { class: 'font-body-sm text-body-sm' }, [el('span', { class: 'font-label-mono-xs text-label-mono-xs text-on-surface-variant uppercase', text: label + ' ' }), el('span', { text: value })]) : null; }

  function card(r) {
    var sel = el('select', { class: 'h-10 px-2 rounded bg-surface-container border border-outline-variant/40', 'aria-label': 'Status of ' + r.ref });
    STATUSES.forEach(function (s) { var o = el('option', { value: s, text: s[0].toUpperCase() + s.slice(1) }); if (s === r.status) o.selected = true; sel.appendChild(o); });
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
    var buttons = [];
    if (r.cert_name) {
      buttons.push(el('a', { class: 'px-3 py-2 rounded bg-tertiary-container text-on-tertiary font-button-text text-button-text hover:bg-tertiary', href: certLink(r, 'cert'), text: 'Certificate' }));
      buttons.push(el('a', { class: 'px-3 py-2 rounded bg-primary-container text-on-primary font-button-text text-button-text hover:bg-primary', href: certLink(r, 'gift'), text: 'Gift card' }));
    }
    var mail = el('a', { class: 'underline text-primary', href: 'mailto:' + encodeURIComponent(r.email).replace('%40', '@'), text: r.email });
    return el('li', { class: 'bg-surface-container-lowest rounded-lg shadow-sm p-5 flex flex-col gap-2' }, [
      el('div', { class: 'flex flex-wrap items-center justify-between gap-2' }, [
        el('div', { class: 'flex items-center gap-3' }, [el('span', { class: 'font-label-mono-sm text-label-mono-sm font-bold text-primary', text: r.ref }), el('span', { class: 'font-label-mono-xs text-label-mono-xs text-on-surface-variant', text: fmt(r.created_at) })]),
        el('div', { class: 'flex items-center gap-2' }, [sel, state])]),
      el('h2', { class: 'font-headline-sm text-headline-sm text-primary', text: r.name }),
      el('p', { class: 'font-body-sm text-body-sm' }, [mail]),
      line('Interested in', r.interests), line('Tree', r.tree), line('Area', r.area),
      r.cert_name ? line('Certificate for', r.cert_name + (r.cert_from ? ', from ' + r.cert_from : '')) : null, line('Message', r.cert_message),
      notes,
      el('div', { class: 'flex flex-wrap items-center gap-2' }, buttons.concat([saveNotes, del]))]);
  }

  function load() {
    if (!API) { $('#msg').textContent = 'The orders service is not connected yet.'; return; }
    var qs = new URLSearchParams(); if ($('#f-status').value) qs.set('status', $('#f-status').value); if ($('#f-q').value.trim()) qs.set('q', $('#f-q').value.trim());
    api('/api/admin/reservations' + (qs.toString() ? '?' + qs : '')).then(function (r) {
      if (!r.ok) { $('#msg').textContent = fail(r); return; }
      return r.json().then(function (j) {
        $('#msg').textContent = '';
        var list = $('#list'); list.textContent = '';
        j.reservations.forEach(function (x) { list.appendChild(card(x)); });
        var count = function (s) { return j.reservations.filter(function (x) { return x.status === s; }).length; };
        $('#summary').textContent = j.reservations.length ? j.reservations.length + ' shown: ' + count('new') + ' new, ' + count('confirmed') + ' confirmed, ' + count('paid') + ' paid, ' + count('done') + ' done, ' + count('cancelled') + ' cancelled.' : 'No reservations yet.';
      });
    }, function () { $('#msg').textContent = 'Could not reach the orders service.'; });
  }

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
  $('#logout').addEventListener('click', function () { signOut('Signed out.'); });
  $('#refresh').addEventListener('click', load);
  $('#f-status').addEventListener('change', load);
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
