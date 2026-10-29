// Rule-based syllabus event detector. Pure + deterministic: no AI, no network.
export type LocalEventType = "exam" | "final" | "quiz" | "assignment" | "project" | "presentation" | "deadline";

export interface DetectedEvent {
  id: string;
  title: string;
  type: LocalEventType;
  date: string; // YYYY-MM-DD
  endDate: string | null;
  confidence: "high" | "low";
  reason: string | null; // why it's uncertain
  source: string; // original line
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const MON = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";

const TYPE_RULES: [LocalEventType, RegExp][] = [
  ["final", /\bfinal\s+(exam|examination|test)\b|\bfinals?\s*(week|:|$)/i],
  ["exam", /\b(midterm|exam|examination|test)\b/i],
  ["quiz", /\bquiz(zes)?\b/i],
  ["project", /\bproject\b/i],
  ["presentation", /\bpresentation|presents?\b/i],
  ["assignment", /\b(homework|hw\s?\d*|assignment|problem set|pset|essay|paper|lab report|reading response|worksheet)\b/i],
  ["deadline", /\b(due|deadline|submit|last day|drop)\b/i],
];

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
function valid(y: number, m: number, d: number) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Guess the term year from text like "Fall 2026"; fallback to the given year. */
export function inferYear(text: string, fallback: number): number {
  const m = text.match(/\b(fall|spring|summer|winter|autumn)\s+(20\d{2})\b/i) ?? text.match(/\b(20\d{2})\b/);
  return m ? Number(m[m.length - 1]) : fallback;
}

type G = [string, string, string, string, string, string, string];
interface DateHit { date: string; endDate: string | null; yearGuessed: boolean }

export function findDates(line: string, year: number): DateHit[] {
  const hits: DateHit[] = [];
  const used: [number, number][] = [];
  const take = (re: RegExp, fn: (m: G) => DateHit | null) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      const s = m.index, e = s + m[0].length;
      if (used.some(([a, b]) => s < b && e > a)) continue;
      const h = fn(m as unknown as G);
      if (h) { hits.push(h); used.push([s, e]); }
    }
  };
  // ISO 2026-10-14
  take(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g, (m) => {
    const [y, mo, d] = [+m[1], +m[2], +m[3]];
    return valid(y, mo, d) ? { date: iso(y, mo, d), endDate: null, yearGuessed: false } : null;
  });
  // Month ranges: "Oct 12-14", "October 12 – November 2, 2026"
  take(new RegExp(`\\b${MON}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*[-–—]\\s*(?:${MON}\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(20\\d{2}))?`, "gi"), (m) => {
    const m1 = MONTHS[m[1].toLowerCase().replace(".", "")];
    const m2 = m[3] ? MONTHS[m[3].toLowerCase().replace(".", "")] : m1;
    const y = m[5] ? +m[5] : year;
    const [d1, d2] = [+m[2], +m[4]];
    if (!m1 || !m2 || !valid(y, m1, d1) || !valid(y, m2, d2)) return null;
    return { date: iso(y, m1, d1), endDate: iso(y, m2, d2), yearGuessed: !m[5] };
  });
  // "Oct 14", "October 14th, 2026", "Tue, Oct. 14"
  take(new RegExp(`\\b${MON}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s*(20\\d{2}))?`, "gi"), (m) => {
    const mo = MONTHS[m[1].toLowerCase().replace(".", "")];
    const y = m[3] ? +m[3] : year;
    const d = +m[2];
    return mo && valid(y, mo, d) ? { date: iso(y, mo, d), endDate: null, yearGuessed: !m[3] } : null;
  });
  // "14 October 2026"
  take(new RegExp(`\\b(\\d{1,2})\\s+${MON}(?:,?\\s*(20\\d{2}))?`, "gi"), (m) => {
    const mo = MONTHS[m[2].toLowerCase().replace(".", "")];
    const y = m[3] ? +m[3] : year;
    const d = +m[1];
    return mo && valid(y, mo, d) ? { date: iso(y, mo, d), endDate: null, yearGuessed: !m[3] } : null;
  });
  // US numeric: 10/14, 10/14/26, 10/14/2026, ranges 10/12-10/14
  take(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?:\s*[-–]\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?)?\b/g, (m) => {
    const yr = (s?: string) => (s ? (s.length === 2 ? 2000 + +s : +s) : year);
    const [mo, d, y] = [+m[1], +m[2], yr(m[3])];
    if (!valid(y, mo, d)) return null;
    let endDate: string | null = null;
    if (m[4]) {
      const [mo2, d2, y2] = [+m[4], +m[5], yr(m[6] ?? m[3])];
      if (valid(y2, mo2, d2)) endDate = iso(y2, mo2, d2);
    }
    return { date: iso(y, mo, d), endDate, yearGuessed: !m[3] };
  });
  return hits;
}

