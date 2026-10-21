"""Lay out an amud line for line as the Vilna Shas prints it.

    python scripts/vilna_page.py Bekhorot 33        # both amudim
    python scripts/vilna_page.py Bekhorot 33a       # one amud
    python scripts/vilna_page.py Bekhorot 33a --check   # also save a picture to compare with the scan

The printed page is Sefaria's scan of the Romm Vilna edition (manuscripts.sefaria.org). The
script finds every printed line on the scan (where it starts and ends, and how high it sits),
sorts the lines into Gemara, Rashi and Tosafot, and then decides which of Sefaria's words go on
each line: the split whose word count, ink width and first and last word widths best match what
is printed. The result, site/data/vilna/<Masechet>-<daf><amud>.json, holds each line's place on the
page and its words, so the site can draw the page exactly as printed, with live words.

Needs numpy, scipy and Pillow (pip install numpy scipy pillow).
"""
import io, json, re, sys, urllib.parse, urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data" / "vilna"
FONTS = Path(__file__).resolve().parent / "fonts"
API = "https://www.sefaria.org/api"

WIDTH = 4167        # the scan's width that the measures below are for
SW_GEMARA = 3.4      # stroke thickness (px) between the Gemara's letters and the commentary's, when a page can't tell


def fetch(url, raw=False):
    req = urllib.request.Request(url, headers={"User-Agent": "limud-gemara vilna layout"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    return data if raw else json.loads(data)


# ---------- the scan ----------

def straighten(img):
    """Level the lines (a small rotation) and stand the columns upright (a photographed page
    leans): each is the correction that makes the row or column profile sharpest."""
    def best(values, make, axis):
        small = img.resize((img.width // 4, img.height // 4))
        scores = [((np.asarray(make(small, v)) < 150).sum(axis=axis).astype(float).var(), v) for v in values]
        return float(max(scores)[1])
    rot = lambda im, a: im.rotate(a, resample=Image.BILINEAR, fillcolor=255)
    lean = lambda im, k: im.transform(im.size, Image.AFFINE, (1, k, -k * im.height / 2, 0, 1, 0),
                                      resample=Image.BILINEAR, fillcolor=255)
    img = rot(img, best(np.arange(-1.5, 1.51, 0.05), rot, 1))
    return lean(img, best(np.arange(-0.03, 0.0301, 0.001), lean, 0))


def white_runs(row, minw):
    z = np.diff(np.r_[1, row.astype(int), 1])
    s, e = np.flatnonzero(z == -1), np.flatnonzero(z == 1)
    return [(int(a), int(b)) for a, b in zip(s, e) if b - a >= minw]


def edge_clusters(ink, win=100, step=25, gutter=45):
    """Where text blocks start and end across the page, most common first."""
    lefts, rights = [], []
    for y in range(0, ink.shape[0] - win, step):
        xs = np.flatnonzero(ink[y:y + win].any(axis=0))
        if not len(xs): continue
        s = p = xs[0]
        for x in list(xs[1:]) + [10 ** 9]:
            if x - p > gutter:
                if p - s > 200: lefts.append(s); rights.append(p)
                s = x
            p = x
    def clusters(v):
        h = np.convolve(np.bincount(np.array(v) // 8, minlength=ink.shape[1] // 8 + 1), [1, 1, 1], "same")
        top = []
        for i in np.argsort(-h):
            if h[i] < 5: break
            if all(abs(i - j) > 6 for j, _ in top): top.append((i, h[i]))
        return [(int(i * 8 + 4), int(c)) for i, c in top]
    return clusters(lefts)[:10], clusters(rights)[:10]


def columns(ink):
    """The six edges of the three columns: two side columns of about the same width, each a
    narrow gutter away from the Gemara; the combination the most lines start or end at."""
    lefts, rights = edge_clusters(ink)
    best = None
    for gL, a in lefts:
        for lR, b in rights:
            if not 40 <= gL - lR <= 160: continue
            for gR, c in rights:
                if gR - gL < 600: continue
                for rL, d in lefts:
                    if not 40 <= rL - gR <= 160: continue
                    for L, e in lefts:
                        if not 400 <= lR - L <= 900: continue
                        for R, f in rights:
                            if abs((R - rL) - (lR - L)) > 80: continue
                            score = a + b + c + d + e + f - abs((gL - lR) - (rL - gR))
                            if best is None or score > best[0]:
                                best = (score, dict(L=L, lR=lR, gL=gL, gR=gR, rL=rL, R=R))
    if best is None: raise SystemExit("couldn't find the page's columns")
    return best[1]


def strip_lines(ink, x0, x1):
    """The printed lines crossing a vertical strip: runs of inked rows, with runs that hold
    two or more lines cut at their thinnest rows."""
    p = np.convolve(ink[:, x0:x1].sum(1).astype(float), np.ones(5) / 5, "same")
    on = p > max(3, 0.02 * (x1 - x0))
    ys = np.flatnonzero(np.diff(np.r_[0, on.astype(int), 0]))
    runs = [(a, b) for a, b in zip(ys[::2], ys[1::2]) if b - a >= 12]
    if not runs: return []
    med = float(np.median([b - a for a, b in runs]))
    pieces = []
    for a, b in runs:
        k = int(round((b - a) / med))
        if b - a > 1.6 * med and k >= 2:
            sm = np.convolve(p[a:b], np.ones(9) / 9, "same")
            cuts, step = [a], (b - a) / k
            for j in range(1, k):
                c, w = int(j * step), int(step * 0.35)
                lo, hi = max(1, c - w), min(len(sm) - 1, c + w)
                cuts.append(a + lo + int(np.argmin(sm[lo:hi])))
            pieces += list(zip(cuts, cuts[1:] + [b]))
        elif b - a < 0.45 * med and pieces and a - pieces[-1][1] < 0.3 * med:
            pieces[-1] = (pieces[-1][0], b)       # a raised mark: part of the line above
        else:
            pieces.append((a, b))
    out = []
    for a, b in pieces:
        s = p[a:b]
        if not len(s) or s.max() <= 0: continue
        core = np.flatnonzero(s > 0.4 * s.max())    # the letters' body, without the tall and low strokes
        out.append(dict(y0=int(a), y1=int(b), c0=int(a + core[0]), c1=int(a + core[-1] + 1)))
    return out


def extent(ink, l, x0, x1, lo, hi):
    """From the strip, run out to the gutters on both sides. A gutter stays white over this
    line and the lines above and below it (a word space doesn't); a gap far wider than any
    word space in the line's own row ends it too."""
    h = l["c1"] - l["c0"]
    win = ink[max(0, l["c0"] - 2 * h):l["c1"] + 2 * h].any(axis=0)
    own = ink[l["c0"]:l["c1"]].any(axis=0)
    xs = np.flatnonzero(own[x0:x1])
    if not len(xs): return None
    a, b = x0 + xs[0], x0 + xs[-1]
    runs = white_runs(win, 25) + white_runs(own, 300)
    left = max([e for s, e in runs if e <= a] + [lo])
    right = min([s for s, e in runs if s > b] + [hi])
    ys = np.flatnonzero(own[left:right])
    return (int(left + ys[0]), int(left + ys[-1])) if len(ys) else None


def stroke(ink, l):
    band = ink[l["c0"]:l["c1"], l["x0"]:l["x1"]]
    v = ndimage.distance_transform_edt(band)[band]
    return float(np.percentile(v, 75)) if len(v) else 0.0


def sw_split(values):
    """The stroke thickness that best splits values into two groups (Otsu's method)."""
    v = np.array(values, float)
    v = np.sort(np.clip(v, *np.percentile(v, [5, 92])))     # running heads and big opening words are rare and far off
    best = (0, SW_GEMARA)
    for i in range(1, len(v)):
        if v[i] - v[i - 1] < 1e-6: continue
        a, b = v[:i], v[i:]
        score = len(a) * len(b) * (b.mean() - a.mean()) ** 2
        if score > best[0]: best = (score, (v[i - 1] + v[i]) / 2)
    lo, hi = v[v <= best[1]], v[v > best[1]]
    # two real groups only if they stand well apart
    return best[1] if len(lo) and len(hi) and hi.mean() - lo.mean() > 0.35 else SW_GEMARA


def same_row(a, b):
    return min(a["c1"], b["c1"]) - max(a["c0"], b["c0"]) > 0.5 * min(a["c1"] - a["c0"], b["c1"] - b["c0"])


def overlap(a, b): return min(a["x1"], b["x1"]) - max(a["x0"], b["x0"])


def find_lines(ink, col):
    L, R, lR, gL, gR, rL = (col[k] for k in ("L", "R", "lR", "gL", "gR", "rL"))
    m = 15
    def lines_in(x0, x1, lo, hi):
        out = []
        for ln in strip_lines(ink, x0, x1):
            ext = extent(ink, ln, x0, x1, lo(ln), hi(ln))
            if ext:
                ln["x0"], ln["x1"] = ext
                out.append(ln)
        return out
    # the Gemara column, never crossing its gutters
    gem = sorted(lines_in(gL + m, gR - m, lambda l: gL - 12, lambda l: gR + 12), key=lambda l: l["c0"])
    for l in gem: l["sw"] = stroke(ink, l)
    # how thick the Gemara's strokes are against the commentary's differs from scan to scan:
    # split this page's lines (the Gemara column's and the side columns') into two groups
    sample = [l["sw"] for l in gem] + [stroke(ink, l) for x0, x1 in ((L + m, lR - m), (rL + m, R - m))
                                       for l in lines_in(x0, x1, lambda l: x0 - m - 12, lambda l: x1 + m + 12)]
    sw = sw_split(sample)
    col["sw"] = sw
    # the Gemara's rows: the longest run of thick lines in its column (one thin misread allowed)
    flags = [l["sw"] > sw for l in gem]
    best, i = (0, 0, -1), 0
    while i < len(gem):
        if not flags[i]: i += 1; continue
        j = i
        while j + 1 < len(gem) and (flags[j + 1] or (j + 2 < len(gem) and flags[j + 2])): j += 1
        if j - i + 1 > best[0]: best = (j - i + 1, i, j)
        i = j + 1
    _, a, b = best
    col["top"], col["bot"] = top, bot = gem[a]["c0"] - 5, gem[b]["c1"] + 5
    inside = lambda l: l["c0"] >= top - 10 and l["c1"] <= bot + 10
    lines = [dict(l, kind="g") for l in gem[a:b + 1]]
    # the side columns: beside the Gemara they stop at its gutter, over and under it they run free
    side = lines_in(L + m, lR - m, lambda l: L - 12, lambda l: lR + 12 if inside(l) else R + 12)
    side += lines_in(rL + m, R - m, lambda l: rL - 12 if inside(l) else L - 12, lambda l: R + 12)
    for l in sorted(side, key=lambda l: (l["c0"], l["x0"])):
        k = next((k for k in lines if same_row(k, l) and overlap(k, l) > 0), None)
        if k is None:
            l["sw"] = stroke(ink, l); lines.append(l)
        elif k.get("kind") != "g":
            k["x0"], k["x1"] = min(k["x0"], l["x0"]), max(k["x1"], l["x1"])    # one line, seen from both sides
    # beside the Gemara, a thick line in a side column is the Gemara widening into it: once it
    # widens, that column's commentary has ended, so no thin line of the column comes below it
    core = lambda l: l["c1"] - l["c0"]
    gcore = float(np.median([core(l) for l in lines if l.get("kind") == "g"]))
    ccore = float(np.median([core(l) for l in lines if "kind" not in l] or [gcore * 0.85]))
    tall = lambda l: core(l) > (gcore + ccore) / 2 if gcore - ccore > 2 else True     # the Gemara's letters are taller
    for l in lines:
        if "kind" in l: continue
        l["kind"] = "c"
        if inside(l) and l["sw"] > sw and tall(l):
            same_side = (lambda k: k["x1"] < gL) if l["x1"] < gL else (lambda k: k["x0"] > gR)
            if not any(k is not l and same_side(k) and l["c0"] < k["c0"] < bot and k["sw"] <= sw
                       for k in lines if k.get("kind") != "g"):
                l["kind"] = "g"
    merged = []
    for l in sorted(lines, key=lambda l: (l["c0"], l["x0"])):
        if l["kind"] == "g":
            # the same row seen twice (once maybe as a thin piece of it) is one line
            k = next((k for k in merged if k["kind"] == "g" and (same_row(k, l) or (
                overlap(k, l) > 0 and abs(k["c1"] - l["c1"]) < 0.6 * (k["c1"] - k["c0"])))), None)
            if k: k["x0"], k["x1"] = min(k["x0"], l["x0"]), max(k["x1"], l["x1"]); continue
        merged.append(l)
    return merged


def sort_commentary(ink, col, lines):
    """The commentary lines of each side, top to bottom, without the running head, catchwords,
    the "תורה אור" heading over the gutter, and the notes printed under the page."""
    L, R, mid = col["L"], col["R"], (col["gL"] + col["gR"]) / 2
    com = sorted([l for l in lines if l["kind"] == "c"], key=lambda l: l["c0"])
    body = [l for l in com if l["sw"] <= col["sw"] and l["c1"] - l["c0"] > 20 and (l["x0"] < L + 40 or l["x1"] > R - 40)]
    first = min(l["c0"] for l in body)
    # the running head: the page's top row, over the first line of commentary
    top_row = min(l["c0"] for l in com)
    head = [l for l in com if l["c1"] <= first - 15 and l["c0"] < top_row + 40]
    com = [l for l in com if l not in head]
    # under the page come the notes: after a gap of over a line and a half, or in smaller letters
    core = float(np.median([l["c1"] - l["c0"] for l in body]))
    pitch = float(np.median([d for d in np.diff([l["c0"] for l in body]) if d > 20]))
    com = [l for l in com if l["c1"] - l["c0"] > 0.6 * core]       # specks and rules, not lines
    below = [l for l in com if l["c0"] > col["bot"]]
    for prev, l in zip([None] + below, below):
        gap = l["c0"] - (prev["c0"] if prev else col["bot"])
        if gap > 1.7 * pitch + (0 if prev else 40) or (l["c1"] - l["c0"] < 0.85 * core and l["x1"] - l["x0"] > 0.4 * (R - L)):
            com = [k for k in com if k["c0"] < l["c0"]]
            break
    # two pieces of one row with only a word space between them (wide where a comment ends) are one
    # line; beside the Gemara the column's gutter is far wider than that
    rows = []
    for l in com:
        k = next((k for k in rows if same_row(k, l) and -5 < max(l["x0"] - k["x1"], k["x0"] - l["x1"])
                  < (60 if l["c0"] > col["bot"] else 180) and not (min(k["x1"], l["x1"]) < mid < max(k["x0"], l["x0"]))), None)
        if k: k["x0"], k["x1"] = min(k["x0"], l["x0"]), max(k["x1"], l["x1"])
        else: rows.append(l)
    com = rows
    for l in com:
        # a side's line reaches its outer edge, or (a short last line) stays on its own side
        a, b = l["x0"] < L + 40, l["x1"] > R - 40
        a, b = a or (not b and l["x1"] < mid - 60), b or (not a and l["x0"] > mid + 60)
        # over the Gemara, a line that stops short of its edge (a big opening word stands there) still
        # lies on its own side of the page
        if not a and not b and l["c0"] < col["top"] and abs((l["x0"] + l["x1"]) / 2 - mid) > 150:
            a, b = (l["x0"] + l["x1"]) / 2 < mid, (l["x0"] + l["x1"]) / 2 > mid
        # a centred last line under the Gemara goes with the side still running
        if not a and not b and l["c0"] > col["bot"] and l["x0"] < mid < l["x1"]: a = b = True
        l["side"] = "B" if a and b else "L" if a else "R" if b else None
    com = [l for l in com if l["side"]]
    for l in com:
        if l["side"] == "B":    # a full line under the page: it goes on with the side still running
            prev = {s: max([k["c0"] for k in com if k["side"] == s and k["c0"] < l["c0"]], default=-1) for s in "LR"}
            l["side"] = "L" if prev["L"] > prev["R"] else "R"
    out = {}
    for s in "LR":
        ls = [l for l in com if l["side"] == s]
        for l in ls:
            # just over the Gemara, a line starts at the page's middle (a wide line) or at its column's
            # edge; one that starts in between has the "תורה אור" heading over the gutter stuck to it
            if col["top"] - 2.5 * pitch < l["c0"] < col["top"]:
                own = ink[l["c0"]:l["c1"]].any(axis=0)
                if s == "R" and mid + 150 < l["x0"] < col["rL"] - 20:
                    l["x0"] = col["rL"] - 15 + int(np.flatnonzero(own[col["rL"] - 15:])[0])
                if s == "L" and col["lR"] + 20 < l["x1"] < mid - 150:
                    l["x1"] = int(np.flatnonzero(own[:col["lR"] + 15])[-1])
        # a last line that came out too tall has the row under it (a catchword, a note) stuck to it:
        # keep only the line, so what's under it can be found
        if ls and ls[-1]["c1"] - ls[-1]["c0"] > 1.2 * core:
            l = ls[-1]
            prof = ink[l["c0"]:l["y1"], l["x0"]:l["x1"]].sum(axis=1).astype(float)
            lo = int(0.55 * core)
            cut = l["c0"] + lo + int(np.argmin(prof[lo:]))
            l["c1"], l["y1"] = min(l["c1"], cut), cut
        out[s] = ls
    return out, head


def bracket(m, core):
    """What a glyph (a boolean mask) is, if it is a paren or a square bracket: "close" or "open"
    (as read right to left), with "sq" for a square one; else None. They are thin and stand taller
    than the letters; a square bracket has flat arms at its top and bottom, a paren is curved."""
    h, w = m.shape
    if h < 1.1 * core or w > 0.5 * h or h < 12: return None
    widths = m.sum(axis=1).astype(float)
    med = float(np.median(widths))
    centre = lambda rows: float(np.mean([np.flatnonzero(m[r]).mean() for r in rows if m[r].any()]))
    ends = list(range(1, 4)) + list(range(h - 4, h - 1))
    middle = range(h // 3, 2 * h // 3)
    top, bottom = widths[1:4].mean() / med, widths[h - 5:h - 1].mean() / med
    if max(top, bottom) >= 1.6 and min(top, bottom) >= 1.15:     # one arm may print faintly
        # the stem on the left and the arms out to the right closes (right to left); the other way opens
        return "close-sq" if centre(middle) < centre(ends) else "open-sq"
    shift = centre(ends) - centre(middle)
    if shift > 0.25 * w: return "close"      # bulges left: "(" on the page closes, right to left
    if shift < -0.25 * w: return "open"
    return None


def drop_markers(ink, l, boxes, core, state):
    """Take out of a commentary line the note markers Sefaria's text doesn't have: a short word
    closed by a paren or bracket that nothing opened ("כח]", "כ)"), and a "*)" stuck to the front
    of a word. state carries what is open from one line to the next."""
    out = []
    for a, b in reversed(boxes):              # right to left, in reading order
        sub = ink[l["y0"]:l["y1"], l["x0"] + a:l["x0"] + b]
        lab, n = ndimage.label(sub)
        comps = sorted(((sl[1].start, sl[1].stop, (lab[sl] == i + 1)) for i, sl in enumerate(ndimage.find_objects(lab))),
                       key=lambda c: -c[1])     # right to left
        kinds = [bracket(m, core) for _, _, m in comps]
        # a "*)" before the word: a closing paren at its right with nothing open
        if len(comps) > 2 and kinds[0] is None and kinds[1] == "close" and not state.get("close"):
            b = a + comps[1][0] - 2
        elif kinds and kinds[0] == "close" and not state.get("close") and len(comps) > 1:
            b = a + comps[0][0] - 2
        for k in kinds:
            if k in ("open", "open-sq"): state[k.replace("open", "close")] = True
        last = kinds[-1] if kinds else None
        if last in ("close", "close-sq"):
            if state.get(last): state[last] = False          # it closes a reference: a real word
            elif b - a < 3 * core: continue                    # a marker
        if b - a >= 14: out.append((a, b))
    return out[::-1]


def word_boxes(ink, l, kind, state=None):
    """The words of a printed line as (x0, x1), left to right; dots, *, ° and the little
    letters that point to the notes are left out, and in the commentary the note markers."""
    prof = ink[l["y0"]:l["y1"], l["x0"]:l["x1"] + 1].sum(axis=0) > 0
    z = np.diff(np.r_[0, prof.astype(int), 0])
    out = []
    for a, b in zip(np.flatnonzero(z == 1), np.flatnonzero(z == -1)):
        if out and a - out[-1][1] < (9 if kind == "g" else 10): out[-1][1] = b
        else: out.append([a, b])
    out = [(a, b) for a, b in out if b - a >= 8]
    def height(a, b):
        rows = np.flatnonzero(ink[l["y0"]:l["y1"], l["x0"] + a:l["x0"] + b].any(axis=1))
        return rows[-1] - rows[0] + 1 if len(rows) else 0
    hs = [height(a, b) for a, b in out]
    med = float(np.median(hs)) if hs else 0
    out = [(int(a), int(b)) for (a, b), h in zip(out, hs) if h >= 0.62 * med and b - a >= (18 if kind == "g" else 14)]
    if kind == "c" and state is not None:
        # the column's usual letter height: a line's own can come out taller
        out = drop_markers(ink, l, out, state.get("core", l["c1"] - l["c0"]), state)
    return out


def catchword_under(ink, col, last):
    """The catchword when it shares its rows with a note printed beside it (so it wasn't found as a
    line of its own): the letters under the last line that are as thick and tall as the Gemara's."""
    gL, gR, h = col["gL"], col["gR"], last["c1"] - last["c0"]
    y0, y1 = last["y1"] + 2, last["y1"] + int(2.5 * h)
    area = ink[y0:y1, gL - 10:gR + 10]
    lab, n = ndimage.label(area)
    if not n: return None
    depth = ndimage.distance_transform_edt(area)
    gem_depth = np.percentile(ndimage.distance_transform_edt(ink[last["c0"]:last["c1"], last["x0"]:last["x1"]])
                              [ink[last["c0"]:last["c1"], last["x0"]:last["x1"]]], 95)
    thick = ndimage.maximum(depth, lab, range(1, n + 1))
    keep = [sl for sl, t in zip(ndimage.find_objects(lab), thick)
            if t >= 0.85 * gem_depth and sl[0].stop - sl[0].start > 0.6 * h]
    if not keep or len(keep) > 8: return None
    box = dict(y0=y0 + min(k[0].start for k in keep), y1=y0 + max(k[0].stop for k in keep),
               x0=gL - 10 + min(k[1].start for k in keep), x1=gL - 10 + max(k[1].stop for k in keep))
    if box["x1"] - box["x0"] > 0.4 * (gR - gL): return None
    box["c0"], box["c1"] = box["y0"], box["y1"]
    return box


def word_under(ink, last):
    """A lone word printed just under a line, toward its left end (where a line ends, read right
    to left): a commentary's catchword. A box, or None."""
    h, width = last["c1"] - last["c0"], last["x1"] - last["x0"]
    y0, y1 = last["y1"] + 2, last["c1"] + int(1.6 * h)
    area = ink[y0:y1, last["x0"]:last["x1"] + 1]
    cols_ = np.flatnonzero(area.any(axis=0))
    if not len(cols_): return None
    pieces = []
    for a in cols_:
        if pieces and a - pieces[-1][1] < 40: pieces[-1][1] = a
        else: pieces.append([a, a])
    pieces = [p for p in pieces if 0.5 * h < p[1] - p[0] < 0.25 * width]
    # short, as tall as letters, and in the line's left part (a note may stand further right)
    found = []
    for a, b in pieces:
        rows = np.flatnonzero(area[:, a:b + 1].any(axis=1))
        if rows[-1] - rows[0] >= 0.6 * h and b < 0.45 * width:
            found.append(dict(x0=last["x0"] + int(a), x1=last["x0"] + int(b), c0=y0 + int(rows[0]), c1=y0 + int(rows[-1]) + 1))
    return found[0] if len(found) == 1 else None


# ---------- the text ----------

def strip_tags(s): return re.sub(r"<[^>]+>", "", s or "")

def gemara_words(segs):
    out = []
    for i, s in enumerate(segs):
        s = re.sub(r"\((?:[א-ת]+ ){1,2}[א-ת]{1,3},? [א-ת]{1,3}\)", " ", strip_tags(s))   # verses: printed in the margin
        out += [dict(w=w, s=i) for w in s.split() if re.search(r"[א-ת]", w)]
    return out

def comment_words(segs, masechet_he):
    out = []
    for i, seg in enumerate(segs):
        for k, c in enumerate(seg if isinstance(seg, list) else [seg]):
            c = strip_tags(c)
            # Sefaria writes "(דברים ט״ו:כ״ב)" where the page has "(דברים טו)", and names the masechet
            c = re.sub(r"\(([^()]*?) ([א-ת״׳]+):[א-ת״׳\-–]+\)", lambda m: f"({m.group(1)} {re.sub('[״׳]', '', m.group(2))})", c)
            c = c.replace(f"({masechet_he} דף", "(דף")
            dh, sep, rest = c.partition(" - ")
            n = 0
            for part, is_dh in ((dh, True), (rest, False)) if sep else ((c, False),):
                ws = [w for w in part.split() if re.search(r"[א-ת]", w)]
                for j, w in enumerate(ws):
                    out.append(dict(w=w, c=[i, k], first=n == 0, dh_end=is_dh and j == len(ws) - 1))
                    n += 1
    return out


FONT = {"g": ImageFont.truetype(str(FONTS / "FrankRuhlLibre.ttf"), 100),
        "c": ImageFont.truetype(str(FONTS / "NotoRashiHebrew.ttf"), 100)}

def body_ratio(font):
    """A letter's body height as a share of the font size."""
    big = font.font_variant(size=1000)
    x0, y0, x1, y1 = big.getbbox("מ")
    return (y1 - y0) / 1000


def loss(x, h=0.5):
    x = abs(x)
    return x * x if x < h else 2 * h * x - h * h

def split(lines, words, kind, free_end=False, pre=0, post=0):
    """Cut the words into the printed lines: line i gets words[cut[i]:cut[i+1]]. Each line costs
    how far its word count, its ink width, its first and last words' widths, and where its word
    spaces would fall (the line justified to its printed width) are from the print; the cheapest
    split wins. The first `pre` words (the end of the amud before, which the page may carry over)
    and the last `post` words (which the page may leave to the next) may stay off the page."""
    # Tosafot's comments open with a word in big square letters
    e = np.array([FONT["g"].getlength(w["w"]) * 1.45 if w.get("bold") else FONT[kind].getlength(w["w"]) for w in words])
    E = np.r_[0, np.cumsum(e)]
    N, M = len(words), len(lines)
    if not N or not M: return [0] * (M + 1), 0, 0.0
    n = [len(l["boxes"]) for l in lines]
    W = [sum(b - a for a, b in l["boxes"]) for l in lines]
    # right to left: a line's first word is its rightmost box, its last word its leftmost
    first = [(l["boxes"][-1][1] - l["boxes"][-1][0]) if l["boxes"] else 0 for l in lines]
    last = [(l["boxes"][0][1] - l["boxes"][0][0]) if l["boxes"] else 0 for l in lines]
    span = [(l["boxes"][-1][1] - l["boxes"][0][0]) if l["boxes"] else 0 for l in lines]
    # the word spaces' middles, measured from the line's right end
    gaps = [np.sort([l["boxes"][-1][1] - (b[1] + c[0]) / 2 for b, c in zip(l["boxes"], l["boxes"][1:])])
            for l in lines]
    s = sum(W) / E[-1]
    INF = 1e18
    for _ in range(3):        # the scale (print px per font unit) is refit from each split
        mean = s * E[-1] / N
        D = np.full((M + 1, N + 1), INF); P = np.zeros((M + 1, N + 1), int)
        D[0, :pre + 1] = 0
        for i in range(1, M + 1):
            ni, Wi, fi, li, Si, Gi = n[i - 1], W[i - 1], first[i - 1], last[i - 1], span[i - 1], gaps[i - 1]
            reach = np.flatnonzero(D[i - 1] < INF)
            if not len(reach): break
            for j in range(int(reach[0]) + 1, min(N, int(reach[-1]) + ni + 6) + 1):
                bestc, arg = INF, 0
                for k in range(max(1, ni - 6), min(ni + 6, j) + 1):
                    a = j - k
                    if D[i - 1, a] >= INF: continue
                    c = (D[i - 1, a] + 0.15 * loss(k - ni) + loss((Wi - s * (E[j] - E[a])) / mean)
                         + loss((fi - s * e[a]) / mean) + loss((li - s * e[j - 1]) / mean))
                    if k > 1 and len(Gi):
                        w = s * e[a:j]
                        space = (Si - w.sum()) / (k - 1)
                        pred = np.cumsum(w)[:-1] + (np.arange(k - 1) + 0.5) * space
                        idx = np.clip(np.searchsorted(Gi, pred), 1, len(Gi) - 1) if len(Gi) > 1 else np.zeros(k - 1, int)
                        d = np.minimum(np.abs(pred - Gi[idx]), np.abs(pred - Gi[idx - 1]) if len(Gi) > 1 else np.inf)
                        c += 1.5 * float(np.minimum(d / mean, 1.0).mean())
                    if c < bestc: bestc, arg = c, a
                D[i, j], P[i, j] = bestc, arg
        # where the page's text ends: after all of it, or a few words short (they go on the next page)
        # (each word left off costs a little, each found line left empty a lot: those are rare)
        tail = 0.25 * np.arange(post, -1, -1)
        rows = range(M + 1) if free_end else [M]
        end, stop = min(((i, j) for i in rows for j in range(N - post, N + 1)),
                        key=lambda ij: D[ij[0], ij[1]] + tail[ij[1] - (N - post)] + 2.0 * (M - ij[0]))
        cuts, j = [stop], stop
        for i in range(end, 0, -1):
            j = P[i, j]; cuts.append(j)
        cuts = cuts[::-1]
        if end == 0 or D[end, stop] >= INF: return cuts, 0, float("inf")     # the words don't fit these lines
        s = sum(W[:end]) / (E[stop] - E[cuts[0]])
    return cuts, end, float(D[end, stop]) / max(end, 1)


# ---------- one amud ----------

ORDINALS = "ראשון שני שלישי רביעי חמישי שישי שביעי שמיני תשיעי עשירי אחד-עשר שנים-עשר שלשה-עשר ארבעה-עשר חמשה-עשר ששה-עשר שבעה-עשר שמונה-עשר תשעה-עשר עשרים עשרים-ואחד עשרים-ושנים עשרים-ושלשה עשרים-וארבעה".split()

def hebrew_number(n):
    out = ""
    for v, ch in ((400, "ת"), (300, "ש"), (200, "ר"), (100, "ק")):
        while n >= v: out += ch; n -= v
    if n == 15: return out + "טו"
    if n == 16: return out + "טז"
    tens = " יכלמנסעפצ"
    return out + (tens[n // 10] if n >= 10 else "") + (" אבגדהוזחט"[n % 10] if n % 10 else "")


def parse(ref):
    m = re.fullmatch(r"(.+?)[ _.](\d+)([ab])?", ref.strip())
    if not m: raise SystemExit(f"not an amud or daf: {ref}")
    return m.group(1).replace("_", " "), int(m.group(2)), m.group(3)


def ref_num(r):
    d, a = re.search(r"(\d+)([ab])", r).groups()
    return int(d) * 2 + (a == "b")


def header_words(masechet, daf, amud):
    index = fetch(f"{API}/v2/raw/index/{urllib.parse.quote(masechet)}")
    he = next(t["text"] for t in index["schema"]["titles"] if t["lang"] == "he" and t.get("primary"))
    here, perek = daf * 2 + (amud == "b"), None
    for i, node in enumerate(index["alt_structs"]["Chapters"]["nodes"]):
        a, b = node["wholeRef"].split("-")
        if ref_num(a) <= here <= ref_num(b if re.search(r"\d+[ab]", b) else a):
            perek = (next(t["text"] for t in node["titles"] if t["lang"] == "he"), node.get("numeric_equivalent", i + 1))
            break
    title = (perek[0].split() + ["פרק", ORDINALS[perek[1] - 1].replace("-", " ")] if perek else []) + [he]
    # amud a has the daf at the outer (left) corner; amud b the page number at the right
    return (title + [hebrew_number(daf) + "."]) if amud == "a" else ([str(daf * 2)] + title), he


def amud_page(masechet, daf, amud, check=False):
    ref = f"{masechet} {daf}{amud}"
    route = urllib.parse.quote(f"{masechet.replace(' ', '_')}.{daf}{amud}")
    scans = fetch(f"{API}/manuscripts/{route}")
    vilna = next((m for m in scans if "vilna" in (m.get("manuscript_slug") or "")), None)
    if not vilna: raise SystemExit(f"{ref}: Sefaria has no Vilna scan")
    img = Image.open(io.BytesIO(fetch(vilna["image_url"], raw=True))).convert("L")
    # the scans come in two sizes; every measure here is for the larger (4167 px wide)
    if abs(img.width - WIDTH) > 200:
        img = img.resize((WIDTH, round(img.height * WIDTH / img.width)), Image.LANCZOS)
    img = straighten(img)
    ink = ndimage.binary_opening(np.asarray(img) < 150, np.ones((3, 3)))

    col = columns(ink)
    lines = find_lines(ink, col)
    gem = sorted([l for l in lines if l["kind"] == "g"], key=lambda l: l["c0"])
    sides, head = sort_commentary(ink, col, lines)
    for l in gem: l["boxes"] = word_boxes(ink, l, "g")
    for ls in sides.values():
        state = {"core": float(np.median([l["c1"] - l["c0"] for l in ls])) if ls else 30}
        for l in ls: l["boxes"] = word_boxes(ink, l, "c", state)
    # the catchword: the next amud's first word, alone under the last line
    catch = gem.pop() if gem and len(gem[-1]["boxes"]) <= 2 and gem[-1]["x1"] - gem[-1]["x0"] < 0.7 * (col["gR"] - col["gL"]) else None
    if catch is None and gem:
        catch = catchword_under(ink, col, gem[-1])

    hw, masechet_he = header_words(masechet, daf, amud)
    def text(name):
        if not name: return fetch(f"{API}/v3/texts/{route}?version=hebrew|Wikisource_Talmud_Bavli")
        return fetch(f"{API}/v3/texts/{name}_on_{route}")
    g_words = gemara_words(text("")["versions"][0]["text"])
    report, out_lines, spill = {}, [], {}

    cuts, end, cost = split(gem, g_words, "g")
    report["gemara"] = (len(gem), len(g_words), cost)
    for i, l in enumerate(gem):
        ws = g_words[cuts[i]:cuts[i + 1]]
        out_lines.append(dict(k="g", l=l, words=[w["w"] for w in ws], ids=[w["s"] for w in ws]))
    if catch:
        nxt = f"{daf}b" if amud == "a" else f"{daf + 1}a"
        try:
            w = gemara_words(fetch(f"{API}/v3/texts/{urllib.parse.quote(masechet.replace(' ', '_'))}.{nxt}?version=hebrew|Wikisource_Talmud_Bavli")["versions"][0]["text"])[0]["w"]
            out_lines.append(dict(k="g", l=catch, words=[w], ids=[None]))
        except Exception:
            pass

    # Rashi sits toward the binding: on the right of amud a, the left of amud b
    for name, key, side in (("Rashi", "r", "R" if amud == "a" else "L"), ("Tosafot", "t", "L" if amud == "a" else "R")):
        ls = sides[side]
        try: data = text(name)["versions"][0]["text"]
        except Exception: data = []
        ws = comment_words(data, masechet_he)
        if not ws or not ls: continue
        # a page can leave the end of its commentary to the next page; the amud before's file says how
        # many words it left (its "spill"), and this page starts with them
        prev_ref = f"{daf}a" if amud == "b" else f"{daf - 1}b"
        prev = []
        try:
            left = json.loads((OUT / f"{masechet.replace(' ', '_')}-{prev_ref}.json").read_text(encoding="utf-8")).get("spill", {}).get(key, 0)
            if left:
                prev = comment_words(fetch(f"{API}/v3/texts/{name}_on_{urllib.parse.quote(masechet.replace(' ', '_'))}.{prev_ref}")["versions"][0]["text"], masechet_he)[-left:]
        except (OSError, ValueError):
            pass
        for w in prev: w["c"] = None          # not this amud's: no Gemara line to light up
        ws = prev + ws
        big = None
        if ls and ws and not prev:
            # the commentary may open with a big word over its first two lines, at their right
            f0, f1 = ls[0], ls[1] if len(ls) > 1 else ls[0]
            limit = (col["gL"] + col["gR"]) // 2 if side == "L" and f0["c0"] < col["top"] else col["R"] if side == "R" else col["lR"]
            xs = min(f0["x1"], f1["x1"]) + 15
            area = ink[f0["c0"] - 30:f1["c1"], xs:limit + 20]
            if area.size and area.sum() > 0.02 * area.size:
                rows, cols_ = np.flatnonzero(area.any(axis=1)), np.flatnonzero(area.any(axis=0))
                box = dict(x0=xs + int(cols_[0]), x1=xs + int(cols_[-1]),
                           c0=f0["c0"] - 30 + int(rows[0]), c1=f0["c0"] - 30 + int(rows[-1]) + 1)
                if box["c1"] - box["c0"] > 1.3 * (f0["c1"] - f0["c0"]) and stroke(ink, box) > col["sw"]:
                    big = box
                    if f0["x1"] > big["x0"]:      # the first line ran into it: it ends before it
                        f0["x1"] = big["x0"] - 10
                        f0["boxes"] = word_boxes(ink, f0, "c")
        start = 1 if big else 0
        for w in ws: w["bold"] = key == "t" and w["first"]
        cuts, end, cost = split(ls, ws[start:], "c", free_end=True, post=min(80, len(ws) // 3))
        # when the page goes on with this commentary on the next one, the next page's first word
        # stands alone under the last line (the catchword). If the split put it at the end of the
        # last line instead (the closer width says), it comes off that line.
        catch_c = word_under(ink, ls[end - 1]) if end and cuts[end] - cuts[end - 1] > 1 else None
        if catch_c:
            pos = start + cuts[end]
            width = lambda w: FONT["c"].getlength(w["w"])
            box_w = catch_c["x1"] - catch_c["x0"]
            line_s = sum(b - a for a, b in ls[end - 1]["boxes"]) / max(1, sum(width(w) for w in ws[start + cuts[end - 1]:pos]))
            if pos < len(ws):
                nxt = ws[pos]
            else:       # all of this amud's commentary is on the page: the catchword is the next amud's
                nxt_ref = f"{daf}b" if amud == "a" else f"{daf + 1}a"
                try:
                    nxt = comment_words(fetch(f"{API}/v3/texts/{name}_on_{urllib.parse.quote(masechet.replace(' ', '_'))}.{nxt_ref}")["versions"][0]["text"], masechet_he)[0]
                    nxt["c"] = None
                except Exception:
                    nxt = None
            on_line = abs(line_s * width(ws[pos - 1]) - box_w)
            after = abs(line_s * width(nxt) - box_w) if nxt else float("inf")
            if on_line < 0.6 * after and pos - 1 > start + cuts[end - 1]:
                cuts[end] -= 1; pos -= 1; nxt = ws[pos]
            if nxt:
                out_lines.append(dict(k=key, l=dict(catch_c, y0=catch_c["c0"], y1=catch_c["c1"]),
                                      words=[nxt["w"]], ids=[nxt["c"]]))
        spill[key] = len(ws) - start - cuts[end]
        report[name] = (len(ls), end, len(ws), cost)
        if big:
            out_lines.append(dict(k=key, l=big, words=[ws[0]["w"]], ids=[ws[0]["c"]], big=True))
        for i in range(end):
            seg = ws[start + cuts[i]:start + cuts[i + 1]]
            out_lines.append(dict(k=key, l=ls[i], words=[w["w"] + (" ·" if w["dh_end"] else "") for w in seg],
                                  ids=[w["c"] for w in seg], first=[j for j, w in enumerate(seg) if w["first"]]))

    # the running head: one word per box when they come out even, else spread over its width
    head_out = []
    if head:
        y0, y1 = min(h["c0"] for h in head), max(h["c1"] for h in head)
        band = dict(y0=y0, y1=y1, c0=y0, c1=y1, x0=col["L"] - 20, x1=col["R"] + 20)
        prof = ink[y0:y1, band["x0"]:band["x1"]].any(axis=0)
        boxes = []
        for a, b in white_runs(~prof, 1):
            if boxes and a - boxes[-1][1] < 40: boxes[-1][1] = b
            else: boxes.append([a, b])
        boxes = [(band["x0"] + a, band["x0"] + b) for a, b in boxes if b - a > 20]
        if len(boxes) == len(hw):
            head_out = [dict(x=a, w=b - a, y=y1, t=w) for (a, b), w in zip(boxes[::-1], hw)]
        elif len(boxes) >= 2:
            # the daf (amud a, at the left) or page number (amud b, at the right) stands alone in its corner
            num, rest = (boxes[0], boxes[1:]) if amud == "a" else (boxes[-1], boxes[:-1])
            title = hw[:-1] if amud == "a" else hw[1:]
            head_out = [dict(x=num[0], w=num[1] - num[0], y=y1, t=hw[-1] if amud == "a" else hw[0]),
                        dict(x=rest[0][0], w=rest[-1][1] - rest[0][0], y=y1, t=title)]

    # sizes: each kind's letters as high as the print's
    core = lambda k: float(np.median([o["l"]["c1"] - o["l"]["c0"] for o in out_lines if o["k"] == k and not o.get("big")] or [30]))
    font = {"g": round(core("g") / body_ratio(FONT["g"]), 1), "c": round(np.median([core("r"), core("t")]) / body_ratio(FONT["g"]), 1)}    # Rashi and Tosafot are shown in square letters too
    if head_out:
        hh = float(np.median([h["c1"] - h["c0"] for h in head]))
        font["h"] = round(min(max(hh / body_ratio(FONT["g"]), 1.1 * font["g"]), 1.3 * font["g"]), 1)

    xs = [o["l"]["x0"] for o in out_lines] + [h["x"] for h in head_out]
    xe = [o["l"]["x1"] for o in out_lines] + [h["x"] + h["w"] for h in head_out]
    ys = [o["l"]["c0"] for o in out_lines] + [min(h["c0"] for h in head)] if head else [o["l"]["c0"] for o in out_lines]
    ye = [o["l"]["c1"] for o in out_lines]
    pad = 40
    X0, Y0 = min(xs) - pad, min(ys) - 2 * pad
    page = dict(ref=ref, spill=spill, w=max(xe) - X0 + pad, h=max(ye) - Y0 + 2 * pad, font=font,
                head=[dict(h, x=h["x"] - X0, y=h["y"] - Y0) for h in head_out], lines=[])
    for o in sorted(out_lines, key=lambda o: (o["l"]["c1"], -o["l"]["x1"])):
        l = o["l"]
        line = dict(k=o["k"], x=l["x0"] - X0, w=l["x1"] - l["x0"] + 1, y=l["c1"] - Y0, words=o["words"], ids=o["ids"])
        if o.get("big"): line["big"] = round((l["c1"] - l["c0"]) / body_ratio(FONT["g"]), 1)    # its font size
        if o.get("first"): line["first"] = o["first"]
        page["lines"].append(line)

    path = OUT / f"{masechet.replace(' ', '_')}-{daf}{amud}.json"
    # an unusual page (the end of a masechet, a page with little commentary) can come out wrong;
    # without a file the site lays the amud out from the text instead
    if check: draw_check(img, page, X0, Y0, Path.cwd() / f"{path.stem}.check.png")
    bad = [k for k, r in report.items() if r[-1] > (1.0 if k == "gemara" else 1.2)
           or (k != "gemara" and r[0] - r[1] > max(3, 0.2 * r[0]))]
    if bad or "gemara" not in report:
        path.unlink(missing_ok=True)
        raise SystemExit(f"the page didn't come out right ({', '.join(bad) or 'gemara'}: "
                         + "; ".join(f"{k} " + "/".join(str(round(v, 2)) for v in r) for k, r in report.items()) + ")")
    OUT.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(page, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{ref}: " + "; ".join(f"{k} " + "/".join(str(round(v, 2)) for v in r) for k, r in report.items()) + f" -> {path.relative_to(ROOT)}")
    return page


def draw_check(img, page, X0, Y0, path):
    """The scan with each found line boxed (red Gemara, green Rashi, blue Tosafot), to compare."""
    pic = img.convert("RGB"); d = ImageDraw.Draw(pic)
    color = {"g": (220, 0, 0), "r": (0, 150, 0), "t": (0, 0, 220)}
    for l in page["lines"]:
        x, y = l["x"] + X0, l["y"] + Y0
        d.rectangle([x, y - 34, x + l["w"], y], outline=color[l["k"]], width=5)
    pic.resize((pic.width // 3, pic.height // 3)).save(path)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args: raise SystemExit(__doc__)
    masechet, daf, amud = parse(" ".join(args))
    for a in ([amud] if amud else ["a", "b"]):
        try:
            amud_page(masechet, daf, a, check="--check" in sys.argv)
        except (SystemExit, Exception) as err:     # e.g. the last daf of a masechet has no amud b
            print(f"{masechet} {daf}{a}: not made ({err})")


if __name__ == "__main__":
    main()
