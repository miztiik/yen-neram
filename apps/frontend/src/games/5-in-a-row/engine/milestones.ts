// Pure adaptive-milestone math (ADR-0036). No DOM, no save, no UI.
//
// Mid-run the player gets a quiet "you reached N" beat for a sense of progress.
// The targets ADAPT to the player's own recent runs so they stay
// reachable-but-a-stretch: fixed 250/500/1000 proved far too high (500 very
// hard, 1000 near-impossible for the median player). The baseline is the MEDIAN
// (not the mean) of the last N runs -- robust to one lucky blowout AND one
// disaster, which a mean chases. Council 2026-06-28 (Palm / Player / Fowler).
//
// Crucial design rule (Palm's hill): the thresholds are NEVER shown to the
// player before they are crossed -- a milestone seen only at the instant it is
// earned cannot read as "the game lowered the bar because I'm bad", which is
// what makes it safe to let the targets float DOWN after a bad streak.

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

// Round to a "nice" human step so the pop reads as a milestone, not a raw int,
// and is coarse enough that it never looks like it is reacting to one bad game:
// nearest 10 below 200, nearest 25 below 500, nearest 50 at/above 500.
export function roundNice(n: number): number {
  if (n <= 0) return 0;
  const step = n < 200 ? 10 : n < 500 ? 25 : 50;
  return Math.max(step, Math.round(n / step) * step);
}

// Adaptive journey milestones for ONE run, frozen at run start. `recent` is the
// rolling last-N run scores for the CURRENT mode (oldest..newest); `coldStart`
// is the per-mode ladder used while there is no useful history; `fractions` are
// the baseline multipliers (e.g. [0.6, 1.0, 1.4]). Each threshold is floored at
// the matching cold-start rung so a bad streak can never collapse the targets
// to an insulting tiny number. Returns ascending, de-duplicated, positive
// thresholds (a small base can round two fractions to the same step).
export function deriveMilestones(
  recent: readonly number[],
  coldStart: readonly number[],
  fractions: readonly number[],
): readonly number[] {
  const base = recent.length === 0 ? 0 : median(recent);
  const out: number[] = [];
  for (let i = 0; i < fractions.length; i++) {
    const floor = coldStart[i] ?? 0;
    const f = fractions[i] ?? 0;
    const raw = base > 0 ? roundNice(base * f) : floor;
    const t = Math.max(raw, floor);
    if (t > 0) out.push(t);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

// FIFO append with a hard cap: keep the last `cap` entries (newest last). Used
// to roll the recent-runs buffer on each game-over.
export function appendCapped(buf: readonly number[], value: number, cap: number): number[] {
  if (cap <= 0) return [];
  const next = [...buf, value];
  return next.length > cap ? next.slice(next.length - cap) : next;
}
