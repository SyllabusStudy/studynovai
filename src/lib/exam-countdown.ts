import { daysUntil, type AssignmentRow, type EventRow } from "@/lib/data";

export type UpcomingExam = {
  key: string;
  title: string;
  classId: string | null;
  date: string;
  days: number;
};

const EXAM_WORDS = /\b(exam|midterm|mid-term|final|test|quiz)s?\b/i;

/** Next exams/tests within `windowDays`, soonest first, without duplicate linked items. */
export function upcomingExams(
  assignments: AssignmentRow[],
  events: EventRow[],
  windowDays = 14,
): UpcomingExam[] {
  const out: UpcomingExam[] = [];
  const linked = new Set<string>();
  for (const e of events) {
    const d = daysUntil(e.event_date);
    if (d === null || d < 0 || d > windowDays) continue;
    if (e.event_type !== "exam" && !EXAM_WORDS.test(e.title)) continue;
    if (e.assignment_id) linked.add(e.assignment_id);
    out.push({ key: `e:${e.id}`, title: e.title, classId: e.class_id, date: e.event_date, days: d });
  }
  for (const a of assignments) {
    if (a.status === "completed" || linked.has(a.id) || !a.due_date) continue;
    const d = daysUntil(a.due_date);
    if (d === null || d < 0 || d > windowDays) continue;
    const isExam = (a.category ?? "").match(EXAM_WORDS) || a.category === "exam" || EXAM_WORDS.test(a.title);
    if (!isExam) continue;
    out.push({ key: `a:${a.id}`, title: a.title, classId: a.class_id, date: a.due_date, days: d });
  }
  return out.sort((x, y) => x.days - y.days);
}

export function countdownLabel(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}
