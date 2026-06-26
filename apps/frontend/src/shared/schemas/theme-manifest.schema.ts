import { z } from "zod";

// Theme manifest contract. Lives at `public/assets/themes/<id>/manifest.json`
// and is fetched at runtime by the theme-loader. Each run-group (1..6) maps to
// a motif FILENAME; the filename carries the motif's identity (e.g. `earth.svg`,
// `watermelon.png`), so there is no separate `name` field. The browser fetches
// motifs directly from the same folder.
//
// schema_version 2 (2026-06-26, ADR-0023): the per-motif value collapsed from
// `{ file, name }` to a bare filename string, and the filename regex widened
// from `motif-N` to any kebab-case name. Manifests ship in-bundle with the code
// that reads them, so the bump is a coordinated edit with no runtime migration.
//
// Invariant: the `motifs` table has exactly the run-groups required by the
// game's balance config (currently 6, with a 7th seat reserved for hard mode).
// Per-theme format is free (planets ships SVG; tropical-fruits ships PNG);
// mixing formats inside one theme is also valid.

export const ThemeMotifFileSchema = z.string().regex(/^[a-z0-9-]+\.(svg|png)$/);

export const ThemeBackgroundSchema = z
  .object({
    fill: z.string().regex(/^#[0-9a-fA-F]{3,8}$/),
    grid: z.string().regex(/^#[0-9a-fA-F]{3,8}$/),
  })
  .strict();

export const ThemeManifestSchema = z
  .object({
    schema_version: z.literal(2),
    id: z.string().regex(/^[a-z0-9-]+$/),
    display_name: z.string().min(1),
    description: z.string().min(1),
    license: z.string().min(1),
    background: ThemeBackgroundSchema,
    motifs: z.record(z.string().regex(/^[1-7]$/), ThemeMotifFileSchema),
  })
  .strict();

export type ThemeManifest = z.infer<typeof ThemeManifestSchema>;
