import { describe, expect, it } from "vitest";

import balanceJson from "@/games/5-in-a-row/balance.json";
import { BalanceSchema, balance } from "@/games/5-in-a-row/balance.schema.js";

// Contract for the per-game tuning config (ADR-0034). balance.json is hand
// edited, so the schema is the guard that a typo'd or missing knob fails at
// load/CI instead of becoming a silent NaN in the score / render path. Replaces
// the old `as unknown as ExtendedBalance` double-cast that validated nothing.

describe("BalanceSchema (balance.json contract, ADR-0034)", () => {
  it("the shipped balance.json validates", () => {
    expect(BalanceSchema.safeParse(balanceJson).success).toBe(true);
  });

  it("exposes the parsed core knobs", () => {
    expect(balance.board_size).toBe(9);
    expect(balance.num_run_groups).toBe(6);
    expect(balance.spawn_per_turn).toBe(3);
    expect(balance.opening_cluster_size).toBe(3);
    expect(balance.recent_window).toBe(15);
    expect(balance.milestones.fractions).toEqual([0.6, 1, 1.4]);
    expect(balance.milestones.cold_start["infinite"]).toEqual([40, 80, 140]);
    expect(balance.clear.splash_ring_count_by_length["9"]).toBe(3);
  });

  it("rejects a missing required knob", () => {
    const broken: Record<string, unknown> = { ...(balanceJson as Record<string, unknown>) };
    delete broken["num_run_groups"];
    expect(BalanceSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects a wrong-typed knob", () => {
    expect(BalanceSchema.safeParse({ ...balanceJson, spawn_per_turn: "three" }).success).toBe(
      false,
    );
  });

  it("rejects an unknown top-level knob (strict)", () => {
    expect(BalanceSchema.safeParse({ ...balanceJson, bogus: 1 }).success).toBe(false);
  });
});
