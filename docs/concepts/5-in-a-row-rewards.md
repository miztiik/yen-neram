# 5-in-a-Row Rewards

**Last Updated**: 2026-06-30

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

### The high end: one turn can clear far more than 9 chips

The worked tables above stop at a single line (max 9 cells) and a small intersect (13 cells), but one turn can clear many more chips. Two engines stack:

- **A single placement completes several lines at once** (an intersect). `cells` is the UNION of every line through the placed cell across the 4 axes, shared cells counted once. A length-9 horizontal and a length-9 vertical sharing the placed cell is already 17 cells; add a length-5 diagonal arm and one placement clears **21 cells** in a single step. This is the realistic high end a packed board produces.
- **A player clear cascades.** After the move-clear removes its cells, the gap can complete another line, which clears at the next cascade tier (x3, then x5...). The turn's total chips is the sum across every step.

So "how much is a 21-chip turn worth" depends on HOW the 21 chips partition across steps and line lengths, because every term is multiplicative. Worked maxima:

| Shape of the 21-chip turn | Per-step points | Turn total |
| --- | --- | --- |
| One length-9 triple-intersect, 21 cells, step 0 | `round(21*5*1.5*1)` = 158 | **158** |
| 13-cell length-9 intersect (step 0) then an 8-cell length-8 line cascades (step 1, x3) | 98 + `round(8*3*1*3)`=72 | **170** |
| 9-cell length-9 line (step 0) then a 7-cell length-7 intersect cascades (x3) then a 5-cell length-5 closes it (x5) | 45 + `round(7*2*1.5*3)`=63 + `round(5*1*1*5)`=25 | **133** (chips 9+7+5=21) |

The ceiling for a fixed chip count is reached by pushing the longest, most-intersecting lines into the deepest cascade step (the x3 / x5 tiers dwarf the length and intersect bonuses), bounded only by what the 9x9 geometry can actually hold. A 21-chip turn realistically lands anywhere from ~105 (flat, no bonuses) to ~250+ (deep cascade of length-9 intersects).

**Yes, intersecting clearances are actively rewarded.** Every step with two or more lines carries the 1.5x `intersection_mult` (verified in `engine/score.ts`: `lineCount >= 2 ? intersection_bonus : 1`). The bonus applies on the move-clear step AND on any cascade step whose first detected line crosses another. Intersect (x1.5) and cascade (x3, x5) multiply together, so the rarest plus-shaped chained clears are worth dramatically more than the chip count alone suggests - which is the intended "skill setup pays off" curve.

## What a clear creates

A scoring clear (a move-clear or a spawn-clear) produces, in order:

1. **Score** - `state.score` rises by the turn's points (engine, synchronous).
2. **Board change** - the cleared cells empty; on a move-clear the cascade chain may empty more.
3. **Clear ceremony** - pre-clear glow + the per-length centroid shockwave/splash on the cleared cells.
4. **The `+N` badge** - one delta badge flies from the cleared-cells centroid into the score chip (larger/brighter when a bonus fired).
5. **Score count-up** - the chip climbs to the new total, with a celebration glow.
6. **Best chip** - climbs in lockstep with the count-up; flips to the "crossed" colourway the frame the running score passes the all-time best.
7. **Milestone toast** - fires the frame the climbing number crosses an adaptive threshold (if any), single-flight so two crossings never stack.
8. **Timed mode only** - a clear extends the clock by the LONGEST cleared line's bonus (`extend_5/6/7plus_ms`); multiple lines in one turn do not stack the time bonus.
9. **Persist** - the in-progress run (board, score, RNG cursor, etc.) is written to `localStorage`.

What a clear does NOT create: a leaderboard entry, a `recent_scores` sample, or a streak update. Those happen when the RUN ends, not per clear - see the lifecycle below.

## When the high score is recorded

The all-time `high_scores[mode]` leaderboard, the `recent_scores` median buffer, and the daily `streak` are committed by one shared path (`commitRun`), at exactly two moments:

- **Game over** (board fills, or the timer hits 0): commits the score, folds it into `recent_scores`, and credits the streak. The game-over modal then reads the just-committed records.
- **Abandon with a score** (Restart / Reset / Switch mode while `score > 0`): commits the score to the leaderboard and credits the streak, but does NOT fold into `recent_scores` (a partial run must not drag the adaptive-milestone median down). This is why a personal best earned mid-run is never lost when the player restarts - the record is banked before the run is discarded (council 2026-06-30).

Mid-run, the live score is written only to the resumable `in_progress` save (a reload resumes it); it is not on the leaderboard until one of the two commit moments above. A score-0 abandon (a misclick restart) records nothing and simply wipes to a fresh board while preserving every cross-run record. `recordPlayedToday` is per-local-day idempotent, so committing on both an abandon and a later game-over the same day never double-counts the streak.

## Bug: pill said +24 but the score added 10

