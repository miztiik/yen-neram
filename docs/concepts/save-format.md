# Save format

**Last Updated**: 2026-06-07

The save format is the per-game state-persistence contract. Each game writes versioned JSON to `localStorage` under the key `yn:game:<slug>`; app-level preferences live under `yn:app`. Every value carries a top-level `schema_version: number` that the reader inspects before parsing the rest of the payload.

## Migration rules

- Additive bump: the reader supplies a default for the new field when reading an old save. No write-side migration needed.
- Breaking bump (removed field, type change, semantic shift): the read-side migrator ships in the same commit as the schema change.
- The old reader stays in the codebase for one release after a breaking bump so partially-rolled-out clients still load.
- A player whose save from yesterday no longer loads today is a release blocker (CLAUDE.md section 11).

## See also

- [../../CLAUDE.md](../../CLAUDE.md) section 11 (Schema Versioning)
- [../architecture/decisions/0002-save-per-game-localstorage-keys.md](../architecture/decisions/0002-save-per-game-localstorage-keys.md)
- [5-in-a-row-gameplay.md](5-in-a-row-gameplay.md)
- `../architecture/save-format/5-in-a-row.md` (deferred; born in PR 4)
