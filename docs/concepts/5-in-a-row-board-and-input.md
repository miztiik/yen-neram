# 5-in-a-Row Board And Input

**Last Updated**: 2026-06-29

This document is the living spec for board rendering, piece sizing, selection, and input feel in 5-in-a-Row.

## Renderer Contract

The board is inline SVG with scoped CSS keyframes and transitions. There is no `requestAnimationFrame` loop in the 5-in-a-Row renderer: the board sleeps between discrete input/state events. Tailwind styles the app chrome around the board, not the board internals.

Rejected renderer options remain rejected for the current game shape: plain DOM divs make path tracing awkward, Canvas 2D would require manual hit-testing and redraws, Pixi.js does not earn its bytes for this body count, and Three.js is a 3D engine for a 2D grid.

## Board Geometry

The board is an inline SVG renderer wrapped by a CSS slab. The SVG owns cells, motifs, previews, selection state, and clear effects. The outer DOM chrome owns layout, menu, modals, and HUD.

The current cell grid uses `CELL_SIZE = 40` SVG units. Medium tile size keeps active motifs at 75 percent of a cell (`MOTIF_SIZE = 30`) and previews at 45 percent (`PREVIEW_SIZE = 18`). This leaves animation headroom so selected and landing pieces can scale without crossing cell hairlines.

Tile size is a player preference with Small, Medium, and Large tiers. The invariant is `motifSize * landPeak <= CELL_SIZE`; bigger motifs get gentler bounce peaks.

## Board Depth

The board is visually a slab, not a framed SVG rim. `.yn-board-slab` provides the tray, radius, and static box shadow. Motifs get lifted shadows through SVG/CSS filters. The old `.yn-board-boundary` rim was removed because the slab already frames the board.

The board square should fill the available square container on desktop and mobile. Avoid reintroducing gutters, nested cards around the board, or a second visible frame.

## Selection And Movement

The selected piece uses a hueless dark lift, not a brand-accent halo. This keeps selection readable across motif themes whose dominant colours vary. Selection motion is one-shot: `yn-select-in` scales once and then holds still. Do not reintroduce a perpetual filtered pulse on the motif; it shimmered on mid-tier Android and has been removed twice.

Moves hand the real motif node from source cell to destination cell after the path trace. The renderer should not rebuild all 81 cells between slide and settle. A moved piece settles with a small overshoot; spawned pieces may use the stronger land pop because they genuinely appear from nothing.

Legal movement is orthogonal and path-based: no diagonals and no jumping blocked paths. Illegal moves show both the attempted destination and the adjacent blockers so the player sees why the move failed.

## Touch Input

Tap detection is cell-matched, not pixel-matched. A real finger can drift several pixels during a tap; pointer movement should cancel a long-press preview timer but should not discard a tap if pointerdown and pointerup are in the same cell.

Input during animation lock is buffered when it represents a plausible next tap. The intent is to replay impatient player taps after the animation completes instead of dropping them silently.

## Menu Controls

In-play chrome keeps frequent actions small and direct: undo plus menu. Navigation, restart, mode switching, display preferences, help, scores, reset, and high-score clearing live in the menu drawer.

Undo is one per game. It restores board, score, preview, selection, RNG cursor, and mode state from the pre-move snapshot. Undo availability persists; the in-memory snapshot itself does not survive a reload.

## See also

- [5-in-a-row-gameplay.md](5-in-a-row-gameplay.md) - modes, daily play, and spawn tuning.
- [5-in-a-row-rewards.md](5-in-a-row-rewards.md) - scoring feedback and clear effects.
- [theme-system.md](theme-system.md) - motif art and theme contracts.
- [../architecture/runtime/perf-budget.md](../architecture/runtime/perf-budget.md) - runtime budgets and checks.
- [../reference/ui-contract.md](../reference/ui-contract.md) - keyboard and semantic UI contract.
