import { describe, expect, it } from "vitest";
import { countdownLabel, upcomingExams } from "./exam-countdown";
import type { AssignmentRow, EventRow } from "./data";

const day = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const a = (title: string, n: number, extra: Partial<AssignmentRow> = {}) =>
  ({ id: title, title, due_date: day(n), status: "not_started", category: null, class_id: null, ...extra }) as AssignmentRow;

describe("exam countdown", () => {
  it("shows exams within 14 days, soonest first", () => {
    const r = upcomingExams([a("Midterm 1", 4), a("Final Exam", 2), a("Essay draft", 1)], []);
    expect(r.map((x) => x.title)).toEqual(["Final Exam", "Midterm 1"]);
  });
  it("skips exams more than 14 days away or completed", () => {
    expect(upcomingExams([a("Final", 15), a("Test 2", 3, { status: "completed" })], [])).toEqual([]);
  });
  it("does not double-list an event linked to an assignment", () => {
    const ev = { id: "e", title: "Midterm 1", event_date: day(4), event_type: "exam", assignment_id: "Midterm 1", class_id: null } as EventRow;
    expect(upcomingExams([a("Midterm 1", 4)], [ev])).toHaveLength(1);
  });
  it("labels days", () => {
    expect(countdownLabel(0)).toBe("Today");
    expect(countdownLabel(1)).toBe("Tomorrow");
    expect(countdownLabel(4)).toBe("In 4 days");
  });
});
