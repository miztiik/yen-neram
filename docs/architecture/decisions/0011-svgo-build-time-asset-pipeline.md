# ADR-0011: SVGO build-time asset pipeline for theme motifs

**Last Updated**: 2026-06-07
**Status**: Accepted
**Born in**: v2 polish (SVGO pipeline subagent)

## Context

V1 shipped a byte-passthrough `tools/copy-themes.mjs` script that copied
SVGs from `assets/themes/` to `public/assets/themes/`. The v2 monorepo
collapsed the dual-location split (commit `4baa2cc`); SVGs now live
ONLY at `apps/frontend/public/assets/themes/<id>/motif-*.svg` and are
served verbatim by Vite.

CLAUDE.md sections 4 and 10 require every asset to go through a
pipeline that earns its bytes. A passthrough copy did not. With the
canonical location settled, this is the right moment to add the first
real pipeline step before more themes land.

## Decision

SVGO runs at build time as the first step of `pnpm -F frontend build`,
modifying the canonical SVGs IN PLACE.

- `tools/svgo-themes.mjs` (root-level Node 20+ ESM script) walks
  `apps/frontend/public/assets/themes/<id>/motif-*.svg`, runs SVGO with
  the modern default preset plus the standard tuning (keep `viewBox`,
  keep `xmlns`, drop dimensions, `floatPrecision: 2`,
  `removeUselessStrokeAndFill`), and rewrites each file in place.
- The script reports per-file and total before/after bytes, and exits
  with code 1 if any file grew (so an upstream change that defeats
  SVGO is caught at build).
- `apps/frontend/package.json` build script becomes
  `node ../../tools/svgo-themes.mjs && tsc --noEmit && vite build`.
- A `build:assets` script runs just the pipeline for local
  re-optimisation after editing an SVG by hand.
- No `predev` hook: dev should not mutate source SVGs on every
  restart.
- SVGs are committed to git in their post-optimisation form (the
  canonical location IS the build output for this asset class).
- A contract test
  (`apps/frontend/tests/contract/svgo-pipeline.test.ts`) asserts each
  motif is `< 1500b`, well-formed, free of `<?xml>`, `<title>`,
  `<desc>`.

This is per-file optimisation only - no sprite-sheet, no atlas, no
runtime indirection.

## Rejected alternatives

- **Sprite-sheet (single concatenated `<svg>` with `<symbol>`s + `<use>`
  refs)**: saves more total bytes but adds runtime `<use>` indirection
  and breaks the simple inline-SVG / `<image src>` approach the
  renderer assumes (ADR-0004). Defer to v3 if profiling shows the
  per-file fetch overhead actually matters on the target device.
- **imagemin or sharp**: generic image pipelines underperform SVGO on
  SVGs; SVG-focused tools are state of the art for SVG bytes.
- **Vite plugin (e.g. `vite-plugin-svgo`)**: adds Vite-side magic and
  binds the optimisation to dev/preview/build runs. A standalone Node
  script is more inspectable, runs only when asked, and stays usable
  if the build tool changes (ADR-0005 picked Vite but the script
  outlives that pick).
- **Run SVGO at request time / in a service worker**: violates
  static-first (Holy Law 1) and adds runtime cost for no player
  benefit.

## Consequences

- Build adds ~200ms (SVGO over ~12 small SVGs).
- SVGs in git ARE the optimised form. Editors that auto-format SVGs on
  save (e.g. Prettier with `--write '**/*.svg'`) would re-introduce
  bytes; `apps/frontend/public/assets/themes/README.md` carries the
  drop-in contract and the "after editing, run
  `pnpm -F frontend build:assets`" note.
- The exit-1-on-growth rule catches a future SVG that defeats SVGO
  (e.g. inline base64 raster) before it lands.
- Contract test gives the pipeline a CI gate so an unoptimised asset
  cannot ship.
- One more dev dependency: `svgo` (~5MB installed, dev-only, zero
  runtime cost).

## Reversal cost

Cheap. Delete `tools/svgo-themes.mjs`, drop the prefix from the
`build` script, drop the `build:assets` script, drop `svgo` from
`devDependencies`, delete the contract test. SVGs stay where they are
in their last-optimised form; nothing in the runtime bundle changes.

## See also

- [0004-renderer-pick-svg.md](0004-renderer-pick-svg.md)
- [0005-build-stack-vite-typescript-vanilla.md](0005-build-stack-vite-typescript-vanilla.md)
- [0006-bundle-budget-and-codesplit.md](0006-bundle-budget-and-codesplit.md)
- [0008-license-cc0.md](0008-license-cc0.md)
- [../../../CLAUDE.md](../../../CLAUDE.md) sections 4, 9, 10
