# 5-in-a-Row Gameplay

**Last Updated**: 2026-06-30

This document is the living gameplay spec for 5-in-a-Row. It records the current player-facing rules and tuning invariants. Historical experiments stay in git history and old plan-doc ledgers; this file keeps the shape future agents should preserve or deliberately change.

## Modes

5-in-a-Row is one game with mode parameters, not separate games. The shipped modes share the board, movement, scoring, themes, and save contract.

- **Infinite**: relaxed endless play until no legal moves remain.
- **Max Points**: a constrained scoring chase that uses the same rules with a fixed target shape.
- **Timed**: time pressure layered on the same board rules.
- **Daily**: a date-derived seed and pinned board give each local day one repeatable run.

The mode picker appears on every fresh launch. Replay flows may use a one-shot replay flag, but the game does not silently skip the picker because of a remembered last mode.

## Daily And RNG

Daily play derives its seed on the client from the player's local date. There is no backend authority for the day. This matches the static-first production contract and keeps the bundle playable offline.

The RNG cursor is part of the play state. Persisting it prevents reloads from changing future spawns and keeps undo from becoming a reroll. Daily boards are pinned so a mid-game reload resumes the same board, same next preview, and same spawn stream.

## Opening Pace

The opening board plants one same-colour run so the first clear arrives quickly. The goal is not to make the board easier forever; it is to make the first 60 seconds legible and rewarding.

Future spawn tuning should protect this first-clear promise before optimizing for later-game difficulty.

## Spawn Pacing And Placement

Each non-clearing move spawns `spawn_per_turn` tiles (currently 3). Three per turn is the canonical Color Lines pressure: the board fills unless the player keeps making lines, which is the point. Two per turn drained too slowly and the game felt too easy, so the count is locked at three (player call, 2026-06-30). The fairness lever for three-per-turn is the preview, not a softer spawn count.

`preview_count` must be at least `spawn_per_turn`, and is kept EQUAL to it: the next-pieces ghosts promise where every spawned tile will land, so the player plans around the incoming flood instead of being buried by it. Showing fewer ghosts than tiles that land leaves a tile arriving unannounced; showing the full set is what makes three-per-turn read as fair-but-tougher rather than punishing. `BalanceSchema` now rejects `preview_count < spawn_per_turn` at load, because the spawn loop draws straight from the preview queue (`nextPreview.slice(0, spawn_per_turn)`) -- a preview shorter than the spawn count silently clamped spawns to its own length, which was the "spawns 2 not 3" bug.

Spawn cells are not uniform-random: placement is LINE-AWARE (`engine/spawn-weight.ts`). Each candidate empty cell is weighted by the longest same-colour run it would EXTEND across all four axes (horizontal, vertical, and BOTH diagonals). A cell that would complete a clear (extend a `min_line_length - 1` run) is strongly down-weighted - about one-eighth as likely as open ground - and a cell one short of that is mildly down-weighted; anything shorter is freely placeable. The penalty is floored, never zero, so the late-game flood can still occasionally crowd an almost-line (that pressure IS the game), and colour concentration stays possible so deliberate clear clusters survive. The weight is pure board-math and adds no RNG draw, so the per-turn draw count, daily determinism, and the RNG-cursor save contract all hold.

Why line-aware and not just "avoid crowded cells": the earlier weight was density-only (`max(1, 3 - filledOrthogonalNeighbours)`) - it measured how crowded a cell is, not whether it sits on the player's building line, and it was blind to diagonals. A real-engine measurement found it barely helped: a spawn landed next to a 3+ in-progress line about as often as pure chance (roughly 2.1% vs 2.3%), and diagonal lines got essentially no protection. Players felt tiles dropping into the exact gap that completes or blocks their line; the felt problem was real even though the guessed cause ("the spawn is seeded by my last touch") was not - the RNG is one continuous seeded stream and never sees the move. Line-aware placement roughly halves the line-adjacent spawn rate on the boards players actually face and now covers diagonals (council 2026-06-30).

This is cell placement, not colour, so it is distinct from the rejected experiment below.

## Stuck-Valve Shuffle

The stuck-valve shuffle is a once-per-run lifeline for boards that become unproductive. It recolours the board rather than injecting extra score or removing pieces, so the core line-building rules remain intact.

The shuffle is a game-feel valve, not monetisation, lives, or pay-to-skip. It must stay deterministic enough to test from real fixtures.

## Rejected Spawn Experiment

The anti-clump preview nudge was tried and reverted. Preventing monochrome preview triples looked cleaner on paper, but in play it made the game harder in the wrong direction by reducing the concentrated colours that create satisfying clears.

Current rule: spawn colour concentration is allowed and sometimes desirable. Do not reintroduce anti-clump colour logic unless a new playtest shows the same failure mode has been solved. Cell placement bias (above) is the sanctioned anti-frustration lever, because it spreads tiles across the board without touching colour mix.

## What not to try (these break the experience)

Hard-won regressions from spawn placement. Each looked reasonable and hurt the game; do not reintroduce without a playtest proving the failure mode is gone.

- **Do not make spawn placement density-only or orthogonal-only.** Counting filled orthogonal neighbours (`max(1, 3 - filledOrthogonalNeighbours)`) is line-BLIND: the cell that completes your 4-in-a-row scores the same as a cell next to any lone tile, and diagonal lines get no protection at all. Measured, it gave almost no help - a spawn landed next to a 3+ line about as often as pure chance, and players felt tiles dropping into the exact gap that completes or blocks their line. Weight by the longest same-colour run a tile would EXTEND across all four axes instead (`engine/spawn-weight.ts`). (Council 2026-06-30.)
- **Do not ban completing cells (weight 0).** Driving clear-intrusion to ~0% removes the late-game pressure that makes the board tighten - clears become a formality. Floor the weight so an occasional intrusion still happens; a completing cell sits at ~1/8 the weight of open ground, not zero.
- **Do not add an RNG draw inside the spawn weighting.** The weights MUST be a pure, rng-free function of the board, with exactly one `rng.nextInt` per pick. Any extra (or skipped) draw shifts the whole stream and breaks daily determinism and the mid-game `rng_cursor` resume contract. The daily golden master's draw-count guard exists to catch this.
- **Do not fold an abandoned / partial run into `recent_scores`.** It scores artificially low and drags the adaptive-milestone median down, making milestones too easy. The median must represent completed runs (see [5-in-a-row-rewards.md](5-in-a-row-rewards.md)).
- **Do not show fewer preview ghosts than `spawn_per_turn`.** A tile then arrives unannounced; the preview is the fairness lever that makes three-per-turn read as tough-but-fair. `BalanceSchema` rejects `preview_count < spawn_per_turn` for this reason.
- **Do not "seed" spawns from the player's last move.** They are not, and they should not be - the RNG is one continuous seeded stream so daily boards and mid-game resume stay reproducible. Bias placement through the pure board-aware weight, never through the move coordinate.

## See also

- [5-in-a-row-board-and-input.md](5-in-a-row-board-and-input.md) - board geometry, input, and movement feedback.
- [5-in-a-row-rewards.md](5-in-a-row-rewards.md) - scoring and reward ceremony.
- [save-format.md](save-format.md) - persisted save shape and migration rules.
- [../how-to/tune-5-in-a-row.md](../how-to/tune-5-in-a-row.md) - procedure for changing game-feel knobs.
