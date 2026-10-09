import { describe, expect, it } from "vitest";
import { createGloSpeechGate, GLO_SILENCE_MS } from "./glo-speech";

describe("Glo speech submission", () => {
  it("keeps the requested two-second silence interval", () => {
    expect(GLO_SILENCE_MS).toBe(2000);
  });
  it("does not submit speech while an answer is processing or speaking", () => {
    const accept = createGloSpeechGate();
    expect(accept("Make a quiz", true, 0)).toBe(false);
    expect(accept("Make a quiz", false, 1)).toBe(true);
  });
  it("submits repeated interim and final wording only once", () => {
    const accept = createGloSpeechGate();
    expect(accept("Make a quiz", false, 0)).toBe(true);
    expect(accept("Make a quiz!", false, 2000)).toBe(false);
    expect(accept("Make flashcards", false, 2001)).toBe(true);
  });
  it("allows a deliberate retry after the short duplicate window", () => {
    const accept = createGloSpeechGate();
    expect(accept("Make a quiz", false, 0)).toBe(true);
    expect(accept("Make a quiz", false, 5000)).toBe(true);
  });
});