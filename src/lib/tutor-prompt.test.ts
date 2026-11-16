import { describe, expect, it } from "vitest";
import { buildTutorSystemPrompt, tutorHistory } from "./tutor-prompt";

describe("Tutor instruction handling", () => {
  it("makes the student's explicit task override the selected mode", () => {
    const prompt = buildTutorSystemPrompt("explain", "", "", "");
    expect(prompt).toContain("Their request overrides the selected study mode");
    expect(prompt).toContain("number of items");
    expect(prompt).not.toContain("DEEP DIVE, always");
  });
  it("uses interactive quizzing without the conflicting default answer key", () => {
    const prompt = buildTutorSystemPrompt("quiz_me", "", "", "");
    expect(prompt).toContain("Ask ONE question and wait");
    expect(prompt).toContain("Do not reveal the answer before an attempt");
    expect(prompt).not.toContain("3-5 questions");
  });
  it("keeps initial task constraints and the most recent exchanges in order", () => {
    const history = Array.from({ length: 40 }, (_, i) => ({ content: i === 0 ? "Only ask biology questions; do not show answers" : `Message ${i}` }));
    const selected = tutorHistory(history);
    expect(selected[0]?.content).toBe("Only ask biology questions; do not show answers");
    expect(selected.slice(2)).toEqual(history.slice(18));
    expect(selected.at(-1)?.content).toBe("Message 39");
  });
});