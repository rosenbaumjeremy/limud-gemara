"use strict";
// לומדים גמרא — a study companion for the daily daf. The text and the commentaries come
// live from Sefaria (cached on the device by sw.js); the student's level, progress and
// reviews live in localStorage on this device only.

const API = "https://www.sefaria.org/api";
const $ = (s, root = document) => root.querySelector(s);

// ---------- small helpers ----------

function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) e.append(k instanceof Node ? k : String(k));
  return e;
}

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem("gemara-" + key); return v ? JSON.parse(v) : fallback; }
    catch (err) { return fallback; }
  },
  set(key, value) { try { localStorage.setItem("gemara-" + key, JSON.stringify(value)); } catch (err) { /* private mode */ } },
};


function today(offset = 0) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Hebrew numerals: 27 -> כ״ז, 15 -> ט״ו
function gem(n, marks = true) {
  const ones = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
  const tens = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
  let s = ["", "ק", "ר", "ש", "ת"][Math.floor(n / 100)] || "";
  n %= 100;
  s += n === 15 ? "טו" : n === 16 ? "טז" : tens[Math.floor(n / 10)] + ones[n % 10];
  if (!marks) return s;
  return s.length > 1 ? s.slice(0, -1) + "״" + s.slice(-1) : s + "׳";
}

// Sefaria HTML -> safe nodes: keep only simple formatting, drop footnotes.
const KEEP = new Set(["B", "STRONG", "I", "EM", "BR", "BIG", "SMALL"]);
function clean(html) {
  const doc = new DOMParser().parseFromString(`<div>${html || ""}</div>`, "text/html");
  const out = document.createDocumentFragment();
  (function walk(src, dst) {
    for (const n of src.childNodes) {
      if (n.nodeType === 3) dst.append(n.textContent);
      else if (n.nodeType === 1) {
        if (n.classList.contains("footnote") || n.classList.contains("footnote-marker")) continue;
        if (KEEP.has(n.tagName)) { const c = document.createElement(n.tagName); dst.append(c); walk(n, c); }
        else walk(n, dst);
      }
    }
  })(doc.body.firstChild, out);
  return out;
}
function plain(html) { const d = document.createElement("div"); d.append(clean(html)); return d.textContent.replace(/\s+/g, " ").trim(); }

const NIKUD = /[֑-ׇ]/g;
const core = w => w.replace(NIKUD, "").replace(/[^א-ת]/g, "");

// ---------- interface text ----------

const T = {
  he: {
    title: "לומדים גמרא", subtitle: "דף יומי ללומד — בכל רמה",
    home: "בית", shas: "ש״ס",
    dafYomi: "הדף היומי", amudA: "עמוד א", amudB: "עמוד ב", learned: "✓ נלמד",
    chooseLevel: "באיזו רמה אתה לומד?", chooseLevelSub: "אפשר לשנות בכל עת בהגדרות (⚙). כל כלי אפשר גם להדליק ולכבות בנפרד.",
    beginner: "מתחיל", intermediate: "ממשיך", advanced: "מתקדם",
    beginnerD: "הסבר מלא מתחת לכל שורה, ניקוד, מילים בארמית מסומנות, ומפת מבנה הסוגיא.",
    intermediateD: "הטקסט קודם; ההסבר ורש״י בלחיצה. מסומנות רק המילים החשובות.",
    advancedD: "טקסט ללא ניקוד, רש״י ותוספות, בלי עזרים — ההסבר רק כשמבקשים.",
    continue: "להמשיך מאיפה שעצרתי", continueBtn: "להמשיך", noLast: "עוד לא פתחת דף. אפשר להתחיל מהדף היומי.",
    browse: "לבחור מסכת ודף",
    loading: "טוען…", loadFail: "לא הצלחנו לטעון את הטקסט.", openSefaria: "לפתוח בספריא",
    offlineFail: "אין חיבור, והעמוד הזה עוד לא נשמר במכשיר.",
    prev: "הקודם", next: "הבא",
    markLearned: "סיימתי את העמוד", isLearned: "✓ נלמד", markReview: "✓ חזרתי",
    explain: "הסבר", rashi: "רש״י", tosafot: "תוספות",
    flow: "מבנה הסוגיא", flowNote: "סימון אוטומטי לפי מילות המפתח — הצעה, לא פסק.",
    legend: "מה הסימנים אומרים?",
    q_mishnah: "משנה מצוטטת", q_mishnahD: "סוגריים זהובים: הגמרא מביאה משנה (תנן, והתנן)",
    q_baraita: "ברייתא מצוטטת", q_baraitaD: "סוגריים סגולים: הגמרא מביאה ברייתא (תנו רבנן, תניא, מיתיבי)",
    settings: "הגדרות", level: "רמה", tools: "כלים",
    sExplain: "הסבר מתחת לכל שורה", sExplainOpen: "פתוח", sExplainTap: "בלחיצה", sExplainOff: "מוסתר",
    sRashi: "רש״י", sTosafot: "תוספות", sVocab: "סימון מילים בארמית", sVocabAll: "כל המילים", sVocabKey: "רק החשובות", sVocabOff: "ללא",
    sStructure: "מבנה הסוגיא (צבעים)", sColorText: "צביעת הטקסט עצמו לפי המבנה", sNikud: "ניקוד", close: "סגור", reset: "למחוק את ההתקדמות במכשיר",
    resetConfirm: "למחוק את כל ההתקדמות והחזרות במכשיר הזה?",
    seder: "סדר",
    lastRead: "נקרא לאחרונה",
    sMeforshim: "סיכום הראשונים והאחרונים",
    rishonim: "ראשונים", acharonim: "אחרונים", mfOpen: "בספריא",
    musagim: "מושגים", sugyot: "הסוגיות", sumGemara: "הגמרא:", sumHalakha: "להלכה:", sumOther: "שאר הסוגיות בדף",
    sumNote: "סיכום שנכתב מתוך מה שיש בספריא; כל דעה מקושרת למקורה. אם מצאת טעות — לבדוק במקור.",
    viewLines: "שורה אחר שורה", viewPage: "צורת הדף", printed: "הדף המודפס",
    pageNote: "הגמרא באמצע, רש״י לצד הכריכה ותוספות בצד החיצון, כמו בדפוס וילנא. הסידור מחושב מהטקסט, ולכן השורות אינן זהות לדף המודפס. לחיצה על שורה פותחת את ההסבר שלה.",
    scanFail: "לא הצלחנו לטעון את סריקת הדף.",
    scanCredit: "דפוס וילנא של האלמנה והאחים ראם (1880–1886) · סריקה: הספרייה הלאומית, דרך ספריא · לחיצה מגדילה",
  },
  en: {
    title: "Learning Gemara", subtitle: "The daily daf, at every level",
    home: "Home", shas: "Shas",
    dafYomi: "Today's Daf Yomi", amudA: "Amud a", amudB: "Amud b", learned: "✓ learned",
    chooseLevel: "What level are you learning at?", chooseLevelSub: "You can change it any time in Settings (⚙), and switch each tool on or off.",
    beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced",
    beginnerD: "Full explanation under every line, vowels, Aramaic words marked, and a map of the sugya.",
    intermediateD: "Text first; explanation and Rashi on tap. Only the key words are marked.",
    advancedD: "Unvocalized text with Rashi and Tosafot, no aids — explanation only when you ask.",
    continue: "Continue where I left off", continueBtn: "Continue", noLast: "You haven't opened a daf yet. Start with today's daf.",
    browse: "Choose a tractate and daf",
    loading: "Loading…", loadFail: "Couldn't load the text.", openSefaria: "Open on Sefaria",
    offlineFail: "You're offline and this amud isn't saved on the device yet.",
    prev: "Previous", next: "Next",
    markLearned: "I finished this amud", isLearned: "✓ learned", markReview: "✓ I reviewed it",
    explain: "Explanation", rashi: "Rashi", tosafot: "Tosafot",
    flow: "Structure of the sugya", flowNote: "Marked automatically from the key words — a guide, not a ruling.",
    legend: "What do the colors mean?",
    q_mishnah: "Quoted mishnah", q_mishnahD: "gold brackets: the Gemara quotes a mishnah (tenan, vehatenan)",
    q_baraita: "Quoted baraita", q_baraitaD: "purple brackets: the Gemara quotes a baraita (tanu rabanan, tanya, meitivei)",
    settings: "Settings", level: "Level", tools: "Tools",
    sExplain: "Explanation under each line", sExplainOpen: "Open", sExplainTap: "On tap", sExplainOff: "Hidden",
    sRashi: "Rashi", sTosafot: "Tosafot", sVocab: "Mark Aramaic words", sVocabAll: "All", sVocabKey: "Key words", sVocabOff: "None",
    sStructure: "Sugya structure (colors)", sColorText: "Color the text itself by structure", sNikud: "Vowels (nikud)", close: "Close", reset: "Erase progress on this device",
    resetConfirm: "Erase all progress and reviews on this device?",
    seder: "Seder",
    lastRead: "Last read",
    sMeforshim: "Summary of the Rishonim and Acharonim",
    rishonim: "Rishonim", acharonim: "Acharonim", mfOpen: "On Sefaria",
    musagim: "Key terms", sugyot: "The sugyot", sumGemara: "The Gemara:", sumHalakha: "Halakha:", sumOther: "Other sugyot on this daf",
    sumNote: "A summary written from what Sefaria has; every opinion links to its source. If something looks wrong, check the source.",
    viewLines: "Line by line", viewPage: "Page view", printed: "Printed page",
    pageNote: "Gemara in the middle, Rashi toward the binding and Tosafot on the outer side, as in the Vilna Shas. The layout is computed from the text, so its lines don't match the printed page. Tap a line for its explanation.",
    scanFail: "Couldn't load the page scan.",
    scanCredit: "Romm Vilna edition (1880–1886) · scan: National Library of Israel, via Sefaria · tap to zoom",
  },
};