Cause: NOT the scoring math (the table above is correct, verified by `tests/unit/5-in-a-row/score.test.ts`). The chip min-width was `2.5ch`, sized for ~3 digits; once a run reached 4-5 digits the number overflowed and drifted off-centre. Separately, named word pills (`LENGTH 8`, `INTERSECT`, `CASCADE`) advertised multipliers, not points, so a long-line pill looked like a big number while the real `+N` was smaller and unreadable mid-flight.

Fix: chip width set to `5.5ch`. Word pills retired 2026-06-29 (player council) - only the `+N` badge flies now, larger/brighter when a bonus fired, centroid rounded to whole pixels to kill the blur. The 9999 cap noted earlier was the SAME width issue.

Future watch: `length_mult` falls back to 1 above length 9. Unreachable on the 9x9 board, but extend `length_multipliers` if `board_size` ever grows or a 10+ line silently scores `cells * 1`. Tune everything via `length_multipliers` / `intersection_bonus` / `cascade_bonus` in `balance.json`.

## Score Feedback

Every scoring clear produces visible cause-and-effect. The score chip count animates, and a single `+N` delta badge flies from the clear centroid into the score. A bonus turn (length 6+, intersect, or cascade) shows a larger, vibrant badge; plain clears stay calm. Named word pills were retired 2026-06-29 - unreadable mid-flight, so the bonus signal is size+colour on the `+N`, not text. See `hasNamedBonus` in `ui/bonus-pills.ts`.

The reward is one coherent beat. The `+N` badge flies, lands in the chip, and the count-up starts on the landing frame; the BEST chip and any milestone toast are driven BY that count-up (they climb/fire as the number passes their value), not ahead of it. An earlier version updated the best chip and milestone synchronously the instant the move committed - about 0.8s before the score number started moving - so the best chip could read the new total while the score still showed the old one (the "it jumped to 80 but only added 45" report). They are now in lockstep.

The count-up climbs identically on every platform. It is a bounded JS `requestAnimationFrame` tween, not a CSS `@property` transition. The CSS-transition approach interpolated the digits only where `@property <integer>` is supported (Chrome 85+, Safari 16.4+, Firefox 128+) and silently JUMPED to the final value everywhere else - including older Android WebViews, i.e. the mid-tier target device - which is why the animation looked different across phones. The rAF tween is the same everywhere, supersedes itself on a fast next clear, snaps to the final value when the OS "reduce motion" setting is on or the tab is hidden, and writes one custom property on one element (no per-frame layout). It runs only in the post-input cosmetic tail, never in the input path. See [../architecture/runtime/perf-budget.md](../architecture/runtime/perf-budget.md) for the sanctioned-rAF exception.

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

## What not to try (these break the experience)

Hard-won regressions from the reward loop. Each was tried (or shipped) and hurt the player; do not reintroduce them without a playtest proving the failure mode is gone.

- **Do not update the BEST chip or milestone toast ahead of the score count-up.** They must ride the count-up (climb/fire as the running number passes their value). Updating them synchronously at move-commit shows the new total ~0.8s before the score reaches it - the "it says 80 but only added 45" desync. (Council 2026-06-30.)
- **Do not drive the count-up with a CSS `@property` transition.** It interpolates only on Chrome 85+/Safari 16.4+/Firefox 128+ and silently JUMPS on older Android WebViews - i.e. the mid-tier target device - so the animation differs per platform while looking fine on your desktop. Use the bounded rAF tween that snaps on reduce-motion / hidden tab. (Carmack council 2026-06-30; see perf-budget.md sanctioned-rAF exception.)
- **Do not run the reward (flying badge + count-up) inside the input lock.** It blocks the next move for ~1.8s; on a bus that is an uninstall. Keep the cosmetic tail detached - reopen input, flush buffered taps, THEN fire the badge/count-up. Capture the committed score so a fast next move can't corrupt the tween.
- **Do not record the score only at game-over.** A personal best set mid-run is then lost the moment the player taps Restart / Switch mode. Commit through the shared `commitRun` path on abandon-with-score too (leaderboard + streak, but NOT `recent_scores`).
- **Do not let a run boundary wipe `high_scores`, `streak`, or `recent_scores`.** `makeFreshGame` must carry all cross-run records forward; only `in_progress` resets. (ADR-0021 class of bug - it has regressed more than once.)
- **Do not print named word pills** (`LENGTH 8`, `INTERSECT`, `CASCADE`). They are unreadable mid-flight and read as points. The bonus signal is size+colour on the single `+N`.
- **Do not size the score chip for 3 digits.** Combination clears reach 4-5 digits in one run; reserve `5.5ch` so the number never overflows or drifts off-centre.

## See also

- [5-in-a-row-gameplay.md](5-in-a-row-gameplay.md) - gameplay pacing and modes.
- [5-in-a-row-board-and-input.md](5-in-a-row-board-and-input.md) - board feedback and selection.
- [../how-to/tune-5-in-a-row.md](../how-to/tune-5-in-a-row.md) - safe tuning procedure.
- [../architecture/runtime/perf-budget.md](../architecture/runtime/perf-budget.md) - renderer and animation budget.
