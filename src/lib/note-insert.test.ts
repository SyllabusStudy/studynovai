import { describe, expect, it } from "vitest";
import { bestTopicBlock } from "./note-insert";

describe("bestTopicBlock", () => {
  const blocks = ["Week 3 notes", "Photosynthesis happens in chloroplasts", "Mitosis has four phases"];
  it("finds the block mentioning the asked topic", () => {
    expect(bestTopicBlock(blocks, "What does mitosis mean?")).toBe(2);
  });
  it("returns -1 when the topic is not in the note", () => {
    expect(bestTopicBlock(blocks, "explain gravity")).toBe(-1);
  });
});
