# Save format

**Last Updated**: 2026-06-29

The save format is the per-game state-persistence contract. Each game writes versioned JSON to `localStorage` under the key `yn:game:<slug>`; app-level preferences live under `yn:app`. Every value carries a top-level `schema_version: number` that the reader inspects before parsing the rest of the payload.

## Storage Keys

- Game state lives under `yn:game:<slug>`.
- App-level preferences live under `yn:app`.
- Game keys are isolated so adding or changing one game does not force a global read-modify-write of every other game.

`localStorage` is the current persistence surface because saves are small and synchronous reads keep boot simple. IndexedDB remains available if a future game needs larger or binary state, but it should not be introduced for the current small game saves.

## Migration rules

- Additive bump: the reader supplies a default for the new field when reading an old save. No write-side migration needed.
- Breaking bump (removed field, type change, semantic shift): the read-side migrator ships in the same commit as the schema change.
- The old reader stays in the codebase for one release after a breaking bump so partially-rolled-out clients still load.
- A player whose save from yesterday no longer loads today is a release blocker (CLAUDE.md section 11).

## See also

- [../../CLAUDE.md](../../CLAUDE.md) section 11 (Schema Versioning)
- [5-in-a-row-gameplay.md](5-in-a-row-gameplay.md)
- `../architecture/save-format/5-in-a-row.md` (deferred; born in PR 4)
