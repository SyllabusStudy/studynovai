import { describe, expect, it } from "vitest";
import { diagnose } from "./health-diagnose";

describe("diagnose", () => {
  it("flags Google rate limits", () => {
    expect(diagnose("bug", "ai", "429 RESOURCE_EXHAUSTED").diagnosis).toMatch(/rate limit/);
  });
  it("flags bad keys", () => {
    expect(diagnose("bug", "ai", "API key not valid").diagnosis).toMatch(/key/);
  });
  it("reports lag seconds", () => {
    expect(diagnose("lag", "request", "Slow request", 9400).diagnosis).toContain("9.4s");
  });
});
