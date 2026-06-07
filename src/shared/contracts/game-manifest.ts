// Schema is the single source of truth for the GameManifest contract.
// Re-export the Zod-inferred type so the schema's optional-field semantics
// (`tile_silhouette?: string | undefined`) match the type used at consumer sites,
// satisfying `exactOptionalPropertyTypes: true`.
export type { GameManifestEntry } from "@/shared/schemas/game-manifest.schema.js";

export type GameStatus = "shipped" | "placeholder";
