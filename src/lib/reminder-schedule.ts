import type { AssignmentRow, EventRow } from "@/lib/data";

/** Pure reminder timing logic — safe to use in the browser and on the server. */

export const REMINDER_LEAD_OPTIONS = [
  { minutes: 0, label: "At the due time" },
  { minutes: 60, label: "1 hour before" },
  { minutes: 180, label: "3 hours before" },
  { minutes: 1440, label: "1 day before" },
  { minutes: 4320, label: "3 days before" },
  { minutes: 10080, label: "1 week before" },
] as const;

export function leadLabel(minutes: number | null | undefined): string {
  const found = REMINDER_LEAD_OPTIONS.find((o) => o.minutes === (minutes ?? -1));
  return found ? found.label : "Default reminder";
}

/** Default clock time used when an item has a date but no time. */
const DEFAULT_HOUR = 9;

export function dueAt(date: string | null | undefined, time?: string | null): Date | null {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return null;
  let hh = DEFAULT_HOUR;
  let mm = 0;
  const match = time?.match(/(\d{1,2}):(\d{2})/);
  if (match) {
    hh = Number(match[1]);
    mm = Number(match[2]);
    if (/pm/i.test(time ?? "") && hh < 12) hh += 12;
    if (/am/i.test(time ?? "") && hh === 12) hh = 0;
  }
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

export type PendingReminder = {
  kind: "assignment" | "event";
  id: string;
  title: string;
  body: string;
  remindAt: Date;
  dueAt: Date;
};

export function collectDueReminders(
  assignments: AssignmentRow[],
  events: EventRow[],
  defaultMinutes: number,
  now = new Date(),
): PendingReminder[] {
  const out: PendingReminder[] = [];
  const push = (r: PendingReminder) => {
    // fire from the reminder moment until the item is due (plus a short grace window)
    if (now >= r.remindAt && now.getTime() <= r.dueAt.getTime() + 6 * 60 * 60 * 1000) out.push(r);
  };

  const fmt = (d: Date) => d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

  for (const a of assignments) {
    if (a.status === "completed" || !a.due_date) continue;
    const due = dueAt(a.due_date);
    if (!due) continue;
    const lead = a.reminder_minutes ?? defaultMinutes;
    const high = (a.priority ?? "").toLowerCase() === "high";
    push({
      kind: "assignment",
      id: a.id,
      title: `${high ? "High priority — due soon" : "Due soon"}: ${a.title}`,
      body: `Assignment due ${fmt(due)}`,
      remindAt: new Date(due.getTime() - lead * 60000),
      dueAt: due,
    });
    // High-priority work gets automatic extra heads-ups: 3 days and 1 day before.
    if (high) {
      for (const early of [4320, 1440]) {
        if (early <= lead) continue;
        push({
          kind: "assignment",
          id: a.id,
          title: `High priority: ${a.title}`,
          body: `Due ${fmt(due)} — ${early === 4320 ? "3 days left, start now" : "due tomorrow"}`,
          remindAt: new Date(due.getTime() - early * 60000),
          dueAt: due,
        });
      }
    }
  }

  for (const e of events) {
    const due = dueAt(e.event_date, e.event_time);
    if (!due) continue;
    const lead = e.reminder_minutes ?? defaultMinutes;
    const reading = e.event_type === "reading" || /\b(read|reading|chapter|ch\.)\b/i.test(e.title);
    const exam = /exam|midterm|final|test/i.test(e.event_type) || /\b(exam|midterm|final)\b/i.test(e.title);
    push({
      kind: "event",
      id: e.id,
      title: `${reading ? "Reading due" : "Coming up"}: ${e.title}`,
      body: fmt(due),
      remindAt: new Date(due.getTime() - lead * 60000),
      dueAt: due,
    });
    // Readings: automatic nudge 2 days before so there's time to actually read.
    // Exams: automatic 3-day study heads-up.
    const early = reading ? 2880 : exam ? 4320 : 0;
    if (early > lead) {
      push({
        kind: "event",
        id: e.id,
        title: reading ? `Start reading: ${e.title}` : `Start studying: ${e.title}`,
        body: `${reading ? "Reading due" : "Exam"} ${fmt(due)}`,
        remindAt: new Date(due.getTime() - early * 60000),
        dueAt: due,
      });
    }
  }

  // If several reminders for one item are already due, only send the most recent one.
  const latest = new Map<string, PendingReminder>();
  for (const r of out) {
    const k = `${r.kind}:${r.id}`;
    const prev = latest.get(k);
    if (!prev || r.remindAt > prev.remindAt) latest.set(k, r);
  }
  return [...latest.values()].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}
