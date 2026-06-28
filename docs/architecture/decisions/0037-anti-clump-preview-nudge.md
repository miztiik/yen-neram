# ADR-0037: Anti-clump preview nudge (no monochrome triple)

**Last Updated**: 2026-06-28
**Status**: Superseded by [ADR-0039](0039-revert-anti-clump-preview-nudge.md) (the nudge shipped a difficulty regression in the harder direction; reverted)
**Born in**: Player feedback ("three of the same colour I don't need, dumped at once - stings") + the spawn-fairness council
**Affects**: `apps/frontend/src/games/5-in-a-row/{balance.json,balance.schema.ts}`, `.../ui/turn-loop.ts`, `apps/frontend/tests/unit/5-in-a-row/preview-anticlump.test.ts`

## Context

The loudest spawn feel-bad the player named was a whole preview coming up ONE
colour ("three useless same colours at once"). The full "anti-streak" the
casual-design council wanted - boosting a colour the player has been STARVED of
for several turns - needs cross-turn spawn-drought state threaded through the
pure turn-loop, which is invasive for a modest (~1-in-15) gain, AND the cheap
approximations are wrong-directioned: weighting by BOARD scarcity actually
DEMOTES the colour you are busy building a line with. So this ADR ships the
clean, correct-directioned LITE version that addresses the player's literal
complaint; deeper spawn-drought is deferred.

## Decision

`avoidMonochromePreview(preview, numRunGroups)` (pure, exported, unit-tested):
if the WHOLE preview is one colour, nudge the LAST item to `(kind % n) + 1` (the
next colour, wrapping). A 2-of-3 preview is left alone - a pair is shruggable; a
clean monochrome sweep is the one that stings. `rollPreview` applies it when the
new `balance.spawn_avoid_triple` knob is on.

- **Deterministic, no extra RNG draw** - the nudge is a post-pass on the already
  drawn colours, so the daily seed stays reproducible and the spawn stream
  length is invariant.
- **Config-gated + golden-master-safe** - `spawn_avoid_triple` is optional on
  `BalanceLike` (fixtures default it OFF), so the pure i.i.d. baseline and the
  ADR-0034 daily golden master are byte-identical; only the live `balance.json`
  (flag on) gets the nudge.

## Consequences

- The rare all-one-colour preview can no longer happen with the flag on; the
  player keeps at least two options in every "Next 3".
- +7 unit tests (nudge / wrap / pair-left-alone / varied / n=1 / single / no
  mutation). Full suite 370 green; golden master unchanged.
- NOT done (deliberately): cross-turn spawn-drought weighting (invasive, modest
  value) and board-scarcity weighting (wrong-directioned). `pickRunGroup` /
  `rollPreview` remain the seam if a richer distribution is ever named.

## See also

- [0034-persist-rng-cursor-and-pin-daily-board.md](0034-persist-rng-cursor-and-pin-daily-board.md) - the golden master this is careful not to disturb (flag-off path); `pickRunGroup` seam.
- [0009-daily-seed-client-derived.md](0009-daily-seed-client-derived.md) - the daily reproducibility the no-extra-draw nudge preserves.
