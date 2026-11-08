# The Original Dublin Christmas Trees

A one-page static website: reserve a Christmas tree in Dublin, sponsor a native Irish tree, find your guardian tree from the Celtic tree calendar.
Plain HTML, one stylesheet, one small script. No server, no cookies, no analytics, nothing loaded from other companies.

Live (GitHub Pages, served from `/docs`): https://conorcparis.github.io/orignal-dublin-christmas-trees/

## Folders

| Folder | What it is |
|---|---|
| `docs/` | The published site. GitHub Pages serves this folder. |
| `beacon-kit/` | `facts.yaml` is the single source for the beacon (`beacon.json`, `llms.txt`, `agent.txt` (and `beacon.md` where the host serves it as plain text; GitHub Pages does not)) and the JSON-LD. Same layout as the AI Agent Brewery's kit. |
| `src/` | Tailwind input and the original images (the design export's pictures, before cropping). |
| `tests/` | `site.test.mjs` (fast checks, `npm test`) and `browser-check.py` (clicks everything in a real browser). |
| `DESIGN.md` | The design tokens exported from the design tool. |

## Certificates and gift cards

`docs/certificates.html` is the owner's maker (not linked from the public pages, not indexed): copy the details from a reservation email, check the preview, then Print or Save as PDF. A4 landscape for the sponsorship certificate, A5 landscape for the gift card, one page each. Nothing is sent or stored, and the certificate or voucher number is typed by hand (keep your own list: the site cannot check numbers, so anyone could print a lookalike). The reservation form asks the customer for the name, giver and message when sponsorship or a gift is ticked, so the details arrive ready to copy. Certificates deliberately carry no GPS, registry or seal wording until those are confirmed.

## Logo

The round badge (`docs/images/logo-*.png`, original in `src/original-images/logo-original.png`) is the site logo, favicon, app icon, social-sharing image and certificate emblem. `docs/images/dublin-city-crest.png` is no longer used and can be deleted.

## Links

The footer links to Dublin Landscaping (website, Facebook, Instagram). The same links are in the JSON-LD and the beacon (`profiles:` in `beacon-kit/facts.yaml`).

## Tree photos

The 13 tree photos (carousel and guardian-tree finder) come from Wikimedia Commons under free licences. `src/photo-credits.json` holds the author, licence and source link for each; the carousel, the finder and `docs/credits.html` all read from it. To swap a photo, replace `docs/images/trees/<tree>.jpg`, update its record, and rebuild the page. The hero and woodland pictures are illustrative and should be replaced with real photographs.

## Everyday jobs

```
npm install                      # once
npm run build:css                # after changing a class in docs/*.html or docs/js/site.js
npm test                         # 9 static checks
python beacon-kit/build.py --publish    # after editing beacon-kit/facts.yaml; copies the files into docs/
python beacon-kit/verify.py beacon-kit/out/        # checks them
python beacon-kit/verify.py https://conorcparis.github.io/orignal-dublin-christmas-trees/   # checks what is live
python -m http.server 8765 --directory docs &  &&  python tests/browser-check.py ./shots     # needs Playwright
```

## The reservation form

A static site cannot receive a form on its own, so the form posts to [FormSubmit](https://formsubmit.co) (free, no account), which emails the owner. The first submission makes FormSubmit email the owner once to confirm the address; submissions sent before that are held and delivered after it.
If the service cannot be reached or does not accept the request, the page opens the visitor's own email app with the request written out (and shows the text to copy), so nothing is lost.
The service is one line, `FORM_ENDPOINT`, plus `sendToService()` in `docs/js/site.js`; change both to use another service and update `docs/privacy.html` to name it. FormSubmit publishes no operator or data-processing terms, which matters for GDPR (see `confirm:` in `beacon-kit/facts.yaml`).
The browser check intercepts the service, so running the tests never sends a real email.

## Before this goes public properly (see `beacon-kit/facts.yaml`, `confirm:`)

Things written on the page today that need the owner's evidence or decision, and are therefore **not** in the beacon: the "1,480+ saplings" and "20 years" figures, the
"Dublin City & County Native Woodland Initiative" wording and the use of the Dublin City shield (is there permission?), "BATCH CERTIFIED 2024" / "Sustainable Forestry Ireland",
the planting-site and delivery claims, prices, and the trading name and postal address (a seller must show these). The hero and woodland pictures are illustrative; replace them with real photographs.

## Registering on the Digital Forum

A beacon is read at the root of a domain (`/.well-known/beacon.json`). On a GitHub project page the root belongs to `conorcparis.github.io`, not to this folder, so register once the site has its own domain
(point the domain at GitHub Pages, set it in the repo's Pages settings, update the address in `beacon-kit/facts.yaml` and `docs/`, rebuild). Then add the Forum's profile, attestation, token and feed addresses under `profiles:` in `facts.yaml`.
