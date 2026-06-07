# ADR-0014: Timed mode + daily-streak; SaveV1 -> SaveV2

**Last Updated**: 2026-06-07
**Status**: Accepted
**Born in**: v2 game-depth pass

## Context

The 2026-06-07 design freeze captured in
[`docs/concepts/multi-game-shell.md`](../../concepts/multi-game-shell.md)
listed three modes for 5-in-a-Row (Infinite, Max-Points, Timed) and
shipped only Infinite + Max-Points at v1. Timed was deferred. Two v2
asks landed together:

1. **Timed mode** - a 60-second clock that gains time on every clear
   (Bejeweled-Blitz loop). This is the most-asked-for casual-game
   verb in the genre and the only one of the three modes that adds a
   genuinely new feel rather than another scoring twist.
2. **Daily-streak counter** - the number of consecutive days the
   player has finished at least one game. Reset on a missed day,
   displayed quietly in the HUD.

Both bend the persisted save shape: Timed needs a new `mode_state`
case carrying `ms_remaining` / `ms_window`, a new `mode` enum value,
and its own `high_scores.timed` bucket; the streak needs a new
optional-shaped top-level field. Per
[`../../../CLAUDE.md`](../../../CLAUDE.md) sec 11, a persisted
contract change ships its read-side migration in the same commit.

The streak question doubles as a non-goals call. The cheap path to
"give players a reason to come back" in any other game is push
notifications, account-backed streaks, streak-saver IAP, or a loud
red "you'll lose your streak" modal. All four are descoped at
project level
([`../../../CLAUDE.md`](../../../CLAUDE.md) sec 0a Non-Goals: no
production backend, no accounts, no push, no monetisation, no
FOMO). The only honest-but-still-effective version of the same
mechanic is a local-date counter that the player can lose without
being shamed.

## Decision

### Schema bump 1 -> 2

`SaveV1Schema` is renamed `SaveV1SchemaLegacy` and kept verbatim.
`SaveV2Schema` is added with three additive changes:

- `schema_version: 2`.
- `mode` enum widens to `["infinite", "max-points", "timed"]`.
- `mode_state` tagged union grows
  `{ kind: "timed", ms_remaining, ms_window }`. `ms_window` is the
  configured starting duration (default 60000ms);
  `ms_remaining` counts down from it and may reach 0 (game-over).
- `high_scores` grows a `timed: TopScoreEntry[]` bucket.
- New top-level `streak: { current, longest, last_played_date } | null`.
  `null` means "never played" so V1 saves migrate by gaining
  `streak: null` + `high_scores.timed: []` with no data loss.

`SaveSchema` aliases `SaveV2Schema` and is the only export new code
should use; `SaveV1SchemaLegacy` exists solely for the migrator.

### V1 -> V2 migrator

`readSave()` in [`apps/frontend/src/games/5-in-a-row/save.ts`](../../../apps/frontend/src/games/5-in-a-row/save.ts)
tries V2 first. On parse failure, if and only if the raw payload
self-declares `schema_version === 1`, it runs `migrateV1ToV2`
(additive: copy V1 fields verbatim, set
`high_scores.timed = []`, `streak = null`, bump version to 2). The
write side is V2-only. A player whose save is from yesterday loads
today without losing high-score history; that contract is enforced
by a new contract test (`readSave V1 -> V2 migration`).

### Timed mode

- `freshModeState("timed")` reads
  `balance.json -> timed.window_ms` (default 60000) and seeds
  `ms_remaining = ms_window`.
- `extendTimeForClear(modeState, longestLineLength)` adds time on a
  clear: 5-line +5000ms, 6-line +10000ms, 7+-line +15000ms. Values
  live in `balance.json -> timed` so balance changes don't touch
  code. Non-timed mode states pass through unchanged.
- `isGameOver(state)` returns true additionally when
  `modeState.kind === "timed" && ms_remaining <= 0`.
- The renderer adds a `setInterval(timerTick, 100)` that decrements
  `ms_remaining`. The tick is paused (early return) while a move is
  animating OR while the settings drawer is open, and the interval
  is actually stopped while the page is hidden (visibilitychange
  listener). The displayed `MM:SS` is updated only at second
  boundaries (coalesced) so `aria-live="polite"` doesn't flood the
  screen reader at 10Hz.
- Time-up shows a minimal game-over modal: final score, Play Again
  primary, Home secondary. No share, no rate, no ads, no
  continue-with-wait, no streak-loss UI - same shape as the v1
  design-freeze game-over modal.

### Daily streak

- `recordPlayedToday(streak, now)` is pure, takes `Streak | null`,
  returns the next `Streak`. Rules:
  - null streak -> `{current: 1, longest: 1, last_played_date: today}`.
  - same-day replay -> unchanged.
  - last-played-date == yesterday -> increment current; longest =
    `max(longest, current + 1)`; update date.
  - any older / non-adjacent date -> reset current to 1; longest
    preserved.
- "Today" and "yesterday" are local-time, derived via the same
  `localDateString` helper that `seedForMode("max-points")` already
  uses. Midnight is the device's, not a server's.
