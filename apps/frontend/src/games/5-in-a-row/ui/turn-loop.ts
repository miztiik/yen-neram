// Pure turn-loop state machine for 5-in-a-row.
// NO DOM, no save imports. Composes the engine.

import type { Board, Coord, ModeState, PreviewItem, RunGroup } from "../types.js";
import { createEmptyBoard, findEmptyCoords, getCell, setCell } from "../engine/board.js";
import { findPath } from "../engine/pathfind.js";
import { detectLines, type LineDetectResult } from "../engine/line-detect.js";
import { scoreSingleClear } from "../engine/score.js";
import type { Rng } from "../engine/rng.js";

export type TurnState = {
  readonly board: Board;
  readonly selected: Coord | null;
  readonly nextPreview: readonly PreviewItem[];
  readonly score: number;
  readonly rng: Rng;
  readonly gameOver: boolean;
  readonly modeState: ModeState;
};

export type BalanceLike = {
  readonly board_size: number;
  readonly min_line_length: number;
  readonly num_run_groups: number;
  readonly spawn_per_turn: number;
  readonly preview_count: number;
  readonly initial_seed_count: number;
  readonly length_multipliers: Readonly<Record<string, number>>;
  readonly intersection_bonus: number;
  readonly cascade_bonus: number;
};

export type AttemptMoveOutcome =
  | { readonly kind: "no-source" }
  | { readonly kind: "unreachable"; readonly from: Coord; readonly to: Coord }
  | {
      readonly kind: "moved";
      readonly from: Coord;
      readonly to: Coord;
      readonly path: readonly Coord[];
      readonly postMoveState: TurnState;
      readonly clears: readonly LineDetectResult[];
      readonly spawnedAt: readonly Coord[];
    };

// Single tested seam for the spawn colour draw (ADR-0034). Both the initial
// seed and every per-turn preview pick a run-group HERE, so the RNG draw order
// -- which the daily-seed golden master pins -- has exactly one home. A future
// weighted / anti-streak distribution changes this one function, not two inline
// call sites that could silently drift apart.
function pickRunGroup(rng: Rng, numRunGroups: number): RunGroup {
  return (rng.nextInt(numRunGroups) + 1) as RunGroup;
}

function rollPreview(
  board: Board,
  rng: Rng,
  count: number,
  numRunGroups: number,
): { readonly preview: readonly PreviewItem[]; readonly gameOver: boolean } {
  const empties = findEmptyCoords(board);
  if (empties.length === 0) {
    return { preview: [], gameOver: true };
  }
  // Sample without replacement up to `count` cells.
  const remaining = [...empties];
  const out: PreviewItem[] = [];
  const target = Math.min(count, remaining.length);
  for (let i = 0; i < target; i++) {
    const idx = rng.nextInt(remaining.length);
    const picked = remaining[idx];
    if (picked === undefined) continue;
    const last = remaining[remaining.length - 1];
    if (last !== undefined && idx !== remaining.length - 1) {
      remaining[idx] = last;
    }
    remaining.pop();
    const kind = pickRunGroup(rng, numRunGroups);
    out.push({ row: picked.row, col: picked.col, kind });
  }
  return { preview: out, gameOver: false };
}

function seedInitialBoard(rng: Rng, seedCount: number, numRunGroups: number): Board {
  let board = createEmptyBoard();
  const empties = [...findEmptyCoords(board)];
  const target = Math.min(seedCount, empties.length);
  for (let i = 0; i < target; i++) {
    const idx = rng.nextInt(empties.length);
    const picked = empties[idx];
    if (picked === undefined) continue;
    const last = empties[empties.length - 1];
    if (last !== undefined && idx !== empties.length - 1) {
      empties[idx] = last;
    }
    empties.pop();
    const kind = pickRunGroup(rng, numRunGroups);
    board = setCell(board, picked.row, picked.col, { runGroup: kind });
  }
  return board;
}

