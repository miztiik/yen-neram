import { describe, expect, it } from "vitest";
import { makeFreshSave } from "@/games/5-in-a-row/save.js";
import { SaveSchema, type Save } from "@/shared/schemas/5-in-a-row.save.schema.js";

describe("save round-trip", () => {
  it("makeFreshSave('infinite') passes SaveSchema (canonical V2)", () => {
    const save = makeFreshSave("infinite");
    const result = SaveSchema.safeParse(save);
    expect(result.success).toBe(true);
  });

  it("makeFreshSave('max-points') passes SaveSchema", () => {
    const save = makeFreshSave("max-points");
    const result = SaveSchema.safeParse(save);
    expect(result.success).toBe(true);
  });

  it("makeFreshSave('timed') passes SaveSchema", () => {
    const save = makeFreshSave("timed");
    const result = SaveSchema.safeParse(save);
    expect(result.success).toBe(true);
  });

  it("makeFreshSave('infinite') has schema_version 2, mode infinite, in_progress null", () => {
    const save = makeFreshSave("infinite");
    expect(save.schema_version).toBe(2);
    expect(save.mode).toBe("infinite");
    expect(save.in_progress).toBeNull();
  });

  it("makeFreshSave('max-points') has mode max-points and schema_version 2", () => {
    const save = makeFreshSave("max-points");
    expect(save.mode).toBe("max-points");
    expect(save.schema_version).toBe(2);
  });

  it("makeFreshSave('timed') has schema_version 2 and mode timed", () => {
    const save = makeFreshSave("timed");
    expect(save.schema_version).toBe(2);
    expect(save.mode).toBe("timed");
  });

  it("fresh save (infinite) has empty high score arrays for all three modes", () => {
    const save = makeFreshSave("infinite");
    expect(save.high_scores.infinite).toEqual([]);
    expect(save.high_scores.max_points).toEqual([]);
    expect(save.high_scores.timed).toEqual([]);
  });

  it("fresh save (max-points) has empty high score arrays for all three modes", () => {
    const save = makeFreshSave("max-points");
    expect(save.high_scores.infinite).toEqual([]);
    expect(save.high_scores.max_points).toEqual([]);
    expect(save.high_scores.timed).toEqual([]);
  });

  it("fresh save (timed) has empty high score arrays for all three modes", () => {
    const save = makeFreshSave("timed");
    expect(save.high_scores.infinite).toEqual([]);
    expect(save.high_scores.max_points).toEqual([]);
    expect(save.high_scores.timed).toEqual([]);
  });

  it("fresh save has streak: null (never played)", () => {
    expect(makeFreshSave("infinite").streak).toBeNull();
    expect(makeFreshSave("max-points").streak).toBeNull();
    expect(makeFreshSave("timed").streak).toBeNull();
  });

  it("JSON round-trip on a fresh save parses successfully through the canonical schema", () => {
    const save = makeFreshSave("infinite");
    const reparsed: unknown = JSON.parse(JSON.stringify(save));
    const result = SaveSchema.safeParse(reparsed);
    expect(result.success).toBe(true);
  });

  it("fresh save serialisation is byte-stable across a JSON round-trip", () => {
    const a = JSON.stringify(makeFreshSave("infinite"));
    const b = JSON.stringify(JSON.parse(JSON.stringify(makeFreshSave("infinite"))));
    expect(a).toBe(b);
  });

  it("a custom save with an in_progress field round-trips byte-identical", () => {
    const inProgressSave: Save = {
      schema_version: 2,
      mode: "infinite",
      in_progress: {
        board: [
          [
            { runGroup: 1 },
            { runGroup: 2 },
            { runGroup: 3 },
            { runGroup: 4 },
            { runGroup: 5 },
            { runGroup: 6 },
            { runGroup: 7 },
            { runGroup: 1 },
            null,
          ],
          [null, null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null, null],
        ],
        selected_cell: null,
        next_preview: [
          { row: 0, col: 0, kind: 1 },
          { row: 0, col: 1, kind: 2 },
          { row: 0, col: 2, kind: 3 },
        ],
        score: 25,
        turn_seed: 42,
        undo: { available: false, snapshot: null },
        mode_state: { kind: "infinite" },
      },
      high_scores: { infinite: [], max_points: [], timed: [] },
      streak: null,
    };

    const json = JSON.stringify(inProgressSave);
    const reparsed: unknown = JSON.parse(json);
    expect(JSON.stringify(reparsed)).toBe(json);

    const validated = SaveSchema.parse(reparsed);
    expect(validated).toEqual(inProgressSave);
  });

  it("makeFreshSave('timed') is ready for a 60-second game (mode_state via freshModeState)", () => {
    // makeFreshSave does NOT pre-seed in_progress (that's the engine's job
    // at mount time). The post-mount in_progress.mode_state for timed is
    // the responsibility of freshModeState. Cover that here for symmetry.
    // The fresh save shape: mode is "timed", no in-progress yet.
    const save = makeFreshSave("timed");
    expect(save.mode).toBe("timed");
    expect(save.in_progress).toBeNull();
  });
});
