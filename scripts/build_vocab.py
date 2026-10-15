"""Turn scripts/vocab.txt into site/data/vocab.json (the flashcards and the word highlights)."""
import json, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
rows = []
for line in (root / "scripts" / "vocab.txt").read_text(encoding="utf8").splitlines():
    if not line.strip() or line.startswith("#"): continue
    w, v, he, en, t, basic = [c.strip() for c in (line.split("|") + [""])[:6]]
    row = {"w": w, "v": v, "he": he, "en": en, "t": t}
    if basic: row["basic"] = 1
    rows.append(row)
assert len({r["w"] for r in rows}) == len(rows), "duplicate word"
(root / "site" / "data" / "vocab.json").write_text(
    json.dumps(rows, ensure_ascii=False, separators=(",", ":")), encoding="utf8")
print(len(rows), "words")
