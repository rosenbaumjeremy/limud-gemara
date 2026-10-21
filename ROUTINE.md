# Daf Yomi summary routine

Instructions for the cloud routine that runs every morning at 03:00 Israel time.
It studies the day's daf (Daf Yomi) with the Rishonim and Acharonim on Sefaria, writes
the daf's summary (סיכום: an overview, the key terms, and each sugya with the Gemara, the
Rishonim, the Acharonim and the halakha) and publishes it to this site. The site shows it
beside the text of the daf, and collects every summary of a masechet on that masechet's
summaries page (the small ס button on its box on the home page).

`site/data/summaries/Bekhorot-27.json` is the first summary, written by hand: follow its
shape, depth and tone. (Its opinions have no `quote`, because it was written before the
check below; yours must have one.)

## The rule

**Only cite a source that you link to on Sefaria, and only for what it actually says.**
Every opinion and every key term carries a Sefaria ref plus the exact words quoted from
that ref. `scripts/check_summary.py` downloads each ref and removes anything whose quote is
not there. Nothing you did not read goes in: no opinions of your own, no paraphrased
"quotes", no sources you did not open.

## Modes

- **Daily** (the normal run): steps 0–6 for today's date.
- **Backfill** (when the prompt lists dates): steps 1–4 (with 1b) and 6 for each listed date in turn,
  one commit per date. No time guard.

## Step 0 – time guard (daily only)

The schedule fires at 00:00 and 01:00 UTC so one firing lands at 03:00 in Israel
year-round. Run `TZ=Asia/Jerusalem date +%H`; if it is `02` or `04`, print
"Off-hour scheduled firing – skipping" and stop. Any other hour, continue.

## Step 1 – the day's daf

1. Date: `TZ=Asia/Jerusalem date +%Y-%m-%d` (or the backfill date).
2. `python3 scripts/add_summary.py --info <date>` prints the daf's `ref` (e.g. "Bekhorot 28"),
   the masechet (en/he), the `amudim` it has (the last daf of a masechet may have only
   amud a), the `gemara_refs`, the `file` it will be filed under, and `already_published`.
   Study exactly that daf.
3. Make the day's printed page (step 1b) first; then, if `already_published` is true, print
   "Already published", publish the page (step 6, with only `site/data/vilna` to add) and stop.

## Step 1b – the printed page (צורת הדף)

The site's page view draws each amud line for line as the Vilna Shas prints it, from
`site/data/vilna/<Masechet>-<daf><amud>.json`. Make the day's two files:

```sh
pip install -q numpy scipy pillow
python3 scripts/vilna_page.py "<Masechet>" <daf>
```

It reads Sefaria's scan of the Vilna page and the texts, and prints one line per amud: for
the Gemara, Rashi and Tosafot, how many printed lines it found, how many words, and the
average cost per line (how far the words it put on each line are from the print; under about
0.7 is a close fit). Run it for amud a before amud b (the one command does): each amud's file
records how much commentary it left for the next page, and the next amud starts with it. An amud that isn't there (the last daf of a masechet may have only
amud a) prints "not made"; that's fine. Don't edit these files by hand. Report the costs in
the final line; if one is over 1.0, add "check the page" to it.

## Step 2 – read the Gemara

For each of the `gemara_refs`:
`curl -s "https://www.sefaria.org/api/v3/texts/<ref with underscores>?version=hebrew&version=english"`.
Each item of the Hebrew `text` array is one **line**; lines are numbered from 1 on each
amud, and the summary refers to them by amud and line number. Read every line, and the
Steinsaltz on the daf (`/api/v3/texts/Steinsaltz_on_<Masechet>.<daf><amud>`) to follow it.
Divide the daf into its sugyot (usually 4–10).

## Step 3 – read the Rishonim and Acharonim

`python3 scripts/gather_meforshim.py <Masechet> <daf> > /tmp/meforshim.txt`
(a masechet of two words is one argument: `"Bava Metzia"`). It lists every Rishon (before
1500) and Acharon (1500–1930) that Sefaria links to the daf, line by line, with its ref, its
kind (on the daf, quoting it elsewhere, halakha, responsa) and its text; long pieces are cut
to the passages that cite the daf. It is long (often 200,000+ characters): read all of it,
in parts. Rashi and Tosafot on the daf itself are not in it (the site shows them beside the
text): read them too, from `/api/v3/texts/Rashi_on_<Masechet>.<daf><amud>?version=hebrew` and
`Tosafot_on_…`, and cite them where they matter. Every `ref` you cite must be one of the refs
printed there, a Rashi or Tosafot on the daf, or the Gemara itself.

