import { z } from "zod";

export const GameManifestEntrySchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().min(1),
    status: z.enum(["shipped", "placeholder"]),
    tile_silhouette: z.string().optional(),
    entry_route: z.string().optional(),
  })
  .strict();

export const GameManifestArraySchema = z.array(GameManifestEntrySchema);

export type GameManifestEntry = z.infer<typeof GameManifestEntrySchema>;
