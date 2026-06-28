import { describe, expect, it } from "vitest";

import { InProgressSchema } from "@/shared/schemas/5-in-a-row.save.schema.js";

// Contract for the in-progress save's rng_cursor field (ADR-0034). Persisting
// the live Mulberry32 cursor lets a mid-game reload resume the exact spawn
// stream instead of rewinding to turn_seed. The field is additive + optional,
// so a save written before it shipped must still parse (no schema_version bump,
// no migration owed). The cursor is SIGNED (the |0 recurrence), so a negative
// value is valid.

function emptyBoard(): unknown[][] {
  const row: unknown[] = [null, null, null, null, null, null, null, null, null];
  return [[...row], [...row], [...row], [...row], [...row], [...row], [...row], [...row], [...row]];
}

function baseInProgress(): Record<string, unknown> {
  return {
    board: emptyBoard(),
    selected_cell: null,
    next_preview: [],
    score: 0,
    turn_seed: 42,
    undo: { available: true, snapshot: null },
    mode_state: { kind: "infinite" },
  };
}

describe("InProgress rng_cursor contract (ADR-0034)", () => {
  it("round-trips a positive rng_cursor", () => {
    const r = InProgressSchema.safeParse({ ...baseInProgress(), rng_cursor: 123456 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.rng_cursor).toBe(123456);
  });

  it("allows a NEGATIVE rng_cursor (the Mulberry32 |0 state is signed)", () => {
    const r = InProgressSchema.safeParse({ ...baseInProgress(), rng_cursor: -987654321 });
    expect(r.success).toBe(true);
  });

  it("back-compat: an in_progress written before rng_cursor still parses; field undefined", () => {
    const r = InProgressSchema.safeParse(baseInProgress());
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.rng_cursor).toBeUndefined();
  });

  it("rejects a non-integer rng_cursor", () => {
    expect(InProgressSchema.safeParse({ ...baseInProgress(), rng_cursor: 1.5 }).success).toBe(
      false,
    );
  });
});
