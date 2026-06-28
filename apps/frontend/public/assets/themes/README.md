# Theme assets - drop-in contract

**Last Updated**: 2026-06-26

Canonical location for in-bundle theme assets. Vite serves this folder
verbatim at `/assets/themes/<id>/...`. There is no separate `assets/`
source location; this folder IS the source and the served form.

## Layout

```
themes/
   index.json        # generated roster (ThemeIndex); do NOT hand-edit
  <theme-id>/
    manifest.json   # ThemeManifest (zod-validated, contract-tested)
    <motif>.svg     # 6 motif files, one per run-group (1..6). The
    <motif>.png     # filename IS the motif identity (e.g. earth.svg,
    ...             # watermelon.png) - any kebab-case name, svg or png.
```

- `<theme-id>` is kebab-case and matches `manifest.json` `id` field.
- Six motifs per theme (one per run-group, 1..6).
- `<ext>` is `svg` or `png`. Both are first-class - the renderer is
  format-agnostic. A theme can ship all SVG, all PNG, or mixed; the
  manifest maps each run-group (1..6) to its motif filename.
- Every theme manifest declares a `license` for asset provenance.

## Adding or editing a theme

1. Drop the six motif files and a `manifest.json` into a new
   `<theme-id>/` folder (or edit an existing one). Set each
   `motifs.<rg>` to its motif filename (e.g. `earth.svg` or
   `watermelon.png`); the filename carries the motif identity (there
   is no separate `name` field).
2. From the repo root, run the optimisation pass (SVG only - PNGs
   pass through untouched):

   ```
   pnpm -F frontend build:assets
   ```

   This runs `tools/svgo-themes.mjs` (per the SVGO pipeline decision), which rewrites
   each SVG motif IN PLACE to its optimised form. PNG motifs are
   ignored by this pass; if you want to shrink them, pre-process
   them with your own tool of choice (`oxipng`, `pngcrush`,
   `squoosh-cli`) before committing.

   `build:assets` also runs `tools/themes-index.mjs` (per the theme-system concept),
   which regenerates `index.json` - the theme roster the settings
   picker reads. Adding or renaming a theme only needs the folder
   plus its `manifest.json`; the index follows. Never hand-edit
   `index.json`.

3. Run the contract gates locally before committing:

   ```
   pnpm -F frontend test
   ```

   The relevant tests are
   `tests/contract/theme-manifest.test.ts` (manifest shape, motif
   files present), `tests/contract/theme-index.test.ts` (the
   generated roster matches the manifests), and
   `tests/contract/svgo-pipeline.test.ts` (SVG motifs well-formed,
   no `<?xml>` / `<title>` / `<desc>`).

## Why the SVGs in git are already optimised

The pipeline writes back to the same path it reads from. The
canonical location IS the build output for SVG motifs - there is no
separate `dist/` shape for theme SVGs. This is intentional: it keeps
the artifact a player downloads identical to the one a maintainer
inspects in git.

If an editor or pre-commit hook auto-formats your SVG on save and the
file balloons, just re-run `pnpm -F frontend build:assets`.

## Sizing guidance (advisory, not enforced)

Per-motif byte cap was removed 2026-06-07. The
renderer decodes each motif once and caches the bitmap; click +
move + theme-swap are compositor-thread operations whose cost is
independent of source file size after first paint. The cost is
first-fetch over Slow-4G:

| Per-motif size | 6-motif theme weight | First-paint cost on Slow-4G |
| -------------- | -------------------- | --------------------------- |
| ~3 KB SVG      | ~18 KB               | ~0.4 s                      |
| ~15 KB PNG     | ~90 KB               | ~1.8 s                      |
| ~50 KB PNG     | ~300 KB              | ~6.0 s (uncomfortable)      |

Keep per-motif weight under ~15 KB and you are still well inside the
150 KB first-playable-frame budget (`docs/architecture/runtime/perf-budget.md`).
Beyond that, weigh the visual delta against the network cost on the
target device profile.

## See also

- [../../../../../docs/architecture/decisions/0004-renderer-pick-svg.md](../../../../../docs/architecture/decisions/0004-renderer-pick-svg.md)
- [../../../../../docs/architecture/decisions/0011-svgo-build-time-asset-pipeline.md](../../../../../docs/architecture/decisions/0011-svgo-build-time-asset-pipeline.md)
- [../../../../../docs/concepts/theme-system.md](../../../../../docs/concepts/theme-system.md)
