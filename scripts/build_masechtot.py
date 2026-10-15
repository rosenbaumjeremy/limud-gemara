"""Write site/data/masechtot.json: every Bavli tractate on Sefaria, in order, with its
Hebrew name and the first and last amud. Run once (the list doesn't change)."""
import json, urllib.request, pathlib, time

def get(url):
    for attempt in range(5):  # Sefaria sometimes drops a connection mid-run
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "talmud-site"})) as r:
                return json.load(r)
        except OSError:
            if attempt == 4: raise
            time.sleep(3 * (attempt + 1))

out = []
for cat in get("https://www.sefaria.org/api/index"):
    if cat.get("category") != "Talmud": continue
    for sub in cat["contents"]:
        if sub.get("category") != "Bavli": continue
        for seder in sub["contents"]:
            if "contents" not in seder or not seder.get("category", "").startswith("Seder"): continue
            for m in seder["contents"]:
                if "title" not in m: continue
                idx = get("https://www.sefaria.org/api/v2/raw/index/" + m["title"].replace(" ", "_"))
                shape = get("https://www.sefaria.org/api/shape/" + m["title"].replace(" ", "_"))
                shape = shape[0] if isinstance(shape, list) else shape
                chapters = shape["chapters"]          # one entry per amud, 2a = index 2
                first = next(i for i, n in enumerate(chapters) if n)
                last = max(i for i, n in enumerate(chapters) if n)
                amud = lambda i: f"{i // 2 + 1}{'ab'[i % 2]}"
                out.append({"en": m["title"], "he": m["heTitle"], "seder": seder["category"],
                            "heSeder": seder.get("heCategory", ""), "first": amud(first), "last": amud(last)})
                print(out[-1]["en"], out[-1]["first"], out[-1]["last"])
p = pathlib.Path(__file__).resolve().parent.parent / "site" / "data" / "masechtot.json"
p.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf8")
