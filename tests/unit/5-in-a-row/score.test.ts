import { describe, expect, it } from "vitest";
import { scoreChain, scoreSingleClear } from "@/games/5-in-a-row/engine/index.js";

const BALANCE = {
  length_multipliers: { "5": 1, "6": 1.5, "7": 2, "8": 3, "9": 5 },
  intersection_bonus: 1.5,
  cascade_bonus: 2,
};

function clearResult(
  cellCount: number,
  longest: number,
  lineCount: number,
): {
  cells: ReadonlySet<string>;
  lineCount: number;
  longestLineLength: number;
} {
  // Build a fake cells set with `cellCount` unique entries.
  const cells = new Set<string>();
  for (let i = 0; i < cellCount; i++) cells.add(`fake-${String(i)}`);
  return { cells, lineCount, longestLineLength: longest };
}

describe("scoreSingleClear", () => {
  it("5-clear baseline: 5 * 1 * 1 * 1 = 5", () => {
    expect(scoreSingleClear(clearResult(5, 5, 1), 0, BALANCE)).toBe(5);
  });

  it("6-clear baseline: round(6 * 1.5) = 9", () => {
    expect(scoreSingleClear(clearResult(6, 6, 1), 0, BALANCE)).toBe(9);
  });

  it("7-clear baseline: 7 * 2 = 14", () => {
    expect(scoreSingleClear(clearResult(7, 7, 1), 0, BALANCE)).toBe(14);
  });

  it("8-clear baseline: 8 * 3 = 24", () => {
    expect(scoreSingleClear(clearResult(8, 8, 1), 0, BALANCE)).toBe(24);
  });

  it("9-clear baseline: 9 * 5 = 45", () => {
    expect(scoreSingleClear(clearResult(9, 9, 1), 0, BALANCE)).toBe(45);
  });

  it("intersection bonus when lineCount >= 2: round(9 * 1 * 1.5) = round(13.5) = 14", () => {
    expect(scoreSingleClear(clearResult(9, 5, 2), 0, BALANCE)).toBe(14);
  });

  it("cascade index 1 on a 5-clear: 5 * 1 * 1 * 3 = 15", () => {
    expect(scoreSingleClear(clearResult(5, 5, 1), 1, BALANCE)).toBe(15);
  });

  it("cascade index 2 on a 5-clear: 5 * 1 * 1 * 5 = 25", () => {
    expect(scoreSingleClear(clearResult(5, 5, 1), 2, BALANCE)).toBe(25);
  });

  it("empty result returns 0 (early exit on cells.size === 0)", () => {
    expect(
      scoreSingleClear(
        { cells: new Set<string>(), lineCount: 0, longestLineLength: 0 },
        0,
        BALANCE,
      ),
    ).toBe(0);
  });

  it("unknown length 4 falls back to multiplier 1: 4 * 1 = 4", () => {
    expect(scoreSingleClear(clearResult(4, 4, 1), 0, BALANCE)).toBe(4);
  });

  it("unknown length 10 falls back to multiplier 1: 10 * 1 = 10", () => {
    expect(scoreSingleClear(clearResult(10, 10, 1), 0, BALANCE)).toBe(10);
  });
});

describe("scoreChain", () => {
  it("empty chain returns 0", () => {
    expect(scoreChain([], BALANCE)).toBe(0);
  });

  it("chain of two 5-clears: 5 (index 0) + 15 (index 1) = 20", () => {
    const r = clearResult(5, 5, 1);
    expect(scoreChain([r, r], BALANCE)).toBe(20);
  });

  it("chain equals sum of per-index scoreSingleClear", () => {
    const r = clearResult(5, 5, 1);
    const expected = scoreSingleClear(r, 0, BALANCE) + scoreSingleClear(r, 1, BALANCE);
    expect(scoreChain([r, r], BALANCE)).toBe(expected);
  });

  it("chain of three 5-clears applies cascade indices 0, 1, 2: 5 + 15 + 25 = 45", () => {
    const r = clearResult(5, 5, 1);
    expect(scoreChain([r, r, r], BALANCE)).toBe(45);
  });
});
