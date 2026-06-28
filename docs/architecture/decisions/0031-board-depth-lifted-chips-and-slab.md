# ADR-0031: Board depth - lifted-piece shadows + whole-board slab (faux-3D, no library)

**Last Updated**: 2026-06-28
**Status**: Accepted
**Born in**: User feedback - "the board feels too flat - can we make it look to have a 3d effect? make few idea proposals before a PR" (council pass: Jony / Carmack / Palm / Player / Fowler)
**Affects**: `apps/frontend/src/games/5-in-a-row/ui/board-view.css`, `apps/frontend/src/games/5-in-a-row/ui/board-view.ts`, `apps/frontend/src/games/5-in-a-row/index.ts`, `apps/frontend/src/styles/index.css`
**Amends**: ADR-0004 (SVG renderer - which explicitly reserved "gloss, drop-shadow, gradient ... no library needed" for later). Supersedes the informal accent board rim + violet glow (added in an "ADR-0021 polish round" referenced in code comments but never written as a decision file): the slab tray is now the board's single edge, so the rim is removed (see Decision point 4).

## Context

The 9x9 board read as a flat white plane: every cell was `fill: #ffffff` with a
1px lavender hairline, and the theme motifs were flat sprites sitting directly on
that plane. No light direction, no contact shadow, no elevation.

The hard fence is ADR-0004: the renderer is inline SVG + CSS keyframes, **zero
rAF, no Three.js, no WebGL**. So "3D" here means *faux-3D* via SVG natives
(gradients, `clip-path`) and compositor-only CSS (`box-shadow`, `filter:
drop-shadow`) - never a real 3D engine.

The council debated three proposals:

- **A - Lifted Chips**: the board stays a top-down plane; the *pieces* rise off
  it via a contact shadow, plus a subtle per-tile bevel.
- **B - Recessed Tray**: cells become sockets (inner shadow), pieces sit inside
  wells.
- **C - Tabletop Tilt**: `perspective() rotateX()` on the board container.

Convergence (live, on the dev server):

- The **piece contact shadow** is the dominant, theme-agnostic depth cue (Palm:
  the Candy-Crush tactility; Player: the fruit pops, nothing got harder to read).
