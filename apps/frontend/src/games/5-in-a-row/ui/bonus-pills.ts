// Pure derivation of bonus-wave pills from a chain breakdown.
// Per ADR-0017 (reward-loop stacked-wave); word pills retired 2026-06-29.
//
// Only the +N delta badge is rendered now -- the readable, real score
// delta. Named bonuses (length/intersect/cascade) become a size+colour
// signal on the badge via `hasNamedBonus`, never a printed word.
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

export function derivePills(
  breakdowns: readonly ClearBreakdown[],
  totalDelta: number,
): readonly BonusPill[] {
  // Player council 2026-06-29: the named word pills (LENGTH/INTERSECT/
  // CASCADE) were a blur nobody could read mid-flight and added no value.
  // The only pill is now the +N badge -- the real, readable delta. Bonus
  // tiers still register via `hasNamedBonus` (drives the vibrant/larger
  // badge), so a multiplier turn looks bigger without printing a word.
  const pills: BonusPill[] = [];
  if (totalDelta > 0) {
    pills.push({ kind: "delta", text: `+${String(totalDelta)}`, isFinalBadge: true });
  }
  return pills;
}

// True when any step earned a named bonus (length>=6, intersection, or a
// cascade depth>=1). Drives the larger/vibrant +N badge -- the bonus signal
// is now size+colour, not a printed word.
export function hasNamedBonus(breakdowns: readonly ClearBreakdown[]): boolean {
  return breakdowns.some((b) => b.length >= 6 || b.intersection_mult > 1 || b.cascadeIndex >= 1);
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
