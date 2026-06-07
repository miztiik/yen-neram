# ADR-0017: Motifs occupy 75% of the cell, leaving 25% headroom for bounce

**Last Updated**: 2026-06-07
**Status**: Accepted
**Born in**: post-merge to `4a2606d` (grid-always-visible commit on `main`)

## Context

Cells in 5-in-a-Row render through a fixed SVG coordinate space:
`CELL_SIZE = 40` SVG units. Before this decision the active motif size
was `MOTIF_SIZE = 36` (90% of the cell). The selected-piece pulse
keyframe `yn-pulse` reached `scale(1.06)` and the drop-bounce keyframe
`yn-land` reached `scale(1.15)`, which on the previous sizing pushed
the visual peak to `36 * 1.15 = 41.4` SVG units -- past the cell edge.

The overflow expressed as a player-visible problem: fruit tiles
collided with neighbouring cell borders, the grid hairlines (added in
ADR-0004 / commit `4a2606d`) read as broken across animations, and any
attempt to make the bounce more perceptible (deeper pulse, larger
land) made the overflow worse.

Every theme renders motifs through the same `<image>` element produced
by `createMotifImage()` in [board-view.ts](../../../apps/frontend/src/games/5-in-a-row/ui/board-view.ts);
there is no per-theme sizing path. Whatever number `MOTIF_SIZE`
carries applies uniformly to fruits, gemstones, glyphs, origami, and
any future theme.

## Decision

The motif occupies exactly 75% of its cell (`MOTIF_SIZE = 30` of
`CELL_SIZE = 40`), leaving a 5-SVG-unit margin on every side as
declared headroom for shrink/grow bounce animations.

The CSS keyframes in
[board-view.css](../../../apps/frontend/src/games/5-in-a-row/ui/board-view.css)
consume the headroom:

- `yn-pulse` peak `scale(1.18)` -- selected-piece breathing bounce.
- `yn-land` peak `scale(1.30)` -- drop-and-settle bounce when a new
  piece lands.

The safe scale ceiling is `CELL_SIZE / MOTIF_SIZE = 40 / 30 = 1.333`.
Any future keyframe must stay strictly below this number.

`PREVIEW_SIZE` (the next-piece preview rendered inside its target
cell) stays at `16` (40% of the cell). Preview motifs are a different
visual signal -- "this is upcoming, not placed" -- and they intentionally
do not bounce, so they need no headroom budget.

## Applies to all themes

This is the policy reason for landing the decision in
`docs/architecture/decisions/` rather than as a per-theme tweak. Theme
manifests do not declare a render size; the renderer is the single
source of truth. Adding a new theme has zero impact on the 75% rule.

## Rejected alternatives

- **Keep `MOTIF_SIZE = 36` and clamp bounce to `scale(1.1)`**:
  the bounce becomes imperceptible to the median casual player on a
  Snapdragon-6-class device under 4G throttling (CLAUDE.md Holy Law #2).
  Animation was previously dialled to `1.06`/`1.15` for exactly this
  reason and was still hitting the overflow ceiling.
- **Per-theme `MOTIF_SIZE` declared in the theme manifest**: adds a
  schema field, a migration, and an integration test surface for a
  problem the renderer can solve with one constant. Rejected on
  Holy Law #6 (no hardcoding) and CLAUDE.md sec 10 (don't grow the
  schema surface area to fix a render-side concern).
- **Make the motif fill 100% of the cell and animate via `transform`
  on a parent group with negative-margin overlap**: trades a clean
  cell boundary for one that visually leaks during bounce. Rejected
  on Jony-altitude grounds -- the grid is part of the chrome
  (ADR-0004); the chrome must not flicker.

## Consequences

Tiles read as bounded objects sitting inside their cell rather than
filling it. The bounce reads on first frame -- there is enough scale
delta (`1.30` vs `1.0` is a 30% change in area) that even a
mid-tier-Android render can carry the signal. The grid hairlines from
`4a2606d` stay crisp through every animation state. Zero per-theme
work to maintain.

## Reversal cost

Trivial. Two constants (`MOTIF_SIZE` in board-view.ts) and two
keyframe peak values (in board-view.css). No schema impact, no save
migration, no test fixture changes.

## See also

- [CLAUDE.md](../../../CLAUDE.md) Holy Law #2 (target device),
  Holy Law #6 (no hardcoding), sec 10 (don't grow schema surface)
- [ADR-0004](0004-renderer-pick-svg.md) (renderer is inline SVG +
  CSS keyframes)
- commit `4a2606d` (grid-always-visible) -- the chrome contract this
  decision protects
