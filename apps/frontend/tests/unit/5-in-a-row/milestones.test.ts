import { describe, expect, it } from "vitest";

import {
  median,
  roundNice,
  deriveMilestones,
  appendCapped,
} from "@/games/5-in-a-row/engine/milestones.js";

// Adaptive-milestone math (ADR-0036). These pure functions are the whole reason
// the targets stay reachable, so the edge cases (cold start, all-zeros, one
// blowout) are pinned here -- they are exactly the cases a naive mean() would
// have gotten wrong.

describe("median", () => {
  it("empty -> 0", () => expect(median([])).toBe(0));
  it("odd length -> middle", () => expect(median([3, 1, 2])).toBe(2));
  it("even length -> mean of the middle two", () => expect(median([1, 2, 3, 4])).toBe(2.5));
  it("robust to one lucky blowout", () => expect(median([100, 110, 120, 130, 9999])).toBe(120));
  it("robust to one disaster", () => expect(median([0, 100, 110, 120, 130])).toBe(110));
});

describe("roundNice", () => {
  it("<= 0 -> 0", () => expect(roundNice(0)).toBe(0));
  it("below 200 -> nearest 10", () => expect(roundNice(123)).toBe(120));
  it("200..499 -> nearest 25", () => expect(roundNice(263)).toBe(275));
  it("500+ -> nearest 50", () => expect(roundNice(640)).toBe(650));
  it("never below the first step", () => expect(roundNice(3)).toBe(10));
});

describe("deriveMilestones", () => {
  const COLD = [40, 80, 140];
  const FRAC = [0.6, 1.0, 1.4];

  it("cold start (no history) -> the cold-start ladder", () => {
    expect(deriveMilestones([], COLD, FRAC)).toEqual([40, 80, 140]);
  });

  it("all-zeros history -> the ladder (never collapses to 0)", () => {
    expect(deriveMilestones([0, 0, 0], COLD, FRAC)).toEqual([40, 80, 140]);
  });

  it("typical history -> rounded fractions of the median", () => {
    // median 200 -> [roundNice(120)=120, roundNice(200)=200, roundNice(280)=275]
    expect(deriveMilestones([200, 200, 200], COLD, FRAC)).toEqual([120, 200, 275]);
  });

  it("floors each threshold at the cold-start rung when the median is low", () => {
    // median 50 -> raw [30, 50, 70] all below the ladder -> floored to [40, 80, 140]
    expect(deriveMilestones([50, 50, 50], COLD, FRAC)).toEqual([40, 80, 140]);
  });

  it("returns ascending, de-duplicated, positive thresholds", () => {
    const r = deriveMilestones([100, 100, 100], COLD, FRAC);
    expect([...r]).toEqual([...r].sort((a, b) => a - b));
    expect(new Set(r).size).toBe(r.length);
    expect(r.every((t) => t > 0)).toBe(true);
  });
});

describe("appendCapped (rolling recent-runs buffer)", () => {
  it("appends newest last", () => expect(appendCapped([1, 2], 3, 5)).toEqual([1, 2, 3]));
  it("trims to the last `cap` entries", () =>
    expect(appendCapped([1, 2, 3], 4, 3)).toEqual([2, 3, 4]));
  it("evicts the oldest at the boundary", () =>
    expect(appendCapped([10, 20, 30, 40, 50], 60, 5)).toEqual([20, 30, 40, 50, 60]));
  it("cap 0 -> empty", () => expect(appendCapped([1, 2], 3, 0)).toEqual([]));
});