// What each line of the sugya is doing. Colors are in app.css (.k-<kind>).
const KINDS = {
  mishnah:    { he: "משנה",   en: "Mishnah",    dHe: "המשנה שהגמרא דנה בה", dEn: "the Mishnah under discussion" },
  statement:  { he: "מימרא",  en: "Statement",  dHe: "דברי אמורא או תנא, מעשה, או מסקנה (הלכה, תיקו, תיובתא)", dEn: "a teaching of an Amora or Tanna, a story, or a conclusion (halakha, unresolved, refuted)" },
  question:   { he: "שאלה / קושיא", en: "Question / Challenge", dHe: "הגמרא שואלת (מה, מניין, למה) או מקשה על מה שנאמר", dEn: "the Gemara asks what, why or from where, or challenges what was said" },
  answer:     { he: "תירוץ / ראיה", en: "Answer / Proof", dHe: "יישוב הקושיא, או ראיה ממקור או מפסוק", dEn: "resolving the challenge, or support from a source or a verse" },
  plain:      { he: "המשך",   en: "Continuation", dHe: "המשך הדיון", dEn: "the discussion continues" },
};

const PRESETS = {
  beginner:     { explain: "open", rashi: false, tosafot: false, vocab: "all", structure: true,  colorText: true,  nikud: true,  meforshim: false },
  intermediate: { explain: "tap",  rashi: true,  tosafot: false, vocab: "key", structure: true,  colorText: false, nikud: true,  meforshim: true },
  advanced:     { explain: "tap",  rashi: true,  tosafot: true,  vocab: "off", structure: false, colorText: false, nikud: false, meforshim: true },
};

// a setting added after the student chose a level takes that level's default
const SAVED = store.get("settings", {});
let S = Object.assign({ lang: "he", level: null, view: "lines" }, PRESETS[SAVED.level] || PRESETS.beginner, SAVED);
const t = (k, ...a) => { const v = T[S.lang][k]; return typeof v === "function" ? v(...a) : v; };
const saveSettings = () => store.set("settings", S);

// ---------- data ----------

let MASECHTOT = [], VOCAB = [], VOCAB_BY = new Map();
const cache = new Map();

async function getJSON(url) {
  if (cache.has(url)) return cache.get(url);
  const p = fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
  cache.set(url, p);
  p.catch(() => cache.delete(url));
  return p;
}

// "Bava Metzia 27a" <-> route "Bava_Metzia.27a"
const toRoute = ref => ref.replace(/ (\d+[ab])$/, ".$1").replace(/ /g, "_");
const fromRoute = r => r.replace(/_/g, " ").replace(/\.(\d+[ab])$/, " $1");
function parseRef(ref) {
  const m = ref.match(/^(.+) (\d+)([ab])$/);
  return m && { m: m[1], daf: +m[2], amud: m[3], idx: (+m[2] - 1) * 2 + (m[3] === "b" ? 1 : 0) };
}
const amudOf = idx => `${Math.floor(idx / 2) + 1}${"ab"[idx % 2]}`;
const masechet = en => MASECHTOT.find(m => m.en === en);
function refName(ref) {
  const p = parseRef(ref); if (!p) return ref;
  if (S.lang === "en") return ref;
  const m = masechet(p.m);
  return `${m ? m.he : p.m} ${gem(p.daf)} ${p.amud === "a" ? "ע״א" : "ע״ב"}`;
}
function neighbour(ref, step) {
  const p = parseRef(ref), m = masechet(p.m); if (!m) return null;
  const idx = p.idx + step, first = parseRef(`x ${m.first}`).idx, last = parseRef(`x ${m.last}`).idx;
  if (idx >= first && idx <= last) return `${p.m} ${amudOf(idx)}`;
  const i = MASECHTOT.indexOf(m) + step, o = MASECHTOT[i];
  return o ? `${o.en} ${step > 0 ? o.first : o.last}` : null;
}

// Every match of a vocab word or phrase in a list of words: [start, length, entry].
const PREFIXES = ["וד", "וב", "ול", "ומ", "וה", "וכ", "ו", "ד", "ב", "ל", "מ", "ה", "כ"];
function findVocab(cores) {
  const hits = [];
  for (let i = 0; i < cores.length;) {
    let hit = null;
    for (let n = 4; n >= 1 && !hit; n--) {
      if (i + n > cores.length) continue;
      const rest = cores.slice(i + 1, i + n);
      let v = VOCAB_BY.get([cores[i], ...rest].join(" "));
      for (const p of PREFIXES) {
        if (v) break;
        if (cores[i].startsWith(p) && cores[i].length - p.length >= (n > 1 ? 2 : 3))
          v = VOCAB_BY.get([cores[i].slice(p.length), ...rest].join(" "));
      }
      if (v) hit = [i, n, v];
    }
    if (hit) { hits.push(hit); i += hit[1]; } else i++;
  }
  return hits;
}

