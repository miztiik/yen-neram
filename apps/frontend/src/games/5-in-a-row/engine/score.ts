// Pure scoring. Length-graded + intersection bonus + cascade bonus.
// Per ADR-0003 and design freeze 2026-06-07.

import type { LineDetectResult } from "./line-detect.js";

export type BalanceLike = {
  readonly length_multipliers: Readonly<Record<string, number>>;
  readonly intersection_bonus: number;
  readonly cascade_bonus: number;
};

export function scoreSingleClear(
  result: LineDetectResult,
  cascadeIndex: number,
  balance: BalanceLike,
): number {
  if (result.cells.size === 0) return 0;
  const length_mult = balance.length_multipliers[String(result.longestLineLength)] ?? 1;
  const intersection_mult = result.lineCount >= 2 ? balance.intersection_bonus : 1;
  const cascade_mult = 1 + cascadeIndex * balance.cascade_bonus;
  return Math.round(result.cells.size * length_mult * intersection_mult * cascade_mult);
}

export function scoreChain(chain: readonly LineDetectResult[], balance: BalanceLike): number {
  let total = 0;
  for (let i = 0; i < chain.length; i++) {
    const step = chain[i];
    if (step === undefined) continue;
    total += scoreSingleClear(step, i, balance);
  }
  return total;
}

// Per-step bonus breakdown used by the reward-loop wave (ADR-0017).
// Pure: identical inputs always produce identical breakdown; the wave
// renderer is then free to choose which fields earn an on-screen pill
// (e.g. only render LENGTH N when length >= 6, only render INTERSECT
// when intersection_mult > 1, only render CASCADE when cascadeIndex >= 1).
export type ClearBreakdown = {
  readonly cascadeIndex: number;
  readonly cellCount: number;
  readonly length: number;
  readonly lineCount: number;
  readonly length_mult: number;
  readonly intersection_mult: number;
  readonly cascade_mult: number;
  readonly points: number;
};

export function breakdownClear(
  result: LineDetectResult,
  cascadeIndex: number,
  balance: BalanceLike,
): ClearBreakdown {
  const length_mult = balance.length_multipliers[String(result.longestLineLength)] ?? 1;
  const intersection_mult = result.lineCount >= 2 ? balance.intersection_bonus : 1;
  const cascade_mult = 1 + cascadeIndex * balance.cascade_bonus;
  const points =
    result.cells.size === 0
      ? 0
      : Math.round(result.cells.size * length_mult * intersection_mult * cascade_mult);
  return {
    cascadeIndex,
    cellCount: result.cells.size,
    length: result.longestLineLength,
    lineCount: result.lineCount,
    length_mult,
    intersection_mult,
    cascade_mult,
    points,
  };
}

export function breakdownChain(
  chain: readonly LineDetectResult[],
  balance: BalanceLike,
): readonly ClearBreakdown[] {
  const out: ClearBreakdown[] = [];
  for (let i = 0; i < chain.length; i++) {
    const step = chain[i];
    if (step === undefined) continue;
    out.push(breakdownClear(step, i, balance));
  }
  return out;
}