For each sugya, look for what the Rishonim explain or dispute (Rashi, Tosafot, Rabbeinu
Gershom, Rambam, Rashba, Ritva, Ran, Meiri, Rosh, Tosafot HaRosh, Shita Mekubetzet …), how
the Acharonim take it further (Maharsha, Rashash, Penei Yehoshua, Rabbi Akiva Eiger, Arukh
LaNer, Chazon Ish …), and how it is ruled (Rambam's Mishneh Torah, Tur, Shulchan Arukh and
their commentaries). A machlokes between them is the heart of a sugya's entry.

## Step 4 – write the summary as JSON

Write `/tmp/summary.json` with python `json.dump(..., ensure_ascii=False)`:

```
{"date": "YYYY-MM-DD",
 "he": {"overview": "…"},
 "en": {"overview": "…"},
 "musagim": [{
   "amud": "a", "line": 1, "anchors": ["טובת הנאה לבעלים"],
   "he": {"term": "טובת הנאה", "explanation": "…"},
   "en": {"term": "Tovat hana'ah (benefit of discretion)", "explanation": "…"},
   "source": {"who": {"he": "רבינו גרשום", "en": "Rabbeinu Gershom"},
              "ref": "Rabbeinu Gershom on Bekhorot 27a:1",
              "quote": "<the mefaresh's own words, copied exactly from that ref>"}}],
 "topics": [{
   "amud": "a", "lines": [1, 4],
   "he": {"title": "…", "gemara": "…", "halakha": "…"},
   "en": {"title": "…", "gemara": "…", "halakha": "…"},
   "rishonim": [{"who": {"he": "רש״י", "en": "Rashi"}, "ref": "Rashi on Bekhorot 27a:1:1",
                 "quote": "<the words in that ref that say this, copied exactly>",
                 "he": "what he says, in Hebrew", "en": "what he says, in English"}],
   "acharonim": [ the same shape ]}]
}
```

- **overview**: 3–5 sentences: what the daf is about, amud by amud, and the main questions
  the Rishonim and Acharonim take up. Hebrew and English say the same thing.
- **musagim**: 5–8 key terms a learner needs for this daf (not basics every learner knows).
  Each: a plain explanation in 2–4 sentences, the amud and line it belongs to, `anchors`
  (the exact words of that line it explains, copied from the Sefaria Hebrew, without nikud is
  fine), and one mefaresh that explains it, with a quote.
- **topics**: one per sugya, in the order of the daf. `amud` is "a" or "b", with `lines`
  [first, last] on it; a sugya that runs from amud a into amud b is `"amud": "ab"` with
  `lines` [first line on a, last line on b]. `title` names the sugya; `gemara` gives what
  the Gemara says in 2–4 sentences; `halakha` (optional) is the ruling, only as a halakha
  source you cite in that topic states it. Then the opinions: every Rishon and Acharon worth
  knowing on that sugya, each in one or two sentences, in its own words where possible. Aim
  for the depth of Bekhorot 27 (86 opinions over 8 sugyot); spread the opinions across many
  works rather than leaning on two or three.
- **quotes**: copied from the Sefaria text you fetched, at least three words in a row (two
  excerpts may be joined with "…", each at least two words, in the order they appear).
- Hebrew is natural Hebrew study prose; names in Hebrew (רש״י, תוספות, רמב״ם, ריטב״א,
  מהרש״א, רבי עקיבא איגר …). Every ref, quote, amud and line is identical in both languages.
  Plain text only: no Markdown, no HTML. Do not write opinions or rulings no source gives.

## Step 5 – verify

```sh
python3 scripts/check_summary.py /tmp/summary.json "<ref>"
```

It removes every opinion whose quote is not in its ref, every key term whose quote or
anchors are not found, and every topic whose lines are not on the daf, and rewrites the file.
It exits 1 under 4 topics, 20 verified opinions or 5 key terms, over 8 key terms, or if no
topic keeps both a Rishon and an Acharon.

On exit 1: go back to steps 3–4, read more, fix quotes by copying them exactly, and run it
again. If a second full pass still fails because Sefaria truly has little on this daf,
continue, and say so in the final line. Never edit the file after the check passes, except
by re-running it.

No email: the user reads every summary on the site. Do not use Gmail or any other messaging
tool.

## Step 6 – publish

1. `git pull --rebase origin main`.
2. `python3 scripts/add_summary.py /tmp/summary.json` — writes
   `site/data/summaries/<Masechet>-<daf>.json` and updates `site/data/summaries/index.json`.
3. `git add site/data/summaries site/data/vilna` — nothing else — and commit as
   `git -c user.name="Daf Yomi routine" -c user.email="rosenbaum.jeremy@gmail.com" commit -m "Summary: <ref> (<date>)"`.
4. `git push origin main`; if rejected because main moved, pull --rebase and retry (3 tries).
   If refused for permission, push to `claude/summary-<date>` and say so.

Finish with one line per date: how many topics, verified opinions and key terms passed,
how many distinct works were cited, and whether the commit was pushed. Do not change any
other file, open PRs, or send any email.
