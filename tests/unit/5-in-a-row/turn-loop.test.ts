import { describe, expect, it } from "vitest";
import type { Board, Coord, ModeState, PreviewItem, RunGroup } from "@/games/5-in-a-row/types.js";
import type { Rng } from "@/games/5-in-a-row/engine/index.js";
import {
  BOARD_SIZE,
  countFilled,
  createEmptyBoard,
  createRng,
  getCell,
  setCell,
} from "@/games/5-in-a-row/engine/index.js";
import {
  attemptMove,
  createInitialTurnState,
  deselect,
  selectCell,
  type TurnState,
} from "@/games/5-in-a-row/ui/turn-loop.js";

const BALANCE = {
  board_size: 9,
  min_line_length: 5,
  num_run_groups: 6,
  spawn_per_turn: 3,
  preview_count: 3,
  initial_seed_count: 5,
  length_multipliers: { "5": 1, "6": 1.5, "7": 2, "8": 3, "9": 5 },
  intersection_bonus: 1.5,
  cascade_bonus: 2,
};

const INFINITE_MODE: ModeState = { kind: "infinite" };

const NO_PREVIEW: readonly PreviewItem[] = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type BuildStateOpts = {
  readonly board: Board;
  readonly selected: Coord | null;
  readonly nextPreview: readonly PreviewItem[];
  readonly score?: number;
  readonly rng?: Rng;
  readonly gameOver?: boolean;
  readonly modeState?: ModeState;
};

function buildState(opts: BuildStateOpts): TurnState {
  return {
    board: opts.board,
    selected: opts.selected,
    nextPreview: opts.nextPreview,
    score: opts.score ?? 0,
    rng: opts.rng ?? createRng(0),
    gameOver: opts.gameOver ?? false,
    modeState: opts.modeState ?? INFINITE_MODE,
  };
}

// Place `length` consecutive cells of the same runGroup starting at
// (startRow, startCol), stepping by (dr, dc). Returns a new state.
function placeRun(
  state: TurnState,
  startRow: number,
  startCol: number,
  dr: number,
  dc: number,
  length: number,
  runGroup: RunGroup,
): TurnState {
  let board = state.board;
  for (let i = 0; i < length; i++) {
    board = setCell(board, startRow + dr * i, startCol + dc * i, { runGroup });
  }
  return { ...state, board };
}

// Place a list of (row, col, runGroup) tuples on the board. Returns a new state.
function placeAt(
  state: TurnState,
  ...placements: ReadonlyArray<{
    readonly row: number;
    readonly col: number;
    readonly runGroup: RunGroup;
  }>
): TurnState {
  let board = state.board;
  for (const p of placements) {
    board = setCell(board, p.row, p.col, { runGroup: p.runGroup });
  }
  return { ...state, board };
}

// Fill the entire 9x9 board with a 4-coloring (((2 * r + c) % 4) + 1) that
// contains no 5-in-a-row of any colour on any of the four axes. Cells in
// `omit` are left empty. Used to build line-safe near-full boards.
function fillNoLines(state: TurnState, omit: ReadonlyArray<Coord> = []): TurnState {
  const omitKeys = new Set<string>(omit.map((c) => `${String(c.row)},${String(c.col)}`));
  let board = state.board;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (omitKeys.has(`${String(r)},${String(c)}`)) continue;
      board = setCell(board, r, c, { runGroup: ((2 * r + c) % 4) + 1 });
    }
  }
  return { ...state, board };
}

// ---------------------------------------------------------------------------
// createInitialTurnState
// ---------------------------------------------------------------------------

