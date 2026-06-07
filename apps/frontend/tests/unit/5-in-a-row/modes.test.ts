import { describe, expect, it } from "vitest";
import {
  MODE_CONTRACTS,
  extendTimeForClear,
  freshModeState,
  isGameOver,
  localDateString,
  recordPlayedToday,
  seedForMode,
  yesterdayLocal,
} from "@/games/5-in-a-row/modes/index.js";
import { createEmptyBoard, createRng } from "@/games/5-in-a-row/engine/index.js";
import type { ModeState, Streak } from "@/games/5-in-a-row/types.js";
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

describe("yesterdayLocal", () => {
  it("returns the day before a known local date", () => {
    expect(yesterdayLocal(new Date(2026, 5, 7, 12))).toBe("2026-06-06");
  });

  it("rolls back over a month boundary", () => {
    expect(yesterdayLocal(new Date(2026, 5, 1, 12))).toBe("2026-05-31");
  });

  it("rolls back over a year boundary", () => {
    expect(yesterdayLocal(new Date(2026, 0, 1, 12))).toBe("2025-12-31");
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

  it("returns {kind: 'timed', ms_remaining: 60000, ms_window: 60000} for timed mode", () => {
    const s = freshModeState("timed");
    expect(s.kind).toBe("timed");
    if (s.kind === "timed") {
      expect(s.ms_remaining).toBe(60000);
      expect(s.ms_window).toBe(60000);
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

  it("timed returns different numbers across two consecutive calls (statistically)", () => {
    expect(seedForMode("timed")).not.toBe(seedForMode("timed"));
  });

  it("max-points returns a non-negative integer in uint32 range", () => {
    const v = seedForMode("max-points");
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(0xffffffff);
  });
});

describe("MODE_CONTRACTS", () => {
  it("has exactly 3 entries: infinite + max-points + timed", () => {
    expect(MODE_CONTRACTS).toHaveLength(3);
    const kinds = MODE_CONTRACTS.map((c) => c.kind).sort();
    expect(kinds).toEqual(["infinite", "max-points", "timed"]);
  });

  it("every contract has a non-empty label and description", () => {
    for (const c of MODE_CONTRACTS) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.description.length).toBeGreaterThan(0);
    }
  });

  it("timed mode has label 'Timed' and a description that mentions seconds", () => {
    const timed = MODE_CONTRACTS.find((c) => c.kind === "timed");
    expect(timed).toBeDefined();
    if (timed === undefined) return;
    expect(timed.label).toBe("Timed");
    expect(timed.description.toLowerCase()).toMatch(/seconds|clears/);
  });
});

describe("isGameOver", () => {
  it("returns state.gameOver verbatim when false (infinite mode)", () => {
    expect(isGameOver(BASE_TURN_STATE)).toBe(false);
  });

  it("returns state.gameOver verbatim when true (infinite mode)", () => {
    expect(isGameOver({ ...BASE_TURN_STATE, gameOver: true })).toBe(true);
  });

  it("returns true for a timed game with ms_remaining === 0", () => {
    const timedState: TurnState = {
      ...BASE_TURN_STATE,
      modeState: { kind: "timed", ms_remaining: 0, ms_window: 60000 },
    };
    expect(isGameOver(timedState)).toBe(true);
  });

  it("returns true for a timed game with negative ms_remaining (defence)", () => {
    const timedState: TurnState = {
      ...BASE_TURN_STATE,
      modeState: { kind: "timed", ms_remaining: -100, ms_window: 60000 },
    };
    expect(isGameOver(timedState)).toBe(true);
  });

  it("returns false for a timed game with ms_remaining > 0", () => {
    const timedState: TurnState = {
      ...BASE_TURN_STATE,
      modeState: { kind: "timed", ms_remaining: 1, ms_window: 60000 },
    };
    expect(isGameOver(timedState)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extendTimeForClear
// ---------------------------------------------------------------------------

const TIMED_BASE: ModeState = { kind: "timed", ms_remaining: 10000, ms_window: 60000 };

describe("extendTimeForClear", () => {
  it("adds +5000ms for a 5-line clear", () => {
    const next = extendTimeForClear(TIMED_BASE, 5);
    expect(next.kind).toBe("timed");
    if (next.kind === "timed") {
      expect(next.ms_remaining).toBe(15000);
      expect(next.ms_window).toBe(60000);
    }
  });

  it("adds +10000ms for a 6-line clear", () => {
    const next = extendTimeForClear(TIMED_BASE, 6);
    if (next.kind === "timed") expect(next.ms_remaining).toBe(20000);
  });

  it("adds +15000ms for a 7-line clear", () => {
    const next = extendTimeForClear(TIMED_BASE, 7);
    if (next.kind === "timed") expect(next.ms_remaining).toBe(25000);
  });

  it("adds +15000ms for an 8-line clear", () => {
    const next = extendTimeForClear(TIMED_BASE, 8);
    if (next.kind === "timed") expect(next.ms_remaining).toBe(25000);
  });

  it("adds +15000ms for a 9-line clear", () => {
    const next = extendTimeForClear(TIMED_BASE, 9);
    if (next.kind === "timed") expect(next.ms_remaining).toBe(25000);
  });

  it("non-timed (infinite) mode: returns the mode state unchanged", () => {
    const infiniteState: ModeState = { kind: "infinite" };
    expect(extendTimeForClear(infiniteState, 7)).toBe(infiniteState);
  });

  it("non-timed (max-points) mode: returns the mode state unchanged", () => {
    const mpState: ModeState = { kind: "max-points", target: 100, seed_date: "2026-06-07" };
    expect(extendTimeForClear(mpState, 7)).toBe(mpState);
  });

  it("preserves ms_window when extending ms_remaining", () => {
    const next = extendTimeForClear(TIMED_BASE, 5);
    if (next.kind === "timed") expect(next.ms_window).toBe(TIMED_BASE.ms_window);
  });
});

// ---------------------------------------------------------------------------
// recordPlayedToday
// ---------------------------------------------------------------------------

describe("recordPlayedToday", () => {
  const today = new Date(2026, 5, 7, 12); // 2026-06-07 local noon
  const todayStr = "2026-06-07";
  const yesterdayStr = "2026-06-06";
  const twoDaysAgoStr = "2026-06-05";

  it("null streak (first play ever) -> {current: 1, longest: 1, last_played_date: today}", () => {
    expect(recordPlayedToday(null, today)).toEqual({
      current: 1,
      longest: 1,
      last_played_date: todayStr,
    });
  });

  it("same-day replay -> streak unchanged", () => {
    const prev: Streak = { current: 3, longest: 7, last_played_date: todayStr };
    expect(recordPlayedToday(prev, today)).toBe(prev);
  });

  it("yesterday -> current increments to 2, longest follows current", () => {
    const prev: Streak = { current: 1, longest: 1, last_played_date: yesterdayStr };
    expect(recordPlayedToday(prev, today)).toEqual({
      current: 2,
      longest: 2,
      last_played_date: todayStr,
    });
  });

  it("yesterday -> current 5 increments to 6, longest 6 stays at 6 (tie)", () => {
    const prev: Streak = { current: 5, longest: 6, last_played_date: yesterdayStr };
    expect(recordPlayedToday(prev, today)).toEqual({
      current: 6,
      longest: 6,
      last_played_date: todayStr,
    });
  });

  it("2-day gap -> resets current to 1, longest preserved", () => {
    const prev: Streak = { current: 4, longest: 9, last_played_date: twoDaysAgoStr };
    expect(recordPlayedToday(prev, today)).toEqual({
      current: 1,
      longest: 9,
      last_played_date: todayStr,
    });
  });

  it("year-old gap -> resets current to 1, longest preserved", () => {
    const prev: Streak = { current: 4, longest: 9, last_played_date: "2025-06-07" };
    expect(recordPlayedToday(prev, today)).toEqual({
      current: 1,
      longest: 9,
      last_played_date: todayStr,
    });
  });

  it("longest is preserved across a reset (gap -> incrementing run never exceeds prior longest)", () => {
    let s: Streak | null = null;
    s = recordPlayedToday(s, new Date(2026, 5, 1, 12)); // day 1: current=1, longest=1
    s = recordPlayedToday(s, new Date(2026, 5, 2, 12)); // day 2: current=2, longest=2
    s = recordPlayedToday(s, new Date(2026, 5, 3, 12)); // day 3: current=3, longest=3
    s = recordPlayedToday(s, new Date(2026, 5, 4, 12)); // day 4: current=4, longest=4
    expect(s.longest).toBe(4);
    // Skip a day; current resets but longest remains 4.
    s = recordPlayedToday(s, new Date(2026, 5, 6, 12));
    expect(s.current).toBe(1);
    expect(s.longest).toBe(4);
    // Building back up: current goes 1, 2; still below longest=4.
    s = recordPlayedToday(s, new Date(2026, 5, 7, 12));
    expect(s.current).toBe(2);
    expect(s.longest).toBe(4);
  });
});
