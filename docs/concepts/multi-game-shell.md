# Multi-game shell

**Last Updated**: 2026-06-29

A multi-game shell is the architecture pattern where one app shell hosts multiple independent games behind a portal of tile-doorways. In Yen-Neram terms: a portal home page rendering 6 tiles, a router that maps each tile's path to a per-game dynamic `import()`, a shared chrome layer (settings, theme switcher, save reader), and sealed games whose code is only fetched on entry. Each game is a self-contained module behind its `GameManifest`; the shell does not know the game's internals.

## Routing

Game routes use path routing: `/play/<game-slug>/`. Mode and theme are parameters on that route, not separate portal games. GitHub Pages deep-link reloads are handled by the production `404.html` fallback; local and deployed paths are normalized through `import.meta.env.BASE_URL`.

The portal owns game discovery and entry. Placeholder tiles route to a coming-soon surface rather than pre-creating empty game modules.

## Sealed games invariant

- `src/games/<slug>/` MUST NOT import from `src/games/<other-slug>/`. Games are siblings; they never cross-reference.
- `src/shared/` MUST NOT import from `src/games/`. The shared layer is upstream of every game.
- The shell reads `GameManifest` and dynamic-imports games; it never imports a game's internals directly.

## Loading Contract

The always-loaded shell stays small: portal grid, router, dynamic-import loader, app preferences, and shared schema readers. Each game payload is dynamically imported only when its tile is entered. Per-game payloads include the game's code, save reader/writer, and default assets needed for first play.

Adding a game means adding its game module and manifest, then adding its portal row. It does not mean creating a separate app, separate HTML entry point, or separate save namespace outside the shared contract.

## See also

- [theme-system.md](theme-system.md)
- [../how-to/ship-to-github-pages.md](../how-to/ship-to-github-pages.md)
- [../architecture/runtime/perf-budget.md](../architecture/runtime/perf-budget.md)
- [../reference/toolchain.md](../reference/toolchain.md)
- `game-manifest.md` (deferred; born in PR 3)
