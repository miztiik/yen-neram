# ADR-0029: Input buffering - replay taps made during the animation lock

**Last Updated**: 2026-06-28
**Status**: Accepted
**Born in**: Player feedback - "on touch, the next move's taps are dropped while the previous move is still animating; the second touch does not register" (council pass: Carmack / Player)
**Affects**: `apps/frontend/src/games/5-in-a-row/index.ts`

## Context

A move is dressed by an animation chain that the move handler `await`s before
releasing input. For a scoring move the chain is long:

- slide trace 150ms + land bounce 200ms
- pre-clear glow 180ms + clear burst 400ms (+ ripple)
- reward wave ~900ms

So `onCellTap` holds `isAnimating = true` for up to ~1.8s, and its first line was
`if (isAnimating) return;` - every tap in that window was **silently dropped**.

On a touch screen the player's instinct is to make the next move WHILE the
current one finishes. A "next move" is two taps - select the source piece, then
tap the destination - and BOTH were rejected by the lock. Reproduced live: a tap
fired mid-animation left no trace (not deferred, just gone), and the game felt
like it "ate" the touch.

Carmack: keep the full lock (serialised moves = zero re-entrancy) but BUFFER the
dropped taps and replay them on settle; a single-slot buffer is wrong because a
completed move nulls `state.selected`, so a lone replayed destination tap
no-ops. Player: remember the ONE last tap and play it the instant the animation
ends - but do not queue five and replay them all ("feels possessed").

## Decision

A small input buffer in the game host:

- While `isAnimating`, `onCellTap(coord)` pushes the coord into `bufferedTaps`
  (a 2-entry sliding window = one move's worth) instead of returning.
- In the move handler's `finally` (after `isAnimating = false`),
  `flushBufferedTaps()` replays the buffered taps through `onCellTap` via
  `queueMicrotask` - never synchronously inside `finally` (that would re-enter
  the move stack and nest unboundedly on a scoring chain).
- Replay re-runs `attemptMove` against the LIVE board, so a destination that is
  now filled / cleared self-revalidates; nothing is cached from the dropped tap.
- The first replayed move re-locks `isAnimating`, so any further replayed taps
  re-buffer - the pipeline stays one move at a time (no flood).
- Replay is discarded when a menu/drawer or the game-over modal is up - those
  taps were not aimed at a live board.

## Consequences

- The player can stage their next move during the celebration; it fires the
  instant the board settles. No dropped touches.
- Full serialisation is preserved (one move animates at a time), so the existing
  move / clear / reward code is unchanged and re-entrancy-free.
- No new persisted state; in-memory only.

## Alternatives rejected

- **Shorten the lock** to just the structural slide+land and let the clear +
  reward wave play non-blocking. Better *feel*, but the wave reads live
  `state.score` + the cleared-cells centroid; a re-entrant move mid-wave
  corrupts the count-up + centroid unless those are snapshotted first (Carmack:
  a separate, larger change). Deferred.
- **Single-slot buffer** (last tap only): wrong - a completed move nulls the
  selection, so a replayed destination tap no-ops (Carmack).
- **Unbounded queue**: a deep replay fires several moves in a burst ("feels
  possessed", Player).

## Tests

`tests/e2e/game-smoke.spec.ts > "a tap made during the move animation is
buffered and replayed (not dropped)"` - selects a source, starts a move, taps a
second piece mid-animation, asserts it is NOT selected mid-animation (lock held)
but IS selected after settle (buffered + replayed).

## See also

- [0017-reward-loop-stacked-wave.md](0017-reward-loop-stacked-wave.md) - the
  reward wave that dominates the lock duration.
- [0030-selectable-clear-styles-and-game-over-ceremony.md](0030-selectable-clear-styles-and-game-over-ceremony.md) - shipped in the same pass.
