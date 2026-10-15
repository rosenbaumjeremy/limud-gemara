"""Work out a day's daf (Daf Yomi), and file that day's written summary into the site.

    python3 scripts/add_summary.py --info YYYY-MM-DD
        Print the day's daf as JSON: its Sefaria ref ("Bekhorot 28"), the masechet (en/he),
        the daf number, the amudim it has, the site file it will be filed under, the page
        on the site, and whether that file already exists. The daily routine uses this so
        it studies exactly the daf the site will file.

    python3 scripts/add_summary.py summary.json
        summary.json = {"date", "he": {...}, "en": {...}, "musagim": [...], "topics": [...]}
        (the shape is in ROUTINE.md). Writes site/data/summaries/<Masechet>-<daf>.json and
        adds the daf to site/data/summaries/index.json, which the site reads to list every
        summary of a masechet.

The daf of a date comes from Sefaria's calendar (the same one the site's home page shows).
"""

import datetime
import json
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "site" / "data"
SUMMARIES = DATA / "summaries"
SITE = "https://limud-gemara.dailylearning.workers.dev"


def fetch(url):
    for attempt in range(4):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "talmud-site"})
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except Exception:  # Sefaria returns the odd transient 504
            if attempt == 3:
                raise
            time.sleep(3)


def info(date_text):
    day = datetime.date.fromisoformat(date_text)
    cal = fetch(f"https://www.sefaria.org/api/calendars?year={day.year}&month={day.month}&day={day.day}"
                "&timezone=Asia/Jerusalem")
    item = next(i for i in cal["calendar_items"] if i["title"]["en"] == "Daf Yomi")
    ref = item["ref"]                                   # "Bekhorot 28"
    masechet, daf = ref.rsplit(" ", 1)
    daf = int(daf)
    m = next(x for x in json.loads((DATA / "masechtot.json").read_text(encoding="utf-8")) if x["en"] == masechet)
    last = m["last"]                                    # "73a"
    amudim = ["a"] if f"{daf}a" == last else ["a", "b"]
    key = f"{masechet.replace(' ', '_')}-{daf}"
    path = SUMMARIES / f"{key}.json"
    return {
        "date": date_text,
        "ref": ref,
        "masechet": {"en": masechet, "he": m["he"]},
        "daf": daf,
        "he": item["displayValue"]["he"],
        "amudim": amudim,
        "gemara_refs": [f"{masechet} {daf}{a}" for a in amudim],
        "file": f"site/data/summaries/{key}.json",
        "site_url": f"{SITE}/#daf/{masechet.replace(' ', '_')}.{daf}a",
        "already_published": path.exists(),
    }


def add(summary_path):
    summary = json.loads(Path(summary_path).read_text(encoding="utf-8"))
    day = info(summary["date"])
    for key in ("he", "en", "musagim", "topics"):
        if not summary.get(key):
            sys.exit(f"summary has no {key}")
    for lang in ("he", "en"):
        if not summary[lang].get("overview"):
            sys.exit(f"summary has no {lang} overview")
        # the site titles the card itself ("סיכום — <daf>"); keep the file's title the same
        summary[lang]["title"] = f"סיכום — {day['he']}" if lang == "he" else f"Summary — {day['ref']}"
    record = {"ref": day["ref"], "date": day["date"], "he": summary["he"], "en": summary["en"],
              "musagim": summary["musagim"], "topics": summary["topics"]}

    SUMMARIES.mkdir(exist_ok=True)
    path = ROOT / day["file"]
    path.write_text(json.dumps(record, ensure_ascii=False, indent=1), encoding="utf-8")

    index_path = SUMMARIES / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else {"days": []}
    # one summary per daf: a later cycle's run replaces this one in the index
    index["days"] = [d for d in index["days"] if d["ref"] != day["ref"]]
    index["days"].append({"date": day["date"], "ref": day["ref"], "masechet": day["masechet"]["en"], "daf": day["daf"]})
    index["days"].sort(key=lambda d: d["date"])
    index_path.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"filed {day['ref']} for {day['date']} -> {day['file']}")


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--info":
        print(json.dumps(info(sys.argv[2]), ensure_ascii=False, indent=1))
    elif len(sys.argv) == 2:
        add(sys.argv[1])
    else:
        sys.exit(__doc__)
