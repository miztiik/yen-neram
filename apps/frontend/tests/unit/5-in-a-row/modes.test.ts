import { describe, expect, it } from "vitest";
import {
  MODE_CONTRACTS,
  freshModeState,
  isGameOver,
  localDateString,
  seedForMode,
} from "@/games/5-in-a-row/modes/index.js";
import { createEmptyBoard, createRng } from "@/games/5-in-a-row/engine/index.js";
import type { TurnState } from "@/games/5-in-a-row/ui/turn-loop.js";

const BASE_TURN_STATE: TurnState = {
  board: createEmptyBoard(),
  selected: null,
  nextPreview: [],
  score: 0,
  rng: createRng(0),
  gameOver: false,
  modeState: { kind: "infinite" },
};

describe("localDateString", () => {
  it("formats a known local date as YYYY-MM-DD", () => {
    expect(localDateString(new Date("2026-06-07T12:00:00"))).toBe("2026-06-07");
  });

  it("zero-pads single-digit month and day", () => {
    expect(localDateString(new Date(2026, 0, 1, 12, 0, 0))).toBe("2026-01-01");
  });

  it("returns today's date in YYYY-MM-DD format when called with no argument", () => {
    expect(localDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("freshModeState", () => {
  it("returns {kind: 'infinite'} for infinite mode", () => {
    expect(freshModeState("infinite")).toEqual({ kind: "infinite" });
  });

  it("returns {kind: 'max-points', target: 0, seed_date: <today>} for max-points mode", () => {
    const s = freshModeState("max-points");
    expect(s.kind).toBe("max-points");
    if (s.kind === "max-points") {
      expect(s.target).toBe(0);
      expect(s.seed_date).toBe(localDateString());
    }
  });
});

describe("seedForMode", () => {
  it("max-points returns the same number across two consecutive calls", () => {
    expect(seedForMode("max-points")).toBe(seedForMode("max-points"));
  });

  it("infinite returns different numbers across two consecutive calls (statistically)", () => {
    expect(seedForMode("infinite")).not.toBe(seedForMode("infinite"));
  });

  it("max-points returns a non-negative integer in uint32 range", () => {
    const v = seedForMode("max-points");
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(0xffffffff);
  });
});

describe("MODE_CONTRACTS", () => {
  it("has exactly 2 entries: infinite + max-points", () => {
    expect(MODE_CONTRACTS).toHaveLength(2);
    const kinds = MODE_CONTRACTS.map((c) => c.kind).sort();
    expect(kinds).toEqual(["infinite", "max-points"]);
  });

  it("every contract has a non-empty label and description", () => {
    for (const c of MODE_CONTRACTS) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.description.length).toBeGreaterThan(0);
    }
  });
});

describe("isGameOver", () => {
  it("returns state.gameOver verbatim when false", () => {
    expect(isGameOver(BASE_TURN_STATE)).toBe(false);
  });

  it("returns state.gameOver verbatim when true", () => {
    expect(isGameOver({ ...BASE_TURN_STATE, gameOver: true })).toBe(true);
  });
});
