# ADR-0023: Theme index discovery manifest (generated roster)

**Last Updated**: 2026-06-26

**Status**: Accepted

## Context

The set of installed themes (the "roster") was a hard-coded array,
`KNOWN_THEME_IDS = ["origami", "tropical-fruits"]`, in
`apps/frontend/src/games/5-in-a-row/ui/settings-drawer.ts`. The settings
drawer's theme picker iterated that list and fetched every theme's
`manifest.json` (one request per theme) just to read its `id` and
`display_name`.

That made the roster live in several places at once: the on-disk
`<id>/` folder, the folder's `manifest.json` `id` field, the
`KNOWN_THEME_IDS` array, and the e2e selector. Adding or renaming a
theme meant editing each by hand, and a missed edit failed silently
(the picker just dropped the theme, or every motif 404'd on an
`id`/folder mismatch). A `TODO` in the code already anticipated a
build-time `index.json`.

A static GitHub Pages bundle cannot list a directory at runtime, so
"auto-discovery" has to happen at build time.

## Decision

Emit a generated roster at `public/assets/themes/index.json` and read
it at runtime.

- **Shape** (`ThemeIndexSchema`, `src/shared/schemas/theme-index.schema.ts`):
  `{ schema_version: 1, themes: [{ id, display_name }] }`, sorted by `id`.
- **Generator** (`tools/themes-index.mjs`): scans
  `public/assets/themes/<id>/manifest.json`, asserts each `manifest.id`
  equals its folder name (a mismatch would 404 motifs), projects out
  `id` + `display_name`, and writes `index.json`. Run from `build` and
  `build:assets`, beside the existing SVGO pass.
- **Runtime** (`settings-drawer.ts`): `discoverAvailableThemes()` fetches
  and validates `index.json` in a single request; `KNOWN_THEME_IDS` is
  deleted. On a missing/invalid index it falls back to the canonical
  theme so the picker is never empty.
- **Source of truth**: the index is a *projection* of the manifests -
  `display_name` is never hand-duplicated. The per-theme `manifest.json`
  remains authoritative for motifs, background, and license, and is
  still fetched (lazily) when a theme is actually selected.
- **Staleness guard**: `tests/contract/theme-index.test.ts` independently
  re-derives the expected roster from the manifests and deep-equals it
  against the committed `index.json`, so a forgotten regeneration fails
  the test suite.

`URL` building goes through `assetPaths.themesIndex()` (per CLAUDE.md
sec 10; respects the Vite base for GitHub Pages).

## Consequences

- Adding a theme is now: drop the folder + `manifest.json`, run
  `build:assets`. The roster, picker, and index follow automatically.
- The picker makes one request instead of one-per-theme.
- A new persisted contract (`index.json`) joins the versioned-surface
  list (CLAUDE.md sec 11). It ships in-bundle with the code, so there
  is no cross-version migration burden.
- Semantic motif filenames + dropping `name` (delivered 2026-06-26):
  the per-motif value is now a bare filename string (e.g. `earth.svg`,
  `watermelon.png`) instead of `{ file, name }`, so the filename carries
  the motif identity. The theme-manifest schema bumped to version 2, and
  the `origami` theme was replaced by `planets` at the same time.

## See also

- [ADR-0011: SVGO build-time asset pipeline](0011-svgo-build-time-asset-pipeline.md) - the sibling build-time pass.
- [docs/concepts/multi-game-shell.md](../../concepts/multi-game-shell.md) - where themes fit in the shell.
- `apps/frontend/src/shared/schemas/theme-manifest.schema.ts` - the per-theme contract this indexes.
