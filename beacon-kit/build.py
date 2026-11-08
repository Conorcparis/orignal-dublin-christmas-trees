#!/usr/bin/env python3
"""build.py: generate every machine-readable file from facts.yaml (single source of truth).

Same shape as the AI Agent Brewery's beacon kit (Beacon v3: facts only, no directives; a schema.org core plus a `beacon` block).
Usage:  python build.py              -> writes ./out/
        python build.py --publish    -> also copies the public files into ../docs/ (the folder GitHub Pages serves)
No network. Standard library + PyYAML. Facts in `confirm:` are never published; they are written to out/CONFIRM.md (stays out of ../docs).
"""
import json, pathlib, shutil, sys
import yaml

HERE = pathlib.Path(__file__).parent
F = yaml.safe_load((HERE / "facts.yaml").read_text(encoding="utf-8"))
OUT = HERE / "out"
OUT.mkdir(exist_ok=True)
E = F["entity"]
BASE = E["url"]
PROFILES = F.get("profiles") or {}


def write(name, text):
    (OUT / name).write_text(text if text.endswith("\n") else text + "\n", encoding="utf-8", newline="\n")


def jsonld():
    core = {
        "@context": "https://schema.org",
        "@type": "Organization",
        "@id": E["id"],
        "name": E["name"],
        "description": E["one_line"] + " " + E["disambiguation"],
        "url": BASE,
        "logo": E["logo"],
        "email": E["email"],
        "areaServed": {"@type": "AdministrativeArea", "name": E["location"]},
        "knowsLanguage": E["languages"],
        "contactPoint": {"@type": "ContactPoint", "contactType": "customer service", "email": E["email"], "areaServed": "IE", "availableLanguage": ["English"]},
    }
    same = [v for k, v in PROFILES.items() if k in ("forum_profile",) and v]
    if same:
        core["sameAs"] = same
    return core


def beacon_json():
    b = {
        "beacon_version": "3.0",
        "updated": F["updated"],
        "spec": "Beacon v3: facts only, no directives. A schema.org core plus a beacon block for Forum and engagement data.",
        "context": jsonld(),
        "beacon": {
            "name": E["name"],
            "disambiguation": E["disambiguation"],
            "status": E["status"],
            "promises": F["promises"],
            "offers": [{"id": o["id"], "name": o["name"], "text": o["text"]} for o in F["offers"]],
            "free_features": F["free_features"],
            "audiences": F["audiences"],
            "data_protection": F["data_protection"],
            "proof": {"results": [], "note": "No customers, partners, certifications or awards are announced."},
            "engage": {"human_handoff": E["human_handoff"], "reservation_form": E["reservation_form"], "agent_may_not": F["agent_rules"]["may_not"]},
            "agent_card": None,
            "agent_card_note": "No A2A agent card is published for this business; use the human handoff.",
            "files": {"beacon_md": BASE + "beacon.md", "llms": BASE + "llms.txt", "policy": BASE + "agent.txt", "sitemap": BASE + "sitemap.xml"},
        },
    }
    if PROFILES.get("forum_profile"):
        b["beacon"]["forum"] = {k.replace("forum_", ""): v for k, v in PROFILES.items() if k.startswith("forum_")}
        if PROFILES.get("verification_token"):
            b["beacon"]["forum"]["token"] = PROFILES["verification_token"]
    return b


def beacon_md():
    L = [f"# {E['name']}", "", f"> {E['one_line']} {E['disambiguation']}", "", f"Status: {E['status']}", "", "## What is offered"]
    L += [f"- {o['name']}: {o['text']}" for o in F["offers"]]
    L += ["", "## Free feature"] + [f"- {x['name']}: {x['text']} {x['url']}" for x in F["free_features"]]
    L += ["", "## Promises"] + [f"- {p}" for p in F["promises"]]
    L += ["", "## Who it is for", F["audiences"]["buyers"], "", "## Contact", f"- Email: {E['email']}", f"- Reservation form: {E['reservation_form']}", "",
          "## Data protection", F["data_protection"], "", "## An agent may not"] + [f"- {x}" for x in F["agent_rules"]["may_not"]]
    L += ["", "## Proof", "No customers, partners, certifications or awards are announced.", "", f"Updated {F['updated']} from facts.yaml."]
    return "\n".join(L)


def llms_txt():
    L = [f"# {E['name']}", f"> {E['one_line']} {E['disambiguation']}", "", f"Status: {E['status']}", "", "## Pages"]
    L += [f"- [{p['title']}]({p['url']})" + (f": {p['text']}" if p.get("text") else "") for p in F["site_pages"]["en"]]
    L += ["", "## What is offered"] + [f"- {o['name']}: {o['text']}" for o in F["offers"]]
    L += ["", "## Free"] + [f"- {x['name']}: {x['text']}" for x in F["free_features"]]
    L += ["", "## Machine-readable", f"- beacon.json: {BASE}.well-known/beacon.json", f"- beacon.md: {BASE}beacon.md", f"- agent.txt: {BASE}agent.txt", f"- sitemap: {BASE}sitemap.xml",
          "", "## Contact", f"- {E['email']}", f"- Reservation form: {E['reservation_form']}"]
    return "\n".join(L)


def agent_txt():
    L = [f"# {E['name']} - agent.txt", f"# Updated {F['updated']} from facts.yaml", "## Who we are", E["one_line"], "## Files",
         f"- Beacon (context file): {BASE}.well-known/beacon.json", f"- Beacon (Markdown): {BASE}beacon.md", f"- LLM guide: {BASE}llms.txt",
         "## Engage", f"- human handoff: {E['human_handoff']}", f"- reservation form: {E['reservation_form']}", "## An agent may not"] + [f"- {x}" for x in F["agent_rules"]["may_not"]]
    return "\n".join(L)


def confirm_md():
    return "# Open items (not published until confirmed)\n\n" + "\n".join(f"- [ ] {c}" for c in F["confirm"])


ld = jsonld()
write("beacon.json", json.dumps(beacon_json(), indent=2, ensure_ascii=False))
write("jsonld.json", json.dumps(ld, ensure_ascii=False))
write("homepage-jsonld.html", '<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False) + "</script>")
write("beacon.md", beacon_md())
write("llms.txt", llms_txt())
write("agent.txt", agent_txt())
write("CONFIRM.md", confirm_md())
print("wrote", ", ".join(sorted(p.name for p in OUT.iterdir())))

if "--publish" in sys.argv:
    DOCS = HERE.parent / "docs"
    (DOCS / ".well-known").mkdir(parents=True, exist_ok=True)
    shutil.copy(OUT / "beacon.json", DOCS / ".well-known" / "beacon.json")
    for n in ("beacon.md", "llms.txt", "agent.txt"):
        shutil.copy(OUT / n, DOCS / n)
    print("published to", DOCS)
