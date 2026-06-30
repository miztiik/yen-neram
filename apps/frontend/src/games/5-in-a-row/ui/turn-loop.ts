// Pure turn-loop state machine for 5-in-a-row.
// NO DOM, no save imports. Composes the engine.

import type { Board, Coord, ModeState, PreviewItem, RunGroup } from "../types.js";
import {
  BOARD_SIZE,
  createEmptyBoard,
  findEmptyCoords,
  getCell,
  setCell,
} from "../engine/board.js";
import { findPath } from "../engine/pathfind.js";
import { detectLines, type LineDetectResult } from "../engine/line-detect.js";
import { scoreSingleClear } from "../engine/score.js";
import { spawnWeight } from "../engine/spawn-weight.js";
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
  // Opening same-colour run length (ADR-0035): plant one contiguous run of this
  // many same-colour tiles in the initial seed so the first clear comes fast.
  // Optional so existing BalanceLike constructors (tests) default it off; the
  // live balance.json sets it. < 2 = the pure-random opening.
  readonly opening_cluster_size?: number;
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

// Count filled orthogonal neighbours (0-4) of a cell. Drives spawn placement:
// an empty cell wedged inside the player's pocket has many filled neighbours; a
// cell in open board has few. Cheap (4 getCell lookups) vs frame budget.
// Scan the whole board for the first cell that sits on a clearable line.
// Drives the player-clear CASCADE chain: after cells are removed, removal
// can complete a fresh line elsewhere. Pure (no RNG); returns null when no
// line remains. O(81) per pass, a handful of passes max -- inside budget.
function detectFirstLine(board: Board, minLineLength: number): LineDetectResult | null {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (getCell(board, r, c) === null) continue;
      const res = detectLines(board, { row: r, col: c }, minLineLength);
      if (res.cells.size > 0) return res;
    }
  }
  return null;
}

// Spawn-placement bias (ADR-0040): pick an empty-cell index weighted TOWARD
// emptier neighbourhoods (weight 3 for a wide-open cell, 1 for one surrounded
// on all sides). This stops new tiles dropping into the exact pocket the player
// is packing -- the "it spawned in my about-to-clear line" complaint -- while
// keeping concentration POSSIBLE (low-weight cells are unlikely, not banned),
// so the satisfying clear cluster survives. Distinct from the reverted #61,
// which nudged COLOUR; this nudges CELL. Exactly one rng draw, so the per-turn
// draw count is unchanged (mid-game resume + cursor contract intact).
// Pick an empty-cell index weighted by spawnWeight (engine/spawn-weight): a
// candidate cell that is a worse spawn target (e.g. one that would extend the
// player's building line) gets a lower weight and is less likely to be chosen.
// Exactly ONE rng draw, so the per-turn draw count is unchanged (mid-game
// resume + daily-determinism contract intact); the weights are a pure, rng-free
// function of the board.
function pickWeightedEmptyIndex(
  board: Board,
  cells: readonly Coord[],
  rng: Rng,
  minLineLength: number,
): number {
  let total = 0;
  const weights = cells.map((p) => {
    const w = spawnWeight(board, p, minLineLength);
    total += w;
    return w;
  });
  let t = rng.nextInt(total);
  for (let i = 0; i < weights.length; i++) {
    t -= weights[i] ?? 0;
    if (t < 0) return i;
  }
  return cells.length - 1;
}

function rollPreview(
  board: Board,
  rng: Rng,
  count: number,
  numRunGroups: number,
  minLineLength: number,
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
    const idx = pickWeightedEmptyIndex(board, remaining, rng, minLineLength);
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

function seedInitialBoard(
  rng: Rng,
  seedCount: number,
  numRunGroups: number,
  clusterSize: number,
): Board {
  let board = createEmptyBoard();
  let placed = 0;
  // Opening cluster (ADR-0035): plant ONE contiguous same-colour horizontal run
  // so the first clear comes fast and the move verb is legible from the very
  // first board (Palm's first-60-seconds win). The run counts TOWARD seedCount
  // (it is not extra tiles), so the board still holds exactly initial_seed_count
  // motifs. clusterSize < 2 disables it -> the pure-random opening, unchanged.
  const effCluster = Math.max(0, Math.min(clusterSize, seedCount, BOARD_SIZE));
  if (effCluster >= 2) {
    const colour = pickRunGroup(rng, numRunGroups);
    const row = rng.nextInt(BOARD_SIZE);
    const startCol = rng.nextInt(BOARD_SIZE - effCluster + 1);
    for (let c = startCol; c < startCol + effCluster; c++) {
      board = setCell(board, row, c, { runGroup: colour });
      placed += 1;
    }
  }
  const empties = [...findEmptyCoords(board)];
  const target = Math.min(seedCount - placed, empties.length);
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
  const board = seedInitialBoard(
    rng,
    balance.initial_seed_count,
    balance.num_run_groups,
    balance.opening_cluster_size ?? 0,
  );
  const { preview, gameOver } = rollPreview(
    board,
    rng,
    balance.preview_count,
    balance.num_run_groups,
    balance.min_line_length,
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
    // Player-placed clear (skill). It scores at cascadeIndex 0, then CHAINS:
    // removing the cells can complete further lines, each paying the next
    // cascade tier (x3, x5...). The chain is pure board re-detection -- no
    // spawn, no RNG -- so cascade rewards the player who engineers overlaps,
    // not random drops (council 2026-06-29). No spawn on a clearing move.
    let cascadeIndex = 0;
    let step: LineDetectResult | null = moveClear;
    while (step !== null && step.cells.size > 0) {
      score += scoreSingleClear(step, cascadeIndex, balance);
      clears.push(step);
      for (const key of step.cells) {
        const parts = key.split(",");
        const r = Number(parts[0]);
        const c = Number(parts[1]);
        if (Number.isFinite(r) && Number.isFinite(c)) {
          board = setCell(board, r, c, null);
        }
      }
      cascadeIndex += 1;
      step = detectFirstLine(board, balance.min_line_length);
    }
  } else {
    // No clears: spawn from the preview queue. A spawned tile that happens
    // to complete a line is luck, not skill, so it scores at cascadeIndex 0
    // only -- no cascade tier for random drops.
    for (const preview of state.nextPreview.slice(0, balance.spawn_per_turn)) {
      // If the previewed cell is now occupied (e.g., the player moved into it),
      // pick an alternate empty cell, biased toward open space (ADR-0040) so the
      // fallback never drops into the player's pocket. Classic Color Lines behaviour.
      let spawnCoord: Coord = { row: preview.row, col: preview.col };
      if (getCell(board, spawnCoord.row, spawnCoord.col) !== null) {
        const empties = findEmptyCoords(board);
        if (empties.length === 0) break;
        const alt =
          empties[pickWeightedEmptyIndex(board, empties, state.rng, balance.min_line_length)];
        if (alt === undefined) break;
        spawnCoord = alt;
      }
      board = setCell(board, spawnCoord.row, spawnCoord.col, { runGroup: preview.kind });
      spawnedAt.push(spawnCoord);
      const spawnClear = detectLines(board, spawnCoord, balance.min_line_length);
      if (spawnClear.cells.size > 0) {
        score += scoreSingleClear(spawnClear, 0, balance);
        clears.push(spawnClear);
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
    balance.min_line_length,
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
