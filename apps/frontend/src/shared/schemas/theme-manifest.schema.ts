import { z } from "zod";

// Theme manifest contract. Lives at `public/assets/themes/<id>/manifest.json`
// and is fetched at runtime by the theme-loader. The browser fetches motifs
// directly from the same folder; `file` is whatever the manifest says, e.g.
// `/assets/themes/<id>/motif-N.svg` or `/assets/themes/<id>/motif-N.png`.
//
// Invariant: the `motifs` table has exactly the run-groups required by the
// game's balance config (currently 6, with a 7th seat reserved for hard mode).
// Renaming a motif file is a manifest-only edit (file column changes); changing
// the run-group → motif mapping is also a manifest-only edit. Per-theme format
// is free (an origami theme can ship SVG; a tropical-fruits theme can ship
// PNG); mixing formats inside the same theme is also valid.

export const ThemeMotifEntrySchema = z
  .object({
    file: z.string().regex(/^motif-[1-7]\.(svg|png)$/),
    name: z.string().min(1),
  })
  .strict();

export const ThemeBackgroundSchema = z
  .object({
    fill: z.string().regex(/^#[0-9a-fA-F]{3,8}$/),
    grid: z.string().regex(/^#[0-9a-fA-F]{3,8}$/),
  })
  .strict();

export const ThemeManifestSchema = z
  .object({
    schema_version: z.literal(1),
    id: z.string().regex(/^[a-z0-9-]+$/),
    display_name: z.string().min(1),
    description: z.string().min(1),
    license: z.string().min(1),
    background: ThemeBackgroundSchema,
    motifs: z.record(z.string().regex(/^[1-7]$/), ThemeMotifEntrySchema),
  })
  .strict();

export type ThemeManifest = z.infer<typeof ThemeManifestSchema>;
