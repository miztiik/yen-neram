import { describe, expect, it } from "vitest";
import {
  SaveSchema,
  SaveV1SchemaLegacy,
  SaveV2Schema,
} from "@/shared/schemas/5-in-a-row.save.schema.js";
import { readSave } from "@/games/5-in-a-row/save.js";

// Tests run under the `node` environment (vite.config.ts -> test.environment),
// so window.localStorage is not present. The save layer wraps every access
// in try/catch, but the V1 -> V2 migration tests below need to actually
// store and read bytes. Shim a minimal in-memory localStorage here; no
// extra dep, no per-test env switch.
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map<string, string>();
  const shim = {
    getItem: (k: string): string | null => store.get(k) ?? null,
    setItem: (k: string, v: string): void => {
      store.set(k, String(v));
    },
    removeItem: (k: string): void => {
      store.delete(k);
    },
    clear: (): void => {
      store.clear();
    },
    key: (i: number): string | null => Array.from(store.keys())[i] ?? null,
    get length(): number {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", { value: shim, configurable: true });
}

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

describe("SaveV1SchemaLegacy", () => {
  it("accepts the base valid save", () => {
    expect(SaveV1SchemaLegacy.safeParse(baseValidSave()).success).toBe(true);
  });

  it("rejects a save missing schema_version", () => {
    const bad = {
      mode: "infinite",
      in_progress: null,
      high_scores: { infinite: [], max_points: [] },
    };
    expect(SaveV1SchemaLegacy.safeParse(bad).success).toBe(false);
  });

  it("rejects schema_version 0", () => {
    const bad = { ...baseValidSave(), schema_version: 0 };
    expect(SaveV1SchemaLegacy.safeParse(bad).success).toBe(false);
  });

  it("rejects schema_version 2", () => {
    const bad = { ...baseValidSave(), schema_version: 2 };
    expect(SaveV1SchemaLegacy.safeParse(bad).success).toBe(false);
  });

  it("rejects schema_version '1' as a string", () => {
    const bad = { ...baseValidSave(), schema_version: "1" };
    expect(SaveV1SchemaLegacy.safeParse(bad).success).toBe(false);
  });

  it("rejects mode 'timed' (not a v1 mode)", () => {
    const bad = { ...baseValidSave(), mode: "timed" };
    expect(SaveV1SchemaLegacy.safeParse(bad).success).toBe(false);
  });

  it("rejects empty-string mode", () => {
    const bad = { ...baseValidSave(), mode: "" };
    expect(SaveV1SchemaLegacy.safeParse(bad).success).toBe(false);
  });

  it("rejects in_progress with a board of 8 rows", () => {
    const board = emptyBoard().slice(0, 8);
    const inProgress = { ...baseValidInProgress(), board };
    const bad = { ...baseValidSave(), in_progress: inProgress };
    expect(SaveV1SchemaLegacy.safeParse(bad).success).toBe(false);
  });

  it("rejects in_progress with a row of 8 cells", () => {
    const board = emptyBoard();
    board[0] = [null, null, null, null, null, null, null, null];
    const inProgress = { ...baseValidInProgress(), board };
    const bad = { ...baseValidSave(), in_progress: inProgress };
    expect(SaveV1SchemaLegacy.safeParse(bad).success).toBe(false);
  });

  it("rejects a cell with runGroup 0 (below valid range 1..7)", () => {
    const board = emptyBoard();
    const row0 = board[0]!;
    row0[0] = { runGroup: 0 };
    const inProgress = { ...baseValidInProgress(), board };
    const bad = { ...baseValidSave(), in_progress: inProgress };
    expect(SaveV1SchemaLegacy.safeParse(bad).success).toBe(false);
  });

  it("rejects a cell with runGroup 8 (above valid range 1..7)", () => {
    const board = emptyBoard();
    const row0 = board[0]!;
    row0[0] = { runGroup: 8 };
    const inProgress = { ...baseValidInProgress(), board };
    const bad = { ...baseValidSave(), in_progress: inProgress };
    expect(SaveV1SchemaLegacy.safeParse(bad).success).toBe(false);
  });

  it("accepts a cell with runGroup 7 (top of valid range 1..7)", () => {
    const board = emptyBoard();
    const row0 = board[0]!;
    row0[0] = { runGroup: 7 };
    const inProgress = { ...baseValidInProgress(), board };
    const good = { ...baseValidSave(), in_progress: inProgress };
    expect(SaveV1SchemaLegacy.safeParse(good).success).toBe(true);
  });

  it("rejects a cell with an extra unknown key (strict schema)", () => {
    const board = emptyBoard();
    const row0 = board[0]!;
    row0[0] = { runGroup: 1, foo: "bar" };
    const inProgress = { ...baseValidInProgress(), board };
    const bad = { ...baseValidSave(), in_progress: inProgress };
    expect(SaveV1SchemaLegacy.safeParse(bad).success).toBe(false);
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
    expect(SaveV1SchemaLegacy.safeParse(bad).success).toBe(false);
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
    expect(SaveV1SchemaLegacy.safeParse(good).success).toBe(true);
  });

  it("rejects a top_score entry with a negative score", () => {
    const bad = {
      ...baseValidSave(),
      high_scores: {
        infinite: [{ score: -1, timestamp_iso: "2026-06-07T00:00:00Z" }],
        max_points: [],
      },
    };
    expect(SaveV1SchemaLegacy.safeParse(bad).success).toBe(false);
  });

  it("rejects a top_score entry with a non-integer score", () => {
    const bad = {
      ...baseValidSave(),
      high_scores: {
        infinite: [{ score: 1.5, timestamp_iso: "2026-06-07T00:00:00Z" }],
        max_points: [],
      },
    };
    expect(SaveV1SchemaLegacy.safeParse(bad).success).toBe(false);
  });

  it("rejects mode_state 'max-points' missing target", () => {
    const inProgress = {
      ...baseValidInProgress(),
      mode_state: { kind: "max-points", seed_date: "2026-06-07" },
    };
    const bad = { ...baseValidSave(), in_progress: inProgress };
    expect(SaveV1SchemaLegacy.safeParse(bad).success).toBe(false);
  });

  it("rejects mode_state 'max-points' missing seed_date", () => {
    const inProgress = {
      ...baseValidInProgress(),
      mode_state: { kind: "max-points", target: 100 },
    };
    const bad = { ...baseValidSave(), in_progress: inProgress };
    expect(SaveV1SchemaLegacy.safeParse(bad).success).toBe(false);
  });

  it("rejects mode_state with bad discriminator 'foo'", () => {
    const inProgress = {
      ...baseValidInProgress(),
      mode_state: { kind: "foo" },
    };
    const bad = { ...baseValidSave(), in_progress: inProgress };
    expect(SaveV1SchemaLegacy.safeParse(bad).success).toBe(false);
  });

  it("rejects a V1 payload that includes the V2 streak field (strict)", () => {
    const bad = {
      ...baseValidSave(),
      streak: { current: 1, longest: 1, last_played_date: "2026-06-07" },
    };
    expect(SaveV1SchemaLegacy.safeParse(bad).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SaveV2Schema (canonical)
// ---------------------------------------------------------------------------

function baseValidV2Save() {
  return {
    schema_version: 2,
    mode: "infinite" as const,
    in_progress: null,
    high_scores: { infinite: [], max_points: [], timed: [] },
    streak: null,
  };
}

describe("SaveV2Schema (canonical SaveSchema)", () => {
  it("SaveSchema is SaveV2Schema (canonical alias)", () => {
    expect(SaveSchema).toBe(SaveV2Schema);
  });

  it("accepts a valid V2 save with timed mode + streak set", () => {
    const good = {
      schema_version: 2,
      mode: "timed",
      in_progress: {
        ...baseValidInProgress(),
        mode_state: { kind: "timed", ms_remaining: 60000, ms_window: 60000 },
      },
      high_scores: { infinite: [], max_points: [], timed: [] },
      streak: { current: 3, longest: 12, last_played_date: "2026-06-07" },
    };
    expect(SaveV2Schema.safeParse(good).success).toBe(true);
  });

  it("accepts a V2 save with streak: null", () => {
    expect(SaveV2Schema.safeParse(baseValidV2Save()).success).toBe(true);
  });

  it("rejects a V2 save missing the streak field (strict)", () => {
    const v2 = baseValidV2Save();
    const { streak: _unused, ...rest } = v2;
    void _unused;
    expect(SaveV2Schema.safeParse(rest).success).toBe(false);
  });

  it("rejects a V2 save missing high_scores.timed", () => {
    const bad = {
      ...baseValidV2Save(),
      high_scores: { infinite: [], max_points: [] },
    };
    expect(SaveV2Schema.safeParse(bad).success).toBe(false);
  });

  it("rejects a V2 save with schema_version 1", () => {
    const bad = { ...baseValidV2Save(), schema_version: 1 };
    expect(SaveV2Schema.safeParse(bad).success).toBe(false);
  });

  it("accepts mode 'timed' (which V1 rejected)", () => {
    const good = { ...baseValidV2Save(), mode: "timed" };
    expect(SaveV2Schema.safeParse(good).success).toBe(true);
  });

  it("rejects mode_state 'timed' with negative ms_remaining", () => {
    const inProgress = {
      ...baseValidInProgress(),
      mode_state: { kind: "timed", ms_remaining: -1, ms_window: 60000 },
    };
    const bad = { ...baseValidV2Save(), in_progress: inProgress };
    expect(SaveV2Schema.safeParse(bad).success).toBe(false);
  });

  it("rejects mode_state 'timed' with ms_window 0 (window must be positive)", () => {
    const inProgress = {
      ...baseValidInProgress(),
      mode_state: { kind: "timed", ms_remaining: 0, ms_window: 0 },
    };
    const bad = { ...baseValidV2Save(), in_progress: inProgress };
    expect(SaveV2Schema.safeParse(bad).success).toBe(false);
  });

  it("rejects a streak entry missing last_played_date", () => {
    const bad = {
      ...baseValidV2Save(),
      streak: { current: 1, longest: 1 },
    };
    expect(SaveV2Schema.safeParse(bad).success).toBe(false);
  });

  it("rejects a streak entry with negative current", () => {
    const bad = {
      ...baseValidV2Save(),
      streak: { current: -1, longest: 1, last_played_date: "2026-06-07" },
    };
    expect(SaveV2Schema.safeParse(bad).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// V1 -> V2 migration via readSave()
// ---------------------------------------------------------------------------

const STORAGE_KEY = "yn:game:5-in-a-row";

describe("readSave V1 -> V2 migration", () => {
  it("a V1 payload on disk parses through readSave() as a V2 save", () => {
    const v1Fixture = {
      schema_version: 1,
      mode: "max-points",
      in_progress: null,
      high_scores: {
        infinite: [{ score: 100, timestamp_iso: "2026-06-01T00:00:00Z" }],
        max_points: [{ score: 50, timestamp_iso: "2026-06-02T00:00:00Z" }],
      },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v1Fixture));
    try {
      const migrated = readSave();
      expect(migrated).not.toBeNull();
      if (migrated === null) return;
      expect(migrated.schema_version).toBe(2);
      expect(migrated.mode).toBe("max-points");
      expect(migrated.streak).toBeNull();
      expect(migrated.high_scores.timed).toEqual([]);
      // Pre-existing fields carry over verbatim.
      expect(migrated.high_scores.infinite).toEqual(v1Fixture.high_scores.infinite);
      expect(migrated.high_scores.max_points).toEqual(v1Fixture.high_scores.max_points);
      // Re-parsing through the canonical schema confirms the migrated
      // payload is a valid V2 save.
      expect(SaveSchema.safeParse(migrated).success).toBe(true);
    } finally {
      localStorage.removeItem(STORAGE_KEY);
    }
  });

  it("a V2 payload on disk round-trips without migration", () => {
    const v2Fixture = baseValidV2Save();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v2Fixture));
    try {
      const read = readSave();
      expect(read).toEqual(v2Fixture);
    } finally {
      localStorage.removeItem(STORAGE_KEY);
    }
  });

  it("returns null on a malformed JSON payload", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    try {
      expect(readSave()).toBeNull();
    } finally {
      localStorage.removeItem(STORAGE_KEY);
    }
  });

  it("returns null on a payload with an unknown schema_version", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schema_version: 99 }));
    try {
      expect(readSave()).toBeNull();
    } finally {
      localStorage.removeItem(STORAGE_KEY);
    }
  });
});
