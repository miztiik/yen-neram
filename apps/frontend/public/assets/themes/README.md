# Theme assets - drop-in contract

**Last Updated**: 2026-06-26

Canonical location for in-bundle theme assets. Vite serves this folder
verbatim at `/assets/themes/<id>/...`. There is no separate `assets/`
source location; this folder IS the source and the served form.

## Layout

```
themes/
  index.json        # generated roster (ThemeIndex, ADR-0023); do NOT hand-edit
  <theme-id>/
    manifest.json   # ThemeManifest (zod-validated, contract-tested)
    motif-1.<ext>
    motif-2.<ext>
    motif-3.<ext>
    motif-4.<ext>
    motif-5.<ext>
    motif-6.<ext>
```

- `<theme-id>` is kebab-case and matches `manifest.json` `id` field.
- Six motifs per theme (one per run-group, 1..6).
- `<ext>` is `svg` or `png`. Both are first-class - the renderer is
  format-agnostic. A theme can ship all SVG, all PNG, or mixed; the
  manifest's `file` field is the source of truth.
- Every theme manifest declares a `license` (CC0-1.0 per ADR-0008).

## Adding or editing a theme

1. Drop the six motif files and a `manifest.json` into a new
   `<theme-id>/` folder (or edit an existing one). Set each
   `motifs.<rg>.file` to the correct filename (e.g. `motif-1.svg`
   or `motif-1.png`).
2. From the repo root, run the optimisation pass (SVG only - PNGs
   pass through untouched):

   ```
   pnpm -F frontend build:assets
   ```

   This runs `tools/svgo-themes.mjs` (per ADR-0011), which rewrites
   each SVG motif IN PLACE to its optimised form. PNG motifs are
   ignored by this pass; if you want to shrink them, pre-process
   them with your own tool of choice (`oxipng`, `pngcrush`,
   `squoosh-cli`) before committing.

   `build:assets` also runs `tools/themes-index.mjs` (per ADR-0023),
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
separate `dist/` shape for theme SVGs. This is intentional (per
ADR-0011): it keeps the artifact a player downloads identical to the
one a maintainer inspects in git.

If an editor or pre-commit hook auto-formats your SVG on save and the
file balloons, just re-run `pnpm -F frontend build:assets`.

## Sizing guidance (advisory, not enforced)

Per-motif byte cap was removed 2026-06-07 (ADR-0011 amendment). The
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
- [../../../../../docs/architecture/decisions/0008-license-cc0.md](../../../../../docs/architecture/decisions/0008-license-cc0.md)
- [../../../../../docs/architecture/decisions/0011-svgo-build-time-asset-pipeline.md](../../../../../docs/architecture/decisions/0011-svgo-build-time-asset-pipeline.md)
