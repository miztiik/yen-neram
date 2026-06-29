import { describe, expect, it } from "vitest";
import { derivePills, hasNamedBonus, isSilentTier } from "@/games/5-in-a-row/ui/bonus-pills.js";
import type { ClearBreakdown } from "@/games/5-in-a-row/engine/score.js";

// Builder for a single ClearBreakdown without recomputing through the
// scoring engine -- these tests target the pill-derivation rules in
// isolation. (The score-engine-vs-breakdown parity is covered in
// score.test.ts.)
function makeBreakdown(partial: Partial<ClearBreakdown>): ClearBreakdown {
  return {
    cascadeIndex: 0,
    cellCount: 5,
    length: 5,
    lineCount: 1,
    length_mult: 1,
    intersection_mult: 1,
    cascade_mult: 1,
    points: 5,
    ...partial,
  };
}

describe("isSilentTier (tier-1 floor classifier)", () => {
  // Per ADR-0017 amendment 2026-06-08, this no longer gates the bonus
  // wave on/off; the wave plays on every scoring clear. The function
  // remains as a pure classifier: TRUE iff derivePills would emit no
  // NAMED bonus pills (length>=6, intersection, cascade depth>=1).
  // Useful for any future surface that wants to ask "is this a plain
  // tier-1 clear?" without re-deriving the pill array.
  it("tier-1 floor (single 5-clear, no bonuses) is a silent tier", () => {
    expect(isSilentTier([makeBreakdown({})])).toBe(true);
  });

  it("a 6-clear is not silent (length bonus earned)", () => {
    expect(isSilentTier([makeBreakdown({ length: 6 })])).toBe(false);
  });

  it("a single 5-clear with intersection is not silent", () => {
    expect(isSilentTier([makeBreakdown({ lineCount: 2, intersection_mult: 1.5 })])).toBe(false);
  });

  it("any cascade depth is not silent", () => {
    expect(
      isSilentTier([makeBreakdown({}), makeBreakdown({ cascadeIndex: 1, cascade_mult: 3 })]),
    ).toBe(false);
  });

  it("empty chain is silent (no clear, no pills)", () => {
    expect(isSilentTier([])).toBe(true);
  });
});

describe("derivePills (delta-only; word pills retired 2026-06-29)", () => {
  it("plain 5-clear: only the final +delta badge", () => {
    const pills = derivePills([makeBreakdown({})], 5);
    expect(pills.length).toBe(1);
    const last = pills[0];
    if (last === undefined) throw new Error("expected one pill");
    expect(last.kind).toBe("delta");
    expect(last.isFinalBadge).toBe(true);
    expect(last.text).toBe("+5");
  });

  it("bonus clears still emit ONLY the +delta badge (no LENGTH/INTERSECT/CASCADE words)", () => {
    const chain = [
      makeBreakdown({ length: 9, lineCount: 2, intersection_mult: 1.5, points: 67 }),
      makeBreakdown({ cascadeIndex: 1, cascade_mult: 3, points: 42 }),
    ];
    const pills = derivePills(chain, 109);
    expect(pills.map((p) => p.kind)).toEqual(["delta"]);
    expect(pills[0]?.text).toBe("+109");
  });

  it("omits the delta badge when totalDelta is 0 (empty / invalid clear)", () => {
    const pills = derivePills([], 0);
    expect(pills.length).toBe(0);
  });
});

describe("hasNamedBonus (drives the vibrant +N badge)", () => {
  it("plain 5-clear earns no named bonus", () => {
    expect(hasNamedBonus([makeBreakdown({})])).toBe(false);
  });
  it("length 6+ is a named bonus", () => {
    expect(hasNamedBonus([makeBreakdown({ length: 6 })])).toBe(true);
  });
  it("intersection is a named bonus", () => {
    expect(hasNamedBonus([makeBreakdown({ lineCount: 2, intersection_mult: 1.5 })])).toBe(true);
  });
  it("cascade depth >= 1 is a named bonus", () => {
    expect(hasNamedBonus([makeBreakdown({}), makeBreakdown({ cascadeIndex: 1 })])).toBe(true);
  });
});