export function createInitialTurnState(
  rng: Rng,
  modeState: ModeState,
  balance: BalanceLike,
): TurnState {
  const board = seedInitialBoard(rng, balance.initial_seed_count, balance.num_run_groups);
  const { preview, gameOver } = rollPreview(
    board,
    rng,
    balance.preview_count,
    balance.num_run_groups,
  );
  return {
    board,
    selected: null,
    nextPreview: preview,
    score: 0,
    rng,
    gameOver,
    modeState,
  };
}

export function selectCell(state: TurnState, coord: Coord): TurnState {
  const cell = getCell(state.board, coord.row, coord.col);
  if (cell === null) {
    return state;
  }
  return { ...state, selected: coord };
}

export function deselect(state: TurnState): TurnState {
  if (state.selected === null) return state;
  return { ...state, selected: null };
}

export function attemptMove(state: TurnState, to: Coord, balance: BalanceLike): AttemptMoveOutcome {
  const from = state.selected;
  if (from === null) {
    return { kind: "no-source" };
  }
  const path = findPath(state.board, from, to);
  if (path === null) {
    return { kind: "unreachable", from, to };
  }

  const sourceCell = getCell(state.board, from.row, from.col);
  if (sourceCell === null) {
    return { kind: "no-source" };
  }

  // Apply the move.
  let board = setCell(state.board, from.row, from.col, null);
  board = setCell(board, to.row, to.col, { runGroup: sourceCell.runGroup });

  // Check for clears at the destination.
  const moveClear = detectLines(board, to, balance.min_line_length);
  let score = state.score;
  const clears: LineDetectResult[] = [];
  const spawnedAt: Coord[] = [];

  if (moveClear.cells.size > 0) {
    // Clears triggered by the move: score with cascadeIndex 0, no spawn this turn.
    score += scoreSingleClear(moveClear, 0, balance);
    clears.push(moveClear);
    for (const key of moveClear.cells) {
      const parts = key.split(",");
      const r = Number(parts[0]);
      const c = Number(parts[1]);
      if (Number.isFinite(r) && Number.isFinite(c)) {
        board = setCell(board, r, c, null);
      }
    }
  } else {
    // No clears: spawn from the preview queue, with cascade scoring on chain reactions.
    let cascadeIndex = 0;
    for (const preview of state.nextPreview.slice(0, balance.spawn_per_turn)) {
      // If the previewed cell is now occupied (e.g., the player moved into it),
      // pick an alternate empty cell. Classic Color Lines behaviour.
      let spawnCoord: Coord = { row: preview.row, col: preview.col };
      if (getCell(board, spawnCoord.row, spawnCoord.col) !== null) {
        const empties = findEmptyCoords(board);
        if (empties.length === 0) break;
        const alt = empties[state.rng.nextInt(empties.length)];
        if (alt === undefined) break;
        spawnCoord = alt;
      }
      board = setCell(board, spawnCoord.row, spawnCoord.col, { runGroup: preview.kind });
      spawnedAt.push(spawnCoord);
      const spawnClear = detectLines(board, spawnCoord, balance.min_line_length);
      if (spawnClear.cells.size > 0) {
        score += scoreSingleClear(spawnClear, cascadeIndex, balance);
        clears.push(spawnClear);
        cascadeIndex += 1;
        for (const key of spawnClear.cells) {
          const parts = key.split(",");
          const r = Number(parts[0]);
          const c = Number(parts[1]);
          if (Number.isFinite(r) && Number.isFinite(c)) {
            board = setCell(board, r, c, null);
          }
        }
      }
    }
  }

  const { preview: nextPreview, gameOver } = rollPreview(
    board,
    state.rng,
    balance.preview_count,
    balance.num_run_groups,
  );

  const postMoveState: TurnState = {
    board,
    selected: null,
    nextPreview,
    score,
    rng: state.rng,
    gameOver,
    modeState: state.modeState,
  };

  return {
    kind: "moved",
    from,
    to,
    path,
    postMoveState,
    clears,
    spawnedAt,
  };
}
