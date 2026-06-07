// Pure derivation of bonus-wave pills from a chain breakdown.
// Per ADR-0017 (reward-loop stacked-wave).
//
// Vocabulary intentionally minimal: LENGTH N (length>=6 only),
// INTERSECT (lineCount>=2 in any step), CASCADE x N (one pill per
// cascade step >= 1). The final +delta badge always rides last.
//
// NO DOM, NO timing. The renderer in `bonus-wave.ts` stages these
// pills with the per-pill animation defined in `board-view.css`.

import type { ClearBreakdown } from "../engine/score.js";

export type BonusPillKind = "length" | "intersect" | "cascade" | "delta";

export type BonusPill = {
  readonly kind: BonusPillKind;
  // Display text. Pre-formatted at derivation time so the renderer is a
  // pure layout job. The U+00D7 multiplication sign is used (never ASCII
  // 'x') per the UI/UX altitude (see ADR-0017, design rationale).
  readonly text: string;
  // True only on the final "+N" badge that flies into the score chip.
  // The renderer reads this to switch from rise-and-fade-up exit to
  // fly-toward-target exit.
  readonly isFinalBadge: boolean;
};

// Format a multiplier value as e.g. "1.5", "2", "5". Trailing-zero strip
// so "x1.5" reads cleaner than "x1.50" and integer multipliers don't show
// a decimal point. Locale-independent (no thousands separators on small
// integers; the scoring engine never produces multipliers > 9).
function formatMult(value: number): string {
  if (Number.isInteger(value)) return String(value);
  // Trim "1.50" -> "1.5", "1.500" -> "1.5".
  return value.toFixed(2).replace(/\.?0+$/, "");
}

export function derivePills(
  breakdowns: readonly ClearBreakdown[],
  totalDelta: number,
): readonly BonusPill[] {
  const pills: BonusPill[] = [];
  for (const b of breakdowns) {
    if (b.points === 0) continue;
    if (b.length >= 6) {
      pills.push({ kind: "length", text: `LENGTH ${String(b.length)}`, isFinalBadge: false });
    }
    if (b.intersection_mult > 1) {
      pills.push({
        kind: "intersect",
        text: `INTERSECT \u00D7${formatMult(b.intersection_mult)}`,
        isFinalBadge: false,
      });
    }
    if (b.cascadeIndex >= 1) {
      pills.push({
        kind: "cascade",
        text: `CASCADE \u00D7${formatMult(b.cascade_mult)}`,
        isFinalBadge: false,
      });
    }
  }
  if (totalDelta > 0) {
    pills.push({ kind: "delta", text: `+${String(totalDelta)}`, isFinalBadge: true });
  }
  return pills;
}

// True when the wave should be SUPPRESSED entirely (tier-1 floor: plain
// length-5 single clear, no bonuses). Reason: the pink cell-splash overlay
// (see board-view.css `.yn-splash`) is already the tier-1 reward; an extra
// "+5" pill on every clear would flatten tiers 2-4. Per Palm's tier ladder
// in ADR-0017.
export function isSilentTier(breakdowns: readonly ClearBreakdown[]): boolean {
  if (breakdowns.length === 0) return true;
  if (breakdowns.length > 1) return false; // any cascade is at least tier-2
  const only = breakdowns[0];
  if (only === undefined) return true;
  return only.length < 6 && only.intersection_mult === 1 && only.cascadeIndex === 0;
}
