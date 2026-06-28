# ADR-0036: Adaptive milestone beats (median of recent runs, never shown before crossed)

**Last Updated**: 2026-06-28
**Status**: Accepted
**Born in**: Player feedback ("500 is very hard, 1000 almost impossible - use better / adaptive thresholds, mean of the last 15 runs, bucket and encourage") + council (Palm / Player / Fowler, 2026-06-28)
**Affects**: `apps/frontend/src/games/5-in-a-row/{index.ts,balance.json,balance.schema.ts}`, `.../engine/{milestones.ts,index.ts}`, `.../ui/board-view.css`, `apps/frontend/src/shared/schemas/5-in-a-row.save.schema.ts`, tests
**Amends**: ADR-0017 (the reward loop gains a quiet mid-run progress beat, distinct from the +N delta wave)

## Context

The retention audit flagged "pressure without progress": the score climbs but
nothing acknowledges the journey. Fixed milestone thresholds (250 / 500 / 1000)
were tried and proved far too high - the median player rarely reaches 500 and
never sees 1000, so the beat that was meant to encourage instead reads as "this
game isn't built for me." The player asked for ADAPTIVE thresholds keyed to
their own recent performance.

## Decision

### 1. Baseline = MEDIAN of the recent runs (not mean)

The player said "mean"; the council recommends **median** and we ship that
deliberately. The exact complaint (500 hard, 1000 impossible) is the signature
of a statistic that chases outliers - one lucky blowout drags a mean upward for
many runs. A median of the last N runs anchors to "a typical run for this player
right now", which is what "beat your usual" should mean. Robust to one blowout
AND one disaster.

### 2. Thresholds, frozen at run start, NEVER shown before crossed

`deriveMilestones(recent[mode], coldStart[mode], fractions)` (pure,
`engine/milestones.ts`) returns 3 journey beats at `[0.6, 1.0, 1.4] x median`,
each rounded to a nice step and FLOORED at a per-mode cold-start rung so a bad
streak can never collapse them to an insulting tiny number. Computed once at
mount (a new run reloads via Play-again, re-deriving with the just-finished run
folded in).

**The hill (Palm, Player agrees): the targets are NEVER shown to the player
before they are crossed.** A milestone seen only at the instant it is earned
cannot read as "the game lowered the bar because I'm bad" - which is the single
rule that makes it safe to let the targets float DOWN. So there is no goalpost
UI, no "halfway" hint; just a quiet pop at the moment of crossing. The all-time
best chip stays the one fixed, visible, only-ever-up aspirational mountain.

### 3. Storage: `recent_scores` - additive, optional, per-mode, capped

`SaveV2Schema` gains `recent_scores?: { infinite/max_points/timed: number[] }`
(`.max(15)`, `.strict()`), appended in the SAME game-over write as `high_scores`
(one atomic transaction, no second key, no torn write). It keeps EVERY finished
run including the bad ones - `high_scores` (top-10) is survivorship-biased and
cannot feed a recent average. Additive-optional => no `schema_version` bump / no
migration (CLAUDE.md sec 11, the `rng_cursor` precedent). `recent_window: 15` is
a balance knob mirrored by the schema's `.max(15)` ceiling. An idempotency latch
(`recordedThisGame`) guards the append so a stray double game-over cannot inject
a phantom run that skews the median.

### 4. UI: a quiet edge toast, one pop per clear

`.yn-milestone-toast` - a light bare number that rises a little and fades just
below the HUD (top 16%), `pointer-events: none` (never steals a tap), distinct
from the reward wave's flying `+N`, never over the board centre (Player: don't
cover the board). Only the HIGHEST newly-crossed threshold pops per move, so a
cascade can't stack toasts. No cheerleader text. Clamped under reduce-motion.

## Consequences

- The median player now gets 1-2 reachable beats per run; a great run earns the
  third; the targets quietly track their level without ever announcing it.
- +24 tests (19 milestone math incl. cold-start / all-zeros / one-blowout /
  eviction; 5 recent_scores contract). Full suite 363 green.
- Browser smoke: a 9-line (45 pts) crossed the empty-history cold-start rung
  (40) and popped "40"; zero console errors.
- Deferred: a "BEST" PB beat (the existing all-time-best chip already owns that
  moment); time-decay / "last 15 days" (YAGNI - the buffer is bare numbers).

## See also

- [0017-reward-loop-stacked-wave.md](0017-reward-loop-stacked-wave.md) - the +N reward wave this complements (and stays visually distinct from).
- [0034-persist-rng-cursor-and-pin-daily-board.md](0034-persist-rng-cursor-and-pin-daily-board.md) - the additive-optional save-field precedent.
- [../../../CLAUDE.md](../../../CLAUDE.md) sec 11 (additive schema), sec 6 (no hardcoded knobs).
