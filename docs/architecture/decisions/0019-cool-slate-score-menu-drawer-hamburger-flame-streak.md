# ADR-0019: Cool slate score, Menu drawer consolidates navigation, hamburger icon, flame streak chip

**Last Updated**: 2026-06-08
**Status**: Accepted
**Born in**: Player-feedback polish round 4, 2026-06-08 (same day as ADR-0018)

## Context

Four follow-up complaints landed after PR #25 (ADR-0018) merged:

1. **Score number is STILL brown.** ADR-0018 swapped terracotta `#7c2d12` for "espresso" `#1a0a04` -- but `#1a0a04` is still a warm brown (just darker). The player called it out: "no find something now brown for score". Both prior passes were inside the warm-orange palette family; the score never read as the HUD hero.
2. **No way to end the current game and restart.** "Reset game" exists under the Settings drawer's Danger zone, but reads as destructive cleanup, not a normal mid-game intent. There's no friendly "Restart this run" entry surfaced near the player.
3. **Streak chip is "ugly text".** `"3-day streak"` rendered in muted cream pill text reads as a settings field, not the "you showed up again" brag the streak earns.
4. **The Pause button is doing too much** (it opens the whole Settings drawer; the "Pause" label undersells the menu). Player wants an icon-led menu.
5. **No mid-game way to reach the mode picker.** Switch mode lives under the Settings drawer's "Mode" section three rows down; navigationally invisible. The standalone Back button is also confusing -- the player expected ONE consolidated navigation entry point per the modern mobile pattern.

## Decision

### 1. Score colour: cool slate-900 (`#0f172a`)

`--yn-ink-deep` re-pointed from `#1a0a04` (warm espresso brown) to
`#0f172a` (slate-900, cool near-black with blue undertone). The
score digits now sit OUTSIDE the warm-orange palette family; the
contrast against the cream pill is strong but the celebration glow
(warm-accent orange) still pops because warm ON cool is the
classic complementary moment.

Updated in:

- `apps/frontend/src/styles/index.css` (token definition).
- `apps/frontend/src/games/5-in-a-row/ui/board-view.css` `.yn-score-display` (rest colour) + `@keyframes yn-score-pop` (0% and 100% frames).

The rest of the chrome still uses `--yn-ink` (terracotta) for
typographic continuity with the warm palette; only the hero score
glyphs went cool.

### 2. Menu drawer hosts Navigate as its first section

The Settings drawer is renamed to **Menu** (visible heading + `role="dialog"` aria-label). Its first section is **Navigate**, containing three buttons in this fixed order:

1. **Back to home** (relocated from the bottom bar).
2. **Restart this game** (new; same code path as "Reset game" but
   without the destructive confirm -- mid-game restart is a normal
   play action, not destructive cleanup).
3. **Switch mode** (relocated from a buried "Mode" section).

Each Navigate button has a leading SVG icon (home / circular-arrow /
swap), trailing chevron `›`, and stretches full drawer width so it
reads as a navigation row, not a settings toggle.

The existing **Danger zone** keeps "Reset game" + "Clear high
scores" with their destructive-confirm rows. "Reset game" is
preserved here for parity (same code path as Navigate-section
"Restart this game" today; reserved for a future PR that wants
stronger confirm copy).

