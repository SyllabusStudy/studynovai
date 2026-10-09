import { describe, it, expect } from "vitest";
import { gloTasksLeft, isGloTask } from "./glo-limit";

describe("Glo free task limit", () => {
  it("free users get 3 tasks a day", () => {
    expect(gloTasksLeft(0, false)).toBe(3);
    expect(gloTasksLeft(3, false)).toBe(0);
  });
  it("pro users are unlimited", () => {
    expect(gloTasksLeft(10, true)).toBe(Infinity);
  });
  it("only real tasks count", () => {
    expect(isGloTask("quiz")).toBe(true);
    expect(isGloTask("none")).toBe(false);
  });
});
