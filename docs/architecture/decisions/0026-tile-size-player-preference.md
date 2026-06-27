# ADR-0026: Tile size is a player preference (Small/Medium/Large); bounce peak scales per tier

**Last Updated**: 2026-06-27
**Status**: Accepted
**Born in**: Player request, 2026-06-27 ("control the size of the
fruits/panels - small medium large ... always conforming to stay within
the boundary and margin within the cell"). Carmack + Palm + Player + Jony
convergence.

## Context

Every theme renders its motif through the same `<image>` element at a
single renderer-owned size. ADR-0017 fixed that size at 75% of the cell
(`MOTIF_SIZE = 30` of `CELL_SIZE = 40`), leaving a 25% margin as headroom
for the shrink/grow bounce keyframes (`yn-land` peak `scale(1.30)`,
`yn-pulse` peak `scale(1.18)`). The safe ceiling is
`CELL_SIZE / MOTIF_SIZE = 1.333`; the land bounce sits right under it.

The 75% number is a compromise that cannot be right for every theme.
Theme art carries very different internal padding inside its own viewBox:
a tropical fruit nearly fills its square, a thin glyph or an origami fold
floats in whitespace. At a fixed 75% cell fill, padded themes read puny
and dense themes read crowded. Player eyesight and device size vary too.

The player asked for a size control with one hard constraint stated up
front: the motif must "stay within the boundary and margin within the
cell." That constraint is exactly the ADR-0017 invariant -- the bounce
must not cross the cell edge and break the always-on grid hairline
(ADR-0004 chrome contract).

## The four-voice convergence

- **Player**: padded themes look tiny, dense themes crowd; let me pick
  Small / Medium / Large, see it change live, and don't change what I
  have today if I never touch it.
- **Jony**: a segmented control (three named steps), not a dropdown or a
  raw-number slider, in the Display section next to the other display
  prefs. Label "Tile size". Updates live.
- **Palm**: it earns its place because theme padding genuinely varies.
  Three steps, not a continuous slider (no fiddling / decision paralysis).
  Default Medium so the never-opens-the-menu player is untouched. Not a
  dark pattern -- pure accommodation.
- **Carmack**: the cell is 40 units, fixed. Today's motif (30) times the
  land bounce (1.30) already exactly fills the cell. So size is NOT a free
  multiplier layered on top of the bounce; each tier is a geometry tuple
  whose `motif * landPeak <= CELL_SIZE`. Bigger tiles must bounce gentler
  -- there is no room to grow past the edge. Keep the keyframe peaks
  data-driven (CSS custom properties) so the renderer stays the single
  source of truth (ADR-0017). Re-issue `width/height/x/y` on existing
  `<image>`s + set two CSS vars; zero structural re-render, no rAF, no
  measurable bytes.

## Decision

### 1. Three tiers, locked to `CELL_SIZE = 40`

`TILE_SIZE_TIERS` in
[board-view.ts](../../../apps/frontend/src/games/5-in-a-row/ui/board-view.ts)
is the single source of truth for the geometry:

| Tier   | motif | % cell | preview | landPeak | pulsePeak | motif x land |
| ------ | :---: | :----: | :-----: | :------: | :-------: | :----------: |
| small  |  25   | 62.5%  |   15    |   1.30   |   1.18    |     32.5     |
| medium |  30   |  75%   |   18    |   1.30   |   1.18    |     39.0     |
| large  |  35   | 87.5%  |   21    |   1.14   |   1.08    |     39.9     |

Every `motif * landPeak <= 40` and `motif * pulsePeak <= 40`. Medium is
byte-for-byte the historical ADR-0017 behaviour, and is `DEFAULT_TILE_SIZE`.

### 2. The bounce peak is part of the tier, pushed to CSS vars

The keyframes `yn-land` and `yn-pulse` read their 50% peak from
`var(--yn-land-peak, 1.3)` / `var(--yn-pulse-peak, 1.18)`. `board-view.ts`
sets those custom properties on the SVG root per active tier via
`applyTierVars`. The medium values are the CSS fallbacks, so the keyframes
are unchanged when the var is unset (back-compat / defence in depth). This
keeps the bounce ceiling computed from the chosen size, never crossing the
cell edge for any tier.

### 3. Live rescale with no structural re-render

`BoardView.setTileSize(tile)` updates the mutable `motifSize`/`previewSize`,
calls `applyTierVars`, and re-issues `width/height/x/y` on every existing
`.yn-motif` and `.yn-preview-motif` via the shared `sizeMotifImage` helper.
The board is not rebuilt. The change is visible the instant the player
picks a tier (the board is still painted behind the dimmed drawer backdrop).

### 4. Persistence (additive, no migration)

`AppPrefsSchema` (the `yn:app` blob) gains an optional
`tile_size: "small" | "medium" | "large"`. Additive + optional, so a pref
blob written before this field shipped parses fine and falls back to
`DEFAULT_TILE_SIZE` at the call site -- no `schema_version` bump and no
read-side migration needed (CLAUDE.md sec 11, additive case). The literal
list is `satisfies`-guarded against the renderer's `TileSize` so the
persisted enum can never drift from the geometry tiers.

### 5. UI: segmented control in the Display section

A new `makeSegmented` helper renders a labelled equal-thirds radio group
(`role="radiogroup"`, each segment `role="radio"` with its label as the
accessible name, keyboard reachable per ADR-0013). Added to the Menu
drawer's Display section after "Preview bounce".

## The honest trade-off (documented, not hidden)

Larger tiles bounce gentler. Large fills 87.5% of the cell but its land
peak is 1.14 (vs 1.30 at Medium), because there is physically no room to
grow a 35-unit motif past the 40-unit cell without crossing the hairline.
This is geometry, not a tunable we can wish away. If a theme still reads
small at Large, the correct fix is trimming the SVG's internal padding (an
asset-pipeline change), not pushing the motif past the cell boundary (a
chrome-contract break that ADR-0017 + ADR-0004 forbid).

