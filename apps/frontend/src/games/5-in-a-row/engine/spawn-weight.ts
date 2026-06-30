// Spawn-placement policy (pure). Computes how desirable an empty cell is as a
// spawn target; rollPreview + the spawn fallback turn these weights into a
// single weighted RNG draw. Kept separate from the spawn mechanism (turn-loop)
// so the policy is independently unit-testable and never reaches for the RNG.
//
// LINE-AWARE (2026-06-30, council). The prior weight was density-only
// (`max(1, 3 - filledOrthogonalNeighbours)`): it measured how crowded a cell is,
// not whether it sits on the player's building line, and it was blind to
// diagonals. A real-engine measurement showed it gave almost no protection -- a
// spawn landed next to a 3+ in-progress line 2.1% of the time vs 2.3% for pure
// random. The player complaint ("tiles drop right where my line was about to
// clear") was real even though the guessed cause ("seeded by my last touch") was
// not: the RNG is one continuous seeded stream and never sees the move. This
// policy instead down-weights a cell by the longest same-colour run it would
// EXTEND across ALL FOUR axes (orthogonal + diagonal), so the exact cells that
// spoil a clear are strongly (but not absolutely) avoided.

import type { Board, Coord } from "../types.js";
import { getCell } from "./board.js";

// The four line axes a clear can form along: horizontal, vertical, and both
// diagonals. Spawn avoidance must consider ALL of them, not just orthogonal
// density (the old bug left diagonal lines unprotected).
const AXES: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

// Spawn-target weights, by how dangerous the cell is to the player's lines.
// HIGHER weight = more likely to be chosen. Tuned so a clear-completing cell is
// ~1/8 as likely as open ground -- strongly avoided, but NEVER banned, so the
// late-game flood can still occasionally crowd an almost-line (that pressure is
// the game, per the casual-design council). Floored at WEIGHT_COMPLETES (>= 1)
// keeps concentration POSSIBLE.
const WEIGHT_OPEN = 8; // not extending any 3+ run: freely placeable
const WEIGHT_NEAR = 3; // would make a run one short of a clear: mildly avoided
const WEIGHT_COMPLETES = 1; // would complete (or over-fill) a clear: strongly avoided, floored

// Count contiguous same-colour tiles starting AT (r,c) and walking (dr,dc), up
// to `cap` steps. Capped so the cost is bounded (the weight saturates past the
// completing threshold, so the true length past `cap` is never needed).
function sameColorRun(
  board: Board,
  r: number,
  c: number,
  dr: number,
  dc: number,
  color: number,
  cap: number,
): number {
  let n = 0;
  let rr = r;
  let cc = c;
  while (n < cap) {
    const cell = getCell(board, rr, cc);
    if (cell === null || cell.runGroup !== color) break;
    n++;
    rr += dr;
    cc += dc;
  }
  return n;
}

// Longest same-colour run that placing a tile at `cell` would be contiguous
// with, across all 4 axes. For each axis the cell can BRIDGE the runs on both
// sides when they share a colour (a true completion), otherwise it extends the
// longer single side. Capped + early-exit at `cap` (Carmack: the weight
// saturates, so stop walking once the threshold is reached).
export function longestExtendableRun(board: Board, cell: Coord, cap: number): number {
  let best = 0;
  for (const [dr, dc] of AXES) {
    const negCell = getCell(board, cell.row - dr, cell.col - dc);
    const posCell = getCell(board, cell.row + dr, cell.col + dc);
    const negRun =
      negCell === null
        ? 0
        : sameColorRun(board, cell.row - dr, cell.col - dc, -dr, -dc, negCell.runGroup, cap);
    const posRun =
      posCell === null
        ? 0
        : sameColorRun(board, cell.row + dr, cell.col + dc, dr, dc, posCell.runGroup, cap);
    const bridged = negCell !== null && posCell !== null && negCell.runGroup === posCell.runGroup;
    const axisRun = bridged ? negRun + posRun : Math.max(negRun, posRun);
    if (axisRun > best) best = axisRun;
    if (best >= cap) return cap;
  }
  return best;
}

// Weight an empty cell as a spawn target (HIGHER = more likely). A cell that
// would complete a clear (extend a `minLineLength - 1` run) is strongly avoided;
// one short of that is mildly avoided; anything shorter is freely placeable.
export function spawnWeight(board: Board, cell: Coord, minLineLength: number): number {
  // The run length a placed tile would COMPLETE into a clear (4 for min-line 5).
  const completing = Math.max(2, minLineLength - 1);
  const run = longestExtendableRun(board, cell, completing);
  if (run >= completing) return WEIGHT_COMPLETES;
  if (run === completing - 1) return WEIGHT_NEAR;
  return WEIGHT_OPEN;
}
