import { z } from "zod";

// Theme index contract. Lives at `public/assets/themes/index.json` and is the
// roster of installed themes (id + display_name). It is a GENERATED projection
// of the per-theme manifests, emitted by `tools/themes-index.mjs` during
// `build` / `build:assets`. Do NOT hand-edit; regenerate instead.
//
// The settings-drawer theme picker fetches this once at mount instead of
// probing each theme manifest. The per-theme `manifest.json` files remain the
// source of truth for everything else (motifs, background, license); the index
// only carries what the picker needs to render the roster.
//
// Invariant: every entry's `id` matches a `<id>/` folder under themes/ whose
// `manifest.json` carries the same `id` + `display_name`. Enforced by
// tests/contract/theme-index.test.ts, which re-derives the expected index from
// the manifests on disk and fails if the committed file is stale.

export const ThemeIndexEntrySchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    display_name: z.string().min(1),
  })
  .strict();

export const ThemeIndexSchema = z
  .object({
    schema_version: z.literal(1),
    themes: z.array(ThemeIndexEntrySchema),
  })
  .strict();

export type ThemeIndex = z.infer<typeof ThemeIndexSchema>;
export type ThemeIndexEntry = z.infer<typeof ThemeIndexEntrySchema>;
