import { describe, expect, it } from "vitest";
import {
  CLEAR_STYLE_VALUES,
  DEFAULT_CLEAR_STYLE,
  planClearTiming,
} from "@/games/5-in-a-row/ui/board-view.js";

// ADR-0030 clear-style contract. The ripple delays each cleared cell by its
// Chebyshev (chessboard) distance from the style's origin -- NEVER the
// iteration index. This suite is the executable proof that a horizontal and a
// vertical line of the same length now ripple IDENTICALLY (the reported
// inconsistency) and that each style behaves as specified.

type Plan = Map<string, { readonly delayMs: number; readonly peak: number }>;

function sortedDelays(plan: Plan): number[] {
  return [...plan.values()].map((v) => v.delayMs).sort((a, b) => a - b);
}

describe("planClearTiming (ADR-0030 clear-style contract)", () => {
  it("exposes exactly shockwave / flash, default shockwave (ADR-0032: one signature)", () => {
    expect([...CLEAR_STYLE_VALUES]).toEqual(["shockwave", "flash"]);
    expect(DEFAULT_CLEAR_STYLE).toBe("shockwave");
  });

  it("shockwave: a horizontal and a vertical line of equal length ripple identically", () => {
    const horizontal = ["4,2", "4,3", "4,4", "4,5", "4,6"];
    const vertical = ["2,4", "3,4", "4,4", "5,4", "6,4"];
    const h = planClearTiming(horizontal, "shockwave", 50, 2.5);
    const v = planClearTiming(vertical, "shockwave", 50, 2.5);
    // The multiset of per-cell delays is orientation-free -- this is the fix.
    expect(sortedDelays(h)).toEqual(sortedDelays(v));
    // Centre-out: 0 (centre), 50, 50 (dist 1), 100, 100 (dist 2).
    expect(sortedDelays(h)).toEqual([0, 50, 50, 100, 100]);
  });

  it("shockwave: the burst peak dissipates outward (centre biggest, rim smallest)", () => {
    const cells = ["4,2", "4,3", "4,4", "4,5", "4,6"];
    const plan = planClearTiming(cells, "shockwave", 50, 2.5);
    const centrePeak = plan.get("4,4")?.peak ?? 0;
    const rimPeak = plan.get("4,2")?.peak ?? 0;
    expect(centrePeak).toBeGreaterThan(rimPeak);
    expect(plan.get("4,4")?.delayMs).toBe(0);
  });

  it("flash: every cell fires on the same frame with a uniform peak", () => {
    const cells = ["4,2", "4,3", "4,4", "4,5", "4,6"];
    const plan = planClearTiming(cells, "flash", 50, 2.5);
    expect(sortedDelays(plan)).toEqual([0, 0, 0, 0, 0]);
    expect(new Set([...plan.values()].map((v) => v.peak))).toEqual(new Set([2.5]));
  });

  it("ignores malformed keys without throwing", () => {
    const plan = planClearTiming(["bogus", "4,4"], "shockwave", 50, 2.5);
    expect(plan.has("4,4")).toBe(true);
    expect(plan.has("bogus")).toBe(false);
  });
});
