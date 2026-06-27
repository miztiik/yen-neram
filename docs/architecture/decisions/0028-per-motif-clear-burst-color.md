# ADR-0028: Per-motif clear-burst colour + ring form + size-scaled burst + cascade ripple + pre-clear glow

**Last Updated**: 2026-06-27
**Status**: Accepted
**Born in**: Player feedback - "the explosion/disappearance when 5+ line up has a default pink colour irrespective of the theme selected; how do we make this a better gameplay experience?" (council pass: Carmack / Fowler / Jony / Palm / Player)
**Affects**: `apps/frontend/src/games/5-in-a-row/`, `apps/frontend/src/shared/schemas/theme-manifest.schema.ts`, `apps/frontend/public/assets/themes/*/manifest.json`
**Amends**: ADR-0017 (reward-loop) - the clear ceremony gains colour + escalation

## Context

When a line of 5+ identical motifs forms, that line **clears**. The clear was
dressed by a "juice-splash" (an expanding circle per cleared cell) whose fill
was a hardcoded constant:

```ts
const SPLASH_FILL = "rgba(244, 114, 182, 0.5)"; // board-view.ts
```

Every cleared cell fired that same pink, regardless of the selected theme
(planets sit on slate `#0f172a`; the pink clashes) or which motif actually
cleared. The theme manifest carried `background:{fill,grid}` + motif filenames
but **no celebration colour** - so the most important moment, the payoff, was
divorced from the theme. The Player read it as "cheap / a placeholder / like the
game forgot what I was playing".

The council converged: splash colour is *feedback* ("you cleared THESE"), not
decoration (Palm); a theme-blind constant "reads as a bug, not a reward" (Jony);
the fill is paint-once so theming it is **zero per-frame cost** (Carmack); the
colour should flow manifest -> loader -> renderer with a test that asserts it
(Fowler). The user chose the full **per-motif** colour plus four gameplay
upgrades: ring form, size-scaled burst, cascade ripple, and a pre-clear glow.

## Decision

### 1. Per-motif clear-burst colour, sourced from the theme manifest

- New **optional** manifest field `motif_colors`: a `{ "1".."7" -> hex }` map
  keyed by the same run-group as `motifs`. Optional + a loader default makes it
  **additive**: manifests ship in-bundle and old manifests without it still
  validate, so `schema_version` stays **2** (no migration; the player save
  stores only a theme id). Reuses the background hex grammar
  (`#rrggbb` / `#rrggbbaa`).
- `loadTheme` returns `LoadedTheme.motifColors`, every run-group populated:
  a manifest entry where declared, else `DEFAULT_SPLASH_COLOR` (the old pink,
  kept ONLY as the last-resort default, including all fallback paths).
- `BoardViewOptions.motifColors` carries it into the renderer; `setTheme` widens
  to also take the colour map so a live theme-switch repaints the burst colour.
- The splash colour is set per element via the `--yn-splash` custom property
  (CSS `stroke: var(--yn-splash, ...pink...)`), so the `SPLASH_FILL` constant is
  gone from `board-view.ts`.

Shipped colours: planets (earth `#38bdf8`, jupiter `#fb923c`, moon `#cbd5e1`,
neptune `#4f46e5`, sun `#fbbf24`, mars `#ef4444`); tropical-fruits (watermelon
`#f43f5e`, kiwi `#84cc16`, strawberry `#fb7185`, apple `#dc2626`, banana
`#fbbf24`, lemon `#fde047`).

### 2. Engine carries the cleared line's run-group

`LineDetectResult` gains `runGroup` (the cleared line's motif; `0` when no line
forms). `index.ts` builds a `cellKey -> runGroup` map from `outcome.clears` and
hands it to the renderer so each cell bursts in its own colour - for both
move-triggered and spawn-cascade clears.

### 3. Ring form, not a filled disc (Jony)

`.yn-splash` is now `fill: none` + a coloured `stroke`. A stroked circle scaling
0.2 -> peak reads as an expanding **shockwave** (the "burst" verb), same
compositor budget (transform + opacity only), one node per cell.

### 4. Size-scaled burst (Palm)

The splash peak scale grows with the cleared line's length via
`--yn-splash-peak` = `SPLASH_BASE_PEAK x peakScale`, where `peakScale` comes
from `balance.json` `clear.splash_scale_by_length` (5 = 1.0 modest ... 9 = 2.0
real bang). A bigger line bursts bigger - escalation by size, never by colour
(consistent with ADR-0017's size+duration doctrine).

### 5. Cascade ripple (Palm)

A cascade (a spawn that completes a line, or multiple lines) fires its splashes
**staggered** by `clear.cascade_step_ms` in iteration order - a rising ripple
across the cleared cells, the drumroll the bonus pills already promise. The
motif shrink staggers with it. A plain single clear fires all at once.

### 6. Pre-clear glow (Player)

Before a move-triggered clear bursts, the completed line lights up in its own
motif colour for a beat (`clear.preclear_glow_ms`) so the player **sees the line
they made** before it goes (`.yn-cell-preclear-glow`, a transform + coloured
drop-shadow one-shot).

### 7. No hardcoding; reduce-motion respected

All four timings/scales live in `balance.json` `clear.*`. The app reduce-motion
toggle zeroes the glow + ripple (no added latency) from the host; the CSS
`@media (prefers-reduced-motion: reduce)` defangs the glow + splash animations
(colour, which is not motion, survives - the burst just snaps).

## Consequences

- The payoff moment now belongs to the theme: earth bursts blue, watermelon red,
  etc. A theme that omits `motif_colors` degrades gracefully to the historical
  pink, so this is safe to roll out theme-by-theme.
- Adding a new theme SHOULD declare `motif_colors` for its 6 motifs (optional but
  recommended) - one hex per motif, authored by hand (deterministic, no runtime
  canvas sampling, no new deps).
- A future "blend the two lines' colours at an INTERSECT pivot" or a clear
  **sound** (Palm/Player both asked) are deliberately deferred - separate scope.

### Tests

- Unit: `line-detect.test.ts` asserts `runGroup` is carried (and `0` when no line
  clears); `theme-loader.test.ts` asserts `loadTheme` maps each run-group to its
  declared colour and falls back to the default for missing keys / absent
  `motif_colors`.
- Contract: `theme-manifest.test.ts` asserts the schema accepts an optional
  `motif_colors` (and a manifest without it), rejects non-hex values and
  out-of-range keys, and that on-disk `motif_colors` only key declared motifs.
- E2E: `clear-burst.spec.ts` seeds a one-move 5-clear and asserts the splash
  fires in the motif's own colour (`#f43f5e`, not the pink) as a ring
  (`fill: none`) - the test that would have caught the original hardcode.

## See also

- [ADR-0017](0017-reward-loop-stacked-wave.md) - the reward-loop this amends.
- [ADR-0011](0011-svgo-build-time-asset-pipeline.md) - the theme asset pipeline.
- [ADR-0026](0026-tile-size-player-preference.md) and [ADR-0027](0027-selection-halo-decoupled-from-brand-accent.md) - adjacent same-area decisions shipped in parallel; distinct features (do not confuse the ADR numbers).
