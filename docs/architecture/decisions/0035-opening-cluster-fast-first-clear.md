# ADR-0035: Opening cluster - plant one same-colour run so the first clear comes fast

**Last Updated**: 2026-06-28
**Status**: Accepted
**Born in**: Casual-design council (Palm, 2026-06-28) - retention improvement #6
**Affects**: `apps/frontend/src/games/5-in-a-row/{balance.json,balance.schema.ts}`, `.../ui/turn-loop.ts`, `apps/frontend/tests/unit/5-in-a-row/daily-golden-master.test.ts`

## Context

The spawn audit found the median casual player's first run can END without a
single clear: 5-in-a-row is a higher bar than match-3's 3, slide-along-a-path is
less self-evident than swap, and a purely random opening rarely puts even two
same-colour tiles adjacent. Genre leaders (Candy Crush, Two Dots) guarantee a
win in the first ~20 seconds; here the verb wasn't legible from the first board.
Palm ranked this the #2 retention lever (after run-milestone beats): "seed the
opening to include one same-colour adjacency cluster so the first clear comes
fast and the move is taught by being playable - no tutorial screen."

## Decision

`seedInitialBoard` plants ONE contiguous same-colour horizontal run of
`opening_cluster_size` tiles (random row, random colour, random fitting start
column - all from the seeded RNG so the daily board stays reproducible) before
filling the remaining seeds at random. The run **counts toward**
`initial_seed_count` (it is not extra tiles), so the board still holds exactly
`initial_seed_count` motifs - the player just opens with a visible near-line to
extend.

- New knob `balance.json opening_cluster_size: 3` (validated by `BalanceSchema`).
  3 is a visible target that teaches extension without dominating the 5-tile
  opening; set it to 0 (or 1) to restore the pure-random opening.
- `BalanceLike.opening_cluster_size` is **optional**, so existing `BalanceLike`
  test fixtures (and the daily golden master) default it OFF and are unchanged -
  the cluster path is covered by its own dedicated tests. `clusterSize < 2`
  takes zero extra RNG draws, so the draw ORDER (pinned by the golden master) is
  identical when the cluster is disabled.

## Consequences

- Every fresh game (incl. the Max-Points daily) now opens with a 3-run, so the
  first clear is reachable within the first minute. The change is one config
  knob - trivially tunable or reversible.
- The cluster consumes 3 RNG draws (colour + row + start-col) before the
  random-fill, so the daily STARTING board differs from the pre-ADR opening -
  but it remains fully reproducible per seed (deterministic), and the golden
  master's pure-random fixture (cluster 0) is untouched.
- +3 unit tests (run-exists, count-invariant, cluster-0 == golden-master path);
  full suite 339 green.

## See also

- [0034-persist-rng-cursor-and-pin-daily-board.md](0034-persist-rng-cursor-and-pin-daily-board.md) - the golden master this is careful not to disturb (cluster-off path).
- [0009-daily-seed-client-derived.md](0009-daily-seed-client-derived.md) - the daily board remains reproducible per seed.
