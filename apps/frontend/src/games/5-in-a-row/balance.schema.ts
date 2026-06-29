import { z } from "zod";

import balanceJson from "./balance.json";

// Runtime contract for the hand-edited per-game tuning config (ADR-0034).
// balance.json is bundle config (CLAUDE.md sec 6: no hardcoded knobs), so a
// typo'd or missing value must fail LOUDLY at module load rather than surface
// as a silent NaN / undefined deep in the score or render path. This schema
// replaces the old `as unknown as ExtendedBalance` double-cast (which validated
// nothing). `schema_version` is asserted so a future breaking shape change is a
// deliberate, versioned event.
const byLengthTable = z.record(z.string(), z.number());

export const BalanceSchema = z
  .object({
    schema_version: z.literal(1),
    board_size: z.number().int().positive(),
    min_line_length: z.number().int().positive(),
    num_run_groups: z.number().int().positive(),
    spawn_per_turn: z.number().int().positive(),
    preview_count: z.number().int().positive(),
    initial_seed_count: z.number().int().nonnegative(),
    opening_cluster_size: z.number().int().nonnegative(),
    length_multipliers: byLengthTable,
    intersection_bonus: z.number(),
    cascade_bonus: z.number(),
    top_scores_max: z.number().int().positive(),
    recent_window: z.number().int().positive(),
    milestones: z.object({
      fractions: z.array(z.number()),
      cold_start: z.record(z.string(), z.array(z.number().int().nonnegative())),
      toast_ms: z.number().int().nonnegative(),
    }),
    shuffle: z.object({ fullness: z.number().min(0).max(1) }),
    long_press_ms: z.number().int().nonnegative(),
    timed: z.object({
      window_ms: z.number().int().positive(),
      extend_5_ms: z.number().int().nonnegative(),
      extend_6_ms: z.number().int().nonnegative(),
      extend_7plus_ms: z.number().int().nonnegative(),
    }),
    animation: z.record(z.string(), z.number()),
    reward: z.object({
      wave_pill_rise_ms: z.number(),
      wave_pill_hold_ms: z.number(),
      wave_pill_exit_ms: z.number(),
      wave_pill_stagger_ms: z.number(),
      wave_fly_to_score_ms: z.number(),
      score_count_up_min_ms: z.number(),
      score_count_up_per_delta_ms: z.number(),
      score_count_up_max_ms: z.number(),
      score_chip_glow_ms: z.number(),
      best_chip_pulse_ms: z.number(),
    }),
    clear: z.object({
      preclear_glow_ms: z.number(),
      shockwave_step_ms: z.number(),
      splash_scale_by_length: byLengthTable,
      splash_ring_count_by_length: byLengthTable,
      splash_ring_step_ms: z.number(),
    }),
  })
  .strict()
  // Cross-field invariant (2026-06-30): the spawn loop draws tiles from the
  // preview queue (`nextPreview.slice(0, spawn_per_turn)` in turn-loop.ts), and
  // the queue only ever holds `preview_count` items. So a `preview_count` below
  // `spawn_per_turn` SILENTLY clamps the tiles that actually land -- the
  // "spawns 2 not 3" bug. Fail loudly at load instead of shipping the clamp.
  // (They may be EQUAL or preview larger; preview smaller is the bug.)
  .superRefine((cfg, ctx) => {
    if (cfg.preview_count < cfg.spawn_per_turn) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["preview_count"],
        message: `preview_count (${String(cfg.preview_count)}) must be >= spawn_per_turn (${String(
          cfg.spawn_per_turn,
        )}): the spawn loop draws from the preview queue, so a smaller preview silently clamps the tiles that land.`,
      });
    }
  });

export type Balance = z.infer<typeof BalanceSchema>;

// Validate the bundled config ONCE, at module load. Throws on a malformed
// balance.json -- which the build (tsc + vite) and the contract test catch
// before anything ships.
export const balance: Balance = BalanceSchema.parse(balanceJson);
