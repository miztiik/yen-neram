# 5-in-a-Row Rewards

**Last Updated**: 2026-06-29

This document is the living spec for scoring feedback, line clears, milestone beats, and game-over ceremony in 5-in-a-Row. The "For players" section is written for anyone; the rest is the engine reference for agents.

## For players: how rewards work

Make a line of 5 or more same-colour tiles and it clears for points. Bigger, fancier clears pay more:

- Longer line, more points. A 5 is the floor; each extra tile is worth more than the last, so a 9 pays much more than five 5s.
- Cross two lines with one tile (an "intersect") and you get a 1.5x bonus on top.
- Chain a clear into another (a "cascade") and the follow-on pays 3x, then 5x - this is skill, you set it up.

What a "cascade" is: when YOUR clear removes tiles, the gap can complete another line, which clears too - the second pays 3x, a third 5x, and so on. You build it by stacking overlapping lines so one clear knocks down the next. Tiles that drop on a non-clearing turn never cascade, so the bonus rewards your setup, not luck.

What an "intersect" is: a single tile that finishes two lines at the same time (a plus or cross shape). Both lines clear together and the whole clear is multiplied by 1.5.

Reading the chip: one big "+N" flies into your score - that is exactly what you earned. The bigger and brighter it is, the more bonuses fired. No tiny words to squint at.

Highest score: there is no total cap - Infinite mode runs until the board fills. A big intersecting clear is worth ~98; a chained cascade stacks higher. Total run score is unlimited.

## Score Values

Points for one cleared step are computed in `engine/score.ts` as:

    points = round(cells * length_mult * intersection_mult * cascade_mult)

- `cells` - number of cells cleared in the step (the union of every line cleared by that placement; shared cells counted once). This is the ONLY size term - points scale with cells cleared, NOT with the length pill shown.
- `length_mult` - keyed on the LONGEST line length, from `length_multipliers` in `balance.json`. Lengths above 9 fall back to 1 (the 9x9 board caps a single line at 9 today - see the bug below for when this fallback bites).
- `intersection_mult` - `intersection_bonus` (1.5) when 2+ lines clear at once, else 1.
- `cascade_mult` - `1 + cascadeIndex * cascade_bonus` (cascade_bonus 2): step 0 = 1, step 1 = 3, step 2 = 5. A cascade is a PLAYER-placed clear whose removal completes a fresh line, which clears at the next step (skill). Random spawns never cascade (always step 0).

Length multipliers (current `balance.json`): 5 -> 1, 6 -> 1.5, 7 -> 2, 8 -> 3, 9 -> 5.

### Single straight line by cascade step

`cells` = `length`, `intersection_mult` = 1. Step 2 (x5) is reachable only by a chained player clear (a clear whose removal completes another line):

| length | length_mult | step 0 (x1) | step 1 (x3) | step 2 (x5) |
| -----: | ----------: | ----------: | ----------: | ----------: |
|      5 |         1   |          5  |         15  |          25 |
|      6 |         1.5 |          9  |         27  |          45 |
|      7 |         2   |         14  |         42  |          70 |
|      8 |         3   |         24  |         72  |         120 |
|      9 |         5   |         45  |        135  |         225 |

### With intersection (2+ lines, x1.5)

`cells` = union size (longest + crossing arm - 1 shared cell). Examples by total cells:

| cells | longest | length_mult | step 0 | step 1 | step 2 |
| ----: | ------: | ----------: | -----: | -----: | -----: |
|     9 |       5 |         1   |     14 |     41 |     68 |
|    13 |       7 |         2   |     39 |    117 |    195 |
|    13 |       8 |         3   |     59 |    176 |    293 |
|    13 |       9 |         5   |     98 |    293 |    488 |

`round(13 * 5 * 1.5 * 5)` = 488 needs a length-9 intersecting clear that chains twice - very rare. A move-clear chains (cascade x3, x5...) when removal completes a new line; random spawns never cascade. Total run score is unbounded. The score chip reserves width for 5 digits.

## Bug: pill said +24 but the score added 10

Cause: NOT the scoring math (the table above is correct, verified by `tests/unit/5-in-a-row/score.test.ts`). The chip min-width was `2.5ch`, sized for ~3 digits; once a run reached 4-5 digits the number overflowed and drifted off-centre. Separately, named word pills (`LENGTH 8`, `INTERSECT`, `CASCADE`) advertised multipliers, not points, so a long-line pill looked like a big number while the real `+N` was smaller and unreadable mid-flight.

Fix: chip width set to `5.5ch`. Word pills retired 2026-06-29 (player council) - only the `+N` badge flies now, larger/brighter when a bonus fired, centroid rounded to whole pixels to kill the blur. The 9999 cap noted earlier was the SAME width issue.

Future watch: `length_mult` falls back to 1 above length 9. Unreachable on the 9x9 board, but extend `length_multipliers` if `board_size` ever grows or a 10+ line silently scores `cells * 1`. Tune everything via `length_multipliers` / `intersection_bonus` / `cascade_bonus` in `balance.json`.

## Score Feedback

Every scoring clear produces visible cause-and-effect. The score chip count animates, and a single `+N` delta badge flies from the clear centroid into the score. A bonus turn (length 6+, intersect, or cascade) shows a larger, vibrant badge; plain clears stay calm. Named word pills were retired 2026-06-29 - unreadable mid-flight, so the bonus signal is size+colour on the `+N`, not text. See `hasNamedBonus` in `ui/bonus-pills.ts`.

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
