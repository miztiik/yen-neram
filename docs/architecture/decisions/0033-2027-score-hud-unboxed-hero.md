# ADR-0033: 2027 score HUD - un-box the hero, demote stats to a line, drop the Next pill

**Last Updated**: 2026-06-28
**Status**: Accepted
**Born in**: Player feedback - "the current score board box is a super ugly white rectangle with black font - reimagine it for a 2027 app" (council: Jony, with Palm on the preview redundancy)
**Affects**: `apps/frontend/src/games/5-in-a-row/index.ts`, `.../ui/board-view.css`, `apps/frontend/src/styles/index.css`
**Amends**: ADR-0019 (cool-slate score chip on a cream pill - the pill is retired), ADR-0017 (the reward-wave delta still flies into the score, now into bare type)

## Context

The top bar was five equal-weight capsules floating on the violet field - score
pill, Best pill, Streak pill, Timer pill, Next pill - a toolbar, not a
hierarchy. Nothing was the hero because everything was a pill, and the cool
slate score number needed a white pill *only because* slate is unreadable on
violet. Flip the relationship - light ink straight on the field - and the pill
becomes unnecessary. The "Next" pill duplicated the on-board ghost previews
(the player was taught to look in two places for one fact).

## Decision

A three-tier hierarchy, only two tiers visible at rest, all chrome (Tailwind +
tokens, zero canvas styling):

### 1. Score = un-boxed hero

Kill the pill: no `bg-yn-tile`, no `border`, no `shadow`, no padding/radius. The
score is `text-7xl sm:text-8xl`, weight **360** (Outfit is a variable face, so
light-and-large is free and reads premium), `tabular-nums`, tracking `-0.02em`,
in a NEW light token `--yn-hud-ink` (`#ede9fe`) - not the slate `--yn-ink-deep`
(tuned for dark-on-white cards). The count-up (`@property --yn-score-count` +
`counter()`) and the celebration glow stay; `yn-score-pop` DROPS its
per-increment colour-flip (a hero number changing colour every tick reads busy)
and keeps scale + a brightness bloom.

### 2. Best / Streak / Timer = one muted stat line

Demoted into a single centred row beneath the score (`min-h` reserved so a stat
appearing causes no layout shift), no pill backgrounds, in `--yn-hud-muted`
(`#c4b5fd`):

- **Best**: tiny `BEST` label + tabular number. On crossing the all-time best it
  is the only stat allowed to shout - tints to `--yn-accent` (text, no pill
  fill) + lifts once (`yn-best-bump` is now a scale + text-shadow, not a pill
  box-shadow ring).
- **Streak**: the flame glyph carries the warmth; the amber pill is dropped.
- **Timer** (timed mode only): mono `mm:ss`; under 10s it gets the HUD's only
  red + `yn-timer-pulse` (the one genuine-urgency signal), clamped under
  reduce-motion.

### 3. Drop the "Next" HUD pill

Removed entirely (the `previewEl`, its label, and `renderNextPips`). The on-board
ghost motifs on the landing cells are the single representation. The "Show next
3 preview" toggle, which previously hid only the redundant pill, now gates the
ON-BOARD ghosts directly (the two `setBoard` sites pass an empty preview when
off) - the toggle finally does what its label says.

### Tokens

`--color-yn-hud-ink` (#ede9fe) and `--color-yn-hud-muted` (#c4b5fd) added to the
Tailwind `@theme` so `text-yn-hud-ink` / `text-yn-hud-muted` utilities exist.
They are HUD-on-violet tokens; a future light theme flips the pair cleanly.
Accent stays `--yn-accent`.

### Layout

The `topBar` restructures from `[score | best | streak | timer | next]`
siblings into a centred column: `hero score` over `stat-line [best streak
timer]`, in both orientations (top block on mobile, left rail on lg). No new
component; timed mode just shows/hides the timer stat.

## Consequences

- "Ugly white rectangle" is fixed by DELETION (the pill) before anything is
  added; net less chrome on a busy 9x9 phone board.
- Verified in the integrated browser: score renders at 72px / weight 360 /
  `#ede9fe` / transparent bg / no border / column layout; no "Next pieces"
  element; zero console errors; 20 e2e (incl. BEST-chip + clear-burst) green.
- The reward-wave delta badge now merges into bare type instead of a pill -
  reads cleaner, no code change to the wave.

## See also

- [ADR-0019](0019-cool-slate-score-menu-drawer-hamburger-flame-streak.md) - the cream-pill score chip this un-boxes.
- [ADR-0017](0017-reward-loop-stacked-wave.md) - the count-up + delta-fly reward loop (preserved).
- [ADR-0025](0025-app-wide-modern-theme-and-fonts.md) - the violet/Outfit modern theme the HUD ink is tuned for.
- [ADR-0032](0032-one-signature-clear-escalates-by-length.md) - shipped in the same 2027-polish pass.
