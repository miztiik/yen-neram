import { describe, expect, it } from "vitest";

import { InProgressSchema } from "@/shared/schemas/5-in-a-row.save.schema.js";

// Contract for the in-progress save's shuffle_used field (ADR-0038). The
// stuck-valve shuffle is a once-per-run lifeline; persisting whether it has
// been spent lets a mid-game reload keep it spent (you cannot reload to refresh
// the lifeline). The field is additive + optional, so a save written before it
// shipped must still parse (no schema_version bump, no migration owed).

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

describe("InProgress shuffle_used contract (ADR-0038)", () => {
  it("round-trips shuffle_used = true", () => {
    const r = InProgressSchema.safeParse({ ...baseInProgress(), shuffle_used: true });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.shuffle_used).toBe(true);
  });

  it("round-trips shuffle_used = false", () => {
    const r = InProgressSchema.safeParse({ ...baseInProgress(), shuffle_used: false });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.shuffle_used).toBe(false);
  });

  it("back-compat: an in_progress written before shuffle_used still parses; field undefined", () => {
    const r = InProgressSchema.safeParse(baseInProgress());
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.shuffle_used).toBeUndefined();
  });

  it("rejects a non-boolean shuffle_used", () => {
    expect(InProgressSchema.safeParse({ ...baseInProgress(), shuffle_used: "yes" }).success).toBe(
      false,
    );
  });
});
