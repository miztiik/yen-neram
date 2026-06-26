# ADR-0024: Portal landing page is a modern, hero-led front door (vivid gradient + glyph motifs; warm palette overridden for this surface)

**Last Updated**: 2026-06-26
**Status**: Accepted
**Born in**: Player feedback - "the landing page is super ugly as UI/UX", then "the cream/peach is uninviting, not playful, feels like an app from 1970 - make it modern, use glyph motifs"
**Overrides**: the warm peach/terracotta chrome (ADR-0016) **for the landing surface only** (per CLAUDE.md section 0, user approval supersedes the ADR; the in-game chrome keeps the warm palette)
**Superseded in part by**: ADR-0025 - the landing-only scoping below was extended app-wide (the game, picker, and modals now share this modern theme too); the hero-led structure + glyph motifs + `tagline` field still stand.

## Context

The portal rendered all six `games.json` entries as one uniform grid of
square tiles. The single shipped game (5-in-a-Row) and the five `placeholder`
entries differed only by `opacity-40` + a disabled flag, so the one thing a
player can actually play was visually lost among five dead "Coming soon"
tiles. Each tile's silhouette used the cool `#1f2937` fill baked into the SVG.
The first warm-palette pass (cream cards on peach) was rejected by the player
as "uninviting / not playful / 1970s" - the warm-orange/terracotta family
reads as a 70s palette.

The player's first question on this screen is "what can I play right now?" -
the old layout answered it slowly (scan six near-identical tiles).

## Decision

Make the portal a **modern, playful, hero-led front door**, data-driven off
`status`:

- **Shipped games render as hero cards** - a bright white card with a vibrant
  gradient icon badge, the title, a one-line `tagline`, and a `Play ->` cue.
  The obvious primary target. Multiple shipped games wrap into a centred row.
- **Placeholders demote to a "More on the way" shelf** - a quiet row of frosted
  translucent tiles with low-opacity white icons and no per-tile label (the
  section heading carries the meaning). They read as "a growing collection",
  not "five broken buttons".
- **Silhouettes are painted via CSS `mask`** (`--yn-mask` set inline per tile;
  `background-color` is the paint) instead of the baked-in `#1f2937` fill. One
  colour source of truth - a future game's tile inherits the palette
  automatically (Jony worldview "asset metadata is the design system").
- **Modern palette, scoped to `.yn-portal`** - a vivid violet -> fuchsia
  gradient (`#4338ca -> #6d28d9 -> #a21caf`) with pink + sky radial blooms,
  dusted with a tiled **glyph-motif** layer (diamonds, discs, rings, triangles,
  pluses) in translucent white from one inline-SVG data URI (no asset fetch).
  Two large glyph shapes drift slowly for life. The wordmark is an iridescent
  white -> blush -> periwinkle gradient; cards are white with violet-tinted
  shadow; the badge + Play cue are an orange -> pink gradient (a warm pop that
  bridges to the in-game orange).
- **Motion** is compositor-only (`transform`/`opacity`): a staggered entrance
  rise + a slow idle drift on the two background glyphs, both disabled under
  `prefers-reduced-motion`.

The warm `--yn-*` tokens are **not** touched - they still drive the in-game
chrome (board, HUD, menu). Only the `.yn-portal` subtree gets the modern look.

A new **optional `tagline`** field is added to the game-manifest schema
(`z.string().min(1).optional()`). It is additive and backwards-compatible
(older manifests without it still validate); placeholders omit it. Only
5-in-a-Row carries one today.

## Consequences

- The page still renders exactly one `<button>` per game (1 hero + 5
  placeholders = 6), and preserves the accessible names the e2e suite pins
  ("5 in a Row" enabled; five "Coming soon" disabled), so `shell-smoke.spec.ts`
  stays green with no selector churn.
- The cool-on-warm icon clash is gone; recolouring is centralised in CSS, so
  the six silhouette SVG files no longer dictate icon colour.
- Adding a real second game = flip its `status` to `shipped` (+ optional
  `tagline`) and it automatically gets the hero treatment and leaves the
  coming-soon shelf. No portal code change.
- The landing page and the in-game surface now use different palettes by
  design. Modernising the whole app (warm tokens + board-view colours) is a
  separate, larger decision, out of scope here.
- Verified at 1280x800 and 393x851 (Pixel-5) in real chromium: the hero fits
  one row on mobile and the whole page sits above the fold with no scroll.

## Alternatives considered

- **Re-tint the six SVG files** - rejected: scatters the colour decision across
  six asset files and every future tile, vs one CSS rule.
- **Re-skin the entire app (game included)** - deferred: larger, touches the
  board renderer + HUD; the player asked about the landing page. Scoping to
  `.yn-portal` ships the ask without destabilising the game.
- **Hardcode the 5-in-a-Row descriptor in the portal** - rejected in favour of
  a schema `tagline` field so the descriptor is metadata, not chrome code.