- The **per-tile bevel gradient was rejected by the user** - a vertical gradient
  per cell reads as shadow *banding* along every grid line ("the board grid
  shadow ... is ugly"). Removed.
- The user then asked to lift the **whole board as one raised panel** (not
  per-cell, which would re-introduce banding). B is therefore also off the table
  (its per-cell inner shadow is the same banding failure mode).
- C (tilt) is deferred: flat sprites become cardboard standees and the far rows
  compress on a phone (Jony / Player).

## Decision

Faux-3D depth from two static, compositor-only cues + one clip fix. No new
dependency, no contract change (no save / level / asset-manifest field touched).

### 1. Lifted pieces - contact shadow on placed motifs

`.yn-motif` gains `filter: drop-shadow(0 2px 2px var(--yn-chip-shadow))`
(`--yn-chip-shadow = rgba(30, 27, 75, 0.3)`, the cool slate-ink family, not a
neutral grey). Placed pieces read as physical chips raised off the board.
Preview ghosts (`.yn-preview-motif`) deliberately get **no** shadow, which widens
the placed-vs-upcoming distinction. The selected state still overrides `filter`
with its halo (ADR-0027), which already carries a contact drop-shadow; the
landing / clearing transforms ride on top, so the shadow scales with the piece
during the bounce - free drop-and-settle weight.

This reuses a technique already shipped and frame-budget-cleared in this file
(the board boundary rim and the selection halo both use `drop-shadow`).

### 2. Whole-board slab - elevation on the wrapper, not the SVG

The board mount wrapper (`boardWrap` in `index.ts`) gains `.yn-board-slab`: a
solid white rounded panel with a three-layer `box-shadow` (tight contact + mid
lift + soft ambient pool - the Material-elevation recipe). The 9x9 board floats
above the violet page as one raised tray.

The shadow lives on the **wrapper div**, NOT the animating SVG. This is the
Carmack constraint: a `box-shadow`/`filter` on the SVG root would re-rasterise
the whole board region on every piece slide / land / clear; on the static wrapper
it is composited **once** and is independent of the board's internal repaints.
Steady-state cost is ~0ms; there is no rAF and no per-cell filter node.

`boardArea` drops `overflow-hidden` so the slab shadow is not clipped, and it
becomes a **size container** (`container-type: size`, class `.yn-board-area`).
The slab is then sized `width: min(100cqw, 100cqh)` capped at 800px with
`aspect-ratio: 1`, i.e. a square the size of the smaller axis of the board area.
Because the SVG board is itself square, a square tray means the grid fills it
edge-to-edge with **no letterbox** on any viewport (measured 0px internal gutter
on both a 374x374 phone board and a 784x784 desktop board); the flex parent
centers that square in the available area. This replaces the earlier
`aspect-square` / `w-full` / `max-h-full` sizing, which produced a wider-than-tall
wrapper (and a white side gutter) whenever the board column was wider than tall.
The white panel background is the tray fill and the "Loading theme..." backdrop
before the SVG paints. `boardArea`'s own size comes from the root grid track, not
its content, so size containment is safe.

### 3. Rounded corners + the corner-clip fix

The slab and the board round by a shared token `--yn-board-radius: 16px` (the
slab wrapper's `border-radius` and the SVG's `clip-path`), so the tray edge and
the grid edge round by the exact same amount.

The board SVG has **filtered children** (the piece shadows), which promotes the
SVG to its own compositing layer. In Chromium a composited child **escapes an
ancestor's `border-radius` + `overflow: hidden` clip** - so the SVG's *square*
corner leaked past the rounded tray corner, painting the lavender grid lines as a
sharp corner poking out (the reported artifact).

Fix: clip the SVG itself with `clip-path: inset(0 round var(--yn-board-radius))`.
`clip-path` clips the element's own composited output reliably, killing the poke
at the source rather than relying on the parent's (bypassed) `overflow:hidden`.
The clip is still required after the rim removal (point 4): the piece-shadow
filters alone are enough to composite the SVG.

### 4. One frame - the redundant accent rim is removed

The board previously carried an in-SVG accent rim (`.yn-board-boundary`: a
rounded `#c4b5fd` stroke + a violet `drop-shadow` glow), added in an informal
"ADR-0021 polish round" to define the board edge back when the grid floated free
on the violet page. With the slab tray now defining that edge, the rim became a
*second* frame inside the tray (tray edge / white gutter / rim) - "a box in a
box" (Jony council, 2026-06-28). The rim + glow are removed; the white slab tray
is the single board edge. This also drops one filtered SVG element (cheaper, and
one less contributor to the compositing behind the clip fix). The 9x9 grid fills
the tray edge-to-edge on the target portrait phone (measured 0px gutter at a
374x374 board); the only residual gutter is the letterbox on a non-square desktop
viewport, where the white tray fills the side gap.

## Consequences

- Zero per-frame cost: both cues are static and composited; the slab shadow never
  re-rasterises during animations because it is on the non-animating wrapper.
- No persisted contract changes (Holy Law #3 / section 11 untouched): no save
  format, level data, or asset-manifest field. Pure presentation.
- Theme-agnostic: depth lives on the board substrate + the piece alpha, so every
  theme (fruits, glyphs, planets, ...) inherits it with no per-asset authoring.
- Bundle: a few CSS rules + 3 tokens; no new dependency (ADR-0004's reservation
  honoured).
- Rejected within this ADR: the per-tile bevel gradient (grid-shadow banding,
  user-rejected); an SVG-root or boundary-rect `drop-shadow` for the slab (it
  re-rasterises during animation and is clipped by the SVG viewBox edge); the
  perspective tilt (Proposal C, deferred).

## Reversal cost

Low. The whole change is CSS + one wrapper class + three tokens (plus deleting
the rim rect + its CSS); reverting is deleting `.yn-board-slab`, the `.yn-motif`
filter, the SVG `clip-path`, and the `boardWrap` class, and restoring the
`.yn-board-boundary` rim. No structural or data-model impact.

## See also

- [0004-renderer-pick-svg.md](0004-renderer-pick-svg.md) (SVG natives reserved for exactly this)
- The removed accent board rim was informal ("ADR-0021 polish round" in code comments; no decision file existed) - this ADR is the formal record of its removal
- [0027-selection-halo-decoupled-from-brand-accent.md](0027-selection-halo-decoupled-from-brand-accent.md) (the selected-piece filter that overrides the base contact shadow)
- [../../../CLAUDE.md](../../../CLAUDE.md) Holy Law #2 (target device / frame budget), section 4 (Tailwind for chrome only)
- `apps/frontend/tests/e2e/board-depth.spec.ts` (the depth + corner-clip regression guard)
