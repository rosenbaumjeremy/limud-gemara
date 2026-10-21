# לומדים גמרא — Learning Gemara

A study companion for the daily daf. It is a static site
(`site/`), served by Cloudflare Workers like the other study sites (`wrangler.jsonc`).

## What it does

- **Today's daf.** The home page shows the current Daf Yomi (from Sefaria's calendar). The Shas page
  can open any amud in the Bavli.
- **Reader.** Each line of the vocalized Aramaic (William Davidson edition) has, under it, the
  Steinsaltz explanation (Hebrew) or the Davidson English, plus Rashi and Tosafot, all from Sefaria's API.
- **צורת הדף (page view).** The reader's second view. For an amud that has
  `site/data/vilna/<Masechet>-<daf><amud>.json`, it is the Vilna page exactly as printed: every line
  of the Gemara, Rashi and Tosafot in its place on the page, with the words of the printed line, the
  running head, the catchword and Tosafot's big opening words (fonts: Frank Ruhl Libre and Noto
  Rashi Hebrew, `site/fonts`, OFL). `scripts/vilna_page.py <Masechet> <daf>` makes the file: it
  straightens Sefaria's scan of the Romm Vilna page, finds each printed line (gutters, letter
  thickness and height tell Gemara from commentary), and splits Sefaria's text (Wikisource for the
  Gemara, whose abbreviations match the print) over those lines by word count, ink width and the
  widths of each line's first and last words. On Bekhorot 33a it matched all 43 Gemara lines and
  nearly every Rashi and Tosafot line; where Sefaria's text differs from the print (it spells out
  references, e.g. "(בכורות דף כח.)" for "(דף כח:)") a word can move to the next line for a line or two.
  A page that doesn't come out right (an unusual layout, or Sefaria's commentary not matching the
  printed amud) gets no file, about a third of the amudim tried; the margins (עין משפט, מסורת הש״ס,
  רבינו גרשום, the notes under the page) are not drawn. Since 2026-10-21 the daily routine makes the
  day's two files (`ROUTINE.md`, step 1b). An amud without a file falls back to the computed layout:
  `site/daf-layout.js`, adapted from [daf-renderer](https://github.com/GT-Jewish-DH/daf-renderer) (MIT,
  Dan Jutan & Shaun Regenbaum), with its styles in `app.css` because the CSP blocks injected
  `<style>`; its line breaks don't match the printed page, and when an amud has too little
  commentary for the shape it falls back to three columns. Tap a line for its explanation.
- **Written summary of the Rishonim and Acharonim.** For a daf that has `site/data/summaries/<Masechet>-<daf>.json`,
  a card above the text gives each sugya: the Gemara, the Rishonim, the Acharonim and the halakha,
  in Hebrew and English, each opinion linked to its source. To write one, gather the sources
  with `python scripts/gather_meforshim.py Bekhorot 27` (every Rishon and Acharon Sefaria links to the daf, by line,
  with long pieces cut to the passages citing it). Every `ref` in the summary
  should be one of the gathered refs. The file also holds 5–8 `musagim` (key terms): an explanation,
  the exact words in one line of the Gemara (`anchors`, marked in the text and clickable), and one
  mefaresh with a quote. On a tablet or computer the card sits in a column on the left.
  First one: Bekhorot 27 (2026-10-15). Since 2026-10-16 a cloud routine writes one every day at
  03:00 Israel time for the Daf Yomi (`ROUTINE.md`: `scripts/add_summary.py --info`, then
  `gather_meforshim.py`, then `scripts/check_summary.py`, which drops any opinion or key term whose
  quote isn't in its Sefaria source, then `add_summary.py` files it and updates
  `site/data/summaries/index.json`). A masechet with summaries gets a small ס (S) button on its box
  on the home page (its tooltip says סיכום), which opens all of that masechet's summaries in order.
- **Printed page.** A button opens Sefaria's scan of the Romm Vilna page (National Library of Israel),
  from `manuscripts.sefaria.org`. The scans aren't saved offline (about 800 KB each).
- **Tools.** Each tool below can be switched on or off on its own (⚙). The explanation, Rashi and
  Tosafot are chosen in a row under "line by line" instead, since only that view shows them.
- **Sugya structure.** Each line is colored by what it does (משנה, ציטוט משנה/ברייתא, מימרא, שאלה/קושיא,
  תירוץ/ראיה), guessed from its key words (`classify` in `app.js`), with a side map of the
  sugya's flow. This is a heuristic, and the page says so.
- **Aramaic vocabulary.** About 490 Gemara words and phrases beyond the first-year basics (`scripts/vocab.txt`; the
  basic ones were dropped on 2026-10-20 as too elementary) found on the amud
  are listed with their meanings in a dropdown beside the text (not marked in the text itself).
- **Continue.** A margin on the right of the home page holds the daf yomi and the last 10 amudim opened (kept in `localStorage`, on that device only).
- **Offline.** `sw.js` saves the site, every amud opened, and the next two days' dafim.

## Files

- `site/app.js`: the whole app (views, Sefaria loading, classifier, summaries and musagim, progress)
- `site/data/masechtot.json`: Bavli tractates and their first and last amud, built by `scripts/build_masechtot.py`
- `site/data/vocab.json`: built from `scripts/vocab.txt` by `scripts/build_vocab.py`
- `scripts/vilna_page.py`: the printed page's lines (needs `pip install numpy scipy pillow`)
- `site/sw.js` + `site/offline.js`: the offline copy (same pattern as the other study sites)

To add words, edit `scripts/vocab.txt` and run `python scripts/build_vocab.py`.

Local preview: `python -m http.server 8140 --directory site`
