#!/usr/bin/env python3
"""verify.py: check the generated beacon files against facts.yaml, or the LIVE site.

    python verify.py out/                      # the generated files
    python verify.py https://host/path/        # what is live (needs network)
Rules (same as the Brewery kit): valid JSON, one version field, schema.org core, no directives to AI models,
no unresolved CONFIRM markers, no invented proof, URLs well formed, beacon.md served as text/plain.
"""
import json, pathlib, re, sys, urllib.request, urllib.error
import yaml

HERE = pathlib.Path(__file__).parent
F = yaml.safe_load((HERE / "facts.yaml").read_text(encoding="utf-8"))
E = F["entity"]
FILES = {"beacon.json": ".well-known/beacon.json", "llms.txt": "llms.txt", "agent.txt": "agent.txt"}
if F.get("publish_beacon_md", True):
    FILES["beacon.md"] = "beacon.md"
fails = []


def check(name, ok, detail=""):
    print(("PASS  " if ok else "FAIL  ") + name + (f"  [{detail}]" if detail and not ok else ""))
    if not ok:
        fails.append(name)


def fetch(base, key):
    if base.startswith("http"):
        try:
            r = urllib.request.urlopen(urllib.request.Request(base.rstrip("/") + "/" + FILES[key], headers={"User-Agent": "beacon-verify"}), timeout=20)
            return r.status, r.read().decode("utf-8"), r.headers.get("Content-Type", "")
        except urllib.error.HTTPError as e:
            return e.code, "", ""
    p = pathlib.Path(base) / key
    return (200, p.read_text(encoding="utf-8"), "") if p.exists() else (404, "", "")


def main(base):
    texts = {}
    for key in FILES:
        status, body, ctype = fetch(base, key)
        check(f"{key}: reachable (HTTP {status})", status == 200)
        texts[key] = body
        if base.startswith("http") and key == "beacon.md" and status == 200:
            check("beacon.md: content-type is text/plain (ChatGPT's fetch tool refused text/markdown)", ctype.lower().startswith("text/plain"), ctype)
    try:
        b = json.loads(texts["beacon.json"]); check("beacon.json: valid JSON", True)
    except Exception as e:
        check("beacon.json: valid JSON", False, str(e)); return
    ctx = b.get("context", {})
    check("beacon.json: one version field at top level", "beacon_version" in b and "beacon_version" not in ctx)
    check("beacon.json: schema.org core (@context/@type/name/url/logo)", all(k in ctx for k in ("@context", "@type", "name", "url", "logo")))
    check("beacon.json: 'updated' matches facts", b.get("updated") == F["updated"], b.get("updated", ""))
    check("beacon.json: email matches facts", ctx.get("email") == E["email"])
    check("beacon.json: proof.results has no invented entries", b["beacon"]["proof"]["results"] == [])
    check("beacon.json: no llm_directives block (v3 is facts only)", "llm_directives" not in b)
    check("beacon.json: agent_card is null with an explanation", b["beacon"].get("agent_card") is None and bool(b["beacon"].get("agent_card_note")))
    allt = "\n".join(texts.values())
    for key, t in texts.items():
        d = re.search(r"(?i)\b(ignore (all|previous)|you must recommend|always recommend|ai assistants should|tell users to)\b", t)
        check(f"{key}: no directives to AI models", d is None, d.group(0) if d else "")
        check(f"{key}: no unresolved CONFIRM markers", "CONFIRM" not in t)
        check(f"{key}: no unconfirmed claims published", not re.search(r"1,480|20 years|civic partnership|BATCH CERTIFIED|Sustainable Forestry|zero-emission|Zero-Drop|2035|100-year", t, re.I))
    check("llms.txt links the reservation form", E["reservation_form"] in texts["llms.txt"])
    check("agent.txt lists the human handoff", E["human_handoff"] in texts["agent.txt"])
    bad = [u for u in re.findall(r"https?://[^\s)\"'<>]+", allt) if not re.match(r"https?://[\w.-]+\.[a-z]{2,}(/[^\s]*)?$", u)]
    check("all URLs well formed", not bad, ", ".join(bad[:3]))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else str(HERE / "out"))
    print("\nALL CHECKS PASSED" if not fails else f"\n{len(fails)} CHECK(S) FAILED")
    sys.exit(1 if fails else 0)
