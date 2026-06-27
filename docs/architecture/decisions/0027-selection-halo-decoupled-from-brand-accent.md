# ADR-0027: Selection halo decoupled from the brand accent (hueless dark lift)

**Last Updated**: 2026-06-27
**Status**: Accepted
**Born in**: Player feedback, 2026-06-27 - the orange glow around a selected
blue-green Earth motif (Planets theme) reads as a colour clash. Jony (UI/UX).
**Amends**: ADR-0025 (which kept `--yn-accent` orange for the "selected-piece
glow"); the selection halo no longer uses the brand accent.

## Context

When a player taps a placed piece to move it, the selected cell's motif gets a
pulsing halo. That halo was hardwired to the global brand accent `--yn-accent`
(`#f97316`, warm orange) - the same colour as the CTA buttons and focus rings
(ADR-0025). The halo had no per-motif or per-theme awareness; it did not know it
was wrapping the Earth.

The motif library spans the whole colour wheel: cool planets (a blue-green
Earth, a slate moon), warm tropical fruits, and any future theme. A single fixed
warm-orange halo clashes with the cool half of that range - the Earth in the
Planets theme reads as orange-wrapped. The theme manifest (schema v2) carries no
per-motif colour; it only has a per-theme dark `background.fill` /
`background.grid`, identical across both shipped themes. So a motif-matched or
theme-matched halo is not derivable from existing metadata.

Two alternatives were considered and rejected:

- **Motif-derived colour**: needs a manifest schema bump (CLAUDE.md section 11)
  plus a hand-authored colour per motif (6 planets, 6 fruits, every future
  theme) - the "hard-coded category-to-colour map that doesn't scale" both
  CLAUDE.md section 6 and Jony's doctrine forbid. Self-defeating too: a halo
  that matches the motif loses contrast against it.
- **Theme-derived colour**: the only colours in schema v2 are the two dark
  background tokens, identical across themes - a near-invisible smudge, not an
  accent. Adding a per-theme accent field is the same schema bump, deferred
  until a theme actually needs it.

## Decision

**The selection halo carries no hue.** Replace the orange glow with a hueless
dark "lift": the piece reads as raised off the white cell, which is exactly the
semantic of "I have picked this up to move it". The selection signal is carried
by the existing 1.18x `yn-pulse` motion (ADR-0017), which is hue-independent and
pops pre-attentively against the ~20 static pieces; hue was decoration, not
signal.

- New renderer token in `index.css`:
  `--yn-select-glow: rgba(15, 23, 42, 0.45)` (slate-900 at 0.45 alpha - the
  `--yn-ink-deep` family already in `:root`).
- One rule changes in `board-view.css` (`.yn-cell-selected .yn-motif`): the
  first `drop-shadow()` swaps `var(--yn-accent)` -> `var(--yn-select-glow)`. The
  grounding `drop-shadow(0 2px 3px rgba(0, 0, 0, 0.2))` is unchanged.
- No manifest, schema, or renderer-logic change. Scales to every future theme
  with zero per-motif authoring.

Why neutral rather than a different hue: **any** single hue clashes with some
motif, because the library spans the whole wheel. Orange clashes the cool
planets today; a blue halo would clash the warm fruits tomorrow. A neutral has
no hue to fight - it is the only colour that survives every theme. This is
"colour is one signal, never the only one" applied literally.

The halo stays on the DARK side: a white/light glow vanishes against the
`#ffffff` cell, so "neutral" here means a soft dark lift, not a white one.

## Consequences

- The orange `--yn-accent` stays the brand accent for the Menu button, focus
  rings, and the reward-loop +N badge (ADR-0025) - only the selection halo is
  decoupled from it.
- Future themes need no per-motif or per-theme glow colour. If a theme ever
  wants a bespoke selection hue, override `--yn-select-glow` in that theme's
  scope - one token, no schema change.
- No test asserts the halo colour (the e2e specs assert the `yn-cell-selected`
  class, not its `filter`), so the contract surface is unchanged.

## See also

- [ADR-0025](0025-app-wide-modern-theme-and-fonts.md) - the modern palette this
  amends (the selected-piece glow no longer uses `--yn-accent`).
- [ADR-0017](0017-motif-fills-75-percent-of-cell.md) - the motif fill + pulse
  that carries the hue-independent selection signal.
- [ADR-0004](0004-renderer-pick-svg.md) - the SVG renderer whose `filter:
drop-shadow()` natives implement the halo.
