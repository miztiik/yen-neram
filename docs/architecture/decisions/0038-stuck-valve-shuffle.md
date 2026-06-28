# ADR-0038: Stuck-valve shuffle (once-per-run board re-colour lifeline)

**Last Updated**: 2026-06-28
**Status**: Accepted
**Born in**: "reaching 500 is very very hard, 1000 almost impossible" + the casual-design council (Palm/Carmack/Fowler) on how to relieve a dead board without a dark pattern
**Affects**: `apps/frontend/src/games/5-in-a-row/{balance.json,balance.schema.ts,index.ts}`, `.../engine/shuffle.ts`, `apps/frontend/src/shared/schemas/5-in-a-row.save.schema.ts`, `apps/frontend/tests/unit/5-in-a-row/shuffle.test.ts`, `apps/frontend/tests/contract/save-shuffle-used.schema.test.ts`

## Context

Late game, the board crowds and the colours bury each other: the player can see
no move that completes a line, and every placement only makes it worse. The
honest casual answer (Palm) is a **lifeline** — a once-per-run "shuffle" that
re-colours the buried board so it is playable again — NOT a timer, a life, or a
pay-to-continue. Carmack's constraint: it must be pure, deterministic, and
reload-safe, so it can never desync the daily golden master or the persisted
spawn stream.

## Decision

`shuffleBoard(board, rng, numRunGroups, minLineLength)` (pure, exported,
unit-tested) re-colours **every filled tile in place** with a fresh seeded draw
(`rng.nextInt(n) + 1`), then sweeps the board once and clears any line the
re-colour happened to complete (so the board comes back ready, not with a
finished-but-unscored line sitting on it). **No score is awarded** — a lifeline
unblocks, it does not earn points.

- **One per run, button only shows when usable.** `index.ts` adds a `↻ Shuffle`
  pill to the bottom bar that is hidden (`display:none`) unless
  `!shuffle_used && !gameOver && fill ratio ≥ balance.shuffle.fullness` (0.6).
  It therefore appears *exactly* when the player is getting buried and vanishes
  once spent or when the board is roomy — zero clutter in normal play.
- **Reload-safe via `shuffle_used`.** An additive, optional boolean on
  `InProgressSchema` (like `rng_cursor`); a mid-game reload keeps the lifeline
  spent (you cannot reload to refresh it). No `schema_version` bump, no
  migration owed.
- **Reproducible.** The re-colour uses the same seeded `state.rng` as spawns, so
  the cursor advances deterministically and survives a reload via the persisted
  `rng_cursor` (ADR-0034). The shuffle never touches the daily golden master:
  it is a player action, not part of board generation.

## Consequences

- A dead board no longer ends a run prematurely; the player gets one honest
  reset, which is exactly the relief the "500 is very hard" feedback asked for —
  without any dark pattern (no lives, no timer, no IAP).
- +6 engine unit tests (positions preserved / valid colours / determinism /
  line-clear sweep / empty board / no input mutation) and +4 save-contract tests
  (round-trip true/false, back-compat undefined, rejects non-boolean). Full
  suite green; daily golden master unchanged (shuffle is not in generation).
- NOT done (deliberately): more than one shuffle per run, a shuffle that scores,
  or an animated re-colour. The `shuffle.fullness` knob is the single tuning
  seam if the "stuck" threshold needs to move.

## See also

- [0034-persist-rng-cursor-and-pin-daily-board.md](0034-persist-rng-cursor-and-pin-daily-board.md) — the `rng_cursor` persistence the re-colour stream rides on, and the golden master it must not disturb.
- [0036-adaptive-milestone-beats.md](0036-adaptive-milestone-beats.md) — the sibling answer to the same "scores feel out of reach" feedback (encourage via adaptive beats; this one relieves the dead board).
- [0018-undo-mobile-picker-jony-palm-polish.md](0018-undo-mobile-picker-jony-palm-polish.md) — the undo lifeline whose bottom-bar pill + once-per-run persistence pattern this mirrors.