describe("createInitialTurnState", () => {
  it("seeds the board with exactly initial_seed_count motifs", () => {
    const state = createInitialTurnState(createRng(42), INFINITE_MODE, BALANCE);
    expect(countFilled(state.board)).toBe(BALANCE.initial_seed_count);
  });

  it("fills next_preview with exactly preview_count items", () => {
    const state = createInitialTurnState(createRng(42), INFINITE_MODE, BALANCE);
    expect(state.nextPreview.length).toBe(BALANCE.preview_count);
  });

  it("starts with no cell selected", () => {
    const state = createInitialTurnState(createRng(42), INFINITE_MODE, BALANCE);
    expect(state.selected).toBeNull();
  });

  it("starts with score 0", () => {
    const state = createInitialTurnState(createRng(42), INFINITE_MODE, BALANCE);
    expect(state.score).toBe(0);
  });

  it("starts not game over", () => {
    const state = createInitialTurnState(createRng(42), INFINITE_MODE, BALANCE);
    expect(state.gameOver).toBe(false);
  });

  it("is deterministic: the same seed produces the same initial board layout", () => {
    const a = createInitialTurnState(createRng(42), INFINITE_MODE, BALANCE);
    const b = createInitialTurnState(createRng(42), INFINITE_MODE, BALANCE);
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        expect(getCell(b.board, r, c)).toEqual(getCell(a.board, r, c));
      }
    }
  });

  it("every placed motif has runGroup in [1, num_run_groups]", () => {
    const state = createInitialTurnState(createRng(42), INFINITE_MODE, BALANCE);
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const cell = getCell(state.board, r, c);
        if (cell === null) continue;
        expect(cell.runGroup).toBeGreaterThanOrEqual(1);
        expect(cell.runGroup).toBeLessThanOrEqual(BALANCE.num_run_groups);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// selectCell + deselect
// ---------------------------------------------------------------------------

describe("selectCell", () => {
  it("selecting a filled cell sets selected to that coord", () => {
    const baseline = buildState({
      board: createEmptyBoard(),
      selected: null,
      nextPreview: NO_PREVIEW,
    });
    const state = placeAt(baseline, { row: 3, col: 4, runGroup: 1 });
    const next = selectCell(state, { row: 3, col: 4 });
    expect(next.selected).toEqual({ row: 3, col: 4 });
  });

  it("selecting an empty cell does not set selected to that empty coord", () => {
    const baseline = buildState({
      board: createEmptyBoard(),
      selected: null,
      nextPreview: NO_PREVIEW,
    });
    const state = placeAt(baseline, { row: 3, col: 4, runGroup: 1 });
    const next = selectCell(state, { row: 0, col: 0 });
    expect(next.selected).not.toEqual({ row: 0, col: 0 });
  });

  it("selecting a different filled cell overwrites the previous selection", () => {
    const baseline = buildState({
      board: createEmptyBoard(),
      selected: { row: 3, col: 4 },
      nextPreview: NO_PREVIEW,
    });
    const state = placeAt(
      baseline,
      { row: 3, col: 4, runGroup: 1 },
      { row: 5, col: 6, runGroup: 2 },
    );
    const next = selectCell(state, { row: 5, col: 6 });
    expect(next.selected).toEqual({ row: 5, col: 6 });
  });
});

describe("deselect", () => {
  it("sets selected back to null", () => {
    const baseline = buildState({
      board: createEmptyBoard(),
      selected: { row: 3, col: 4 },
      nextPreview: NO_PREVIEW,
    });
    const state = placeAt(baseline, { row: 3, col: 4, runGroup: 1 });
    const next = deselect(state);
    expect(next.selected).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// attemptMove
// ---------------------------------------------------------------------------

describe("attemptMove", () => {
  it("returns {kind: 'no-source'} when no source is selected", () => {
    const state = buildState({
      board: createEmptyBoard(),
      selected: null,
      nextPreview: NO_PREVIEW,
    });
    const outcome = attemptMove(state, { row: 4, col: 4 }, BALANCE);
    expect(outcome.kind).toBe("no-source");
  });

  it("returns {kind: 'unreachable'} when the destination is walled off from the source", () => {
    // Source at (0, 0). Row 1 is a wall of runGroup-2 cells across all 9 columns,
    // so the lower 8 rows are unreachable from row 0.
    const baseline = buildState({
      board: createEmptyBoard(),
      selected: { row: 0, col: 0 },
      nextPreview: [
        { row: 8, col: 0, kind: 3 },
        { row: 8, col: 1, kind: 4 },
        { row: 8, col: 2, kind: 5 },
      ],
    });
    const sourced = placeAt(baseline, { row: 0, col: 0, runGroup: 1 });
    const walled = placeRun(sourced, 1, 0, 0, 1, BOARD_SIZE, 2);

    const outcome = attemptMove(walled, { row: 8, col: 8 }, BALANCE);
    expect(outcome.kind).toBe("unreachable");
    if (outcome.kind !== "unreachable") return;
    expect(outcome.from).toEqual({ row: 0, col: 0 });
    expect(outcome.to).toEqual({ row: 8, col: 8 });
  });

  it("performs a basic move on a near-empty board: motif relocates, spawn fires, no clear", () => {
    const baseline = buildState({
      board: createEmptyBoard(),
      selected: { row: 0, col: 0 },
      nextPreview: [
        { row: 8, col: 0, kind: 2 },
        { row: 8, col: 1, kind: 3 },
        { row: 8, col: 2, kind: 4 },
      ],
      rng: createRng(42),
    });
    const state = placeAt(baseline, { row: 0, col: 0, runGroup: 1 });
    const outcome = attemptMove(state, { row: 0, col: 1 }, BALANCE);
    expect(outcome.kind).toBe("moved");
    if (outcome.kind !== "moved") return;
    // Motif moved from (0, 0) to (0, 1).
    expect(getCell(outcome.postMoveState.board, 0, 1)).toEqual({ runGroup: 1 });
    expect(getCell(outcome.postMoveState.board, 0, 0)).toBeNull();
    // No clear.
    expect(outcome.clears.length).toBe(0);
    // Spawn fires with spawn_per_turn entries (board has many empty cells).
    expect(outcome.spawnedAt.length).toBe(BALANCE.spawn_per_turn);
    // No score gain (no clear).
    expect(outcome.postMoveState.score).toBe(state.score);
    // Selection cleared after move.
    expect(outcome.postMoveState.selected).toBeNull();
  });

  it("clears a 5-line, scores 5, and skips spawning on the clearing turn", () => {
    // 4-cell horizontal run row 4 cols 0..3 runGroup 1.
    // Source motif runGroup 1 at (0, 4); path down column 4 is empty.
    // After moving the source to (4, 4), row 4 cols 0..4 form a 5-line clear.
    const baseline = buildState({
      board: createEmptyBoard(),
      selected: { row: 0, col: 4 },
      nextPreview: [
        { row: 8, col: 0, kind: 2 },
        { row: 8, col: 1, kind: 3 },
        { row: 8, col: 2, kind: 4 },
      ],
      rng: createRng(42),
    });
    const withRun = placeRun(baseline, 4, 0, 0, 1, 4, 1);
    const state = placeAt(withRun, { row: 0, col: 4, runGroup: 1 });

    const outcome = attemptMove(state, { row: 4, col: 4 }, BALANCE);
    expect(outcome.kind).toBe("moved");
    if (outcome.kind !== "moved") return;
    expect(outcome.clears.length).toBe(1);
    const firstClear = outcome.clears[0];
    expect(firstClear).toBeDefined();
    if (firstClear === undefined) return;
    expect(firstClear.cells.size).toBe(5);
    // Length-mult 1 (length 5) * intersection 1 (one line) * cascade 1 (index 0)
    // => 5 cells * 1 = 5.
    expect(outcome.postMoveState.score).toBe(5);
    // Classic Color Lines: a clearing turn skips spawning.
    expect(outcome.spawnedAt.length).toBe(0);
  });

  it("triggers gameOver when the move fills the last empty cell", () => {
    // 80 cells filled with a no-line 4-coloring; the single empty cell is (0, 1).
    // Source is the (0, 0) motif (runGroup 1 per the coloring). After moving
    // (0, 0) -> (0, 1), the implementation spawns into the only remaining empty
    // cell (0, 0). The coloring is constructed so neither the move nor any
    // possible spawn colour forms a 5-line, so the board ends fully filled.
    const baseline = buildState({
      board: createEmptyBoard(),
      selected: { row: 0, col: 0 },
      nextPreview: [
        { row: 4, col: 4, kind: 1 },
        { row: 5, col: 5, kind: 2 },
        { row: 6, col: 6, kind: 3 },
      ],
      rng: createRng(42),
    });
    const state = fillNoLines(baseline, [{ row: 0, col: 1 }]);

    const outcome = attemptMove(state, { row: 0, col: 1 }, BALANCE);
    expect(outcome.kind).toBe("moved");
    if (outcome.kind !== "moved") return;
    expect(outcome.postMoveState.gameOver).toBe(true);
  });

  it("is RNG-deterministic: same rng cursor and same move yield the same spawnedAt", () => {
    const makeState = (): TurnState => {
      const baseline = buildState({
        board: createEmptyBoard(),
        selected: { row: 0, col: 0 },
        nextPreview: [
          { row: 8, col: 0, kind: 2 },
          { row: 8, col: 1, kind: 3 },
          { row: 8, col: 2, kind: 4 },
        ],
        rng: createRng(123),
      });
      return placeAt(baseline, { row: 0, col: 0, runGroup: 1 });
    };
    const first = attemptMove(makeState(), { row: 0, col: 1 }, BALANCE);
    const second = attemptMove(makeState(), { row: 0, col: 1 }, BALANCE);
    expect(first.kind).toBe("moved");
    expect(second.kind).toBe("moved");
    if (first.kind !== "moved" || second.kind !== "moved") return;
    expect(second.spawnedAt).toEqual(first.spawnedAt);
  });
});
