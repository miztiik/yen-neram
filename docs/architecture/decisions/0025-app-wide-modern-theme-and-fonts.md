# ADR-0025: App-wide modern theme + self-hosted Outfit font (warm palette fully retired)

**Last Updated**: 2026-06-26
**Status**: Accepted
**Born in**: Player feedback - "the game page is still super ugly; have a consistent theme; thin modern fonts"
**Supersedes**: the landing-surface-only scoping of ADR-0024 (the modern theme now covers the whole app); completes the override of the warm palette (ADR-0016)

## Context

ADR-0024 modernised the portal but deliberately scoped the violet/white/orange
look to `.yn-portal`, leaving the in-game surface (board, HUD, mode picker,
menu drawer, modals) on the warm peach/terracotta palette. The result was a
jarring split: a modern violet front door opening into a 1970s-warm game. The
player asked for one consistent theme and modern, thin typography.

The chrome is token-driven (`--color-yn-*` Tailwind utilities + `--yn-*` board
renderer vars), and every piece of dark text sits on a light chip/panel - so
the palette can be flipped at the token level, with a handful of targeted
fixes where text sits directly on the page background.

## Decision

**One modern theme, app-wide.** Repoint the shared tokens (in `index.css`) from
warm to modern; the portal, game, picker, and modals all follow:

| token | was (warm) | now (modern) | role |
| --- | --- | --- | --- |
| `--yn-bg-deep` | `#fed7aa` peach | `#4c1d95` violet | page bg fallback |
| `--color-yn-bg` | peach | `#f5f3ff` | small chip bg (timer/next) |
| `--yn-bg-tile` / `--color-yn-tile` | cream | `#ffffff` | cards, bars, chips |
| `--yn-tile-border` / `--color-yn-border` | orange | `#e9d5ff` | soft cool borders |
| `--yn-ink` / `--color-yn-ink` | terracotta | `#1e1b4b` | ink on white |
| `--yn-muted` / `--color-yn-muted` | burnt orange | `#64748b` | secondary ink |
| `--yn-accent` / `--color-yn-accent` | `#ea580c` | `#f97316` | CTA / selected / focus |
| `--yn-grid-line` (new) | (was `--yn-bg-deep`) | `#ede9fe` | 9x9 grid hairline |

- The **violet -> fuchsia gradient + glyph-motif** backdrop (from ADR-0024)
  moves from `.yn-portal` onto `body`, so every route shares it. `.yn-portal`
  and `.yn-board-bg` are now transparent and let it show through.
- **HUD bars go transparent**: the white score / best / next / undo chips and
  the orange Menu button float directly on the violet (consistent with the
  portal), instead of sitting on a cream panel.
- The **9x9 board** stays white cells with a cool violet hairline grid and a
  soft violet boundary glow - a clean white panel floating on the violet.
- A few elements that sit directly on the page bg (mode-picker heading +
  back-link, the loading line, the shell error screens) switch to light text.
- The **orange accent** (`#f97316`) is kept for the Menu button, selected-piece
  glow, focus rings, and the reward-loop +N badge - a warm pop that
  complements the violet and ties back to the portal's orange-pink badges.

**Modern thin typography.** Self-host **Outfit** (geometric variable font,
weights 100-900, OFL) via `@fontsource-variable/outfit`, set as `--font-sans`
so every `font-sans` surface uses it. Heavy weights are dialed back: the score
drops from 900 to 600, headings from bold/black to semibold.

- **`font-display: optional`** (a hand-written `@font-face`, not the package's
  `swap` default). A `swap` reflow under the 4x-CPU + Slow-4G target profile
  ate into the `tap-to-select < 500 ms` budget (perf-check.spec.ts) by
  reflowing all text mid-interaction. `optional` never swaps mid-session: first
  visit may show the system fallback (Segoe UI Variable / SF / Roboto - all
  modern), every later visit uses the cached Outfit. Carmack's frame budget
  wins over first-paint font fidelity.
- Only the **latin** subset woff2 ships (32 KB); the latin-ext face is dropped
  (the UI is ASCII).

## Consequences

- The whole app reads as one modern product. The warm `--yn-*` values are gone
  from `:root` / `@theme`; the only warm survivors are intentional accents
  (orange CTA, amber streak flame, semantic red error flashes).
- `font-display: optional` keeps the throttled tap-to-select test green; the
  font is async and outside the first-playable-frame budget.
- The portal img-less tiles (ADR-0024) plus the token flip required updating
  two e2e assertions: the portal silhouette check now reads the `--yn-mask`
  URL (not an `<img>` src), and the menu-drawer open timeout was relaxed to 5 s
  (cold-preview-server flake, unrelated to the theme).
- Bundle: JS 41.4/50 KB, CSS 9.0/10 KB gzipped, first-playable-frame 51 KB; the
  32 KB font loads async via `optional`.

## Alternatives considered

- **Keep the game warm, only fix the portal** - rejected by the player; the
  split was the complaint.
- **`font-display: swap` + preload** - would keep first-visit Outfit but still
  risks a reflow under Slow-4G if the tap beats the font; `optional` is the
  deterministic perf-safe choice.
- **A second, dark-on-light theme toggle** - out of scope; the player asked for
  one consistent theme, not a theme system.
