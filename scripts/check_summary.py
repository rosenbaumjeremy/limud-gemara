"""Check a daf's summary against the texts it cites, and drop anything that isn't in them.

    python3 scripts/check_summary.py SUMMARY.json "<Masechet> <daf>"

Rewrites SUMMARY.json in place:

  * every opinion (a topic's rishonim and acharonim) needs a "quote" that appears word for
    word in the Sefaria text its "ref" names; opinions that fail are removed;
  * every musag needs a source quote found in its ref, and anchors that are words of the
    Gemara line it names ("<Masechet> <daf><amud>:<line>"); musagim that fail are removed;
  * a topic's lines, and a musag's line, must exist on that amud.

Comparison ignores nikud, te'amim, punctuation, quote marks, HTML, ktiv male/chaser and
divine-name spellings (scripts/quotes.py), nothing else. A report of every removal is printed.

Exits 1, so the caller can read more and fix it instead of publishing a thin summary, if
fewer than 4 topics, 20 verified opinions, or 5 musagim survive, if no topic keeps both a
rishon and an acharon, or if there are more than 8 musagim.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from quotes import fetch_lines, found, norm  # noqa: E402


def main(path, daf_ref):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    report = []
    masechet, daf = daf_ref.rsplit(" ", 1)
    lines = {a: fetch_lines(f"{masechet} {daf}{a}") for a in ("a", "b")}

    def line_ok(amud, n):
        return amud in lines and 1 <= n <= len(lines[amud])

    kept_topics = []
    for i, tp in enumerate(data.get("topics", []), 1):
        title = tp.get("en", {}).get("title", f"topic {i}")
        amud = tp.get("amud", "")
        rng = tp.get("lines") or []
        ok_lines = (len(rng) == 2 and (
            (amud in ("a", "b") and line_ok(amud, rng[0]) and line_ok(amud, rng[1]) and rng[0] <= rng[1])
            or (amud == "ab" and line_ok("a", rng[0]) and line_ok("b", rng[1]))))
        if not ok_lines:
            report.append(f"topic {title!r}: lines {rng} not on amud {amud!r} - removed")
            continue
        for era in ("rishonim", "acharonim"):
            keep = []
            for o in tp.get(era, []):
                who = o.get("who", {}).get("en", "?")
                if found(o.get("quote"), o.get("ref")):
                    keep.append(o)
                else:
                    report.append(f"topic {title!r}: {era[:-2]} {who} - quote not found in {o.get('ref')!r}, removed")
            tp[era] = keep
        kept_topics.append(tp)
    data["topics"] = kept_topics

    kept_musagim = []
    for m in data.get("musagim", []):
        term = m.get("en", {}).get("term", "?")
        src = m.get("source", {})
        amud, n = m.get("amud"), m.get("line", 0)
        if not line_ok(amud, n):
            report.append(f"musag {term!r}: line {amud}{n} does not exist - removed")
            continue
        line_text = norm(lines[amud][n - 1])
        if not m.get("anchors") or not all(norm(a) and norm(a) in line_text for a in m["anchors"]):
            report.append(f"musag {term!r}: anchors {m.get('anchors')} not in line {amud}{n} - removed")
            continue
        if not found(src.get("quote"), src.get("ref")):
            report.append(f"musag {term!r}: quote not found in {src.get('ref')!r} - removed")
            continue
        kept_musagim.append(m)
    data["musagim"] = kept_musagim

    Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    for r in report:
        print(r)
    opinions = sum(len(tp["rishonim"]) + len(tp["acharonim"]) for tp in data["topics"])
    both = any(tp["rishonim"] and tp["acharonim"] for tp in data["topics"])
    print(f"{len(data['topics'])} topics, {opinions} verified opinions, {len(data['musagim'])} musagim, "
          f"{len(report)} removals")
    problems = []
    if len(data["topics"]) < 4: problems.append("fewer than 4 topics")
    if opinions < 20: problems.append("fewer than 20 verified opinions")
    if not both: problems.append("no topic has both a rishon and an acharon")
    if len(data["musagim"]) < 5: problems.append("fewer than 5 musagim")
    if len(data["musagim"]) > 8: problems.append("more than 8 musagim")
    if problems:
        print("FAILED: " + "; ".join(problems))
        sys.exit(1)
    print("OK")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