// Guess what a line is doing from its opening words and key phrases.
function classify(txt, mode) {
  if (mode === "mishnah") return "mishnah";
  const s = txt.replace(/^(גמ׳|גמ'|מתני׳|מתני')\s*/, "").replace(/[״"׳']/g, "");
  const starts = (...w) => w.some(x => new RegExp(`^ו?${x}(\\s|[:,.?!]|$)`).test(s));
  const has = (...w) => w.some(x => new RegExp(`(^|\\s|ו|ד)${x}(\\s|[:,.?!]|$)`).test(s));
  const asks = /^[^.!]*\?/.test(s.replace(/\?(?=\s*הוי אומר)/g, ","));   // the opening sentence is a question (not "...? הוי אומר")
  if (starts("מיתיבי", "איתיביה", "איתיבה", "ורמינהו", "רמי", "והתניא", "והתנן", "והא", "מתקיף לה", "מתקיף", "ולטעמיך", "ותסברא", "איני", "פשיטא")) return "question";
  if (starts("תא שמע", "ת״ש", "תש")) return "answer";
  if (starts("או דלמא", "או דילמא", "אלא מעתה")) return "question";   // the other side of a בעיא; "if so, then..."
  // a quoted mishnah or baraita is bracketed (quoteRanges); the line itself is colored by its role
  if (starts("דתניא", "כדתניא", "דתנן", "כדתנן")) return "answer";
  if (starts("תנו רבנן", "תר", "תניא", "תנן", "תנינא") || /^ו?(תנא|תני)( נמי)?:/.test(s) || /^ו?דבי [^:?]{1,30} תנא/.test(s)) return "statement";
  if (has("לא קשיא", "הכא במאי עסקינן", "לא צריכא", "חסורי מיחסרא", "תרגמה")) return "answer";
  if (has("תיובתא", "תיקו", "שמע מינה", "והלכתא", "הלכתא")) return "statement";
  if (starts("אמר לך")) return "answer";   // "the Tanna would tell you..." answers what was just asked
  if (starts("איתמר", "אמר מר", "אמר", "אמרי", "א״ר", "אר")) return "statement";
  if (starts("לעולם", "אלא", "שאני", "אי בעית אימא", "איבעית אימא", "דילמא")) return "answer";
  if (has("קשיא", "הכי השתא", "אמאי", "קשיין אהדדי")) return "question";
  if (starts("מעשה", "ההוא", "ההיא", "הוה עובדא")) return "statement";
  if (/^(רב|רבי|רבא|רבה|אביי|שמואל|רבינא|מר)\s[^.:?]*\s(הוה|הוו)\s/.test(s)) return "statement";   // "רב נחמן ... הוו קאזלי"
  if (has("מסייע ליה", "תניא נמי הכי", "דיקא נמי")) return "answer";
  if (asks) return "question";
  if (has("דכתיב", "שנאמר", "אמר קרא", "ילפינן")) return "answer";
  return "plain";
}

// A line often carries a question and its answer together ("מאי טעמא? משום ד..."). Split it
// after each "?" or "!" so only the asking is colored as a question and what follows as the
// answer. `prev` is how the line before ended: a line that opens by answering a question
// left open there ("אמר לך: ...", "אמר רבא: ...") is an answer, not a new statement.
const QUOTES = /^ו?(מיתיבי|איתיביה|איתיבה|ורמינהו|רמי|והתניא|והתנן|והא)(\s|[:,]|$)/;   // a challenge that quotes a source
const ASKWORD = /(^|\s)ו?(מנא|מנלן|מנליה|מנלהו|מאי|היכי|היכא|אמאי|למה|מה|מנין|היאך|כיצד|מי|וכי|לימא|ולימא)(\s|[,?]|$)/;
const REPLY = /^ו?(אמר|אמרי|א״ר|אר)(\s|:)/;   // someone speaks up: after a question, that is the answer
const CLOSE = /(^|\s)ו?(תיובתא|תיקו|הלכתא|והלכתא|שמע מינה|ש״מ)(\s|[:,.?!]|$)/;
function pieces(txt) {
  const out = [];
  for (const b of txt.split(/(?<=[?!])(?=\s)/)) {
    // "ילפי מקדשים, וקדשים גופייהו מנלן?" - an answer, then the next question after a comma
    let cut = -1;
    if (/\?\s*$/.test(b))
      for (let i = b.lastIndexOf(", "); i > 0; i = b.lastIndexOf(", ", i - 1)) {
        const head = b.slice(0, i).replace(NIKUD, ""), tail = b.slice(i + 1).replace(NIKUD, "").trim();
        if (ASKWORD.test(head)) break;
        if (/^ו/.test(tail) && ASKWORD.test(tail)) { cut = i + 1; break; }
      }
    // "בכור נאכל... למימרא דלשנה דידיה מנינן. מנא הני מילי?" - only the last sentence asks
    if (cut < 0 && /[?!]\s*$/.test(b)) cut = b.lastIndexOf(". ") + 1;
    if (cut > 0) out.push(b.slice(0, cut), b.slice(cut)); else out.push(b);
  }
  return out;
}
function parts(txt, kind, prev) {
  if (kind === "mishnah" || !txt) return [[txt, kind]];
  const ps = pieces(txt), out = [];
  let quoting = false, last = prev, held = [];
  ps.forEach((b, j) => {
    const s = b.trim().replace(NIKUD, "").replace(/^(גמ׳|גמ')\s*/, "");
    const was = quoting;
    if (j === 0 || QUOTES.test(s)) quoting = QUOTES.test(s);
    // "...אלמא X הוא!" or "מאי לאו...?" closes the challenge; what follows answers it
    if (/!\s*$/.test(b) || /מאי לאו/.test(s)) quoting = false;
    // "איזוהי שנה...? הוי אומר...", "יכול...? תלמוד לומר..." ask only to answer themselves:
    // colored like their own answer
    if (j + 1 < ps.length && /^\s*(הוי אומר|תלמוד לומר|ת״ל)/.test(ps[j + 1].replace(NIKUD, ""))) { out.push([b, null]); held.push(j); return; }
    let k;
    if (/\?\s*$/.test(b)) k = "question";
    // "איפוך אנא!", "והאנן ׳נשר׳ תנן!", "ליתני...!" - an exclamation challenges
    else if (/!\s*$/.test(b) && !/^ו?(אלא(?! מעתה)|לעולם|לא קשיא|שאני|הכא במאי)(\s|[:,]|$)/.test(s)) k = "question";
    else k = j === 0 && kind !== "question" ? kind : classify(s, "gemara");
    if (last === "question" && k !== "question") {
      // the rest of a quoted baraita is still the challenge; otherwise it is the answer
      if (k === "plain") k = was && quoting ? "question" : "answer";
      else if (k === "statement" && REPLY.test(s) && !CLOSE.test(s)) k = "answer";
    } else if (k === "plain" && last && last !== "mishnah" && (j > 0 || last === "answer")) k = last;   // more of the same answer
    held.forEach(h => out[h][1] = k); held = [];
    out.push([b, k]);
    last = k;
  });
  return out;
}

// Where the Gemara quotes a mishnah (תנן) or a baraita (תניא, מיתיבי...): from after the
// colon of the opening formula to where the Gemara's own Aramaic picks up again.
const INTRO = /(?<=^|[.?!:]\s+|\s—\s+|^גמ׳\s+)(ו?(?:כד|ד)?(?:תנו רבנן|ת״ר|תניא|תנן|תנינא|תנא|תני|מיתיבי|איתיביה|איתיבה|ורמינהו|והתניא|והתנן|תא שמע|ת״ש)(?:\s[^:.?!״]{0,40}?)?):\s*/g;
const BACK = /(?:[.?!]|\s—)(?=\s+ו?(?:מאי|אלמא|קתני|מדקתני|אי אמרת|בשלמא|קשיא|תיובתא|שמע מינה|ש״מ|הכא במאי|תרגמה|לימא|מכלל|תיקו|לא,|אלא|אמרי|אמר רב |אמר רבא|אמר אביי|אמר ליה|הכי קאמר|והא|מי כתיב|ואי|איני|למימרא|היינו|ותו|אמאי)[\s,:.?!])/g;
function quoteRanges(txt) {
  let s = "";
  const map = [];
  for (let i = 0; i < txt.length; i++) if (!/[֑-ׇ]/.test(txt[i])) { s += txt[i]; map.push(i); }
  map.push(txt.length);
  const out = [];
  INTRO.lastIndex = 0;
  for (let m; (m = INTRO.exec(s));) {
    const from = m.index + m[0].length;
    // "מיתיבי: ״הבקר אור...״" brings a verse, not a mishnah or baraita: no brackets
    if (s[from] === "״") continue;
    let to = s.length;
    BACK.lastIndex = from;
    const b = BACK.exec(s);
    if (b) to = b.index + (b[0][0] === " " ? 0 : 1);
    while (to > from && /\s/.test(s[to - 1])) to--;
    if (to - from > 3) out.push({ from: map[from], to: map[to], src: /תנן|תנינא/.test(m[1]) ? "mishnah" : "baraita" });
    INTRO.lastIndex = Math.max(to, m.index + 1);
  }
  return out;
}

// The end of one perek (הדרן) and the start of the next stand out from the text around them.
const perekClass = seg => seg.hadran ? " hadran" : seg.opening ? " perek-start" : "";

// The line of Gemara, colored part by part, with corner brackets around quoted sources
// (the same marks as the tikkun's half-page corners): gold for a mishnah, purple for a baraita.
function coloredLine(seg) {
  const ps = parts(seg.txt, seg.kind, seg.prev), qs = seg.kind === "mishnah" || !(S.structure || S.colorText) ? [] : quoteRanges(seg.txt);
  const cuts = new Set([0, seg.txt.length]);
  let at = 0;
  const spans = ps.map(([txt, k]) => { const p = { a: at, b: at + txt.length, k }; at = p.b; cuts.add(p.a); return p; });
  qs.forEach(q => { cuts.add(q.from); cuts.add(q.to); });
  const open = seg.opening ? seg.txt.indexOf(seg.opening) : -1;
  if (open >= 0) { cuts.add(open); cuts.add(open + seg.opening.length); }
  const pos = [...cuts].sort((x, y) => x - y), out = [];
  const mark = (x, end) => qs.filter(q => (end ? q.to : q.from) === x)
    .forEach(q => out.push(el("span", { class: `qb ${end ? "close" : "open"} q-${q.src}`, "aria-hidden": "true" })));
  for (let j = 0; j < pos.length - 1; j++) {
    const x = pos[j], y = pos[j + 1];
    mark(x, true); mark(x, false);
    const k = spans.find(p => p.a <= x && x < p.b).k;
    const bit = gemaraLine(seg.txt.slice(x, y));
    out.push(el("span", { class: "part k-" + k }, x === open ? el("strong", { class: "perek-open" }, bit) : bit));
  }
  mark(seg.txt.length, true);
  return out;
}

// "אמר רב יהודה אמר שמואל: ..." -> who said it, and what
function speaker(txt) {
  const m = txt.match(/^ו?(?:אמר|אמרי)\s+([^:?!]{2,60}?):\s*(.+)$/);
  if (!m || /^(ליה|להו|לה|לך|מר|ליה רב)(\s|$)/.test(m[1]) || m[1].split(" ").length > 8) return null;
  return { who: m[1].trim(), said: m[2].split(" ").slice(0, 14).join(" ") };
}

async function loadAmud(ref) {
  const u = ref.replace(/ (\d+[ab])$/, ".$1").replace(/ /g, "_");
  const opt = url => getJSON(url).catch(() => null);
  const [base, st, ra, to] = await Promise.all([
    getJSON(`${API}/v3/texts/${u}?version=hebrew&version=english`),
    opt(`${API}/v3/texts/Steinsaltz_on_${u}`),
    opt(`${API}/v3/texts/Rashi_on_${u}`),
    opt(`${API}/v3/texts/Tosafot_on_${u}`),
  ]);
  const ver = (d, lang) => d && (d.versions || []).find(v => v.language === lang);
  const he = ver(base, "he"), en = ver(base, "en");
  if (!he || !Array.isArray(he.text) || !he.text.length) throw new Error("no text");
  const st0 = ver(st, "he"), ra0 = ver(ra, "he"), to0 = ver(to, "he");
  const list = x => Array.isArray(x) ? x.flat(Infinity).filter(Boolean) : x ? [x] : [];
  let mode = "gemara";
  const segs = he.text.map((h, i) => {
    const txt = plain(h), core0 = txt.replace(NIKUD, "");
    const enHtml = en && en.text[i] || "";
    if (/MISHNA:/i.test(enHtml) || /^מתני/.test(core0)) mode = "mishnah";
    if (/GEMARA:/i.test(enHtml) || /^גמ/.test(core0)) mode = "gemara";
    const words = core0.split(/[\s־]+/);
    // Sefaria sets "הדרן עלך..." as a line of its own, and the first words of a perek in <big>
    // (מתני׳ and גמ׳ are in <big> too, so skip those)
    const hadran = /^הדרן/.test(core0);
    const big = (h.match(/<big>.*?<\/big>/g) || []).map(plain).find(b => !/^(מתני|גמ)/.test(b.replace(NIKUD, "")));
    const opening = !hadran && big && txt.includes(big) ? big : null;
    return {
      // Steinsaltz numbers its paragraphs with a big Hebrew letter ("<big>ב גמרא</big>"); drop it
      i, txt, en: enHtml, st: (st0 && st0.text[i] || "")
        .replace(/(<big>(?:<[^>]+>)*)[א-ת]{1,3}(?:\s+|(?=<))/g, "$1").replace(/<big>(<[^>]+>)*(<\/[^>]+>)*<\/big>\s*/g, ""),
      rashi: list(ra0 && ra0.text[i]), tosafot: list(to0 && to0.text[i]),
      hadran, opening,
      kind: hadran ? "plain" : classify(core0, mode), speaker: mode === "gemara" ? speaker(core0) : null,
      vocab: findVocab(words.map(core)).map(h => h[2]),
    };
  });
  // a line that opens by answering the question the line before left open is an answer
  segs.forEach((s, i) => {
    const p = segs[i - 1];
    s.prev = p && !s.hadran ? parts(p.txt, p.kind, p.prev).at(-1)[1] : null;
    const first = parts(s.txt, s.kind, s.prev).map(x => x[1]);
    if (s.kind === "plain" && !s.hadran) s.kind = first.find(k => k !== "plain") || "plain";
    else if (s.kind === "statement" && first[0] === "answer") s.kind = "answer";
  });
  return { ref: base.ref || ref, segs };
}

// ---------- progress, reviews, streak ----------

const REVIEW = [1, 7, 30];
let P = Object.assign({ learned: {}, days: [], last: null }, store.get("progress", {}));
const saveP = () => store.set("progress", P);
function activity() { const d = today(); if (!P.days.includes(d)) { P.days.push(d); P.days = P.days.slice(-400); } saveP(); }
function markLearned(ref) {
  if (!P.learned[ref]) P.learned[ref] = { first: today(), stage: 0, due: today(REVIEW[0]) };
  activity();
}
function markReviewed(ref) {
  const L = P.learned[ref]; if (!L) return markLearned(ref);
  L.stage++; L.due = L.stage < REVIEW.length ? today(REVIEW[L.stage]) : null;
  activity();
}

// ---------- views ----------

const view = () => $("#view");
function setView(...kids) { const v = view(); v.replaceChildren(...kids); window.scrollTo(0, 0); }
const loadingBox = () => el("p", { class: "muted center" }, t("loading"));

async function homeView() {
  const parts = [];
  if (!S.level) parts.push(levelPicker());

  const daf = el("section", { class: "card today" }, el("h2", {}, t("dafYomi")), loadingBox());
  parts.push(daf);

  parts.push(el("section", { class: "card go" },
    el("div", {}, el("h2", {}, t("continue")),
      P.last ? el("p", { class: "go-name" }, refName(P.last)) : el("p", { class: "muted" }, t("noLast"))),
    P.last ? el("a", { class: "btn", href: "#daf/" + toRoute(P.last) }, t("continueBtn")) : null));

  parts.push(shasList());

  setView(el("div", { class: "home" }, parts));
  // "#shas" (the old tab, and the link back from a tractate) opens home at the tractate list
  if (location.hash === "#shas") $("#shas").scrollIntoView();

  try {
    const cal = await getJSON(`${API}/calendars?timezone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Jerusalem")}`);
    const item = cal.calendar_items.find(i => i.title.en === "Daf Yomi");
    const name = item.ref;   // "Bekhorot 27"
    daf.replaceChildren(el("h2", {}, t("dafYomi")),
      el("p", { class: "daf-name" }, S.lang === "he" ? item.displayValue.he : item.displayValue.en),
      el("div", { class: "amud-btns" }, ["a", "b"].map(a => {
        const ref = `${name}${a}`;
        return el("a", { class: "btn big" + (P.learned[ref] ? " done" : ""), href: "#daf/" + toRoute(ref) },
          t(a === "a" ? "amudA" : "amudB"), P.learned[ref] ? el("span", { class: "chip" }, t("learned")) : null);
      })));
    prefetchUpcoming();
  } catch (err) {
    daf.replaceChildren(el("h2", {}, t("dafYomi")), el("p", { class: "muted" }, navigator.onLine ? t("loadFail") : t("offlineFail")),
      el("a", { href: "#shas" }, t("browse")));
  }
}


function levelPicker() {
  return el("section", { class: "card levels" },
    el("h2", {}, t("chooseLevel")),
    el("p", { class: "muted" }, t("chooseLevelSub")),
    el("div", { class: "level-grid" }, ["beginner", "intermediate", "advanced"].map(l =>
      el("button", { type: "button", class: "level" + (S.level === l ? " on" : ""), onclick: () => { setLevel(l); route(); } },
        el("b", {}, t(l)), el("span", {}, t(l + "D"))))));
}
function setLevel(l) { Object.assign(S, PRESETS[l], { level: l }); saveSettings(); }

// Save the next two days' dafim on the device, so the student can learn offline.
async function prefetchUpcoming() {
  if (!navigator.onLine || !("serviceWorker" in navigator) || !navigator.serviceWorker.controller) return;
  for (const off of [1, 2]) {
    const [y, m, d] = today(off).split("-");
    try {
      const cal = await getJSON(`${API}/calendars?year=${+y}&month=${+m}&day=${+d}`);
      const item = cal.calendar_items.find(i => i.title.en === "Daf Yomi");
      for (const a of ["a", "b"]) await loadAmud(item.ref + a).catch(() => {});
    } catch (err) { return; }
  }
}

async function amudView(ref) {
  setView(loadingBox());
  let amud;
  try { amud = await loadAmud(ref); }
  catch (err) {
    setView(el("section", { class: "card" }, el("h2", {}, refName(ref)),
      el("p", {}, navigator.onLine ? t("loadFail") : t("offlineFail")),
      el("a", { class: "btn", href: `https://www.sefaria.org/${toRoute(ref)}`, rel: "noopener", target: "_blank" }, t("openSefaria")),
      navButtons(ref)));
    return;
  }
  P.last = ref; saveP();
  const sum = S.meforshim ? await getJSON(summaryUrl(ref)).catch(() => null) : null;
  MUSAGIM = ((sum && sum.musagim) || []).filter(m => m.amud === parseRef(ref).amud);

  const L = P.learned[ref];
  const learnBtn = el("button", { type: "button", class: "btn" + (L ? " done" : "") }, L ? (L.due && L.due <= today() ? t("markReview") : t("isLearned")) : t("markLearned"));
  learnBtn.addEventListener("click", () => {
    const L2 = P.learned[ref];
    if (!L2) markLearned(ref); else if (L2.due && L2.due <= today()) markReviewed(ref); else return;
    learnBtn.className = "btn done"; learnBtn.textContent = t("isLearned");
  });

  const head = el("div", { class: "reader-head" },
    el("h2", {}, refName(ref)),
    el("div", { class: "reader-actions" },
      learnBtn));
  const views = el("div", { class: "reader-views" },
    el("div", { class: "seg-switch view-switch" }, [["lines", t("viewLines")], ["page", t("viewPage")]].map(([v, label]) =>
      el("button", { type: "button", class: S.view === v ? "on" : "", onclick: () => { S.view = v; saveSettings(); amudView(ref); } }, label))),
    el("button", { type: "button", class: "btn ghost", onclick: () => scanSheet(ref) }, t("printed")));

  if (S.view === "page") {
    const page = dafView(amud, ref);
    setView(el("section", { class: "reader" + (S.colorText ? " colortext" : "") }, head, views, readerMain(ref, [colorKey(), page.el]), navButtons(ref)));
    page.draw();
    return;
  }
  const segs = el("div", { class: "segs" + (S.structure ? " structured" : "") }, amud.segs.map(seg => segView(seg)));
  linkCommentary(amud, segs);
  const body = el("div", { class: "reader-body" + (S.structure ? "" : " no-flow") }, S.structure ? flowMap(amud) : null, segs);
  setView(el("section", { class: "reader" + (S.colorText ? " colortext" : "") }, head, views, readerMain(ref, [S.structure ? null : colorKey(), body]), navButtons(ref)));
}

// צורת הדף: the amud laid out like the Vilna page (daf-layout.js). Every line of the
// Gemara opens its explanation; the Aramaic words still open their meaning.
function dafView(amud, ref) {
  const page = el("div", { class: "daf-page" });
  const wrap = el("div", { class: "daf-wrap" }, page,
    el("p", { class: "daf-note" }, t("pageNote")));

  function nodes() {
    const main = el("span", {}, amud.segs.map(seg => [
      markMusagim(el("span", { class: "dseg k-" + seg.kind + perekClass(seg), "data-i": seg.i, onclick: e => { if (!e.target.closest(".w")) lineSheet(seg); } },
        S.structure ? el("span", { class: "dot", title: KINDS[seg.kind][S.lang] }) : null,
        coloredLine(seg)), seg.i), " "]));
    const comments = key => el("span", {}, amud.segs.flatMap(seg => seg[key].map((c, k) => {
      const p = plain(c), cut = p.search(/\s[–-]\s/);
      return [el("span", { class: "cm", "data-c": `${key}-${seg.i}-${k}` }, cut > 0 ? [el("b", {}, p.slice(0, cut)), p.slice(cut)] : p), " "];
    })));
    return { main, inner: comments("rashi"), outer: comments("tosafot") };
  }

  function draw() {
    if (!page.isConnected) return;
    // a printed page has a fixed shape: below ~560px it scrolls sideways rather than squeezing
    const width = Math.min(Math.max(wrap.clientWidth - 32, 560), 860), k = width / 600;
    const serif = getComputedStyle(document.documentElement).getPropertyValue("--serif").trim();
    const n = nodes();
    const ok = DafLayout.render(page, n, parseRef(ref).amud === "b", {
      width, mainWidth: 0.5, halfway: 0.5, padH: 16 * k, padV: 10 * k, sidePad: 4,
      font: { main: serif, side: serif },
      size: { main: 15 * k, side: 10.5 * k }, lh: { main: 19 * k, side: 14 * k },
    });
    if (!ok) {
      // too little Rashi/Tosafot on this amud to make the page's shape: three plain columns
      page.replaceChildren(el("div", { class: "daf-fallback" }, el("div", {}, n.inner), el("div", {}, n.main), el("div", {}, n.outer)));
      page.style.height = "";
    }
    linkCommentary(amud, page);
  }
  let timer;
  window.addEventListener("resize", function again() {
    if (!page.isConnected) return window.removeEventListener("resize", again);
    clearTimeout(timer); timer = setTimeout(draw, 200);
  });
  return { el: wrap, draw };
}

// Scroll to a line of the Gemara (line view or page view) and flash it.
function jumpToLine(n) {
  const seg = document.getElementById("s" + (n - 1)) || document.querySelector(`.dseg[data-i="${n - 1}"]`);
  if (!seg) return;
  seg.scrollIntoView({ behavior: "smooth", block: "center" });
  seg.classList.add("flash-line");
  setTimeout(() => seg.classList.remove("flash-line"), 1600);
}

// The text, with the daf's summary (if it has one) beside it on a wide screen and above it on a phone.
function readerMain(ref, text) {
  return el("div", { class: "reader-main" }, el("div", { class: "reader-text" }, text), S.meforshim ? summaryPanel(ref) : null);
}

// ---------- musagim: the key terms of the daf, marked in the Gemara ----------

// The terms of the amud on screen (from the daf's summary file), set by amudView.
let MUSAGIM = [];
const summaryUrl = ref => { const p = parseRef(ref); return `data/summaries/${p.m.replace(/ /g, "_")}-${p.daf}.json`; };

// Match an anchor in the vocalized text: drop nikud, the vowel letters ו and י, spaces and
// punctuation, keeping a map back to the original characters (as on the Mishnah site).
const isMark = c => c >= "\u0591" && c <= "\u05C7";
function squash(text) {
  const chars = [], map = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (isMark(c) || c === "ו" || c === "י" || !/[א-ת]/.test(c)) continue;
    chars.push(c); map.push(i);
  }
  return { s: chars.join(""), map };
}

// Wrap each term's anchor words in line i of the Gemara (inside root) in a clickable mark.
function markMusagim(root, i) {
  const list = MUSAGIM.filter(m => m.line === i + 1);
  if (!list.length) return root;
  const nodes = [], walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let full = "";
  while (walker.nextNode()) { nodes.push({ n: walker.currentNode, at: full.length }); full += walker.currentNode.data; }
  const { s, map } = squash(full), hits = [];
  for (const m of list) for (const a of m.anchors) {
    const needle = squash(a).s, at = needle ? s.indexOf(needle) : -1;
    if (at < 0) continue;
    // the match skips ו and י, so take back any that open or close the phrase's words
    const vowel = c => c === "ו" || c === "י";
    let start = map[at], end = map[at + needle.length - 1] + 1;
    while (start > 0 && (isMark(full[start - 1]) || vowel(full[start - 1]))) start--;
    while (end < full.length && (isMark(full[end]) || vowel(full[end]))) end++;
    hits.push([start, end, m]);
  }
  // last hit first, and within it the last text node first, so earlier offsets stay valid
  hits.sort((x, y) => y[0] - x[0]);
  for (const [a, b, m] of hits) for (const { n, at } of nodes.slice().reverse()) {
    const from = Math.max(a, at), to = Math.min(b, at + n.data.length);
    if (from >= to) continue;
    const r = document.createRange();
    r.setStart(n, from - at); r.setEnd(n, to - at);
    const mark = el("mark", { class: "musag", title: m[S.lang === "he" ? "he" : "en"].term });
    mark.addEventListener("click", e => { e.stopPropagation(); musagSheet(m); });
    r.surroundContents(mark);
  }
  return root;
}

// ---------- Rashi and Tosafot linked to their words in the Gemara ----------

// Every comment opens by quoting the Gemara (the dibur hamatchil). Find those words in its
// line (or the line before or after), so hovering one lights up the other in light grey.
// About nine in ten are found word for word; the rest light up their whole line.

// the opening words of a comment, without "גמ׳", "ה״ג" and the like, up to "וכו׳"
function openingWords(c) {
  const p = plain(c), dash = p.search(/\s[–-]\s/);
  let d = dash > 0 ? p.slice(0, dash) : p.split(/[.:]/)[0].slice(0, 60);
  d = d.replace(/^((גמ|מתני|ה"ג|ה״ג|בא"ד|בא״ד)['׳"״]?\s*)+/, "");
  return d.split(/\s(?:וכו|כו|וגו)['׳]/)[0].split(/\s+/).filter(Boolean);
}

function textIndex(root) {
  const nodes = [], walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let full = "";
  while (walker.nextNode()) { nodes.push({ n: walker.currentNode, at: full.length }); full += walker.currentNode.data; }
  return { nodes, full };
}

// [start, end] in root's text of the longest opening run of `words`, or null
function findWords(root, words) {
  const { full } = textIndex(root), { s, map } = squash(full);
  const vowel = c => c === "ו" || c === "י";
  for (let n = words.length; n > 0; n--) {
    const needle = squash(words.slice(0, n).join(" ")).s;
    if (needle.length < (n === words.length ? 3 : 4)) continue;
    const at = s.indexOf(needle);
    if (at < 0) continue;
    let a = map[at], b = map[at + needle.length - 1] + 1;
    while (a > 0 && (isMark(full[a - 1]) || vowel(full[a - 1]))) a--;
    while (b < full.length && (isMark(full[b]) || vowel(full[b]))) b++;
    return [a, b];
  }
  return null;
}

// wrap root's text between a and b, one piece per text node; returns the wrappers
function wrapRange(root, a, b, make) {
  const out = [];
  for (const { n, at } of textIndex(root).nodes.reverse()) {
    const from = Math.max(a, at), to = Math.min(b, at + n.data.length);
    if (from >= to) continue;
    const r = document.createRange();
    r.setStart(n, from - at); r.setEnd(n, to - at);
    const w = make(); r.surroundContents(w); out.unshift(w);
  }
  return out;
}

// root holds both the Gemara and the comments (marked data-c="rashi-<line>-<n>").
function linkCommentary(amud, root) {
  const lineEl = j => root.querySelector(`#s${j} .gemara`) || root.querySelector(`.dseg[data-i="${j}"]`);
  for (const key of ["rashi", "tosafot"]) amud.segs.forEach((seg, i) => seg[key].forEach((c, k) => {
    const id = `${key}-${i}-${k}`, comment = root.querySelector(`[data-c="${id}"]`);
    if (!comment) return;
    let words = [];
    for (const j of [i, i - 1, i + 1]) {
      const line = lineEl(j), hit = line && findWords(line, openingWords(c));
      if (hit) { words = wrapRange(line, hit[0], hit[1], () => el("span", { class: "cref" })); break; }
    }
    const targets = words.length ? words : [lineEl(i)].filter(Boolean);
    // in the line view the comment may sit in a folded Rashi/Tosafot section: light its heading too
    const folded = comment.closest("details");
    const heading = folded && folded.querySelector("summary");
    const both = [comment, ...targets, heading].filter(Boolean);
    const on = () => both.forEach(x => x.classList.add("lit")), off = () => both.forEach(x => x.classList.remove("lit"));
    for (const x of [comment, ...words]) { x.addEventListener("mouseenter", on); x.addEventListener("mouseleave", off); }
    // no hover on a touch screen: a tap on the comment lights them for a moment
    comment.addEventListener("click", () => { on(); setTimeout(off, 2500); });
    // in the line view, a click on the words opens the section and shows the comment
    if (folded) words.forEach(w => w.addEventListener("click", e => {
      if (e.target.closest(".w, mark.musag")) return;
      folded.open = true; on(); setTimeout(off, 2500);
      comment.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }));
  }));
}

function musagBody(m) {
  const L = S.lang === "he" ? "he" : "en";
  return [
    el("p", {}, m[L].explanation),
    el("p", { class: "musag-src" }, el("b", {}, m.source.who[L]), ": ",
      el("span", { lang: "he", dir: "rtl" }, `״${m.source.quote}״`), " ",
      el("a", { class: "small", href: `https://www.sefaria.org/${encodeURIComponent(m.source.ref.replace(/ /g, "_"))}`, target: "_blank", rel: "noopener" }, t("mfOpen")))];
}

function musagSheet(m) {
  const L = S.lang === "he" ? "he" : "en";
  $("#sheet").replaceChildren(el("div", { class: "sheet-inner line" },
    el("button", { type: "button", class: "iconbtn close", "aria-label": t("close"), onclick: closeSheet }, "✕"),
    el("p", { class: "tag" }, t("musagim")),
    el("h3", {}, m[L].term),
    musagBody(m)));
  $("#sheet").hidden = false;
}

// ---------- the written summary of the Rishonim and Acharonim on a daf ----------

// data/summaries/<Masechet>-<daf>.json, written per daf (only some dafim have one).
// Each topic: the Gemara, the Rishonim, the Acharonim and the halakha, each opinion
// linked to its source on Sefaria.
function summaryPanel(ref) {
  const p = parseRef(ref);
  const box = el("section", { class: "card sum", hidden: true });
  getJSON(summaryUrl(ref)).then(d => {
    const L = S.lang === "he" ? "he" : "en";
    const here = d.topics.filter(tp => tp.amud.includes(p.amud));
    const other = d.topics.filter(tp => !tp.amud.includes(p.amud));
    // a topic covers lines [from, to] of its amud, or runs from line `from` of amud a to line `to` of amud b
    const lines = tp => tp.amud.length > 1
      ? [[tp.lines[0], tp.amud[0]], [tp.lines[1], tp.amud[1]]]
      : Array.from({ length: tp.lines[1] - tp.lines[0] + 1 }, (_, k) => [tp.lines[0] + k, tp.amud]);
    const line = ([n, amud]) => {
      const label = `${amud === "a" ? (L === "he" ? "ע״א" : "a") : (L === "he" ? "ע״ב" : "b")} ${n}`;
      return amud === p.amud
        ? el("button", { type: "button", class: "chip-btn", onclick: () => jumpToLine(n) }, label)
        : el("span", { class: "chip-btn off" }, label);
    };
    const opinion = o => el("li", {},
      el("b", {}, o.who[L]), " — ", o[L], " ",
      el("a", { class: "small", href: `https://www.sefaria.org/${encodeURIComponent(o.ref.replace(/ /g, "_"))}`, target: "_blank", rel: "noopener" }, t("mfOpen")));
    const topic = (tp, open) => el("details", { class: "sum-topic", open },
      el("summary", {}, tp[L].title),
      el("div", { class: "sum-lines" }, lines(tp).map(line)),
      el("p", { class: "sum-gemara" }, el("b", {}, t("sumGemara")), " ", tp[L].gemara),
      tp.rishonim.length ? [el("h4", {}, t("rishonim")), el("ul", {}, tp.rishonim.map(opinion))] : null,
      tp.acharonim.length ? [el("h4", {}, t("acharonim")), el("ul", {}, tp.acharonim.map(opinion))] : null,
      tp[L].halakha ? el("p", { class: "sum-halakha" }, el("b", {}, t("sumHalakha")), " ", tp[L].halakha) : null);
    // the מושגים and the סוגיות each fold away as a whole; the device remembers which are open
    const opened = store.get("sumOpen", { musagim: true, sugyot: true });
    const group = (key, title, kids) => {
      const g = el("details", { class: "sum-group", open: opened[key] !== false }, el("summary", {}, title), kids);
      g.addEventListener("toggle", () => { opened[key] = g.open; store.set("sumOpen", opened); });
      return g;
    };
    box.replaceChildren(
      el("h2", {}, d[L].title),
      el("p", {}, d[L].overview),
      d.musagim && d.musagim.length ? group("musagim", `${t("musagim")} (${d.musagim.length})`,
        d.musagim.map(m => el("details", { class: "sum-topic" },
          el("summary", {}, m[L].term),
          el("div", { class: "sum-lines" }, line([m.line, m.amud])),
          musagBody(m)))) : null,
      group("sugyot", `${t("sugyot")} (${d.topics.length})`, [
        here.map(tp => topic(tp, false)),
        other.length ? el("details", { class: "sum-other" }, el("summary", {}, t("sumOther")), other.map(tp => topic(tp, false))) : null]),
      el("p", { class: "note" }, t("sumNote")));
    box.hidden = false;
    // on a wide screen the summary becomes a column beside the text (app.css); the page view
    // then has less room, so let it lay itself out again
    if (box.parentElement) box.parentElement.classList.add("has-sum");
    window.dispatchEvent(new Event("resize"));
  }).catch(() => { /* no summary for this daf */ });
  return box;
}

// A one-line key to the colors, for when the text is colored without the structure map beside it.
function colorKey() {
  if (!S.colorText) return null;
  return el("div", { class: "color-key" }, Object.entries(KINDS).filter(([k]) => k !== "plain").map(([k, v]) =>
    el("span", { class: "k-" + k, title: S.lang === "he" ? v.dHe : v.dEn }, el("span", { class: "dot" }), v[S.lang])),
    ["mishnah", "baraita"].map(src => el("span", { class: "qkey", title: t("q_" + src + "D") }, bracketIcon(src), t("q_" + src))));
}
const bracketIcon = src => el("span", { class: "qicon q-" + src, "aria-hidden": "true" },
  el("span", { class: "qb open" }), el("span", { class: "qb close" }));

function lineSheet(seg) {
  const html = S.lang === "he" ? (seg.st || seg.en) : (seg.en || seg.st), isHe = html === seg.st;
  $("#sheet").replaceChildren(el("div", { class: "sheet-inner line" },
    el("button", { type: "button", class: "iconbtn close", "aria-label": t("close"), onclick: closeSheet }, "✕"),
    el("p", { class: "seg-kind k-" + seg.kind }, el("span", { class: "dot" }), KINDS[seg.kind][S.lang]),
    el("p", { class: "gemara", lang: "he", dir: "rtl" }, S.nikud ? seg.txt : seg.txt.replace(NIKUD, "")),
    html ? el("div", { class: "layer-body", lang: isHe ? "he" : "en", dir: isHe ? "rtl" : "ltr" }, clean(html)) : null));
  $("#sheet").hidden = false;
}

// The printed Vilna page: Sefaria's scan of the Romm edition (National Library of Israel).
async function scanSheet(ref) {
  const sheet = $("#sheet");
  const box = el("div", { class: "sheet-inner scan" },
    el("button", { type: "button", class: "iconbtn close", "aria-label": t("close"), onclick: closeSheet }, "✕"),
    el("p", { class: "muted" }, t("loading")));
  sheet.replaceChildren(box);
  sheet.hidden = false;
  let url = `https://manuscripts.sefaria.org/vilna-romm/${toRoute(ref).replace(".", "_")}.jpg`;
  try {
    const list = await getJSON(`${API}/manuscripts/${toRoute(ref)}`);
    const vilna = list.find(m => /vilna/i.test(m.manuscript_slug || ""));
    if (vilna) url = vilna.image_url;
  } catch (err) { /* the usual address is right for almost every amud */ }
  const img = el("img", { src: url, alt: refName(ref) });
  img.addEventListener("click", () => box.classList.toggle("zoom"));
  img.addEventListener("error", () => img.replaceWith(el("p", {}, navigator.onLine ? t("scanFail") : t("offlineFail"))));
  box.replaceChildren(box.firstChild, el("p", { class: "seg-kind" }, refName(ref)), img, el("p", { class: "credit" }, t("scanCredit")));
}

function navButtons(ref) {
  const prev = neighbour(ref, -1), next = neighbour(ref, 1);
  return el("nav", { class: "amud-nav" },
    prev ? el("a", { class: "btn ghost", href: "#daf/" + toRoute(prev) }, (S.lang === "he" ? "→ " : "← ") + refName(prev)) : el("span"),
    next ? el("a", { class: "btn ghost", href: "#daf/" + toRoute(next) }, refName(next) + (S.lang === "he" ? " ←" : " →")) : el("span"));
}

function flowMap(amud) {
  return el("nav", { class: "flow", "aria-label": t("flow") },
    el("h3", {}, t("flow")),
    el("ol", {}, amud.segs.map(seg => el("li", {},
      el("a", { href: "#", class: "k-" + seg.kind, onclick: e => { e.preventDefault(); document.getElementById("s" + seg.i).scrollIntoView({ behavior: "smooth", block: "center" }); } },
        el("span", { class: "dot" }), el("b", {}, KINDS[seg.kind][S.lang]), " ",
        el("span", { class: "gist" }, seg.txt.replace(NIKUD, "").split(/\s+/).slice(0, 4).join(" ")))))),
    el("details", { class: "legend" }, el("summary", {}, t("legend")),
      el("dl", {}, Object.entries(KINDS).map(([k, v]) => [
        el("dt", { class: "k-" + k }, el("span", { class: "dot" }), v[S.lang]),
        el("dd", {}, S.lang === "he" ? v.dHe : v.dEn)]),
        ["mishnah", "baraita"].map(src => [
          el("dt", {}, bracketIcon(src), t("q_" + src)),
          el("dd", {}, t("q_" + src + "D"))]))),
    el("p", { class: "note" }, t("flowNote")));
}

function segView(seg) {
  const k = KINDS[seg.kind];
  const art = el("article", { class: "seg k-" + seg.kind + perekClass(seg), id: "s" + seg.i },
    S.structure ? el("div", { class: "seg-kind" }, el("span", { class: "dot" }), k[S.lang]) : null,
    markMusagim(el("p", { class: "gemara", lang: "he", dir: "rtl" }, coloredLine(seg)), seg.i));

  if (S.explain !== "off") {
    const html = S.lang === "he" ? (seg.st || seg.en) : (seg.en || seg.st);
    const isHe = html === seg.st;
    if (html) art.append(el("details", { class: "layer explain", open: S.explain === "open" },
      el("summary", {}, t("explain")), el("div", { class: "layer-body", lang: isHe ? "he" : "en", dir: isHe ? "rtl" : "ltr" }, clean(html))));
  }
  for (const [key, on] of [["rashi", S.rashi], ["tosafot", S.tosafot]]) {
    if (!on || !seg[key].length) continue;
    art.append(el("details", { class: "layer " + key },
      el("summary", {}, `${t(key)} (${seg[key].length})`),
      el("div", { class: "layer-body", lang: "he", dir: "rtl" }, seg[key].map((c, k) => {
        const p = plain(c), cut = p.search(/\s[–-]\s/);
        return el("p", { "data-c": `${key}-${seg.i}-${k}` }, cut > 0 ? [el("b", {}, p.slice(0, cut)), p.slice(cut)] : p);
      }))));
  }
  return art;
}

// The line of Gemara, with the known Aramaic words as buttons that open their meaning.
function gemaraLine(txt) {
  const parts = txt.split(/([\s־]+)/), words = [], seps = [];
  parts.forEach((p, i) => (i % 2 ? seps : words).push(p));
  const show = w => S.nikud ? w : w.replace(NIKUD, "");
  const sep = j => seps[j] == null ? "" : S.nikud ? seps[j] : seps[j].replace("־", " ");
  const hits = new Map(S.vocab === "off" ? [] : findVocab(words.map(core))
    .filter(([, , v]) => S.vocab === "all" || !v.basic).map(h => [h[0], h]));
  const out = [];
  for (let i = 0; i < words.length;) {
    const h = hits.get(i);
    if (h) {
      const [, n, v] = h;
      let s = ""; for (let j = i; j < i + n; j++) s += show(words[j]) + (j < i + n - 1 ? sep(j) : "");
      out.push(el("button", { type: "button", class: "w t-" + v.t, onclick: () => wordSheet(v) }, s));
      out.push(sep(i + n - 1)); i += n;
    } else { out.push(show(words[i]) + sep(i)); i++; }
  }
  return out;
}

const TYPE = { q: ["מילת שאלה", "question word"], o: ["מילת קושיא", "challenge word"], a: ["מילת תירוץ", "answer word"],
  p: ["מילת ראיה", "proof word"], s: ["מונח", "term"], c: ["מילה שכיחה", "common word"] };

function wordSheet(v) {
  const sheet = $("#sheet");
  sheet.replaceChildren(el("div", { class: "sheet-inner" },
    el("button", { type: "button", class: "iconbtn close", "aria-label": t("close"), onclick: closeSheet }, "✕"),
    el("p", { class: "word", lang: "he", dir: "rtl" }, v.v),
    el("p", { class: "tag t-" + v.t }, TYPE[v.t][S.lang === "he" ? 0 : 1]),
    el("p", { class: "meaning", lang: "he", dir: "rtl" }, v.he),
    el("p", { class: "meaning en", lang: "en", dir: "ltr" }, v.en)));
  sheet.hidden = false;
}
function closeSheet() { $("#sheet").hidden = true; }

// ---------- Shas browser ----------

function shasView(en) {
  if (en) {
    const m = masechet(en);
    if (!m) return shasView();
    const first = parseRef(`x ${m.first}`).idx, last = parseRef(`x ${m.last}`).idx;
    const dafs = [];
    for (let d = Math.floor(first / 2) + 1; d <= Math.floor(last / 2) + 1; d++) {
      dafs.push(el("div", { class: "daf" },
        el("span", { class: "dn" }, S.lang === "he" ? gem(d, false) : d),
        ["a", "b"].map(a => {
          const idx = (d - 1) * 2 + (a === "b" ? 1 : 0), ref = `${en} ${d}${a}`;
          if (idx < first || idx > last) return el("span", { class: "am empty" });
          return el("a", { class: "am" + (P.learned[ref] ? " done" : ""), href: "#daf/" + toRoute(ref), title: refName(ref) }, a === "a" ? "." : ":");
        })));
    }
    setView(el("section", { class: "shas" },
      el("p", {}, el("a", { href: "#shas" }, "‹ " + t("shas"))),
      el("h2", {}, S.lang === "he" ? m.he : m.en),
      el("div", { class: "daf-grid" }, dafs)));
    return;
  }
  return homeView();
}

// Every tractate, seder by seder; it sits on the home page under the daf yomi.
function shasList() {
  const bySeder = new Map();
  for (const m of MASECHTOT) { if (!bySeder.has(m.seder)) bySeder.set(m.seder, []); bySeder.get(m.seder).push(m); }
  return el("section", { class: "shas", id: "shas" }, el("h2", {}, t("browse")),
    [...bySeder.values()].map(list => el("div", { class: "card seder" },
      el("h3", {}, S.lang === "he" ? list[0].heSeder : list[0].seder),
      el("div", { class: "mas-list" }, list.map(m =>
        el("a", { class: "mas", href: "#shas/" + m.en.replace(/ /g, "_") }, el("b", {}, S.lang === "he" ? m.he : m.en)))))));
}

// ---------- settings ----------

function settingsView() {
  const d = $("#settings");
  const radio = (key, opts) => el("div", { class: "seg-switch" }, opts.map(([val, label]) =>
    el("button", { type: "button", class: S[key] === val ? "on" : "", onclick: () => { S[key] = val; saveSettings(); settingsView(); route(); } }, label)));
  const toggle = (key, label) => el("label", { class: "toggle" },
    el("input", { type: "checkbox", checked: !!S[key], onchange: e => { S[key] = e.target.checked; saveSettings(); route(); } }), label);
  d.replaceChildren(el("div", { class: "drawer-inner" },
    el("div", { class: "drawer-head" }, el("h2", {}, t("settings")),
      el("button", { type: "button", class: "iconbtn", "aria-label": t("close"), onclick: () => { d.hidden = true; } }, "✕")),
    el("h3", {}, t("level")),
    el("div", { class: "seg-switch" }, ["beginner", "intermediate", "advanced"].map(l =>
      el("button", { type: "button", class: S.level === l ? "on" : "", onclick: () => { setLevel(l); settingsView(); route(); } }, t(l)))),
    el("p", { class: "muted small" }, S.level ? t(S.level + "D") : ""),
    el("h3", {}, t("tools")),
    el("p", {}, t("sExplain")), radio("explain", [["open", t("sExplainOpen")], ["tap", t("sExplainTap")], ["off", t("sExplainOff")]]),
    el("p", {}, t("sVocab")), radio("vocab", [["all", t("sVocabAll")], ["key", t("sVocabKey")], ["off", t("sVocabOff")]]),
    toggle("structure", t("sStructure")), toggle("colorText", t("sColorText")), toggle("meforshim", t("sMeforshim")), toggle("nikud", t("sNikud")), toggle("rashi", t("sRashi")), toggle("tosafot", t("sTosafot")),
    el("hr"),
    el("button", { type: "button", class: "linkbtn", onclick: () => {
      if (!confirm(t("resetConfirm"))) return;
      P = { learned: {}, days: [], last: null }; saveP(); route();
    } }, t("reset"))));
}

// ---------- shell ----------

function chrome() {
  document.documentElement.lang = S.lang;
  document.documentElement.dir = S.lang === "he" ? "rtl" : "ltr";
  $("#title").textContent = t("title");
  $("#subtitle").textContent = t("subtitle");
  document.querySelectorAll(".langswitch button").forEach(b => b.classList.toggle("on", b.dataset.lang === S.lang));
  const here = location.hash.split("/")[0] || "#";
  $("#tabs").replaceChildren(el("a", { href: "#", class: here === "#" || here === "#shas" ? "on" : "" }, t("home")));
  $("#settings-btn").setAttribute("aria-label", t("settings"));
}

function route() {
  closeSheet();
  chrome();
  const [name, arg] = location.hash.slice(1).split("/");
  if (name === "daf" && arg) return amudView(fromRoute(decodeURIComponent(arg)));
  if (name === "shas") return shasView(arg && decodeURIComponent(arg).replace(/_/g, " "));
  return homeView();
}

async function start() {
  [MASECHTOT, VOCAB] = await Promise.all([getJSON("data/masechtot.json"), getJSON("data/vocab.json")]);
  VOCAB_BY = new Map(VOCAB.map(v => [v.w, v]));
  document.querySelectorAll(".langswitch button").forEach(b => b.addEventListener("click", () => {
    S.lang = b.dataset.lang; saveSettings(); route(); if (!$("#settings").hidden) settingsView();
  }));
  $("#settings-btn").addEventListener("click", () => { const d = $("#settings"); if (d.hidden) { settingsView(); d.hidden = false; } else d.hidden = true; });
  $("#sheet").addEventListener("click", e => { if (e.target.id === "sheet") closeSheet(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") { closeSheet(); $("#settings").hidden = true; } });
  window.addEventListener("hashchange", route);
  route();
}
start();
