import { describe, expect, it } from "vitest";
import { detectEvents, findDates, SAMPLE_SYLLABUS } from "./detect";

describe("local syllabus detector", () => {
  it("parses month-name, numeric, and ISO dates", () => {
    expect(findDates("Midterm Oct 14", 2026)[0]?.date).toBe("2026-10-14");
    expect(findDates("Lab due 9/30", 2026)[0]?.date).toBe("2026-09-30");
    expect(findDates("Due 2026-12-02", 2026)[0]?.date).toBe("2026-12-02");
    expect(findDates("Final December 9, 2026", 2025)[0]?.date).toBe("2026-12-09");
  });

  it("parses ranges", () => {
    const [h] = findDates("Presentations Nov 18-20", 2026);
    expect(h?.date).toBe("2026-11-18");
    expect(h?.endDate).toBe("2026-11-20");
  });

  it("rejects impossible dates", () => {
    expect(findDates("Quiz Feb 30", 2026)).toHaveLength(0);
  });

  it("finds the sample's exams and skips the holiday", () => {
    const ev = detectEvents(SAMPLE_SYLLABUS, 2020);
    expect(ev.find((e) => e.type === "exam")?.date).toBe("2026-10-14");
    expect(ev.find((e) => e.type === "final")?.date).toBe("2026-12-09");
    expect(ev.some((e) => e.date === "2026-11-25")).toBe(false);
    expect(ev.filter((e) => e.type === "quiz")).toHaveLength(2);
  });
});
