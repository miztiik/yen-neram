# 5-in-a-Row Gameplay

**Last Updated**: 2026-06-28

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

Each non-clearing move spawns `spawn_per_turn` tiles (currently 2). Two tiles per turn drains slower than the board fills, which keeps mid-game scores reachable; three made skilled lines die before completing.

`preview_count` must equal `spawn_per_turn`: the next-pieces ghosts promise where tiles will land, so showing three ghosts while only two spawn leaves a ghost that never arrives. Keep them in lockstep when tuning.

Spawn cells are not uniform-random. The preview roll and the occupied-cell fallback both bias placement toward emptier neighbourhoods: an empty cell is weighted `5 - filledOrthogonalNeighbours`, so wide-open cells are up to five times likelier than a cell wedged inside the player's pocket. This stops new tiles dropping into the exact gap of an about-to-clear line while plenty of board is free. Concentration stays possible (packed cells are unlikely, not banned), so deliberate clear clusters survive. The draw count is unchanged, so daily determinism and the RNG-cursor save contract hold.

This is cell placement, not colour, so it is distinct from the rejected experiment below.

## Stuck-Valve Shuffle

The stuck-valve shuffle is a once-per-run lifeline for boards that become unproductive. It recolours the board rather than injecting extra score or removing pieces, so the core line-building rules remain intact.

The shuffle is a game-feel valve, not monetisation, lives, or pay-to-skip. It must stay deterministic enough to test from real fixtures.

## Rejected Spawn Experiment

The anti-clump preview nudge was tried and reverted. Preventing monochrome preview triples looked cleaner on paper, but in play it made the game harder in the wrong direction by reducing the concentrated colours that create satisfying clears.

Current rule: spawn colour concentration is allowed and sometimes desirable. Do not reintroduce anti-clump colour logic unless a new playtest shows the same failure mode has been solved. Cell placement bias (above) is the sanctioned anti-frustration lever, because it spreads tiles across the board without touching colour mix.

## See also

- [5-in-a-row-board-and-input.md](5-in-a-row-board-and-input.md) - board geometry, input, and movement feedback.
- [5-in-a-row-rewards.md](5-in-a-row-rewards.md) - scoring and reward ceremony.
- [save-format.md](save-format.md) - persisted save shape and migration rules.
- [../how-to/tune-5-in-a-row.md](../how-to/tune-5-in-a-row.md) - procedure for changing game-feel knobs.
