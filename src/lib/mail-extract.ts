/**
 * Finds dates and school tasks inside an email so the student can add them
 * to SyllabusStudy with one tap. Pure functions — safe in the browser.
 */

export interface MailSuggestion {
  title: string;
  date: string | null;
  kind: "assignment" | "exam" | "quiz" | "event";
  sourceLine: string;
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function iso(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

/** Turns a phrase like "Friday, Oct 3" or "10/3" into a calendar date. */
export function findDate(text: string, today = new Date()): string | null {
  const lower = text.toLowerCase();

  const monthName = lower.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?/,
  );
  if (monthName) {
    const prefix = monthName[1]!.slice(0, 3);
    const month = MONTHS.findIndex((m) => m.startsWith(prefix));
    const day = Number(monthName[2]);
    if (month >= 0 && day >= 1 && day <= 31) {
      const year = monthName[3] ? Number(monthName[3]) : today.getFullYear();
      let result = iso(year, month, day);
      if (!monthName[3] && new Date(result) < new Date(iso(today.getFullYear(), today.getMonth(), today.getDate()))) {
        result = iso(year + 1, month, day);
      }
      return result;
    }
  }

  const numeric = lower.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (numeric) {
    const month = Number(numeric[1]) - 1;
    const day = Number(numeric[2]);
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      let year = today.getFullYear();
      if (numeric[3]) {
        const raw = Number(numeric[3]);
        year = raw < 100 ? 2000 + raw : raw;
      } else if (new Date(iso(year, month, day)) < today) {
        year += 1;
      }
      return iso(year, month, day);
    }
  }

  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return iso(d.getFullYear(), d.getMonth(), d.getDate());
  }
  if (/\btonight\b|\btoday\b/.test(lower)) {
    return iso(today.getFullYear(), today.getMonth(), today.getDate());
  }

  const weekday = lower.match(
    /\b(?:next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/,
  );
  if (weekday) {
    const target = WEEKDAYS.indexOf(weekday[1]!);
    const d = new Date(today);
    let delta = (target - d.getDay() + 7) % 7;
    if (delta === 0 || /\bnext\s/.test(weekday[0])) delta += 7;
    d.setDate(d.getDate() + delta);
    return iso(d.getFullYear(), d.getMonth(), d.getDate());
  }

  return null;
}

function classify(line: string): MailSuggestion["kind"] {
  const l = line.toLowerCase();
  if (/\b(exam|midterm|final|test)\b/.test(l)) return "exam";
  if (/\b(quiz)\b/.test(l)) return "quiz";
  if (/\b(homework|assignment|essay|paper|lab report|problem set|project|discussion post|reading)\b/.test(l))
    return "assignment";
  return "event";
}

function tidy(line: string): string {
  const cleaned = line.replace(/\s+/g, " ").replace(/^[-*•\d.)\s]+/, "").trim();
  return cleaned.length > 90 ? `${cleaned.slice(0, 87)}…` : cleaned;
}

const TASK_WORDS =
  /\b(due|deadline|submit|turn in|exam|midterm|final|quiz|test|assignment|homework|essay|paper|project|presentation|lab|problem set|reading|office hours|review session|class cancel|meeting|no class)\b/i;

/** Sentences that mention school work, paired with any date found in them. */
export function extractSuggestions(
  subject: string,
  body: string,
  today = new Date(),
): MailSuggestion[] {
  const text = `${subject}\n${body}`;
  const lines = text
    .split(/[\n\r]+|(?<=[.!?])\s+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 6 && l.length < 400);

  const seen = new Set<string>();
  const out: MailSuggestion[] = [];

  for (const line of lines) {
    if (!TASK_WORDS.test(line)) continue;
    const title = tidy(line);
    const key = title.toLowerCase();
    if (!title || seen.has(key)) continue;
    seen.add(key);
    out.push({
      title,
      date: findDate(line, today),
      kind: classify(line),
      sourceLine: line,
    });
    if (out.length >= 6) break;
  }

  if (out.length === 0) {
    const date = findDate(text, today);
    if (date) {
      out.push({
        title: tidy(subject) || "Email reminder",
        date,
        kind: classify(subject),
        sourceLine: subject,
      });
    }
  }

  return out;
}
