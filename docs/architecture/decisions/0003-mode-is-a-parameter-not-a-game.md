# ADR-0003: Mode is a parameter of one game, not a separate game

**Last Updated**: 2026-06-07
**Status**: Accepted
**Born in**: PR 1 (`chore/scaffolding-and-adrs`)

## Context

5-in-a-row ships with two modes at v1 (Infinite + Max-Points). Each mode shares the core verb (tap source, tap destination, BFS pathfind, line-detect 5+, clear, score) but differs in fail-state and presentation. The question is whether each mode is a separate `GameManifest` entry occupying its own portal tile, or whether one tile dispatches into a mode-picker.

## Decision

One game with a `mode` parameter (tagged-union `mode_state`). The portal tile entry-route is `/play/5-in-a-row/` regardless of mode; the mode is picked on first launch (mode-picker screen), persisted in the save, and switchable from the pause drawer.

## Rejected alternatives

- **Three tiles for one game**: bloats the portal and forces the player to read before they play.
- **Mode-picker on every entry**: adds one screen of friction per session, redundant after the first choice.
- **Hard-coded mode per session (no switcher)**: forecloses the player who wants to switch without losing their save.

## Consequences

The board engine is mode-agnostic and pure (no DOM, no mode branching). The mode module owns `mode_state` (timer / target / fail-detect / HUD payload). Adding a mode = new `kind` in the `mode_state` tagged union + new mode module (~50-100 lines). Switching modes mid-game ends the current game with a confirm dialog.

## Reversal cost

Cheap if expanding (adding a third mode is one tagged-union case). Medium if contracting back to "tile per mode" - that's a portal-level UX change requiring 3 tile entries and a save-format migration.

## See also

- [CLAUDE.md](../../../CLAUDE.md) Holy Law #3 (contracts before logic)
- [../../concepts/game-design-5-in-a-row.md](../../concepts/game-design-5-in-a-row.md) (born in PR 6)
