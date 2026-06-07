import { describe, expect, it } from "vitest";
import { makeFreshSave } from "@/games/5-in-a-row/save.js";
import { SaveV1Schema, type SaveV1 } from "@/shared/schemas/5-in-a-row.save.schema.js";

describe("save round-trip", () => {
  it("makeFreshSave('infinite') passes SaveV1Schema", () => {
    const save = makeFreshSave("infinite");
    const result = SaveV1Schema.safeParse(save);
    expect(result.success).toBe(true);
  });

  it("makeFreshSave('max-points') passes SaveV1Schema", () => {
    const save = makeFreshSave("max-points");
    const result = SaveV1Schema.safeParse(save);
    expect(result.success).toBe(true);
  });

  it("makeFreshSave('infinite') has schema_version 1, mode infinite, in_progress null", () => {
    const save = makeFreshSave("infinite");
    expect(save.schema_version).toBe(1);
    expect(save.mode).toBe("infinite");
    expect(save.in_progress).toBeNull();
  });

  it("makeFreshSave('max-points') has mode max-points", () => {
    const save = makeFreshSave("max-points");
    expect(save.mode).toBe("max-points");
  });

  it("fresh save (infinite) has empty high score arrays for both modes", () => {
    const save = makeFreshSave("infinite");
    expect(save.high_scores.infinite).toEqual([]);
    expect(save.high_scores.max_points).toEqual([]);
  });

  it("fresh save (max-points) has empty high score arrays for both modes", () => {
    const save = makeFreshSave("max-points");
    expect(save.high_scores.infinite).toEqual([]);
    expect(save.high_scores.max_points).toEqual([]);
  });

  it("JSON round-trip on a fresh save parses successfully through the schema", () => {
    const save = makeFreshSave("infinite");
    const reparsed: unknown = JSON.parse(JSON.stringify(save));
    const result = SaveV1Schema.safeParse(reparsed);
    expect(result.success).toBe(true);
  });

  it("fresh save serialisation is byte-stable across a JSON round-trip", () => {
    const a = JSON.stringify(makeFreshSave("infinite"));
    const b = JSON.stringify(JSON.parse(JSON.stringify(makeFreshSave("infinite"))));
    expect(a).toBe(b);
  });

  it("a custom save with an in_progress field round-trips byte-identical", () => {
    const inProgressSave: SaveV1 = {
      schema_version: 1,
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
      high_scores: { infinite: [], max_points: [] },
    };

    const json = JSON.stringify(inProgressSave);
    const reparsed: unknown = JSON.parse(json);
    expect(JSON.stringify(reparsed)).toBe(json);

    const validated = SaveV1Schema.parse(reparsed);
    expect(validated).toEqual(inProgressSave);
  });
});
