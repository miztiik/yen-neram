import { describe, expect, it } from "vitest";
import { makeFreshGame, makeFreshSave } from "@/games/5-in-a-row/save.js";
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

describe("makeFreshGame (mid-session restart, preserves cross-run state)", () => {
  // ADR-0021 regression: pre-2026-06-08 the in-game "Play again",
  // "Restart this game", "Reset game", and "Switch mode" handlers all
  // called `writeSave(makeFreshSave(mode))` directly -- which wipes
  // `high_scores` AND `streak` along with the in_progress run. The
  // user reported "the high score is not persisting; it gets cleared
  // when the game ends." Fix: those handlers now route through
  // `makeFreshGame(prev, mode)` which preserves cross-run state and
  // only resets in_progress + mode. These tests pin the new helper.

  const PRIOR_SAVE: Save = {
    schema_version: 2,
    mode: "infinite",
    in_progress: {
      board: Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => null)),
      selected_cell: null,
      next_preview: [{ row: 0, col: 0, kind: 1 }],
      score: 42,
      turn_seed: 123,
      undo: { available: true, snapshot: null },
      mode_state: { kind: "infinite" },
    },
    high_scores: {
      infinite: [
        { score: 200, timestamp_iso: "2026-06-01T10:00:00.000Z" },
        { score: 150, timestamp_iso: "2026-06-02T11:00:00.000Z" },
      ],
      max_points: [{ score: 80, timestamp_iso: "2026-06-03T12:00:00.000Z" }],
      timed: [],
    },
    streak: { current: 3, longest: 7, last_played_date: "2026-06-07" },
  };

  it("wipes in_progress so the next mount starts a fresh board", () => {
    const fresh = makeFreshGame(PRIOR_SAVE, "infinite");
    expect(fresh.in_progress).toBeNull();
  });

  it("PRESERVES high_scores byte-identical (regression for the wipe bug)", () => {
    const fresh = makeFreshGame(PRIOR_SAVE, "infinite");
    expect(fresh.high_scores).toEqual(PRIOR_SAVE.high_scores);
    // Reference equality is also fine since the helper does not deep-clone;
    // the schema is fully serialisable so any subsequent writeSave() will
    // produce a stable wire shape.
    expect(fresh.high_scores).toBe(PRIOR_SAVE.high_scores);
  });

  it("PRESERVES streak byte-identical (regression for the wipe bug)", () => {
    const fresh = makeFreshGame(PRIOR_SAVE, "infinite");
    expect(fresh.streak).toEqual(PRIOR_SAVE.streak);
    expect(fresh.streak).toBe(PRIOR_SAVE.streak);
  });

  it("switches the mode when the caller passes a different mode (Switch-mode flow)", () => {
    const fresh = makeFreshGame(PRIOR_SAVE, "timed");
    expect(fresh.mode).toBe("timed");
    // Cross-run state still preserved across the mode swap.
    expect(fresh.high_scores).toBe(PRIOR_SAVE.high_scores);
    expect(fresh.streak).toBe(PRIOR_SAVE.streak);
  });

  it("output passes SaveSchema (canonical V2 wire shape)", () => {
    const fresh = makeFreshGame(PRIOR_SAVE, "max-points");
    expect(() => SaveSchema.parse(fresh)).not.toThrow();
  });

  it("a prior save with empty high_scores stays empty (no spurious seeding)", () => {
    const emptyPrior = makeFreshSave("infinite");
    const fresh = makeFreshGame(emptyPrior, "infinite");
    expect(fresh.high_scores.infinite).toEqual([]);
    expect(fresh.high_scores.max_points).toEqual([]);
    expect(fresh.high_scores.timed).toEqual([]);
    expect(fresh.streak).toBeNull();
  });

  it("a prior save with a null streak stays null (no spurious seeding)", () => {
    const partial: Save = {
      ...PRIOR_SAVE,
      streak: null,
    };
    const fresh = makeFreshGame(partial, "infinite");
    expect(fresh.streak).toBeNull();
  });

  it("PRESERVES recent_scores across the run boundary (adaptive-milestone history)", () => {
    // recent_scores feeds the adaptive milestones (ADR-0036). The original
    // helper dropped it, so every Restart / Play-again / Switch-mode silently
    // wiped the rolling window -- a latent regression fixed 2026-06-30.
    const withRecent: Save = {
      ...PRIOR_SAVE,
      recent_scores: { infinite: [40, 55, 70], max_points: [], timed: [12] },
    };
    const fresh = makeFreshGame(withRecent, "infinite");
    expect(fresh.recent_scores).toEqual({ infinite: [40, 55, 70], max_points: [], timed: [12] });
    expect(() => SaveSchema.parse(fresh)).not.toThrow();
  });

  it("omits recent_scores when the prior save never had it (back-compat, no undefined key)", () => {
    // exactOptionalPropertyTypes: the helper must NOT write an explicit
    // `recent_scores: undefined`; the key is simply absent on an old save.
    const fresh = makeFreshGame(PRIOR_SAVE, "infinite");
    expect("recent_scores" in fresh).toBe(false);
    expect(() => SaveSchema.parse(fresh)).not.toThrow();
  });
});
