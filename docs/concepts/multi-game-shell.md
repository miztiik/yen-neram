# Multi-game shell

**Last Updated**: 2026-06-07

A multi-game shell is the architecture pattern where one app shell hosts multiple independent games behind a portal of tile-doorways. In Yen-Neram terms: a portal home page rendering 6 tiles, a router that maps each tile's path to a per-game dynamic `import()`, a shared chrome layer (settings, theme switcher, save reader), and sealed games whose code is only fetched on entry. Each game is a self-contained module behind its `GameManifest`; the shell does not know the game's internals.

## Sealed games invariant

- `src/games/<slug>/` MUST NOT import from `src/games/<other-slug>/`. Games are siblings; they never cross-reference.
- `src/shared/` MUST NOT import from `src/games/`. The shared layer is upstream of every game.
- The shell reads `GameManifest` and dynamic-imports games; it never imports a game's internals directly.

## See also

- [../architecture/decisions/0001-routing-path-with-404-fallback.md](../architecture/decisions/0001-routing-path-with-404-fallback.md)
- [../architecture/decisions/0006-bundle-budget-and-codesplit.md](../architecture/decisions/0006-bundle-budget-and-codesplit.md)
- [theme-system.md](theme-system.md)
- [../how-to/ship-to-github-pages.md](../how-to/ship-to-github-pages.md)
- `game-manifest.md` (deferred; born in PR 3)