function classify(line: string): LocalEventType | null {
  for (const [t, re] of TYPE_RULES) if (re.test(line)) return t;
  return null;
}

function cleanTitle(line: string, type: LocalEventType): string {
  let t = line
    .replace(new RegExp(`\\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(day|sday|nesday|rsday|urday)?\\.?,?\\s*`, "gi"), "")
    .replace(new RegExp(`\\b${MON}\\s+\\d{1,2}(st|nd|rd|th)?(\\s*[-–—]\\s*(${MON}\\s+)?\\d{1,2})?(,?\\s*20\\d{2})?`, "gi"), "")
    .replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?(\s*[-–]\s*\d{1,2}\/\d{1,2}(\/\d{2,4})?)?/g, "")
    .replace(/\b20\d{2}-\d{1,2}-\d{1,2}\b/g, "")
    .replace(/\bweek\s*\d+\b/gi, "")
    .replace(/^[\s:–—\-|•*.,]+|[\s:–—\-|•*.,]+$/g, "")
    .replace(/:\s*,\s*/g, ": ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (t.length < 3) t = type[0].toUpperCase() + type.slice(1);
  return t.slice(0, 120);
}

export function detectEvents(text: string, fallbackYear = new Date().getFullYear()): DetectedEvent[] {
  const year = inferYear(text, fallbackYear);
  const termStated = /\b(fall|spring|summer|winter|autumn)\s+20\d{2}\b/i.test(text);
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const out: DetectedEvent[] = [];
  const seen = new Set<string>();
  lines.forEach((line, i) => {
    const dates = findDates(line, year);
    if (!dates.length) return;
    let type = classify(line);
    let source = line;
    let usedNeighbor = false;
    // Table rows sometimes split the label onto the next line.
    if (!type && lines[i + 1] && !findDates(lines[i + 1], year).length) {
      type = classify(lines[i + 1]);
      if (type) { source = `${line} ${lines[i + 1]}`; usedNeighbor = true; }
    }
    if (!type) return;
    for (const d of dates) {
      const title = cleanTitle(source, type);
      const key = `${d.date}|${title.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const reasons: string[] = [];
      if (d.yearGuessed && !termStated) reasons.push(`year assumed ${d.date.slice(0, 4)}`);
      if (usedNeighbor) reasons.push("label found on next line");
      if (dates.length > 1) reasons.push("several dates on one line");
      if (type === "deadline") reasons.push("type unclear");
      out.push({
        id: `${d.date}-${out.length}`,
        title, type, date: d.date, endDate: d.endDate,
        confidence: reasons.length ? "low" : "high",
        reason: reasons.length ? reasons.join(", ") : null,
        source: source.slice(0, 240),
      });
    }
  });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export const SAMPLE_SYLLABUS = `PSY 101 — Introduction to Psychology
Fall 2026 · Dr. Rivera

Course Schedule
Week 1  Aug 26  Introduction and research methods
Week 2  Sep 2   Reading Response 1 due
Week 3  Sep 9   Quiz 1: Research methods
Week 4  Sep 16  Homework 2 due by 11:59 PM
Week 6  9/30    Lab report: Memory experiment due
Week 8  Oct 14  Midterm Exam (chapters 1–6)
Week 10 October 28th Group project proposal due
Week 11 Nov 4   Quiz 2: Learning and conditioning
Week 13 Nov 18-20  Group presentations
Nov 25  No class — Thanksgiving break
Week 15 Dec 2   Final paper due
Final Exam: Wednesday, December 9, 2026, 8:00–10:00 AM

Grading: Quizzes 15%, Homework 20%, Midterm 25%, Final 30%, Project 10%`;
