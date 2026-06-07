export type { GameMode, ModeState } from "../types.js";

export type ModeContract = {
  readonly kind: "infinite" | "max-points";
  readonly label: string;
  readonly description: string;
};

export const MODE_CONTRACTS: readonly ModeContract[] = [
  {
    kind: "infinite",
    label: "Infinite",
    description: "Play until the board fills.",
  },
  {
    kind: "max-points",
    label: "Max Points",
    description: "Today's seed, best of unlimited attempts.",
  },
];
