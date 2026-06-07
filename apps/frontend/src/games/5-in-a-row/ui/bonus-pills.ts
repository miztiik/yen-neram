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

// Classifier for the tier-1 floor: TRUE when the breakdown chain has no
// LENGTH (length<6), no INTERSECT (lineCount<2), and no CASCADE
// (cascadeIndex<1) pills to emit -- i.e. derivePills would return at most
// the final +delta badge with no named bonuses.
//
// Originally (ADR-0017, 2026-06-07) this gated the bonus-wave OFF for
// tier-1 entirely: the pink cell-splash was treated as the whole tier-1
// reward and no flying +N badge was rendered. That was a misjudgement
// (per the 2026-06-08 amendment): the +N badge is FEEDBACK ("the score
// went up by this much because of this clear"), not just celebration,
// and suppressing it left the score chip ticking up with no visible
// cause. The wave now plays on every scoring clear regardless of tier;
// only the NAMED bonus pills are tier-2-and-above ornaments (which is
// already enforced by derivePills via length>=6, lineCount>=2, and
// cascadeIndex>=1 gates).
//
// The function is kept for any future UI surface that wants to ask
// "would this clear have emitted any named bonus pills?" without
// re-deriving the pill array (e.g. analytics, sound design, an alt
// theme). It is unit-tested as the tier-1 floor definition.
export function isSilentTier(breakdowns: readonly ClearBreakdown[]): boolean {
  if (breakdowns.length === 0) return true;
  if (breakdowns.length > 1) return false; // any cascade is at least tier-2
  const only = breakdowns[0];
  if (only === undefined) return true;
  return only.length < 6 && only.intersection_mult === 1 && only.cascadeIndex === 0;
}
