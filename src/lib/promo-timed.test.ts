import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
describe("StudentFriendly promo", () => {
  it("grants 7 days of Pro", () => {
    expect(readFileSync("src/lib/billing.server.ts", "utf8")).toMatch(/studentfriendly:\s*7\b/);
  });
});
