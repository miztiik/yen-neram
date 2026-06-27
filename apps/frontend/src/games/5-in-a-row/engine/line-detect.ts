// Detect lines of same-colour cells passing through a just-placed cell.
// Scans 4 axes: horizontal, vertical, diagonal down-right, diagonal up-right.

import type { Board, Coord, RunGroup } from "../types.js";
import { getCell } from "./board.js";

export type LineDetectResult = {
  readonly cells: ReadonlySet<string>;
  readonly lineCount: number;
  readonly longestLineLength: number;
  // Run-group (motif id 1..N) of the cleared line. Drives the per-motif
  // clear-burst color in the renderer (ADR-0028). 0 when there is no line
  // (empty result); no cells clear in that case so the value is unused.
  readonly runGroup: RunGroup;
};

const AXES: ReadonlyArray<{ readonly dr: number; readonly dc: number }> = [
  { dr: 0, dc: 1 }, // horizontal
  { dr: 1, dc: 0 }, // vertical
  { dr: 1, dc: 1 }, // diagonal down-right (\)
  { dr: 1, dc: -1 }, // diagonal up-right (/)
];

function countDirection(
  board: Board,
  start: Coord,
  dr: number,
  dc: number,
  target: RunGroup,
): number {
  let count = 0;
  let r = start.row + dr;
  let c = start.col + dc;
  while (true) {
    const cell = getCell(board, r, c);
    if (cell === null || cell.runGroup !== target) break;
    count++;
    r += dr;
    c += dc;
  }
  return count;
}

export function detectLines(
  board: Board,
  placedAt: Coord,
  minLineLength: number,
): LineDetectResult {
  const placed = getCell(board, placedAt.row, placedAt.col);
  if (placed === null) {
    return {
      cells: new Set<string>(),
      lineCount: 0,
      longestLineLength: 0,
      runGroup: 0,
    };
  }

  const cells = new Set<string>();
  let lineCount = 0;
  let longestLineLength = 0;
  const target = placed.runGroup;

  for (const { dr, dc } of AXES) {
    const forward = countDirection(board, placedAt, dr, dc, target);
    const backward = countDirection(board, placedAt, -dr, -dc, target);
    const lineLen = forward + backward + 1;
    if (lineLen >= minLineLength) {
      cells.add(`${String(placedAt.row)},${String(placedAt.col)}`);
      for (let i = 1; i <= forward; i++) {
        cells.add(`${String(placedAt.row + dr * i)},${String(placedAt.col + dc * i)}`);
      }
      for (let i = 1; i <= backward; i++) {
        cells.add(`${String(placedAt.row - dr * i)},${String(placedAt.col - dc * i)}`);
      }
      lineCount++;
      if (lineLen > longestLineLength) longestLineLength = lineLen;
    }
  }

  // runGroup is the cleared line's motif (1..N) only when a line actually
  // formed; a placed cell can have a colour but trigger no >=5 line, in which
  // case nothing clears and runGroup is 0 (unused by the renderer).
  return {
    cells,
    lineCount,
    longestLineLength,
    runGroup: cells.size > 0 ? target : 0,
  };
}
