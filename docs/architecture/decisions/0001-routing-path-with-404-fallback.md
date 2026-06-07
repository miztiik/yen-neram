# ADR-0001: Path routing with GitHub Pages 404 SPA fallback

**Last Updated**: 2026-06-07
**Status**: Accepted
**Born in**: PR 1 (`chore/scaffolding-and-adrs`)

## Context

Yen-Neram is a multi-game shell; the home page is a portal of tile-doorways into games. A user must be able to bookmark or share a deep link to a specific game (e.g. `/play/5-in-a-row/`). Hosting is GitHub Pages, which serves static files only - no server-side routing.

## Decision

Path routing - game routes use the URL path `/play/<game-slug>/`. Mode and theme appear as query parameters (`?mode=infinite&theme=origami`). To support deep-link reload on GitHub Pages (which would otherwise return 404), `public/404.html` is a copy of `public/index.html`; both delegate to the SPA router.

## Rejected alternatives

- **Single-page tab-switch with no URL change**: foreclosed by the share/bookmark use case.
- **Hash routing (`/#/play/<slug>`)**: uglier shared previews, link unfurlers misbehave, and we lose the URL spine for future improvements.
- **Sub-path per game (`/<slug>/`)**: defeats the shared-shell purpose; each game becomes its own MPA with separate bundles.

## Consequences

The shell needs a tiny path router (~1-2 KB). `public/404.html` must be a byte-identical copy of `public/index.html` at build time. The 5 placeholder tiles route to a 404-handled "coming soon" view. New games join by appending a row to `GameManifest` and creating `src/games/<slug>/`.

## Reversal cost

Cheap. The shell router is one module; swapping to hash routing is ~50 lines and a `404.html` deletion. The save format and game-module contract are URL-agnostic.

## See also

- [CLAUDE.md](../../../CLAUDE.md) Holy Law #1 (static-first production)
- [0002-save-per-game-localstorage-keys.md](0002-save-per-game-localstorage-keys.md)
- [../../concepts/game-manifest.md](../../concepts/game-manifest.md)
