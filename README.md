# לומדים גמרא — Learning Gemara

A study companion for the daily daf. It is a static site
(`site/`), served by Cloudflare Workers like the other study sites (`wrangler.jsonc`).

## What it does

- **Today's daf.** The home page shows the current Daf Yomi (from Sefaria's calendar). The Shas page
  can open any amud in the Bavli.
- **Reader.** Each line of the vocalized Aramaic (William Davidson edition) has, under it, the
  Steinsaltz explanation (Hebrew) or the Davidson English, plus Rashi and Tosafot, all from Sefaria's API.
- **צורת הדף (page view).** The reader's second view lays the amud out like the Vilna Shas: Gemara
  in the middle, Rashi toward the binding, Tosafot on the outer side. `site/daf-layout.js` is adapted
  from [daf-renderer](https://github.com/GT-Jewish-DH/daf-renderer) (MIT, Dan Jutan & Shaun
  Regenbaum), with its styles moved into `app.css` because the CSP blocks injected `<style>`. The
  layout is computed from the text, so the line breaks don't match the printed page. Tap a line for its
  explanation. When an amud has too little commentary for the shape, it falls back to three columns.
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
- **Continue.** A margin on the right of the home page holds the daf yomi and the last 10 amudim opened (kept in `localStorage`, on that device only).
- **Offline.** `sw.js` saves the site, every amud opened, and the next two days' dafim.

## Files

- `site/app.js`: the whole app (views, Sefaria loading, classifier, summaries and musagim, progress)
- `site/data/masechtot.json`: Bavli tractates and their first and last amud, built by `scripts/build_masechtot.py`
- `site/data/vocab.json`: no longer used by the app (the Aramaic word list was removed on 2026-10-20);
  built from `scripts/vocab.txt` by `scripts/build_vocab.py`, kept in case it comes back
- `site/sw.js` + `site/offline.js`: the offline copy (same pattern as the other study sites)



Local preview: `python -m http.server 8140 --directory site`
