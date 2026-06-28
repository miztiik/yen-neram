# 5-in-a-Row Rewards

**Last Updated**: 2026-06-28

This document is the living spec for scoring feedback, line clears, milestone beats, and game-over ceremony in 5-in-a-Row.

## Score Feedback

Every scoring clear produces visible cause-and-effect. The score chip count animates, and a +delta badge flies from the clear centroid toward the score. Basic clears stay calm; named bonuses make the delta more vibrant.

Named bonus vocabulary:

- `LENGTH N` for clears longer than the base line length.
- `INTERSECT xN` for intersecting lines.
- `CASCADE xN` for cascade steps.

The current code uses a multiplication sign in UI copy; keep docs ASCII-only and avoid copying that glyph into repository text.

## Clear Ceremony

The signature clear effect escalates by line length. Clear feedback should feel like one coherent effect family, not a picker of unrelated styles.

Per-motif clear burst colour comes from motif metadata or a deterministic motif-aware fallback. The burst uses ring form, size scaling, cascade ripple, and pre-clear glow so the cleared cells remain connected to the reward moment.

## Best And Milestones

The best chip tracks all-time best per mode, not session best. Session best is a tautology in a monotonically increasing score run.

Adaptive milestone beats use recent-run history as a private target. The milestone should not be shown before the player crosses it; the moment is a reward, not a pre-run obligation.

## Game Over

Game-over ceremony has two tiers:

- Normal loss: calm copy that frames the run and, when possible, names the gap to best.
- New best: stronger copy and animation that marks the personal record.

Game-over effects stay compositor-friendly. They should respect reduced motion and must not introduce a runtime animation loop.

## See also

- [5-in-a-row-gameplay.md](5-in-a-row-gameplay.md) - gameplay pacing and modes.
- [5-in-a-row-board-and-input.md](5-in-a-row-board-and-input.md) - board feedback and selection.
- [../how-to/tune-5-in-a-row.md](../how-to/tune-5-in-a-row.md) - safe tuning procedure.
- [../architecture/runtime/perf-budget.md](../architecture/runtime/perf-budget.md) - renderer and animation budget.
