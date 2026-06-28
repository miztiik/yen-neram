# ADR-0034: Persist the RNG cursor + pin the daily board (determinism & contracts)

**Last Updated**: 2026-06-28
**Status**: Accepted
**Born in**: Determinism/contracts council (Carmack hill + Fowler hill, 2026-06-28) on the spawn system
**Affects**: `apps/frontend/src/games/5-in-a-row/{index.ts,balance.schema.ts,modes/index.ts}`, `.../ui/turn-loop.ts`, `apps/frontend/src/shared/schemas/5-in-a-row.save.schema.ts`, `apps/frontend/tests/{unit/5-in-a-row/daily-golden-master.test.ts,contract/save-rng-cursor.schema.test.ts,contract/balance.schema.test.ts}`
**Amends**: ADR-0009 (corrects its determinism language; pins the seed -> board map)

## Context

The council audit of the spawn system found one real bug and two unhardened
contracts:

1. **Reload rewinds the RNG.** The in-progress save persisted `turn_seed` but
   NOT the live cursor, and resume did `createRng(turn_seed)`. So a mid-game
   reload reset the generator to stream-start while keeping the mid-game board -
   "same seed + same moves => same board" silently broke across any reload, and
   it was a mild reseed-exploit (reload to reshuffle upcoming spawns). The
   fallback "fork" (occupied-cell re-roll) was a nothingburger by comparison
   (spawn positions are already path-dependent; no leaderboard); the RELOAD was
   the real break.
2. **The daily board's reproducibility was asserted but tested by nothing** -
   ADR-0009 said the seed was "locked", inviting refactors that could reorder
   RNG draws and silently change every player's board.
3. **`balance.json` was consumed via `as unknown as ExtendedBalance`** - the
   `schema_version` field was decorative; a typo'd knob became a silent NaN.

## Decision

### 1. Persist `rng_cursor`; resume from it

`InProgressSchema` gains `rng_cursor?: z.number().int()` (SIGNED - the Mulberry32
`| 0` recurrence makes the cursor negative; do not constrain the sign). `persist()`
writes `state.rng.getCursor()`; resume does `createRng(in_progress.rng_cursor ??
turn_seed)`. The cursor IS the full generator state, so this reconstructs the
exact stream position. Additive + optional: a save written before this field
parses fine and falls back to `turn_seed` (the prior behaviour), so **no
`schema_version` bump and no read-side migration are owed** (CLAUDE.md sec 11,
additive case). The undo SNAPSHOT staying in-memory is unchanged; this governs
the MAIN stream.

### 2. Golden-master the daily board

`daily-golden-master.test.ts` pins, against a FIXED inline tuning (so a
legitimate balance edit is not a false alarm): a fixed seed -> exact initial
board + first preview (inline snapshots), reproducibility, seed-divergence, and
`dailySeed("5-in-a-row", 2026-01-01) === 78847860`. A refactor that reorders
engine draws now fails loudly.

### 3. Validate `balance.json` at load

New `balance.schema.ts` parses `balance.json` against a Zod `BalanceSchema`
(`schema_version` asserted) ONCE at module load and exports the typed `balance`.
`index.ts` and `modes/index.ts` consume that instead of `as unknown as`; a
malformed knob now throws at startup (caught by build + the contract test).

### 4. One spawn-draw seam

`pickRunGroup(rng, n)` in `turn-loop.ts` replaces the colour draw duplicated
inline in `rollPreview` + `seedInitialBoard`, giving the draw a single tested
home (and the place a future weighted / anti-streak distribution will live).

### 5. Correct the determinism docs

ADR-0009 amended: "same board sequence" -> "same STARTING board + reproducible
replay along the same line"; the cursor advances on every committed move, not
only on spawn. The misleading "follow-up: would need rng_cursor" comment in
`persist()` is updated.

## Consequences

- Reload now resumes the exact spawn stream; the reseed-exploit is closed.
- +14 tests (5 golden-master, 4 rng_cursor contract, 5 balance contract); full
  suite 336 green.
- `as unknown as` is gone from the balance path; `schema_version` is enforced.
- Deliberately NOT done: de-forking the occupied-cell fallback (nothingburger,
  no leaderboard); persisting the undo snapshot for reload-survival (separate
  follow-up); a difficulty ramp or weighted distribution (no consumer yet -
  `pickRunGroup` is the seam for when one is named).

## See also

- [0009-daily-seed-client-derived.md](0009-daily-seed-client-derived.md) - the daily-seed contract this hardens + corrects.
- [../../../CLAUDE.md](../../../CLAUDE.md) sec 11 (schema versioning - additive case), sec 6 (no hardcoded knobs).
