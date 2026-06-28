# Motif silhouette sketches

**Last Updated**: 2026-06-07

Design-review artefact. Five candidate silhouette sets + 5 placeholder tiles for the Yen-Neram portal. User picks one motif set during review of PR 2 (per [TODO/2026-06-07-v1-shell-and-5-in-a-row.md](../../TODO/2026-06-07-v1-shell-and-5-in-a-row.md)).

These SVGs are NOT production assets. They live here intentionally - outside `assets/` - so the build pipeline does not see them and the user can review without engineering scaffolding. On pick, the chosen set moves to `apps/frontend/public/assets/themes/<theme-id>/` and goes through the theme asset pipeline.

## How to review

Open [index.html](index.html) in any browser (double-click works; no server needed). Each set is rendered at:

- 36x36 px (the target on-device cell size on a mid-tier Android phone — Carmack's frame-budget profile per CLAUDE.md Holy Law #2)
- 72x72 px (closer inspection)

Two questions to answer while scanning:

1. **Thumb test** — can you tell all 6 silhouettes in a set apart at arm's length on the 36px row?
2. **Personality test** — which set feels like the Yen-Neram you want to ship first?

## The five sets

### Set A — Gemstones

Faceted polygonal cuts. Straight edges only (curved cuts collapse below 32px). Traditional gem colour-coding the player already knows.

- diamond, ruby-square, emerald-rectangle, sapphire-trapezium, amethyst-hex, topaz-pentagon

Palm recommendation: **default theme**. Familiar colour-coding, crisp render, classic feel. Players who wanted "Color Lines but prettier" get exactly that.

### Set B — Glyphs

Secular universal symbols. No religious / regional / copyrighted iconography. Most silhouette-distinct of any family — every glyph is a different shape at any size.

- star, crescent, spiral, leaf, eye, arrow

Palm recommendation: **colourblind-strongest set**. Shape redundancy is highest here — the silhouettes are reliably distinguishable without colour. Wins the ~8% of male players that pure-colour Color Lines silently loses.

### Set C — Pure Geometric

Six primary shapes, no ornamentation. Jony's recommendation for maximum theme flexibility — themes can repaint and re-ornament freely without changing geometry.

- circle, triangle, square, diamond, hexagon, six-point-star

Jony recommendation: **engine-friendly default**. Cleanest renderer. Themes carry all the personality; the silhouette is structural, not decorative.

### Set D — Origami Animals

Paper-fold aesthetic. Each animal rendered as 2-4 flat triangular planes only (no curves, no eyes, no details). Highest personality of the five sets.

- crane, fish, fox, frog, butterfly, turtle

Palm recommendation: **the set that gets the screenshot** — most distinctive theme-identity. Carmack flag: SVG complexity is higher than the other four; must pass the sprite-byte budget check at PR 5.

### Set E — Tropical Fruits

Flat vector illustration, bold silhouettes. Warm and friendly tone. Risk: drifting toward Candy Crush knockoff energy if rendered too glossy.

- mango, banana, dragonfruit, lime, blueberry, kiwi

Palm recommendation: **warmest tone**. Colour-encoded by nature (no one confuses a banana for a blueberry). Watch the silhouette-blur of lime + kiwi at 36px — both are single rounded shapes (flagged during sketch QA).

## Placeholder tiles

Five generic abstract silhouettes for the 5 "coming soon" home tiles. Per design freeze (2026-06-07), placeholders are anonymous and dimmed — no game name, no "?" mark, no locked icon.

- placeholder-1: three vertical bars (data / puzzle feel)
- placeholder-2: spiral / vortex curl
- placeholder-3: nested concentric squares
- placeholder-4: 3x3 dot grid
- placeholder-5: angular zigzag

These ship regardless of which motif set the user picks.

## After the pick

1. User picks ONE motif set from A/B/C/D/E + names 3 themes (default + alt + distinctive).
2. PR 2 closes; PR 3 (shell) + PR 5 (UI) unblock.
3. Picked set moves to `assets/themes/<theme-name>/` with per-motif files renamed to a canonical `motif-rgN.svg` shape (where N is the run-group id 1-6).
4. The 4 unpicked sets stay here as `archive/` once PR 5 lands, in case a future theme wants to revive one.

## See also

- [TODO/2026-06-07-v1-shell-and-5-in-a-row.md](../../TODO/2026-06-07-v1-shell-and-5-in-a-row.md) — plan-doc; PR 2 row.
- [CLAUDE.md](../../CLAUDE.md) Holy Law #2 — the target device that drove the 36px design constraint.
