"""Shared by check_summary.py: compare a quote with the Sefaria text it cites.

Copied from the verify_brief.py of the other study sites (same normalisation: ignores
nikud, te'amim, punctuation, quote marks, HTML, ktiv male/chaser and divine-name spellings).
"""

import html
import json
import re
import time
import urllib.parse
import urllib.error
import urllib.request

MARKS = re.compile(r"[֑-ׇ]")            # te'amim and nikud
NOISE = re.compile(r"[^\w\s]|_")                  # punctuation, quote marks, geresh
_cache = {}


# the divine name, bare or after a one-letter prefix (לה', וה', לַיהוָה...)
DIVINE = re.compile(r"(?<![א-ת])([ובלכמשה]?)(יהוה|יקוק|ה׳|ה'|ה״)(?![א-ת])")
BLOCK_TAGS = re.compile(r"<\s*/?\s*(br|p|div|li)\b[^>]*>", re.I)
ELOKIM = re.compile(r"אלק(ים|יך|יכם|ינו|י)\b")


def norm(text):
    """Strip everything but the words, and the spelling differences that don't
    change a word: ktiv male / chaser (ו and י as vowel letters) and the ways
    the divine names are written. Word order and every other letter count."""
    # inline tags (Sefaria's large ב of בראשית, small ה of בהבראם) sit inside
    # words, so they vanish; block tags separate words
    text = BLOCK_TAGS.sub(" ", text)
    text = html.unescape(re.sub(r"<[^>]+>", "", text))
    text = text.replace("־", " ")            # maqaf joins words; treat as a space
    text = MARKS.sub("", text)
    text = DIVINE.sub(lambda m: m.group(1) + "ה", text)
    text = ELOKIM.sub(lambda m: "אלה" + m.group(1), text)
    text = NOISE.sub(" ", text)
    text = re.sub(r"[וי]", "", text)              # vowel letters: עבור == עבר
    return " ".join(text.split()).lower()


def flatten(value):
    if isinstance(value, list):
        return " ".join(flatten(v) for v in value)
    return value or ""


def source_text(ref):
    """All Hebrew and English text Sefaria has for a ref, normalised."""
    if ref in _cache:
        return _cache[ref]
    url = ("https://www.sefaria.org/api/v3/texts/"
           + urllib.parse.quote(ref.replace(" ", "_"), safe="_.:,-")
           + "?version=hebrew&version=english&version=source")
    text = ""
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=30) as response:
                data = json.load(response)
            text = " ".join(flatten(v.get("text")) for v in data.get("versions", []))
            break
        except Exception:
            time.sleep(3)
    _cache[ref] = norm(text)
    return _cache[ref]


def found(quote, ref):
    """Every part of the quote (parts joined by "..." or "…") appears in the
    source, in order. Parts must be at least two words; the whole quote three."""
    if not quote or not ref:
        return False
    parts = [norm(p) for p in re.split(r"\.\.\.|…", quote)]
    parts = [p for p in parts if p]
    if sum(len(p.split()) for p in parts) < 3 or any(len(p.split()) < 2 for p in parts):
        return False
    text, at = source_text(ref), 0
    for part in parts:
        at = text.find(part, at)
        if at < 0:
            return False
        at += len(part)
    return True


def fetch_lines(ref):
    """The Hebrew lines (Sefaria segments) of an amud of Gemara, e.g. "Bekhorot 27a";
    an empty list if the amud does not exist (the last daf of a masechet has no amud b)."""
    url = ("https://www.sefaria.org/api/v3/texts/"
           + urllib.parse.quote(ref.replace(" ", "_"), safe="_.:,-") + "?version=hebrew")
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=30) as response:
                data = json.load(response)
            versions = data.get("versions") or []
            text = versions[0].get("text") if versions else []
            return [flatten(t) for t in text] if isinstance(text, list) else []
        except urllib.error.HTTPError as err:
            if err.code in (400, 404):
                return []
            time.sleep(3)
        except Exception:
            time.sleep(3)
    return []
