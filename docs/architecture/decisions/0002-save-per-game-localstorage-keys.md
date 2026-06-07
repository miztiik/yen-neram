# ADR-0002: Per-game localStorage keys with versioned save schema

**Last Updated**: 2026-06-07
**Status**: Accepted
**Born in**: PR 1 (`chore/scaffolding-and-adrs`)

## Context

The shell hosts multiple games over time; each game persists state independently. A game added in v2 must not collide with v1 games' saves, and a player whose save from yesterday must continue to load today (CLAUDE.md section 11). The persistence layer must work without a backend.

## Decision

One `localStorage` key per game (`yn:game:<slug>`) plus one app-level key (`yn:app`) for cross-game preferences. Each value is JSON carrying a top-level `schema_version: number`. Schema bumps follow CLAUDE.md section 11: additive bumps supply defaults on read; breaking bumps include a read-side migrator in the same commit.

## Rejected alternatives

- **Single blob (`yn:state`) holding all games**: every game change forces a global read-modify-write; namespace isolation lost.
- **IndexedDB**: async API overkill for ~2 KB per game; adds promise plumbing to the entire save path.
- **Cookies**: capped at ~4 KB, sent on every request, wrong tool.
- **Versionless saves**: first schema change becomes a contract break (CLAUDE.md section 11 release blocker).

## Consequences

Adding a game = pick a new slug, write a new schema, ship the writer/reader. Removing a game = optional `localStorage.removeItem('yn:game:<slug>')` cleanup. The save layer in `src/shared/save/` is the single contract surface; per-game save modules live in `src/games/<slug>/save.ts`.

## Reversal cost

Medium. Migrating to IndexedDB is a one-shot read-write at boot per key (~50 lines per game). Migrating to a backend is a much bigger move and would invalidate the entire static-bundle contract.

## See also

- [CLAUDE.md](../../../CLAUDE.md) section 11 (Schema Versioning)
- [../../concepts/save-format.md](../../concepts/save-format.md)
