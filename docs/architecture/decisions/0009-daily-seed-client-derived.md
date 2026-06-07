# ADR-0009: Daily seed is client-derived from local-time date

**Last Updated**: 2026-06-07
**Status**: Accepted
**Born in**: PR 6 (`feat/5-in-a-row-modes`)

## Context

Max-Points mode wants a daily seed: every player sees the same board sequence
today, a new seed tomorrow. The architecture (CLAUDE.md sec 1 Holy Law 1) is
static-bundle on GitHub Pages, no backend - the seed must be derivable in
the browser with zero server help.

## Decision

Compute the seed as `fnv1a32("5-in-a-row-" + YYYY-MM-DD)` where YYYY-MM-DD
is the player's LOCAL device midnight. Per player wall-clock day; no UTC,
no time-zone library. Implemented in `src/games/5-in-a-row/engine/rng.ts`
(`dailySeed(slug, date)`) and called from `src/games/5-in-a-row/modes/index.ts`
(`seedForMode("max-points")`).

## Rejected alternatives

- **UTC midnight** - canonical but means a player in IST sees "today's"
  seed only after 05:30 local, which is annoying for early-evening play.
- **IST midnight (UTC+5:30 fixed)** - simpler than user-local but assumes
  audience geography; not robust for a generic web app.
- **Precomputed daily-seeds.json shipped in the bundle** - higher quality
  curation possible, but requires a quarterly content drop and adds 1-2 KB
  of asset. Curation cost without server validation is not worth it for v1.
- **Server-issued daily seed** - violates Holy Law #1 (static-first).

## Consequences

A jet-set player can roll the device clock forward to play "tomorrow's"
seed today. For a hobby project with no leaderboards (per design freeze
2026-06-07) the exploit costs nothing. Worst case: the player sees the
same seed twice across timezone boundaries; the high-score record is keyed
by date, so it lands in the right bucket on the relevant local-date row.

The seed function (FNV-1a 32-bit + date string format) is locked - changing
either changes every past day's "today" to a different sequence and breaks
the implicit contract with players who memorised today's seed feel.

## Reversal cost

Cheap. Replacing the seed source is a single function swap. The save
records the `seed_date` per max-points game so historical scores keep
their date context regardless of seed-function changes.

## See also

- [../../../CLAUDE.md](../../../CLAUDE.md) Holy Law 1 (static-first).
- [0003-mode-is-a-parameter-not-a-game.md](0003-mode-is-a-parameter-not-a-game.md).
- `../../../src/games/5-in-a-row/modes/index.ts` (implementation).
