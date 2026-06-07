// Public types for the 5-in-a-row engine.
// Pure: no DOM, no save, no UI imports.

export type RunGroup = number; // 1..N where N = balance.num_run_groups

export type Cell = { readonly runGroup: RunGroup } | null;

export type Board = ReadonlyArray<ReadonlyArray<Cell>>;

export type Coord = { readonly row: number; readonly col: number };

export type PreviewItem = {
  readonly row: number;
  readonly col: number;
  readonly kind: RunGroup;
};

export type GameMode = "infinite" | "max-points";

export type ModeState =
  | { readonly kind: "infinite" }
  | {
      readonly kind: "max-points";
      readonly target: number;
      readonly seed_date: string;
    };
