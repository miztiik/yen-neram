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
