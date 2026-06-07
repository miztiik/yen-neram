import { describe, expect, it } from "vitest";
import { SaveV1Schema } from "@/shared/schemas/5-in-a-row.save.schema.js";

function baseValidSave() {
  return {
    schema_version: 1,
    mode: "infinite" as const,
    in_progress: null,
    high_scores: { infinite: [], max_points: [] },
  };
}

function emptyBoard(): unknown[][] {
  const row: unknown[] = [null, null, null, null, null, null, null, null, null];
  return [[...row], [...row], [...row], [...row], [...row], [...row], [...row], [...row], [...row]];
}

function baseValidInProgress(): Record<string, unknown> {
  return {
    board: emptyBoard(),
    selected_cell: null,
    next_preview: [],
    score: 0,
    turn_seed: 0,
    undo: { available: false, snapshot: null },
    mode_state: { kind: "infinite" },
  };
}

describe("SaveV1Schema", () => {
  it("accepts the base valid save", () => {
    expect(SaveV1Schema.safeParse(baseValidSave()).success).toBe(true);
  });

  it("rejects a save missing schema_version", () => {
    const bad = {
      mode: "infinite",
      in_progress: null,
      high_scores: { infinite: [], max_points: [] },
    };
    expect(SaveV1Schema.safeParse(bad).success).toBe(false);
  });

  it("rejects schema_version 0", () => {
    const bad = { ...baseValidSave(), schema_version: 0 };
    expect(SaveV1Schema.safeParse(bad).success).toBe(false);
  });

  it("rejects schema_version 2", () => {
    const bad = { ...baseValidSave(), schema_version: 2 };
    expect(SaveV1Schema.safeParse(bad).success).toBe(false);
  });

  it("rejects schema_version '1' as a string", () => {
    const bad = { ...baseValidSave(), schema_version: "1" };
    expect(SaveV1Schema.safeParse(bad).success).toBe(false);
  });

  it("rejects mode 'timed' (not a v1 mode)", () => {
    const bad = { ...baseValidSave(), mode: "timed" };
    expect(SaveV1Schema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty-string mode", () => {
    const bad = { ...baseValidSave(), mode: "" };
    expect(SaveV1Schema.safeParse(bad).success).toBe(false);
  });

  it("rejects in_progress with a board of 8 rows", () => {
    const board = emptyBoard().slice(0, 8);
    const inProgress = { ...baseValidInProgress(), board };
    const bad = { ...baseValidSave(), in_progress: inProgress };
    expect(SaveV1Schema.safeParse(bad).success).toBe(false);
  });

  it("rejects in_progress with a row of 8 cells", () => {
    const board = emptyBoard();
    board[0] = [null, null, null, null, null, null, null, null];
    const inProgress = { ...baseValidInProgress(), board };
    const bad = { ...baseValidSave(), in_progress: inProgress };
    expect(SaveV1Schema.safeParse(bad).success).toBe(false);
  });

  it("rejects a cell with runGroup 0 (below valid range 1..7)", () => {
    const board = emptyBoard();
    const row0 = board[0]!;
    row0[0] = { runGroup: 0 };
    const inProgress = { ...baseValidInProgress(), board };
    const bad = { ...baseValidSave(), in_progress: inProgress };
    expect(SaveV1Schema.safeParse(bad).success).toBe(false);
  });

  it("rejects a cell with runGroup 8 (above valid range 1..7)", () => {
    const board = emptyBoard();
    const row0 = board[0]!;
    row0[0] = { runGroup: 8 };
    const inProgress = { ...baseValidInProgress(), board };
    const bad = { ...baseValidSave(), in_progress: inProgress };
    expect(SaveV1Schema.safeParse(bad).success).toBe(false);
  });

  it("accepts a cell with runGroup 7 (top of valid range 1..7)", () => {
    const board = emptyBoard();
    const row0 = board[0]!;
    row0[0] = { runGroup: 7 };
    const inProgress = { ...baseValidInProgress(), board };
    const good = { ...baseValidSave(), in_progress: inProgress };
    expect(SaveV1Schema.safeParse(good).success).toBe(true);
  });

  it("rejects a cell with an extra unknown key (strict schema)", () => {
    const board = emptyBoard();
    const row0 = board[0]!;
    row0[0] = { runGroup: 1, foo: "bar" };
    const inProgress = { ...baseValidInProgress(), board };
    const bad = { ...baseValidSave(), in_progress: inProgress };
    expect(SaveV1Schema.safeParse(bad).success).toBe(false);
  });

  it("rejects high_scores.infinite with 11 entries (max 10)", () => {
    const entries = Array.from({ length: 11 }, (_unused, i) => ({
      score: i,
      timestamp_iso: "2026-06-07T00:00:00Z",
    }));
    const bad = {
      ...baseValidSave(),
      high_scores: { infinite: entries, max_points: [] },
    };
    expect(SaveV1Schema.safeParse(bad).success).toBe(false);
  });

  it("accepts high_scores.infinite with exactly 10 entries", () => {
    const entries = Array.from({ length: 10 }, (_unused, i) => ({
      score: i,
      timestamp_iso: "2026-06-07T00:00:00Z",
    }));
    const good = {
      ...baseValidSave(),
      high_scores: { infinite: entries, max_points: [] },
    };
    expect(SaveV1Schema.safeParse(good).success).toBe(true);
  });

  it("rejects a top_score entry with a negative score", () => {
    const bad = {
      ...baseValidSave(),
      high_scores: {
        infinite: [{ score: -1, timestamp_iso: "2026-06-07T00:00:00Z" }],
        max_points: [],
      },
    };
    expect(SaveV1Schema.safeParse(bad).success).toBe(false);
  });

  it("rejects a top_score entry with a non-integer score", () => {
    const bad = {
      ...baseValidSave(),
      high_scores: {
        infinite: [{ score: 1.5, timestamp_iso: "2026-06-07T00:00:00Z" }],
        max_points: [],
      },
    };
    expect(SaveV1Schema.safeParse(bad).success).toBe(false);
  });

  it("rejects mode_state 'max-points' missing target", () => {
    const inProgress = {
      ...baseValidInProgress(),
      mode_state: { kind: "max-points", seed_date: "2026-06-07" },
    };
    const bad = { ...baseValidSave(), in_progress: inProgress };
    expect(SaveV1Schema.safeParse(bad).success).toBe(false);
  });

  it("rejects mode_state 'max-points' missing seed_date", () => {
    const inProgress = {
      ...baseValidInProgress(),
      mode_state: { kind: "max-points", target: 100 },
    };
    const bad = { ...baseValidSave(), in_progress: inProgress };
    expect(SaveV1Schema.safeParse(bad).success).toBe(false);
  });

  it("rejects mode_state with bad discriminator 'foo'", () => {
    const inProgress = {
      ...baseValidInProgress(),
      mode_state: { kind: "foo" },
    };
    const bad = { ...baseValidSave(), in_progress: inProgress };
    expect(SaveV1Schema.safeParse(bad).success).toBe(false);
  });
});