- Streak is persisted on game-over for any mode (infinite,
  max-points, timed). It is displayed in the top bar as a quiet
  `Streak: N` label in muted small text with
  `aria-label="${N}-day streak"`. No popup, no celebration, no
  warning on a missed day.

## Rejected alternatives

- **Server-backed streak.** Violates
  [`../../../CLAUDE.md`](../../../CLAUDE.md) Holy Law 1 (static-first,
  no production backend). Also requires accounts (descoped, sec 0a)
  and cross-device sync (descoped, sec 0a).
- **Streak-saver IAP / pay-to-keep-streak.** Descoped at project
  level (sec 0a Non-Goals: no monetisation, no streak-savers, no
  pay-to-skip). Would be the third dark pattern in a paragraph.
- **Loud streak-loss UI.** Descoped by the v1 design freeze (no
  FOMO, no streak-loss anxiety). A streak that resets quietly is
  still a return hook for players who care; for players who don't,
  it's invisible.
- **Wall-clock time-extends in non-timed modes.** Would conflate
  modes ("why does an infinite-mode 7-clear give me time?"). Time
  extension is a property of the Timed mode-state, gated by the
  discriminator on every read.
- **Re-roll the seed on each Timed game.** Considered; rejected.
  `seedForMode("timed")` returns a fresh random uint32, same as
  Infinite. Daily-seed (the Max-Points pattern) doesn't compose
  well with a 60-second clock because the player can't iterate
  enough to learn the seed.
- **Streak per mode.** Considered; rejected. One streak across all
  modes keeps the field shape simple (one nullable object instead
  of three) and matches the design intent: "did the player open
  the game today", not "did they finish a Timed run today".
- **Increment streak on game-start instead of game-over.** Rejected.
  The dark pattern would be incrementing on app-open (gaming the
  "I played today" signal). game-over is harder to fake and matches
  the literal meaning of "completed a game today".

## Consequences

- **A V1 save from yesterday loads today.** The migrator is run on
  every read that fails V2 parsing; the resulting V2 save is the
  same shape a fresh V2 save would have, minus the absence of any
  pre-V2 fields (there are none to be absent).
- **Engine stays mode-agnostic.** The engine
  (`engine/{board,pathfind,line-detect,score,rng}.ts`) and the
  turn-loop know nothing about timed mode; the renderer drives the
  countdown and applies `extendTimeForClear` after each `attemptMove`
  outcome with a non-empty `clears` list.
- **Bundle impact is small.** No new dep; ~150 lines of TS added
  across schema + modes + index + UI; balance.json gains a four-field
  object. Well under the v1 150KB total budget.
- **Per-second screen-reader announcements** - not per-tick. The
  coalesced `renderTimer` is the difference between "10 polite
  announcements / second" (intolerable) and "1 / second" (matches
  the displayed digit). Per
  [ADR-0013](0013-basic-a11y-keyboard-and-aria.md), basic ARIA
  semantics are in scope; this is one application of that rule.
- **Test count: 172 -> 217**. New contract tests cover the V2
  schema, the V1 -> V2 migration, and the strict-mode rejection of
  a V1 save that includes the V2 streak field. New unit tests
  cover `extendTimeForClear` (every length bracket + non-timed
  pass-through), `recordPlayedToday` (null / same-day / yesterday /
  gap / longest-preservation), and `yesterdayLocal` (including
  month + year rollover).

## Reversal cost

Cheap. To remove Timed: drop the entry from `MODE_CONTRACTS`, remove
the `timed` case from `freshModeState` / `seedForMode` /
`extendTimeForClear`, hide the timer DOM, remove the
`high_scores.timed` slot read in `recordHighScore`. The schema
field can remain dormant (V2 saves with `mode === "timed"` would
fail validation but the player can no longer get into that state).
To remove the streak: drop `renderStreak` from the renderer, remove
the `recordPlayedToday` call from `recordHighScore`; the
`save.streak` field becomes dormant.

A V2 -> V1 downgrade is NOT supported in either direction; per
[`../../../CLAUDE.md`](../../../CLAUDE.md) sec 11, only forward
migration is contracted.

## See also

- [`../../../CLAUDE.md`](../../../CLAUDE.md) sec 0a Non-Goals (no
  backend, no accounts, no push, no monetisation).
- [`../../../CLAUDE.md`](../../../CLAUDE.md) sec 11 Schema
  Versioning - the rule this ADR is implementing.
- [`../../concepts/save-format.md`](../../concepts/save-format.md) -
  the canonical save-format concept doc.
- [0002-save-per-game-localstorage-keys.md](0002-save-per-game-localstorage-keys.md)
  - the `yn:game:<slug>` key scheme this lives under.
- [0003-mode-is-a-parameter-not-a-game.md](0003-mode-is-a-parameter-not-a-game.md)
  - why Timed is a third mode of one game rather than a third tile
  on the portal.
- [0013-basic-a11y-keyboard-and-aria.md](0013-basic-a11y-keyboard-and-aria.md)
  - the basic-ARIA-in scope that the coalesced timer announcement
  rides on.
