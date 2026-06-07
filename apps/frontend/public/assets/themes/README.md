# Theme assets - drop-in contract

**Last Updated**: 2026-06-07

Canonical location for in-bundle theme assets. Vite serves this folder
verbatim at `/assets/themes/<id>/...`. There is no separate `assets/`
source location; this folder IS the source and the served form.

## Layout

```
themes/
  <theme-id>/
    manifest.json   # ThemeManifest (zod-validated, contract-tested)
    motif-1.svg
    motif-2.svg
    motif-3.svg
    motif-4.svg
    motif-5.svg
    motif-6.svg
```

- `<theme-id>` is kebab-case and matches `manifest.json` `id` field.
- Six motifs per theme (one per run-group, 1..6).
- Every theme manifest declares a `license` (CC0-1.0 per ADR-0008).

## Adding or editing a theme

1. Drop the six motif SVGs and a `manifest.json` into a new
   `<theme-id>/` folder (or edit an existing one).
2. From the repo root, run the optimisation pass to bring the SVGs to
   the committed shape:

   ```
   pnpm -F frontend build:assets
   ```

   This runs `tools/svgo-themes.mjs` (per ADR-0011), which rewrites
   each motif IN PLACE to its optimised form.

3. Run the contract gates locally before committing:

   ```
   pnpm -F frontend test
   ```

   The relevant tests are
   `tests/contract/theme-manifest.test.ts` (manifest shape, motif
   files present) and `tests/contract/svgo-pipeline.test.ts` (motifs
   under 1500b, well-formed, no `<?xml>` / `<title>` / `<desc>`).

## Why the SVGs in git are already optimised

The pipeline writes back to the same path it reads from. The
canonical location IS the build output for this asset class - there
is no separate `dist/` shape for theme SVGs. This is intentional (per
ADR-0011): it keeps the artifact a player downloads identical to the
one a maintainer inspects in git.

If an editor or pre-commit hook auto-formats your SVG on save and the
file balloons, just re-run `pnpm -F frontend build:assets`.

## Anti-patterns

- Do NOT add raster fallbacks (`.png` / `.webp`); the renderer
  expects SVG (ADR-0004).
- Do NOT introduce a sprite-sheet by hand; that is a v3 conversation
  (ADR-0011 rejected alternatives).
- Do NOT commit an SVG that has not been through `build:assets`. The
  contract test will fail it.

## See also

- [../../../../../docs/architecture/decisions/0004-renderer-pick-svg.md](../../../../../docs/architecture/decisions/0004-renderer-pick-svg.md)
- [../../../../../docs/architecture/decisions/0008-license-cc0.md](../../../../../docs/architecture/decisions/0008-license-cc0.md)
- [../../../../../docs/architecture/decisions/0011-svgo-build-time-asset-pipeline.md](../../../../../docs/architecture/decisions/0011-svgo-build-time-asset-pipeline.md)
