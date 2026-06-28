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

## Stuck-Valve Shuffle

The stuck-valve shuffle is a once-per-run lifeline for boards that become unproductive. It recolours the board rather than injecting extra score or removing pieces, so the core line-building rules remain intact.

The shuffle is a game-feel valve, not monetisation, lives, or pay-to-skip. It must stay deterministic enough to test from real fixtures.

## Rejected Spawn Experiment

The anti-clump preview nudge was tried and reverted. Preventing monochrome preview triples looked cleaner on paper, but in play it made the game harder in the wrong direction by reducing the concentrated colours that create satisfying clears.

Current rule: spawn concentration is allowed and sometimes desirable. Do not reintroduce anti-clump logic unless a new playtest shows the same failure mode has been solved.

## See also

- [5-in-a-row-board-and-input.md](5-in-a-row-board-and-input.md) - board geometry, input, and movement feedback.
- [5-in-a-row-rewards.md](5-in-a-row-rewards.md) - scoring and reward ceremony.
- [save-format.md](save-format.md) - persisted save shape and migration rules.
- [../how-to/tune-5-in-a-row.md](../how-to/tune-5-in-a-row.md) - procedure for changing game-feel knobs.
