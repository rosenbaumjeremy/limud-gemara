"""Gather the Rishonim and Acharonim Sefaria links to a daf, laid out line by line, for writing
that daf's summary: every Rishon and Acharon Sefaria links to the daf (before 1500 is Rishonim, 1500-1930 Acharonim).

    python scripts/gather_meforshim.py Bekhorot 27 > out.txt
"""
import json, re, sys, time, urllib.request, html

def get(url):
    for attempt in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "talmud-site"}), timeout=60) as r:
                return json.load(r)
        except OSError:
            if attempt == 4: raise
            time.sleep(3 * (attempt + 1))

KIND = {"Commentary": "על הדף", "Quoting Commentary": "במקום אחר", "Halakhah": "הלכה", "Responsa": "שו\"ת"}
DATES = [(r"^Arukh LaNer", 1850), (r"^Chiddushei Ridbaz", 1890), (r"^Korban HaEdah", 1760), (r"^Mareh HaPanim", 1760),
         (r"^Tziyyun LeNefesh Chayyah", 1782), (r"^Teshuvot Maharsham", 1900), (r"^Pnei Moshe", 1760)]

def flat(x):
    if isinstance(x, list): return " ".join(flat(i) for i in x)
    return x or ""

def plain(s):
    s = re.sub(r"<i class=\"footnote\">.*?</i>", "", s)
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()

# Long pieces (a whole chapter of the Smag, the Rogatchover) mention the daf in passing:
# keep the passages around where they cite it, or else the opening.
def excerpt(body, he_masechet, limit=1500, around=600):
    if len(body) <= limit: return body
    spans = [(max(0, m.start() - around), m.end() + around) for m in re.finditer(he_masechet, body)]
    if not spans: return body[:800] + " …"
    merged = [list(spans[0])]
    for a, b in spans[1:]:
        if a <= merged[-1][1]: merged[-1][1] = max(merged[-1][1], b)
        else: merged.append([a, b])
    return " … ".join(body[a:b] for a, b in merged[:3])

masechet, daf = sys.argv[1], sys.argv[2]
seen = set()
own = {f"Rashi on {masechet}", f"Tosafot on {masechet}", f"Steinsaltz on {masechet}"}
for amud in "ab":
    ref = f"{masechet.replace(' ', '_')}.{daf}{amud}"
    try:
        data = get(f"https://www.sefaria.org/api/v3/texts/{ref}?version=hebrew")
        text = data["versions"][0]["text"]
    except Exception:   # the last daf of a masechet may have no amud b
        if amud == "b": break
        raise
    he_masechet = data["heIndexTitle"] if "heIndexTitle" in data else data.get("heTitle", "").split(" ")[0]
    per = {}
    for l in get(f"https://www.sefaria.org/api/links/{ref}"):
        kind = KIND.get(l.get("category"))
        if not kind or l["index_title"] in own: continue
        year = l.get("compDate")
        year = year[0] if isinstance(year, list) and year else year if isinstance(year, int) else None
        if year is None: year = next((y for p, y in DATES if re.match(p, l["index_title"])), None)
        if year is None or year >= 1930: continue
        body = plain(flat(l.get("he")))
        if not body or (kind != "על הדף" and len(body) < 30): continue
        if l.get("sourceRef") in seen: continue   # one piece linked to several lines: keep the first
        seen.add(l.get("sourceRef"))
        if kind != "על הדף": body = excerpt(body, he_masechet)
        line = l.get("anchorVerse") or int(str((l.get("anchorRefExpanded") or [l["anchorRef"]])[0]).split(":")[-1] or 0)
        per.setdefault(line, []).append((year, "ראשון" if year < 1500 else "אחרון", kind, l.get("sourceHeRef", ""), l.get("sourceRef", ""), body))
    print(f"\n######## {daf}{amud} ########")
    for i, seg in enumerate(text, 1):
        print(f"\n==== שורה {i}: {plain(seg)}")
        for year, era, kind, cite, sref, body in sorted(per.get(i, [])):
            print(f"-- [{era} {year} | {kind}] {cite}  ({sref})\n{body}")