We capped Large at 35 (not 36+) specifically to keep a perceptible
+14% land pop. A 90%+ fill would force the land peak below ~1.11, at
which point the signature "juice" of the game (ADR-0017) becomes
imperceptible on a mid-tier Android -- failing CLAUDE.md Holy Law #2.

## Why three steps, not Tiny or Extra Large (and the per-theme question)

This was asked directly during review. The answer has two halves: the
range ceiling is geometry, and the perceived-size variance is per-theme.

### Extra Large is a trap, not a tier

The land-bounce ceiling for a tier is `CELL_SIZE / motif`. As the motif
grows the ceiling falls: at 35 it is 1.143 (we use 1.14), at 38 it is
1.05, at 40 it is exactly 1.00 -- the motif touches the grid hairline at
rest, with zero room to bounce. So an "Extra Large" tier above ~87.5%
would render a big tile whose land/pulse animation is dead or clipped. It
would LOOK like a feature in the menu while silently removing the game's
signature juice (ADR-0017) -- the engineering equivalent of a dark
pattern. Rejected. If a specific theme still reads too small at Large,
the correct fix is trimming that theme's internal art padding (an
asset-pipeline change), not a runtime tier that breaks the bounce
contract for every theme.

### Tiny is geometrically free but deferred on value

A ~50-60% tier (e.g. motif 20) is the opposite of Extra Large: it has
enormous bounce headroom (20 * 1.30 = 26, far inside the cell). It costs
nothing geometrically. It is deferred for two reasons: (1) a half-cell
motif on a 9x9 board reads as lost, with marginal player value; (2) three
steps is the Palm-approved density -- a fourth step invites fiddling for
little gain. Adding Tiny later is a one-line change (one row in
`TILE_SIZE_TIERS`, one value in the persisted enum, one case in the
invariant test), so we hold it under YAGNI until a dense theme or a
playtest actually asks for it.

### Standard control, per-theme ideal setting

The control itself is STANDARD: the same three cell-fractions
(25 / 30 / 35 of 40) apply to every theme; the renderer is the single
source of truth and themes do not declare size (ADR-0017 reaffirmed).

But the *right* setting is effectively per-theme, because perceived size
is not the same as cell fraction. Each motif fills its OWN SVG viewBox
differently -- a fruit may fill 90% of its viewBox while a thin glyph or
an origami fold floats in 50% whitespace. The renderer cannot see inside
the opaque `<image>`, so at a fixed cell fraction the fruit reads chunky
and the glyph reads puny. That per-theme variance is exactly WHY tile
size is a player preference and not a fixed constant: the player uses it
as the manual per-theme compensator (bump a puny theme to Large, drop a
chunky one to Small).

The structural fix for the variance -- so the standard control behaves
uniformly across themes -- is to normalise each motif's internal padding
at the asset-pipeline level (auto-trim the transparent margin in
`tools/` so every motif fills a consistent fraction of its own viewBox).
That touches every theme's art and the pipeline, so it is out of scope
for this runtime control and tracked as a follow-up, not done here.

## Rejected alternatives

- **Free size multiplier on top of the existing 1.30 bounce**: a "large"
  tile at 36 with a 1.30 land peak reaches 46.8 units -- 17% past the cell
  edge. Clips the grid hairline every land. Rejected on the ADR-0017 +
  ADR-0004 chrome contract.
- **Continuous slider (px or %)**: invites fiddling and decision paralysis
  on a casual game; needs clamping logic and a richer persisted type.
  Three named steps are "pick and play" (Palm).
- **Per-theme size in the theme manifest**: re-litigates ADR-0017's
  rejection. Size is now a player axis (per-player), not a per-theme one;
  the manifest stays size-free and the renderer stays the single source
  of truth.
- **Keep a constant 1.30 bounce and only allow shrinking (cap Large at
  the current 75%)**: defeats half the request -- the padded themes that
  motivated this need to grow past 75%, not just shrink.
- **Animate the CSS var itself per frame for a size transition**: custom
  properties are not smoothly animatable without `@property` registration
  and buy nothing here; the attribute re-issue is instant and compositor
  -friendly. Not worth the bytes.

## Consequences

Players tune the motif fill to their theme + eyes in one tap, live, with
the bounce always safely inside the cell. Default behaviour is unchanged
for anyone who never opens the menu. Adding a future theme still needs
zero size work. The bounce ceiling is now data-driven, so a future tier
change is a one-line edit to `TILE_SIZE_TIERS` plus the unit test that
pins the invariant.

## Reversal cost

Low. Remove the `TILE_SIZE_TIERS` table + `setTileSize` + the CSS vars
(keyframes fall back to the medium literals), drop the segmented control,
and leave `tile_size` as an ignored optional field on the pref blob (or
remove it -- additive fields are safe to drop). No save migration.

## See also

- [CLAUDE.md](../../../CLAUDE.md) Holy Law #2 (target device / frame
  budget), Holy Law #6 (no hardcoding), sec 11 (schema versioning)
- [ADR-0017](0017-motif-fills-75-percent-of-cell.md) (the 75% fill +
  bounce-headroom invariant this decision generalises)
- [ADR-0004](0004-renderer-pick-svg.md) (renderer is inline SVG + CSS
  keyframes; the grid is chrome that must not flicker)
- [ADR-0013](0013-basic-a11y-keyboard-and-aria.md) (segmented control is
  keyboard reachable + labelled)
- [ADR-0019](0019-cool-slate-score-menu-drawer-hamburger-flame-streak.md)
  (the Menu drawer that hosts the Display section)
