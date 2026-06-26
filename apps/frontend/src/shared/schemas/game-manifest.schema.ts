import { z } from "zod";

export const GameManifestEntrySchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().min(1),
    status: z.enum(["shipped", "placeholder"]),
    tile_silhouette: z.string().optional(),
    // One-line "what is this game" descriptor shown under the title on the
    // portal hero card. Optional + additive (older manifests without it still
    // validate); placeholders generally omit it. Chrome metadata per Jony
    // worldview "asset metadata is the design system".
    tagline: z.string().min(1).optional(),
    entry_route: z.string().optional(),
  })
  .strict();

export const GameManifestArraySchema = z.array(GameManifestEntrySchema);

export type GameManifestEntry = z.infer<typeof GameManifestEntrySchema>;