Action callbacks: `SettingsActions` (kept the old name to avoid
churn) gains `onBackToHome: () => void` + `onRestartGame: () =>
Promise<void> | void`. Wired in `index.ts` to `window.history.back()`
(with `/` fallback when there's no previous entry) and
`writeSave(makeFreshSave(save.mode))` + `window.location.reload()`
respectively.

### 3. Bottom bar refactor: Undo + Menu icon only

The standalone "Back" pill is removed. The text "Pause" button is
replaced by a circular accent-filled button containing an inline
SVG hamburger icon (3-line, 20x20, 2.4px stroke). `aria-label="Open menu"`. Bottom bar is now:

```
[ Undo ]                                    [ ☰ ]
  left                                      right
```

This shrinks the bar to two intents (the only frequent actions during play); everything else routes through Menu.

### 4. Streak chip: warm amber pill + inline-SVG flame + count-led

Was: `"3-day streak"` plain text in muted cream pill -- reads as
settings field. Now:

- New `.yn-streak-chip` class in `board-view.css`: warm linear-gradient pill (`#fef3c7 -> #fed7aa`), amber `#fbbf24` border, terracotta text, soft box-shadow.
- Inline 14x14 SVG flame icon (hand-drawn path, two-stop linear
  gradient amber `#fbbf24 -> #ea580c`, inner highlight at 85%
  opacity). No font, no emoji (CLAUDE.md ASCII-only rule), no
  third-party icon set.
- Count is the hero: 15px bold cool-ink number. The "day streak"
  wording is dropped from the chip face but preserved as the
  `aria-label` for screen readers.

### 5. Bug fix uncovered: Switch mode actually shows the picker now

Pre-existing latent bug: the Switch mode handler in `index.ts`
cleared `yn:app.last_mode` (an unused `AppPrefs` field) but NOT the
actual `yn:game:5-in-a-row:last-mode` localStorage key that
`mode-picker.ts > getLastMode()` reads. The picker was therefore
SKIPPED on re-entry after Switch mode, defeating its purpose.

Fix: new `clearLastMode()` export in `mode-picker.ts` that
`localStorage.removeItem`s the canonical key; called from the
Switch mode handler in `index.ts`. `yn:app.last_mode` is also
cleared for forwards-compat (no current reader, but keeps both
stores honest).

E2e regression in `full-flow.spec.ts > "Menu -> Switch mode bounces to home and the mode picker shows on next entry"` pins the doctrine.

## Trade-offs

- **The Menu icon is accent-filled and visually heavy.** Reasoning:
  it carries Back + Restart + Switch mode + Settings + Help + Scores;
  it earns the weight. The Undo button stays as a ghost pill so the
  hamburger is the primary call to action when no undo is available.
- **Restart skips the destructive confirm.** Reasoning per Palm
  altitude: abandoning a bad run is a normal mid-game play action,
  not destructive cleanup. The Danger-zone "Reset game" with confirm
  stays for parity in case a future PR wants stronger guardrails on
  one path but not the other.
- **The streak chip warm amber breaks chrome monochrome.** The
  streak IS supposed to feel different -- it's the only HUD chip
  that rewards multi-day commitment. The warm amber pulls it OUT of
  the cream-on-orange chrome on purpose. (If this clashes in a
  future theme that isn't warm-palette, the gradient gets re-tokened.)
- **`aria-label` on the Restart Navigate button is just "Restart this game"** -- screen reader users get the same friendly framing as sighted users. The destructive-confirm UX is intentionally NOT replicated on the Navigate version because the action is reversible (the save is wiped, but the player chose it, and the only thing lost is the current run's score which is the WHOLE POINT of clicking Restart).

## Rejected alternatives

- **Self-hosted Archivo ExtraBold subset for score digits**
  (Jony's full prescription from PR #25). Still deferred. With the
  cool-slate colour the system-font 900 + tight tracking already
  delivers the "HUD hero" feeling; a custom font binary blob in
  repo is a separate decision needing explicit sign-off.
- **Pure-black `#000000` for score.** Reads as raw debug-text, not
  designed ink. Slate-900 has just enough cool-tint to belong to a
  designed palette.
- **Replacing Undo with a second icon button.** Undo is mode-
  specific (one per game) -- when disabled, it should READ as
  disabled, not look identical to an enabled icon. The text "Undo"
  + reverse-arrow glyph carries that state better than an icon.
- **Pause overlay separate from Menu drawer.** Two separate
  surfaces (pause + menu) doubles the discoverability problem; the
  drawer ALREADY stops the timer on open via `onClose` lifecycle so
  it IS a pause overlay.
- **Confirm dialog on Restart this game.** Adds friction to an
  intent the player already articulated by tapping a button labelled
  "Restart this game"; the destructive-confirm pattern earns its
  place only when the action is non-reversible across sessions.

## See also

- [docs/architecture/decisions/0018-undo-mobile-picker-jony-palm-polish.md](0018-undo-mobile-picker-jony-palm-polish.md) -- the prior polish round; this ADR's score-colour decision SUPERSEDES section 3 of ADR-0018 (the espresso `#1a0a04` choice).
- [apps/frontend/src/games/5-in-a-row/ui/settings-drawer.ts](../../../apps/frontend/src/games/5-in-a-row/ui/settings-drawer.ts) -- the Navigate section + the Menu rename.
- [apps/frontend/src/games/5-in-a-row/ui/mode-picker.ts](../../../apps/frontend/src/games/5-in-a-row/ui/mode-picker.ts) -- the new `clearLastMode()` export.
- [apps/frontend/src/games/5-in-a-row/index.ts](../../../apps/frontend/src/games/5-in-a-row/index.ts) -- the bottom-bar refactor, streak-chip SVG flame, Menu click handler wiring `onBackToHome` + `onRestartGame`.
- [apps/frontend/src/games/5-in-a-row/ui/board-view.css](../../../apps/frontend/src/games/5-in-a-row/ui/board-view.css) -- the streak-chip styles + cool-slate ink.
- [apps/frontend/tests/e2e/full-flow.spec.ts](../../../apps/frontend/tests/e2e/full-flow.spec.ts) -- new e2e for Menu Navigate section presence + Restart wipes save + Switch mode shows picker on re-entry.
