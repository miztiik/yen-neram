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

// V1 mode_state shape (infinite + max-points only).
const ModeStateV1Schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("infinite") }).strict(),
  z
    .object({
      kind: z.literal("max-points"),
      target: z.number().int().nonnegative(),
      seed_date: z.string(),
    })
    .strict(),
]);

// V2 mode_state shape (adds timed). ms_window is the configured starting
// duration; ms_remaining counts down from that and may reach 0.
export const ModeStateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("infinite") }).strict(),
  z
    .object({
      kind: z.literal("max-points"),
      target: z.number().int().nonnegative(),
      seed_date: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("timed"),
      ms_remaining: z.number().int().nonnegative(),
      ms_window: z.number().int().positive(),
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

const InProgressV1Schema = z
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
    mode_state: ModeStateV1Schema,
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

const HighScoresV1Schema = z
  .object({
    infinite: z.array(TopScoreEntrySchema).max(10),
    max_points: z.array(TopScoreEntrySchema).max(10),
  })
  .strict();

export const HighScoresSchema = z
  .object({
    infinite: z.array(TopScoreEntrySchema).max(10),
    max_points: z.array(TopScoreEntrySchema).max(10),
    timed: z.array(TopScoreEntrySchema).max(10),
  })
  .strict();

// Daily-streak counter: consecutive days of play, local-date keyed.
// `null` = the player has never finished a game.
export const StreakSchema = z
  .object({
    current: z.number().int().nonnegative(),
    longest: z.number().int().nonnegative(),
    last_played_date: z.string(),
  })
  .strict();

// V1 schema kept verbatim for the read-side migrator. New callers must use
// `SaveSchema` (alias of V2).
export const SaveV1SchemaLegacy = z
  .object({
    schema_version: z.literal(1),
    mode: z.enum(["infinite", "max-points"]),
    in_progress: z.union([InProgressV1Schema, z.null()]),
    high_scores: HighScoresV1Schema,
  })
  .strict();

export type SaveV1 = z.infer<typeof SaveV1SchemaLegacy>;

// V2 = V1 + timed mode + timed high-scores bucket + daily-streak field.
// Streak is nullable so the V1 -> V2 migration is a pure additive: a V1
// save becomes a V2 save by gaining `streak: null` and
// `high_scores.timed: []`. No data loss; no field rename.
export const SaveV2Schema = z
  .object({
    schema_version: z.literal(2),
    mode: z.enum(["infinite", "max-points", "timed"]),
    in_progress: z.union([InProgressSchema, z.null()]),
    high_scores: HighScoresSchema,
    streak: z.union([StreakSchema, z.null()]),
  })
  .strict();

export type SaveV2 = z.infer<typeof SaveV2Schema>;

// Canonical exports used everywhere outside the migrator.
export const SaveSchema = SaveV2Schema;
export type Save = SaveV2;
