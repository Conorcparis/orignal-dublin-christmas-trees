import sys
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
URL = sys.argv[2] if len(sys.argv) > 2 else 'http://127.0.0.1:8765/'
ORIGIN = URL.split('/')[0] + '//' + URL.split('/')[2]
res = []


def ok(name, cond, detail=''):
    res.append((cond, name, detail))
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{detail}]' if detail and not cond else ''))


with sync_playwright() as p:
    b = p.chromium.launch()
    # ---------- desktop
    pg = b.new_page(viewport={'width': 1280, 'height': 900})
    errs, failed = [], []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('requestfailed', lambda r: failed.append(r.url))
    pg.on('response', lambda r: failed.append(f'{r.status} {r.url}') if r.status >= 400 else None)
    pg.goto(URL, wait_until='networkidle')
    ok('no console or page errors', not errs, str(errs[:3]))
    ok('no failed or 4xx requests', not failed, str(failed[:3]))
    urls = pg.evaluate("performance.getEntriesByType('resource').map(e=>e.name)")
    ok('no request leaves the site (no Google, no CDN)', all(u.startswith(ORIGIN) for u in urls), str([u for u in urls if not u.startswith(ORIGIN)][:3]))
    fonts = pg.evaluate("Promise.all([document.fonts.load('600 40px \"Playfair Display\"'),document.fonts.load('400 16px \"Plus Jakarta Sans\"'),document.fonts.load('500 12px \"JetBrains Mono\"'),document.fonts.load('24px \"Material Symbols Outlined\"')]).then(a=>a.map(x=>x.length))")
    ok('all four self-hosted fonts load', all(n > 0 for n in fonts), str(fonts))
    ok('Ogham letters have a font (no empty boxes)', pg.evaluate("document.fonts.load('16px \"Noto Sans Ogham\"', '\\u1681').then(a=>a.length)") > 0)
    pg.evaluate("document.querySelectorAll('img[loading=lazy]').forEach(i => { i.loading = 'eager'; })")   # pictures far off-screen load on demand; wake them so every file is checked
    pg.wait_for_load_state('networkidle')
    pg.wait_for_timeout(500)
    imgs = pg.evaluate("[...document.images].map(i=>({src:i.getAttribute('src'),ok:i.complete&&i.naturalWidth>0,alt:i.getAttribute('alt')}))")
    ok('every image loads', all(i['ok'] for i in imgs), str([i['src'] for i in imgs if not i['ok']]))
    ok('every image has an alt attribute', all(i['alt'] is not None for i in imgs))
    ok('photos have descriptive alt text; the logo is decorative (empty alt, brand name beside it)', all(len(i['alt']) > 15 for i in imgs if 'logo' not in i['src']) and all(i['alt'] == '' for i in imgs if 'logo' in i['src']), str(imgs))
    ok('icons render as glyphs, not words', pg.evaluate("[...document.querySelectorAll('.material-symbols-outlined')].every(e=>e.getBoundingClientRect().width<60)"))
    bad = pg.evaluate("[...document.querySelectorAll('a[href^=\"#\"]')].filter(a=>a.getAttribute('href').length>1&&!document.querySelector(a.getAttribute('href'))).map(a=>a.getAttribute('href'))")
    ok('every in-page link has a target', not bad, str(bad))
    ok('exactly one H1', pg.evaluate("document.querySelectorAll('h1').length") == 1)
    ok('title, description, canonical, og:image, JSON-LD, beacon link present', all(pg.evaluate(f"!!document.querySelector('{s}')") for s in ['title', 'meta[name=description]', 'link[rel=canonical]', 'meta[property="og:image"]', 'script[type="application/ld+json"]', 'link[rel=beacon]']))
    ld = pg.evaluate("JSON.parse(document.querySelector('script[type=\"application/ld+json\"]').textContent)['@graph'].map(x=>x['@type'])")
    ok('JSON-LD parses: Organization, WebSite, WebPage', ld == ['Organization', 'WebSite', 'WebPage'], str(ld))
    # ---------- finder
    cases = {(1, 1): 'Birch', (1, 20): 'Birch', (1, 21): 'Rowan', (2, 17): 'Rowan', (2, 18): 'Ash', (3, 17): 'Ash', (3, 18): 'Alder', (4, 14): 'Alder', (4, 15): 'Willow', (5, 12): 'Willow',
             (5, 13): 'Hawthorn', (6, 9): 'Hawthorn', (6, 10): 'Oak', (7, 7): 'Oak', (7, 8): 'Holly', (8, 4): 'Holly', (8, 5): 'Hazel', (9, 1): 'Hazel', (9, 2): 'Vine', (9, 29): 'Vine',
             (9, 30): 'Ivy', (10, 27): 'Ivy', (10, 28): 'Reed', (11, 24): 'Reed', (11, 25): 'Elder', (12, 23): 'Elder', (12, 24): 'Birch', (12, 31): 'Birch'}
    wrong = []
    for (m, d), want in cases.items():
        pg.select_option('#birth-month', str(m))
        pg.select_option('#birth-day', str(d))
        pg.click('#reveal-tree-btn')
        got = pg.inner_text('#tree-spotlight h3').split('·')[0].strip()
        if got != want:
            wrong.append(f'{m}/{d}: {got} != {want}')
    ok('finder: 28 boundary dates map to the right tree (incl. 30 Sep = Ivy)', not wrong, str(wrong))
    pg.select_option('#birth-month', '2')
    ok('February offers 29 days, not 31', pg.evaluate("document.querySelector('#birth-day').options.length") == 29)
    pg.select_option('#birth-month', '4')
    ok('April offers 30 days', pg.evaluate("document.querySelector('#birth-day').options.length") == 30)
    # ---------- carousel and photos
    names = ['Birch', 'Rowan', 'Ash', 'Alder', 'Willow', 'Hawthorn', 'Oak', 'Holly', 'Hazel', 'Vine', 'Ivy', 'Reed', 'Elder']
    pg.locator('#tree-carousel').scroll_into_view_if_needed()
    ok('carousel: 13 slides', pg.locator('.tree-slide').count() == 13)
    ok('carousel: starts at the first tree, Previous is disabled', pg.is_disabled('#carousel-prev') and pg.is_enabled('#carousel-next'))
    x0 = pg.evaluate("document.querySelector('#tree-carousel-track').scrollLeft")
    pg.click('#carousel-next')
    pg.wait_for_timeout(900)
    x1 = pg.evaluate("document.querySelector('#tree-carousel-track').scrollLeft")
    ok('carousel: Next scrolls forward and enables Previous', x1 > x0 + 100 and pg.is_enabled('#carousel-prev'), f'{x0} -> {x1}')
    for _ in range(8):
        if pg.is_disabled('#carousel-next'):
            break
        pg.click('#carousel-next')
        pg.wait_for_timeout(700)
    ok('carousel: reaches the last tree and disables Next', pg.is_disabled('#carousel-next') and pg.evaluate("(() => { const t = document.querySelector('#tree-carousel-track'); const l = t.lastElementChild.getBoundingClientRect(); return l.right <= t.getBoundingClientRect().right + 2; })()"))
    pg.click('#carousel-prev')
    pg.wait_for_timeout(900)
    ok('carousel: Previous scrolls back', pg.evaluate("document.querySelector('#tree-carousel-track').scrollLeft") < pg.evaluate("document.querySelector('#tree-carousel-track').scrollWidth") - 500)
    bad = []
    for i, name in enumerate(names):
        pg.evaluate("document.querySelectorAll('.tree-slide')[%d].scrollIntoView({block:'nearest',inline:'center'})" % i)
        pg.click('.tree-slide[data-tree="%d"]' % i)
        pg.wait_for_timeout(120)
        title = pg.inner_text('#tree-spotlight h3').split('.')[0].split('\u00b7')[0].strip()
        loaded = pg.evaluate("(() => { const im = document.querySelector('#tree-spotlight img'); return !!im && im.complete && im.naturalWidth > 0; })()")
        credit = pg.evaluate("(() => { const a = document.querySelector('#tree-spotlight .tree-credit a'); return a ? a.href : ''; })()")
        alt = pg.evaluate("(document.querySelector('#tree-spotlight img') || {}).alt || ''")
        if title != name or not loaded or 'commons.wikimedia.org' not in credit or len(alt) < 15 or pg.get_attribute('.tree-slide[data-tree="%d"]' % i, 'aria-pressed') != 'true':
            bad.append(f'{name}: title={title} loaded={loaded} credit={credit[:30]} alt={alt[:20]}')
    ok('all 13 trees: slide click shows that tree with its own loaded photo, alt text and credit link', not bad, str(bad))
    pg.screenshot(path=OUT + '/e2e-carousel.png')
    q = b.new_page(viewport={'width': 1280, 'height': 800})
    r = q.goto(URL + 'credits.html', wait_until='networkidle')
    ok('credits.html loads and lists 13 photos, all images load', r.status == 200 and q.locator('li img').count() == 13 and q.evaluate("[...document.images].every(i => i.complete && i.naturalWidth > 0)"))
    q.close()
    # ---------- chips and cards
    pg.click('.zodiac-pill[data-tree="6"]')
    ok('chip click shows Oak and marks only it pressed', 'Oak' in pg.inner_text('#tree-spotlight h3') and pg.get_attribute('.zodiac-pill[data-tree="6"]', 'aria-pressed') == 'true' and pg.get_attribute('.zodiac-pill[data-tree="8"]', 'aria-pressed') == 'false')
    pg.focus('.calendar-tree-card[data-tree="3"]')
    pg.keyboard.press('Enter')
    ok('card + Enter key shows Alder', 'Alder' in pg.inner_text('#tree-spotlight h3'))
    pg.click('.zodiac-pill[data-tree="8"]')
    ok('Hazel shows its own photo', pg.evaluate("(document.querySelector('#tree-spotlight img') || {src: ''}).src.includes('/trees/hazel.jpg')"))
    pg.click('.zodiac-pill[data-tree="6"]')
    ok('Oak shows its own photo, not the hazel one', pg.evaluate("(document.querySelector('#tree-spotlight img') || {src: ''}).src.includes('/trees/oak.jpg')"))
    pg.screenshot(path=OUT + '/e2e-spotlight-oak.png')
    pg.click('#tree-spotlight a[data-sponsor-tree]')
    ok('Sponsor button selects that tree in the form and ticks sponsorship', pg.input_value('#tree-sign-select') == 'oak' and pg.is_checked('input[value="Tree sponsorship"]') and not pg.is_checked('input[value="Christmas tree"]'))
    # ---------- form (the form service is intercepted: this test never sends a real email)
    import json as _json
    calls = []
    mode = {'v': 'ok'}

    def service(route):
        calls.append(route.request.post_data)
        if mode['v'] == 'ok':
            route.fulfill(status=200, content_type='application/json', body='{"success":"true","message":"sent"}')
        elif mode['v'] == 'activation':
            route.fulfill(status=200, content_type='application/json', body='{"success":"false","message":"This form needs Activation. We\'ve sent you an email containing an Activate Form link."}')
        elif mode['v'] == 'rejected':
            route.fulfill(status=200, content_type='application/json', body='{"success":"false","message":"Submission rejected as spam."}')
        elif mode['v'] == 'error':
            route.fulfill(status=500, body='boom')
        else:
            route.abort()
    pg.route('https://formsubmit.co/**', service)

    def fill_valid():
        pg.fill('#full-name', 'Aoife Ní Cheallaigh')
        pg.fill('#email', 'aoife@example.ie')
        pg.fill('#eircode', 'D06 W2N8')
        pg.check('#gdpr-consent')
        if pg.is_visible('#cert-fields'):
            pg.fill('#cert-name', 'Maeve Murphy')
            pg.fill('#cert-from', 'The Murphy family')
            pg.fill('#cert-message', 'Merry Christmas')

    pg.click('#tree-spotlight a[data-sponsor-tree]')
    ok('sponsor button shows the certificate fields', pg.is_visible('#cert-fields'))
    fill_valid()
    pg.uncheck('input[value="Tree sponsorship"]')
    ok('certificate fields hide again when only a Christmas tree is wanted', not pg.is_visible('#cert-fields'))
    pg.click('#order-form button[type=submit]')
    ok('no interest ticked: friendly message, form stays, nothing sent', 'at least one' in pg.inner_text('#form-status') and pg.is_visible('#form-content') and not calls)
    pg.check('input[value="Christmas tree"]')
    pg.check('input[value="Gift certificate"]')
    ok('gift certificate shows the certificate fields', pg.is_visible('#cert-fields'))
    pg.fill('#cert-name', '')
    pg.click('#order-form button[type=submit]')
    pg.wait_for_timeout(250)
    ok('certificate name is required: submit is blocked and nothing is sent', pg.is_visible('#form-content') and not calls)
    pg.fill('#cert-name', 'Maeve Murphy')
    pg.fill('#cert-from', 'The Murphy family')
    pg.fill('#cert-message', 'Merry Christmas')
    pg.click('#order-form button[type=submit]')
    pg.wait_for_selector('#form-success:not(.hidden)')
    ok('service accepts: "received" panel, form hidden, no email-app step', 'received' in pg.inner_text('#form-success-text') and not pg.is_visible('#form-content') and not pg.is_visible('#form-summary'))
    sent = _json.loads(calls[0])
    ok('one request to the service with every field the visitor typed', len(calls) == 1 and sent['name'] == 'Aoife Ní Cheallaigh' and sent['email'] == 'aoife@example.ie' and sent['area'] == 'D06 W2N8'
       and sent['interests'] == 'Christmas tree, Gift certificate' and 'Oak' in sent['tree'] and sent['_subject'].startswith('Tree reservation 2026') and sent['_captcha'] == 'false', str(sent)[:200])
    ok('the request carries the certificate details the client typed', sent.get('cert_name') == 'Maeve Murphy' and sent.get('cert_from') == 'The Murphy family' and sent.get('cert_message') == 'Merry Christmas' and 'Maeve Murphy' in sent['message'], str(sent)[:200])
    pg.screenshot(path=OUT + '/e2e-form-done.png')
    mode['v'] = 'activation'
    pg.reload(wait_until='networkidle')
    pg.click('.zodiac-pill[data-tree="2"]')
    pg.click('#tree-spotlight a[data-sponsor-tree]')
    fill_valid()
    pg.click('#order-form button[type=submit]')
    pg.wait_for_selector('#form-success:not(.hidden)')
    ok('first submission held for activation: on-page "received" confirmation, no email-app step', 'received' in pg.inner_text('#form-success-text') and not pg.is_visible('#form-summary') and not pg.is_visible('#form-gmail'))
    for label, md in [('service says "not accepted"', 'rejected'), ('service returns an error', 'error'), ('no network to the service', 'down')]:
        mode['v'] = md
        pg.reload(wait_until='networkidle')
        pg.click('.zodiac-pill[data-tree="2"]')
        fill_valid()
        pg.click('#order-form button[type=submit]')
        pg.wait_for_selector('#form-success:not(.hidden)')
        summ = pg.input_value('#form-summary')
        href = pg.get_attribute('#form-mail-again', 'href') or ''
        ok(f'{label}: falls back to the email app with the request written out', 'One more step' in pg.inner_text('#form-success-title') and 'We could not send it' in pg.inner_text('#form-success-text')
           and all(x in summ for x in ['Aoife Ní Cheallaigh', 'aoife@example.ie', 'D06 W2N8']) and href.startswith('mailto:romacsweeney@gmail.com?subject=') and 'body=' in href, summ[:80])
        gm = pg.get_attribute('#form-gmail', 'href') or ''
        ou = pg.get_attribute('#form-outlook', 'href') or ''
        ok(f'{label}: Gmail and Outlook buttons carry the recipient, subject and request', gm.startswith('https://mail.google.com/mail/?view=cm') and 'to=romacsweeney%40gmail.com' in gm and 'Aoife' in gm and ou.startswith('https://outlook.live.com/mail/0/deeplink/compose') and 'to=romacsweeney%40gmail.com' in ou and 'Aoife' in ou and pg.is_visible('#form-gmail') and pg.is_visible('#form-outlook'))
        pg.click('#form-copy')
        ok(f'{label}: copy button responds', pg.inner_text('#form-copy') in ('Copied', 'Press Ctrl+C'))
    pg.screenshot(path=OUT + '/e2e-form-fallback.png')
    mode['v'] = 'ok'
    n = len(calls)
    pg.reload(wait_until='networkidle')
    pg.evaluate("document.querySelector('[name=website]').value='http://spam'")
    fill_valid()
    pg.click('#order-form button[type=submit]')
    pg.wait_for_timeout(300)
    ok('honeypot filled: nothing is sent and no summary is built', len(calls) == n and pg.input_value('#form-summary') == '')
    pg.goto(URL, wait_until='networkidle')
    pg.screenshot(path=OUT + '/e2e-desktop.png', full_page=True)
    # ---------- certificate and gift card maker
    import re as _re
    q = b.new_page(viewport={'width': 1280, 'height': 900})
    qe = []
    q.on('pageerror', lambda e: qe.append(str(e)))
    r = q.goto(URL + 'certificates.html', wait_until='networkidle')
    ok('certificates.html loads, no errors, noindex', r.status == 200 and not qe and 'noindex' in q.get_attribute('meta[name=robots]', 'content'), str(qe))
    q.select_option('#f-tree', 'hazel')
    q.fill('#f-to', 'Maeve Murphy')
    q.fill('#f-from', 'The Murphy family')
    q.fill('#f-msg', 'Merry Christmas, with love')
    q.fill('#f-no', '2026-001')
    sh = q.inner_text('#sheet')
    ok('certificate preview shows the name, tree, message, giver and number', all(x in sh for x in ['Certificate of Sponsorship', 'Maeve Murphy', 'Hazel', 'Coll', 'Merry Christmas', 'The Murphy family', '2026-001', 'Wisdom']), sh[:120])
    ok('certificate shows the logo and the tree photo, both loaded and credited', q.evaluate("[...document.querySelectorAll('#sheet img')].length === 2 && [...document.querySelectorAll('#sheet img')].every(i => i.complete && i.naturalWidth > 0)") and 'Photo:' in sh)
    ok('certificate has no invented details (no GPS, registry or seal)', not _re.search(r'GPS|registry|seal|latitude', sh, _re.I))
    q.emulate_media(media='print')
    pdf = q.pdf(prefer_css_page_size=True, print_background=True)
    ok('certificate prints on exactly one page', len(_re.findall(rb'/Type\s*/Page[^s]', pdf)) == 1)
    q.emulate_media(media='screen')
    q.check('input[value="gift"]')
    q.select_option('#f-tree', '')
    q.fill('#f-covers', 'One native Irish tree')
    q.fill('#f-until', '2027-12-31')
    sh = q.inner_text('#sheet')
    ok('gift card preview: for, what it covers, choose-your-own-tree, voucher number, valid until, how to redeem', all(x in sh for x in ['Gift Card', 'Maeve Murphy', 'One native Irish tree', 'Choose your own', '2026-001', '31 December 2027', 'romacsweeney@gmail.com']), sh[:140])
    q.emulate_media(media='print')
    pdf = q.pdf(prefer_css_page_size=True, print_background=True)
    ok('gift card prints on exactly one page', len(_re.findall(rb'/Type\s*/Page[^s]', pdf)) == 1)
    q.close()
    # ---------- other pages
    for path, want in [('privacy.html', 'Privacy notice'), ('404.html', 'Page not found')]:
        q = b.new_page(viewport={'width': 1280, 'height': 800})
        e2 = []
        q.on('pageerror', lambda e: e2.append(str(e)))
        r = q.goto(URL + path, wait_until='networkidle')
        ok(f'{path} loads and says "{want}"', r.status == 200 and want in q.inner_text('h1') and not e2)
        q.close()
    # ---------- mobile
    m = b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    me = []
    m.on('pageerror', lambda e: me.append(str(e)))
    m.goto(URL, wait_until='networkidle')
    ok('mobile: no horizontal scroll', m.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), str(m.evaluate("document.documentElement.scrollWidth")))
    ok('mobile: menu button shown, desktop nav hidden', m.is_visible('#menu-btn') and not m.is_visible('header nav.hidden.lg\\:flex'))
    m.click('#menu-btn')
    ok('mobile: menu opens (aria-expanded true)', m.get_attribute('#menu-btn', 'aria-expanded') == 'true' and m.is_visible('#mobile-nav'))
    m.screenshot(path=OUT + '/e2e-mobile-menu.png')
    m.click('#mobile-nav a[href="#sponsor"]')
    m.wait_for_timeout(700)
    ok('mobile: menu link scrolls to Sponsor and closes the menu', not m.is_visible('#mobile-nav') and m.evaluate("document.querySelector('#sponsor').getBoundingClientRect().top < 300"))
    m.goto(URL, wait_until='networkidle')
    m.screenshot(path=OUT + '/e2e-mobile.png', full_page=True)
    ok('mobile: no page errors', not me, str(me[:2]))
    b.close()

fails = [r for r in res if not r[0]]
print(f'\n{len(res) - len(fails)}/{len(res)} passed')
sys.exit(1 if fails else 0)
