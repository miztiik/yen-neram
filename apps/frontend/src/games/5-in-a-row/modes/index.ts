// Mode dispatch for 5-in-a-row. Pure (no DOM).

import type { GameMode, ModeState, Streak } from "../types.js";
import type { TurnState } from "../ui/turn-loop.js";
import { dailySeed } from "../engine/rng.js";
import balanceJson from "../balance.json";

type TimedConfig = {
  readonly window_ms: number;
  readonly extend_5_ms: number;
  readonly extend_6_ms: number;
  readonly extend_7plus_ms: number;
};

const TIMED: TimedConfig = (balanceJson as unknown as { readonly timed: TimedConfig }).timed;

export type ModeContract = {
  readonly kind: GameMode;
  readonly label: string;
  readonly description: string;
};

export const MODE_CONTRACTS: readonly ModeContract[] = [
  { kind: "infinite", label: "Infinite", description: "Play until the board fills." },
  {
    kind: "max-points",
    label: "Max Points",
    description: "Today's seed, unlimited attempts, best wins.",
  },
  {
    kind: "timed",
    label: "Timed",
    description: "60 seconds. Clears add time.",
  },
];

const GAME_SLUG = "5-in-a-row";

// Detect whether the game has reached its end-state for the given mode.
// Infinite ends when the board fills (countEmpty === 0).
// Max-Points has no early end; it ends on board fill, same as Infinite.
// Timed ends additionally when the countdown reaches 0.
// (Per design freeze 2026-06-07.)
export function isGameOver(state: TurnState): boolean {
  if (state.gameOver) return true;
  if (state.modeState.kind === "timed" && state.modeState.ms_remaining <= 0) return true;
  return false;
}

// Local-time YYYY-MM-DD formatter (no timezone library; just zero-padded).
export function localDateString(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${String(yyyy)}-${mm}-${dd}`;
}

// Yesterday in local time, formatted as YYYY-MM-DD. Goes through Date
// constructor with day-of-month - 1 so month/year rollover is handled by
// the platform (Jan 1 - 1 = Dec 31 of prev year).
export function yesterdayLocal(now: Date = new Date()): string {
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return localDateString(yesterday);
}

// Build the initial ModeState for a fresh game in the given mode.
// For max-points: seed_date is today (local time, YYYY-MM-DD).
// For infinite: just {kind: "infinite"}.
// For timed: ms_remaining and ms_window are both balance.timed.window_ms
// (default 60000 = 60 seconds).
// target=0 means "no target, just play".
export function freshModeState(mode: GameMode): ModeState {
  if (mode === "infinite") {
    return { kind: "infinite" };
  }
  if (mode === "timed") {
    return { kind: "timed", ms_remaining: TIMED.window_ms, ms_window: TIMED.window_ms };
  }
  return { kind: "max-points", target: 0, seed_date: localDateString() };
}

// For max-points: returns the seed for today's date (local time).
// For infinite + timed: returns a freshly-rolled random uint32.
export function seedForMode(mode: GameMode, slug: string = GAME_SLUG): number {
  if (mode === "max-points") {
    return dailySeed(slug, new Date());
  }
  return Math.floor(Math.random() * 0xffffffff);
}

// Apply the timed-mode time bonus for a clear of the given longest-line
// length. Returns the new ModeState; non-timed modes pass through
// unchanged. Per design freeze 2026-06-07: 5-line +5s, 6-line +10s,
// 7+-line +15s. Exact numbers live in balance.json so balance tweaks
// don't require a code change.
export function extendTimeForClear(modeState: ModeState, longestLineLength: number): ModeState {
  if (modeState.kind !== "timed") return modeState;
  let extra: number;
  if (longestLineLength <= 5) extra = TIMED.extend_5_ms;
  else if (longestLineLength === 6) extra = TIMED.extend_6_ms;
  else extra = TIMED.extend_7plus_ms;
  return { ...modeState, ms_remaining: modeState.ms_remaining + extra };
}

// Roll the daily-streak forward by one play on the given local date.
// - null streak (never played)      -> start at 1.
// - last_played_date == today       -> already counted today; unchanged.
// - last_played_date == yesterday   -> increment current; bump longest.
// - any older / non-adjacent date   -> reset current to 1; keep longest.
// The streak field is local-date keyed; midnight rollover is the device's,
// not a server's. (See ADR-0014.)
export function recordPlayedToday(streak: Streak | null, now: Date = new Date()): Streak {
  const today = localDateString(now);
  if (streak === null) {
    return { current: 1, longest: 1, last_played_date: today };
  }
  if (streak.last_played_date === today) {
    return streak;
  }
  const yesterday = yesterdayLocal(now);
  if (streak.last_played_date === yesterday) {
    const nextCurrent = streak.current + 1;
    return {
      current: nextCurrent,
      longest: Math.max(streak.longest, nextCurrent),
      last_played_date: today,
    };
  }
  return { current: 1, longest: streak.longest, last_played_date: today };
}
