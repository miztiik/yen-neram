import { describe, expect, it } from "vitest";
import { scoreChain, scoreSingleClear } from "@/games/5-in-a-row/engine/index.js";
import { breakdownChain, breakdownClear } from "@/games/5-in-a-row/engine/score.js";

const BALANCE = {
  length_multipliers: { "5": 1, "6": 1.5, "7": 2, "8": 3, "9": 5 },
  intersection_bonus: 1.5,
  cascade_bonus: 2,
};

function clearResult(
  cellCount: number,
  longest: number,
  lineCount: number,
  runGroup = 1,
): {
  cells: ReadonlySet<string>;
  lineCount: number;
  longestLineLength: number;
  runGroup: number;
} {
  // Build a fake cells set with `cellCount` unique entries.
  const cells = new Set<string>();
  for (let i = 0; i < cellCount; i++) cells.add(`fake-${String(i)}`);
  return { cells, lineCount, longestLineLength: longest, runGroup };
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
        { cells: new Set<string>(), lineCount: 0, longestLineLength: 0, runGroup: 0 },
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

describe("breakdownClear", () => {
  it("plain 5-clear: identity multipliers, points = scoreSingleClear", () => {
    const r = clearResult(5, 5, 1);
    const b = breakdownClear(r, 0, BALANCE);
    expect(b.length).toBe(5);
    expect(b.lineCount).toBe(1);
    expect(b.cellCount).toBe(5);
    expect(b.length_mult).toBe(1);
    expect(b.intersection_mult).toBe(1);
    expect(b.cascade_mult).toBe(1);
    expect(b.cascadeIndex).toBe(0);
    expect(b.points).toBe(5);
  });

  it("7-clear intersection cascade-1: 7 * 2 * 1.5 * 3 = 63", () => {
    const b = breakdownClear(clearResult(7, 7, 2), 1, BALANCE);
    expect(b.length_mult).toBe(2);
    expect(b.intersection_mult).toBe(1.5);
    expect(b.cascade_mult).toBe(3); // 1 + 1 * 2
    expect(b.points).toBe(63);
  });

  it("9-clear intersection cascade-3: 9 * 5 * 1.5 * 7 = 472.5 -> rounds to 473", () => {
    const b = breakdownClear(clearResult(9, 9, 2), 3, BALANCE);
    expect(b.length_mult).toBe(5);
    expect(b.intersection_mult).toBe(1.5);
    expect(b.cascade_mult).toBe(7); // 1 + 3 * 2
    expect(b.points).toBe(473);
  });

  it("empty result returns zero points and zero counts", () => {
    const empty = { cells: new Set<string>(), lineCount: 0, longestLineLength: 0, runGroup: 0 };
    const b = breakdownClear(empty, 0, BALANCE);
    expect(b.cellCount).toBe(0);
    expect(b.points).toBe(0);
  });

  it("points field is identical to scoreSingleClear for all sample shapes", () => {
    // Parity guarantee: the breakdown helper must never disagree with the
    // existing scoring entry point on the final integer (callers may use
    // both in the same code path; drift would silently flip the score).
    const shapes: ReadonlyArray<readonly [number, number, number, number]> = [
      [5, 5, 1, 0],
      [6, 6, 1, 0],
      [7, 7, 1, 0],
      [8, 8, 1, 0],
      [9, 9, 1, 0],
      [9, 5, 2, 0],
      [5, 5, 1, 1],
      [5, 5, 1, 2],
      [4, 4, 1, 0],
      [10, 10, 1, 0],
      [7, 7, 2, 1],
      [9, 9, 2, 3],
    ];
    for (const [cells, longest, lines, idx] of shapes) {
      const r = clearResult(cells, longest, lines);
      expect(breakdownClear(r, idx, BALANCE).points).toBe(scoreSingleClear(r, idx, BALANCE));
    }
  });
});

describe("breakdownChain", () => {
  it("empty chain returns empty array", () => {
    expect(breakdownChain([], BALANCE)).toEqual([]);
  });

  it("chain order matches input order and cascadeIndex advances", () => {
    const r = clearResult(5, 5, 1);
    const out = breakdownChain([r, r, r], BALANCE);
    expect(out.length).toBe(3);
    const out0 = out[0];
    const out1 = out[1];
    const out2 = out[2];
    if (out0 === undefined || out1 === undefined || out2 === undefined) {
      throw new Error("missing chain step");
    }
    expect(out0.cascadeIndex).toBe(0);
    expect(out1.cascadeIndex).toBe(1);
    expect(out2.cascadeIndex).toBe(2);
    expect(out0.cascade_mult).toBe(1);
    expect(out1.cascade_mult).toBe(3);
    expect(out2.cascade_mult).toBe(5);
  });

  it("chain points sum equals scoreChain", () => {
    const a = clearResult(5, 5, 1);
    const b = clearResult(7, 7, 2);
    const c = clearResult(6, 6, 1);
    const chain = [a, b, c];
    const sum = breakdownChain(chain, BALANCE).reduce((acc, x) => acc + x.points, 0);
    expect(sum).toBe(scoreChain(chain, BALANCE));
  });
});
