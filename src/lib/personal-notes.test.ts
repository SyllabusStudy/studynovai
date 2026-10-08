import { describe, expect, it } from "vitest";
import { noteWordCount } from "./personal-notes";

describe("Notes word count", () => {
  it("counts highlighted words instead of the entire note", () => {
    expect(noteWordCount("These are all six note words", "six note words")).toBe(3);
  });
  it("returns to the whole note count when selection is cleared", () => {
    expect(noteWordCount("These are all six note words", null)).toBe(6);
  });
  it("counts selections spanning paragraphs and tabs without empty words", () => {
    expect(noteWordCount("Full note", "  first\n\nsecond\tthird  ")).toBe(3);
    expect(noteWordCount("Full note", " \n ")).toBe(0);
    expect(noteWordCount("")).toBe(0);
  });
});