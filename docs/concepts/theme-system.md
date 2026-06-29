# Theme System

**Last Updated**: 2026-06-29

Themes provide the motif art and display metadata for 5-in-a-Row. They are static bundle assets, validated by schemas and build-time tools, and loaded through base-path-aware asset helpers.

## Asset Location

Theme assets live only under `apps/frontend/public/assets/themes/<theme-id>/`. The game never reads raw source assets from a separate `assets/` tree, and there is no copy step that overwrites theme edits from another source directory.

Each theme folder owns its `manifest.json` and motif files. Motif filenames are semantic, for example `earth.svg` or `watermelon.png`; the manifest declares the exact filenames to load.

## Manifest Contract

Theme manifests are schema-versioned. They declare identity, display name, motifs, and license metadata. The manifest is authoritative for motif files and theme metadata.

SVG and PNG motifs are both first-class. SVGs are optimized by the build-time SVGO pass. PNGs pass through as static assets. Do not hardcode `motif-N.svg` in loaders; read the manifest.

## Build Pipeline

`tools/svgo-themes.mjs` optimizes SVG motifs in place. It keeps `viewBox` and `xmlns`, drops dimensions, uses a stable float precision, reports byte deltas, and fails if a file grows. There is no `predev` hook because dev startup should not mutate source assets.

`pnpm -F frontend build:assets` runs the asset pipeline and regenerates the theme index. The committed theme files are the canonical served form. PNGs pass through the SVGO step unchanged; shrink them before commit with a PNG tool when needed.

Rejected pipeline options for the current app: runtime optimization, service-worker optimization, and sprite-sheet indirection. The player benefits from build-time optimization and simple static files.

## Generated Theme Index

`apps/frontend/public/assets/themes/index.json` is a generated roster. It is a projection of the theme manifests, not a hand-edited source of truth.

`tools/themes-index.mjs` scans theme folders, checks that each manifest `id` matches its folder, sorts by id, and writes the roster. `build:assets` and `build` regenerate it. Contract tests compare the committed index to the manifests.

At runtime, the settings drawer fetches the index once to populate the picker. If the index is missing or invalid, the picker falls back to the canonical fallback theme rather than rendering empty.

## Defaults And Fallbacks

The new-player default theme and the load-failure fallback theme are separate concepts. Changing the default should not change the hardcoded last-ditch fallback unless both behaviours are intentionally changing.

Any test fixture that writes `yn:app` must include the app-prefs schema version. A blob without `schema_version: 1` is rejected and silently falls back to defaults.

## See also

- [5-in-a-row-board-and-input.md](5-in-a-row-board-and-input.md) - how motifs are sized and rendered.
- [../architecture/runtime/perf-budget.md](../architecture/runtime/perf-budget.md) - bundle and runtime budget.
- [../../apps/frontend/public/assets/themes/README.md](../../apps/frontend/public/assets/themes/README.md) - operator README for theme files.
