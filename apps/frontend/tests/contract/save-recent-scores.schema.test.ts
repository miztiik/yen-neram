import { describe, expect, it } from "vitest";

import { SaveV2Schema } from "@/shared/schemas/5-in-a-row.save.schema.js";

// Contract for the rolling recent-runs buffer (ADR-0036). Additive + optional,
// per-mode, capped at 15, .strict() (so it must be a DECLARED key). A save
// written before it shipped must still parse (no schema_version bump).

function baseSave(): Record<string, unknown> {
  return {
    schema_version: 2,
    mode: "infinite",
    in_progress: null,
    high_scores: { infinite: [], max_points: [], timed: [] },
    streak: null,
  };
}

describe("recent_scores contract (ADR-0036)", () => {
  it("round-trips per-mode rolling buffers", () => {
    const r = SaveV2Schema.safeParse({
      ...baseSave(),
      recent_scores: { infinite: [10, 20], max_points: [], timed: [5] },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.recent_scores?.infinite).toEqual([10, 20]);
  });

  it("back-compat: a save written before recent_scores parses; field undefined", () => {
    const r = SaveV2Schema.safeParse(baseSave());
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.recent_scores).toBeUndefined();
  });

  it("caps each bucket at 15", () => {
    const sixteen = Array.from({ length: 16 }, (_, i) => i);
    const r = SaveV2Schema.safeParse({
      ...baseSave(),
      recent_scores: { infinite: sixteen, max_points: [], timed: [] },
    });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown bucket (strict)", () => {
    const r = SaveV2Schema.safeParse({
      ...baseSave(),
      recent_scores: { infinite: [], max_points: [], timed: [], bogus: [] },
    });
    expect(r.success).toBe(false);
  });

  it("rejects a negative run score", () => {
    const r = SaveV2Schema.safeParse({
      ...baseSave(),
      recent_scores: { infinite: [-1], max_points: [], timed: [] },
    });
    expect(r.success).toBe(false);
  });
});
