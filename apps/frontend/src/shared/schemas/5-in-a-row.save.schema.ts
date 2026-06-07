import { z } from "zod";

export const CoordSchema = z.object({
  row: z.number().int().min(0).max(8),
  col: z.number().int().min(0).max(8),
});

export const CellSchema = z.union([
  z.null(),
  z.object({ runGroup: z.number().int().min(1).max(7) }).strict(),
]);

export const BoardSchema = z.array(z.array(CellSchema).length(9)).length(9);

export const PreviewItemSchema = z
  .object({
    row: z.number().int().min(0).max(8),
    col: z.number().int().min(0).max(8),
    kind: z.number().int().min(1).max(7),
  })
  .strict();

export const ModeStateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("infinite") }).strict(),
  z
    .object({
      kind: z.literal("max-points"),
      target: z.number().int().nonnegative(),
      seed_date: z.string(),
    })
    .strict(),
]);

export const UndoSnapshotSchema = z
  .object({
    board: BoardSchema,
    score: z.number().int().nonnegative(),
    next_preview: z.array(PreviewItemSchema).max(10),
  })
  .strict();

export const InProgressSchema = z
  .object({
    board: BoardSchema,
    selected_cell: z.union([CoordSchema, z.null()]),
    next_preview: z.array(PreviewItemSchema).max(10),
    score: z.number().int().nonnegative(),
    turn_seed: z.number().int().nonnegative(),
    undo: z
      .object({
        available: z.boolean(),
        snapshot: z.union([UndoSnapshotSchema, z.null()]),
      })
      .strict(),
    mode_state: ModeStateSchema,
  })
  .strict();

export const TopScoreEntrySchema = z
  .object({
    score: z.number().int().nonnegative(),
    timestamp_iso: z.string(),
  })
  .strict();

export const HighScoresSchema = z
  .object({
    infinite: z.array(TopScoreEntrySchema).max(10),
    max_points: z.array(TopScoreEntrySchema).max(10),
  })
  .strict();

export const SaveV1Schema = z
  .object({
    schema_version: z.literal(1),
    mode: z.enum(["infinite", "max-points"]),
    in_progress: z.union([InProgressSchema, z.null()]),
    high_scores: HighScoresSchema,
  })
  .strict();

export type SaveV1 = z.infer<typeof SaveV1Schema>;
