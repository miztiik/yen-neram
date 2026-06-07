// Mode dispatch for 5-in-a-row. Pure (no DOM).

import type { GameMode, ModeState } from "../types.js";
import type { TurnState } from "../ui/turn-loop.js";
import { dailySeed } from "../engine/rng.js";

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
];

const GAME_SLUG = "5-in-a-row";

// Detect whether the game has reached its end-state for the given mode.
// Infinite ends when the board fills (countEmpty === 0).
// Max-Points has no early end; it ends on board fill, same as Infinite.
// (Per design freeze 2026-06-07.)
export function isGameOver(state: TurnState): boolean {
  return state.gameOver;
}

// Local-time YYYY-MM-DD formatter (no timezone library; just zero-padded).
export function localDateString(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${String(yyyy)}-${mm}-${dd}`;
}

// Build the initial ModeState for a fresh game in the given mode.
// For max-points: seed_date is today (local time, YYYY-MM-DD).
// For infinite: just {kind: "infinite"}.
// target=0 means "no target, just play".
export function freshModeState(mode: GameMode): ModeState {
  if (mode === "infinite") {
    return { kind: "infinite" };
  }
  return { kind: "max-points", target: 0, seed_date: localDateString() };
}

// For max-points: returns the seed for today's date (local time).
// For infinite: returns a freshly-rolled random uint32.
export function seedForMode(mode: GameMode, slug: string = GAME_SLUG): number {
  if (mode === "max-points") {
    return dailySeed(slug, new Date());
  }
  return Math.floor(Math.random() * 0xffffffff);
}
