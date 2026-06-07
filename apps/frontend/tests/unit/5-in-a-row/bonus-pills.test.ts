import { describe, expect, it } from "vitest";
import { derivePills, isSilentTier, type BonusPill } from "@/games/5-in-a-row/ui/bonus-pills.js";
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

describe("isSilentTier", () => {
  it("tier-1 floor (single 5-clear, no bonuses) is silent", () => {
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

  it("empty chain is silent (no clear, no wave)", () => {
    expect(isSilentTier([])).toBe(true);
  });
});

describe("derivePills", () => {
  it("plain 5-clear: only the final +delta badge", () => {
    const pills = derivePills([makeBreakdown({})], 5);
    expect(pills.length).toBe(1);
    const last = pills[0];
    if (last === undefined) throw new Error("expected one pill");
    expect(last.kind).toBe("delta");
    expect(last.isFinalBadge).toBe(true);
    expect(last.text).toBe("+5");
  });

  it("6-clear: LENGTH 6 pill plus delta", () => {
    const pills = derivePills([makeBreakdown({ length: 6, length_mult: 1.5, points: 9 })], 9);
    const kinds = pills.map((p) => p.kind);
    expect(kinds).toEqual(["length", "delta"]);
    const lengthPill = pills.find((p) => p.kind === "length");
    if (lengthPill === undefined) throw new Error("expected length pill");
    expect(lengthPill.text).toBe("LENGTH 6");
  });

  it("intersection at length 5: INTERSECT pill, no LENGTH pill", () => {
    const pills = derivePills(
      [makeBreakdown({ lineCount: 2, intersection_mult: 1.5, points: 8 })],
      8,
    );
    expect(pills.map((p) => p.kind)).toEqual(["intersect", "delta"]);
    const ip = pills.find((p) => p.kind === "intersect");
    if (ip === undefined) throw new Error("expected intersect pill");
    expect(ip.text).toBe("INTERSECT \u00D71.5");
  });

  it("cascade depth-1: emits CASCADE pill for the SECOND step (cascadeIndex 1)", () => {
    const pills = derivePills(
      [makeBreakdown({}), makeBreakdown({ cascadeIndex: 1, cascade_mult: 3, points: 15 })],
      20,
    );
    // Step 0 emits nothing (length 5, no bonuses); step 1 emits the
    // CASCADE pill; then the final +delta badge.
    expect(pills.map((p) => p.kind)).toEqual(["cascade", "delta"]);
    const cp = pills.find((p) => p.kind === "cascade");
    if (cp === undefined) throw new Error("expected cascade pill");
    expect(cp.text).toBe("CASCADE \u00D73");
  });

  it("cascade depth-3 emits THREE cascade pills (drumroll), one per step >= 1", () => {
    const chain = [
      makeBreakdown({}),
      makeBreakdown({ cascadeIndex: 1, cascade_mult: 3, points: 15 }),
      makeBreakdown({ cascadeIndex: 2, cascade_mult: 5, points: 25 }),
      makeBreakdown({ cascadeIndex: 3, cascade_mult: 7, points: 35 }),
    ];
    const pills = derivePills(chain, 80);
    const cascadeMults = pills.filter((p) => p.kind === "cascade").map((p) => p.text);
    expect(cascadeMults).toEqual(["CASCADE \u00D73", "CASCADE \u00D75", "CASCADE \u00D77"]);
    // And the delta badge always rides last.
    const lastPill: BonusPill | undefined = pills[pills.length - 1];
    if (lastPill === undefined) throw new Error("expected last pill");
    expect(lastPill.kind).toBe("delta");
  });

  it("rarest event (length-9 intersection cascade-3) emits all four pill kinds, delta last", () => {
    const chain = [
      makeBreakdown({
        length: 9,
        lineCount: 2,
        length_mult: 5,
        intersection_mult: 1.5,
        points: 67,
      }),
      makeBreakdown({
        length: 7,
        lineCount: 1,
        length_mult: 2,
        cascadeIndex: 1,
        cascade_mult: 3,
        points: 42,
      }),
      makeBreakdown({
        length: 6,
        lineCount: 1,
        length_mult: 1.5,
        cascadeIndex: 2,
        cascade_mult: 5,
        points: 45,
      }),
    ];
    const pills = derivePills(chain, 154);
    // Order: step-0 LENGTH 9, INTERSECT; step-1 LENGTH 7, CASCADE; step-2 LENGTH 6, CASCADE; +delta
    const kinds = pills.map((p) => p.kind);
    expect(kinds).toEqual([
      "length",
      "intersect",
      "length",
      "cascade",
      "length",
      "cascade",
      "delta",
    ]);
    const lastPill: BonusPill | undefined = pills[pills.length - 1];
    if (lastPill === undefined) throw new Error("expected final pill");
    expect(lastPill.text).toBe("+154");
  });

  it("omits the delta badge when totalDelta is 0 (empty / invalid clear)", () => {
    const pills = derivePills([], 0);
    expect(pills.length).toBe(0);
  });

  it("uses the U+00D7 multiplication sign, not ASCII lowercase x", () => {
    const pills = derivePills(
      [makeBreakdown({ lineCount: 2, intersection_mult: 1.5, points: 8 })],
      8,
    );
    const text = pills.find((p) => p.kind === "intersect")?.text ?? "";
    expect(text.includes("\u00D7")).toBe(true);
    expect(text.includes("x1.5")).toBe(false);
  });

  it("integer multiplier formats without trailing .0 (e.g. CASCADE x3 not x3.0)", () => {
    const pills = derivePills(
      [makeBreakdown({}), makeBreakdown({ cascadeIndex: 1, cascade_mult: 3, points: 15 })],
      20,
    );
    const cp = pills.find((p) => p.kind === "cascade");
    if (cp === undefined) throw new Error("expected cascade pill");
    expect(cp.text).toBe("CASCADE \u00D73");
  });
});
