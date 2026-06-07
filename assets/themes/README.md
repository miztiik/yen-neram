# Theme assets (production-bound)

**Last Updated**: 2026-06-07

This is the canonical home for theme motif SVGs the game ships. PR 5 will add the SVGO + sprite-build pipeline that lifts these into `public/assets/themes/<id>/` at build time.

## Drop-in contract

Replace any file at `assets/themes/<theme-id>/motif-<N>.svg` with a same-name SVG. The renderer picks it up on next build.

- **viewBox**: `0 0 24 24` (required - renderer scales to cell size, typically 36-48px on a phone).
- **Format**: pure SVG markup. ASCII only. No `<?xml ... ?>` declaration. No BOM. No `<script>`, `<style>`, `<title>`, `<desc>`.
- **Size**: any byte size; ideal under 2 KB raw. SVGO compresses ~40% at PR 5.
- **Color**: bake the colors into the SVG. Gradients (`<linearGradient>`, `<radialGradient>`), filters (`<filter>` with `<feGaussianBlur>`, `<feOffset>`, `<feMerge>`), drop-shadows are all supported natively (per ADR-0004 - that's why we picked SVG, no library).
- **Run-group mapping** (which file is which colour-group in the game): lives in `assets/themes/<id>/manifest.json`. To swap "crane" and "fish" positions: edit manifest, do NOT rename files.

## v1 themes shipped

### `origami/` - calm planar paper-fold animals

| File          | Motif     | Run-group |
| ------------- | --------- | --------- |
| `motif-1.svg` | crane     | 1         |
| `motif-2.svg` | fish      | 2         |
| `motif-3.svg` | fox       | 3         |
| `motif-4.svg` | frog      | 4         |
| `motif-5.svg` | butterfly | 5         |
| `motif-6.svg` | turtle    | 6         |

### `tropical-fruits/` - vibrant glossy Fruit Ninja energy

| File          | Motif      | Run-group |
| ------------- | ---------- | --------- |
| `motif-1.svg` | watermelon | 1         |
| `motif-2.svg` | pineapple  | 2         |
| `motif-3.svg` | strawberry | 3         |
| `motif-4.svg` | apple      | 4         |
| `motif-5.svg` | banana     | 5         |
| `motif-6.svg` | mango      | 6         |

## Adding a new theme

1. Create `assets/themes/<new-id>/`.
2. Add `manifest.json` matching the `ThemeManifestSchema` at [src/shared/schemas/theme-manifest.schema.ts](../../src/shared/schemas/theme-manifest.schema.ts).
3. Add `motif-1.svg` through `motif-6.svg` (and optional `motif-7.svg` for the reserved hard-mode 7th run-group).
4. License field must be present (CLAUDE.md section 10: every new asset names its license).
5. Run `pnpm test` - the theme manifest contract test at [tests/contract/theme-manifest.test.ts](../../tests/contract/theme-manifest.test.ts) auto-discovers + validates the new theme.

## See also

- [src/shared/schemas/theme-manifest.schema.ts](../../src/shared/schemas/theme-manifest.schema.ts) - Zod contract.
- [tests/contract/theme-manifest.test.ts](../../tests/contract/theme-manifest.test.ts) - contract test.
- [../../docs/architecture/decisions/0004-renderer-pick-svg.md](../../docs/architecture/decisions/0004-renderer-pick-svg.md) - why pure SVG, no library.
- [../../docs/architecture/decisions/0008-license-cc0.md](../../docs/architecture/decisions/0008-license-cc0.md) - the license policy these manifests honour.
- ADR-0009 (born in PR 5) - theme pipeline: raw `assets/themes/` -> SVGO -> sprite -> `public/assets/themes/`.
