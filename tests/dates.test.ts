import { describe, expect, it } from "vitest";
import { buildScanFilters } from "../src/lib/dates";

describe("buildScanFilters", () => {
  it("uses no date bounds for all accessible history", () => {
    expect(buildScanFilters("all", true, "2026-01-01", "2026-01-02")).toEqual({
      mode: "all",
      keepPinned: true,
    });
  });

  it("maps inclusive local calendar days to a half-open timestamp range", () => {
    const result = buildScanFilters("custom", false, "2026-03-07", "2026-03-08");
    expect(result).toEqual({
      mode: "custom",
      keepPinned: false,
      startSec: new Date(2026, 2, 7).getTime() / 1000,
      endExclusiveSec: new Date(2026, 2, 9).getTime() / 1000,
    });
  });

  it.each([
    ["", "2026-03-08"],
    ["2026-02-30", "2026-03-08"],
    ["2026-03-09", "2026-03-08"],
  ])("rejects incomplete, invalid, or reversed custom dates", (start, end) => {
    expect(() => buildScanFilters("custom", true, start, end)).toThrow();
  });
});
