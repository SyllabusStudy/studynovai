import { describe, expect, it } from "vitest";
import { writingStats } from "./writing-stats";

describe("writingStats", () => {
  it("scores identical sentence lengths as zero variety", () => {
    expect(writingStats("One two three four. Five six seven eight. Nine ten eleven twelve.").variety).toBe(0);
  });
  it("counts AI cliché phrases as whole words", () => {
    const s = writingStats("Let us delve in. Moreover, we delve again. The landscapes are pretty.");
    expect(s.cliches.find((c) => c.phrase === "delve")?.count).toBe(2);
    expect(s.cliches.find((c) => c.phrase === "landscape")).toBeUndefined();
  });
});
