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

A static site cannot receive a form on its own. Today the form opens the visitor's email app with the request written out and the visitor presses Send;
the page also shows the text so it can be copied. To receive reservations without that step, put a form service's https address in `FORM_ENDPOINT` at the top of `docs/js/site.js`
(it must accept a JSON POST and answer 2xx). If the service is down the page falls back to the email app. Update `docs/privacy.html` to name the service.

## Before this goes public properly (see `beacon-kit/facts.yaml`, `confirm:`)

Things written on the page today that need the owner's evidence or decision, and are therefore **not** in the beacon: the "1,480+ saplings" and "20 years" figures, the
"Dublin City & County Native Woodland Initiative" wording and the use of the Dublin City shield (is there permission?), "BATCH CERTIFIED 2024" / "Sustainable Forestry Ireland",
the planting-site and delivery claims, prices, and the trading name and postal address (a seller must show these). The hero and woodland pictures are illustrative; replace them with real photographs.

## Registering on the Digital Forum

A beacon is read at the root of a domain (`/.well-known/beacon.json`). On a GitHub project page the root belongs to `conorcparis.github.io`, not to this folder, so register once the site has its own domain
(point the domain at GitHub Pages, set it in the repo's Pages settings, update the address in `beacon-kit/facts.yaml` and `docs/`, rebuild). Then add the Forum's profile, attestation, token and feed addresses under `profiles:` in `facts.yaml`.
