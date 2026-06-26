# ADR-0023: The mode picker is shown on every fresh launch (one-shot replay flag, not a remembered last-mode)

**Last Updated**: 2026-06-26
**Status**: Accepted
**Born in**: Live-site feedback - "the three modes are never shown when I open a game; I can't pick or switch the mode"
**Supersedes**: the last-mode-skip behaviour of ADR-0019, and the Switch-mode-bounces-to-home behaviour of ADR-0019/0020

## Context

5-in-a-Row has three modes (Infinite / Max Points / Timed). The game-host
entry chose the mode like this:

```ts
if (save.in_progress !== null) mode = save.mode;            // resume
else mode = getLastMode() ?? (await showModePicker());     // <- last-mode skip
```

`getLastMode()` read a persistent `localStorage` key written on every launch.
After a player's first game it was always set, so the picker was **never shown
again** on entry - the player was dropped straight into their previous mode.
The only way back to the picker was the Menu's "Switch mode", which (per
ADR-0019/0020) cleared the key and **bounced to the home portal**, forcing the
player to re-tap the game tile to finally see the picker.

Player report: "when I choose what game to play, the three modes are not
displayed" and "there's no exit to choose a different mode; clicking switch
doesn't switch." The remembered-last-mode "instant replay" optimisation was
actively hiding the mode choice the player wanted.

## Decision

Show the picker on **every fresh launch**. Distinguish a "fresh launch" from a
"replay the same mode" reload with a **one-shot flag** instead of a persistent
remembered mode:

- Entry:
  ```ts
  if (save.in_progress !== null) mode = save.mode;          // resume unfinished run
  else { const replay = consumeReplayMode();                // one-shot, see below
         mode = replay ?? (await showModePicker()); }
  ```
- `setReplayMode(mode)` writes a **`sessionStorage`** key; `consumeReplayMode()`
  reads AND clears it (one-shot). It is set immediately before the same-mode
  reloads - **Play Again**, **Restart this game**, **Reset game** - so those
  keep the current mode without re-prompting.
- **Switch mode** now reloads **in place** (wipes `in_progress`, no replay
  flag), so the picker appears right there in the game route - no bounce to the
  portal, no re-tap. The player asked to change the mode, not to leave.
- The picker gains a **"Back to home"** exit so a player who opened it (fresh
  launch or Switch mode) can leave without committing to a mode - important in
  standalone PWA mode where there is no browser back button.

`sessionStorage` (not `localStorage`) is deliberate: the replay intent is
scoped to the current tab session and must NOT survive a real app relaunch - a
genuine relaunch should show the picker. An unfinished `in_progress` run still
resumes straight to its board (progress is never lost); that is the only
silent-skip path that crosses a real relaunch.

The persistent `last-mode` machinery (`getLastMode` / `setLastMode` /
`clearLastMode` + the `yn:game:5-in-a-row:last-mode` key) is removed.

## Resulting launch matrix

| Situation                                   | Result                  |
| ------------------------------------------- | ----------------------- |
| First ever launch / no in-progress run      | Picker                  |
| Unfinished run exists                        | Resume its board        |
| Play Again / Restart / Reset                | Same mode, no picker    |
| Menu -> Switch mode                          | Picker, in place        |
| App relaunch (PWA / new tab) with no run     | Picker                  |

## Rejected alternatives

- **Keep instant-play; only fix "Switch mode" to open the picker in place.**
  Smaller, but it leaves the core complaint unaddressed: tapping a game still
  jumps past the modes. The player explicitly wanted the modes on launch.
- **Always show the picker, even when a run is in progress.** Would force the
  player to re-pick to resume an unfinished game - it discards progress context
  and is the casual-genre anti-pattern (Candy Crush / Angry Birds resume your
  board). Resume must stay silent.
- **A visible in-HUD "mode" dropdown instead of a picker screen.** More chrome
  on the board for a choice made once per run; the full-screen picker already
  exists and reads clearly. Not worth the HUD budget.

## Consequences

The three modes are always reachable: on launch, and via Switch mode in place.
"Play again" / "Restart" stay frictionless (same mode). Reload-survival of an
in-progress run is unchanged (still resumes).

e2e updates: the smoke specs that seeded the old `last-mode` localStorage key
to skip the picker now seed the one-shot `replay-mode` `sessionStorage` key
instead (`shell-smoke`, `game-smoke`, `grid-always-visible`, `perf-check`);
`full-flow` gains a fresh-launch-shows-picker test and a switch-mode-in-place
test, and its seeded-resume tests rely on `in_progress` (no skip seed needed).

## Reversal cost

Moderate. Restore the `last-mode` helpers + the `getLastMode()` entry skip, and
re-point Switch mode at `assetPaths.portal()`. The replay helpers and the
picker's Back-to-home exit can stay (harmless).

## See also

- [0019-cool-slate-score-menu-drawer-hamburger-flame-streak.md](0019-cool-slate-score-menu-drawer-hamburger-flame-streak.md) - introduced the last-mode skip + the Menu drawer.
- [0020-portal-navigation-via-base-url.md](0020-portal-navigation-via-base-url.md) - the `assetPaths.portal()` Switch-mode used to bounce to.
- [0022-manifest-start-url-relative.md](0022-manifest-start-url-relative.md) - shipped together (the "open app lands in the game" half of the same report).
