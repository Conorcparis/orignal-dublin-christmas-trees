"""Copies the owner's tools (the admin page and the certificate maker) from docs/ into worker/public/, so the orders service on Cloudflare serves them
at https://dublin-trees-orders.conor-0a0.workers.dev/admin.html and /certificates.html. The GitHub site is the archive (owner rule, 11 Nov 2026): nothing
here links to it. Run before every `wrangler deploy`:   python worker/build-public.py
worker/public/ is generated (git-ignored); docs/ stays the one place the pages are edited."""
import os, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
DOCS = os.path.join(HERE, '..', 'docs')
OUT = os.path.join(HERE, 'public')
SITE = 'https://www.theoriginaldublinchristmastrees.ie/'
FILES = ['admin.html', 'certificates.html', 'favicon.ico',
         'css/fonts.css', 'css/site.css', 'css/certificate.css', 'css/admin.css',
         'js/admin.js', 'js/certificate.js', 'js/config.js', 'js/vendor/html-to-image-1.11.11.js', 'js/vendor/jspdf-2.5.2.umd.min.js', 'js/vendor/LICENSES.txt',
         'images/apple-touch-icon.png', 'images/favicon-32.png', 'images/logo-128.png', 'images/logo-512.png', 'images/logo-astro.webp']
DIRS = ['fonts', 'images/trees']

if os.path.isdir(OUT): shutil.rmtree(OUT)
for f in FILES:
    os.makedirs(os.path.dirname(os.path.join(OUT, f)) or OUT, exist_ok=True)
    shutil.copyfile(os.path.join(DOCS, f), os.path.join(OUT, f))
for d in DIRS:
    shutil.copytree(os.path.join(DOCS, d), os.path.join(OUT, d))
# "home" and "Back to the site" go to the real website, not to the archive
for page in ['admin.html', 'certificates.html']:
    p = os.path.join(OUT, page); t = open(p, encoding='utf-8').read()
    t = t.replace('href="./"', 'href="' + SITE + '"')
    open(p, 'w', encoding='utf-8', newline='\n').write(t)
# owner tools: never in search results, no sniffing, no framing
with open(os.path.join(OUT, '_headers'), 'w', newline='\n') as h:
    h.write('/*\n  X-Robots-Tag: noindex, nofollow\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: no-referrer\n')
n = sum(len(fs) for _, _, fs in os.walk(OUT))
print('public/ built:', n, 'files')
