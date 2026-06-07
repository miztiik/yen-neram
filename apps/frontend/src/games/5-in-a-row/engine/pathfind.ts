// BFS pathfinder. 4-connected, no diagonals, no movement through filled cells.

import type { Board, Coord } from "../types.js";
import { getCell, isInBounds } from "./board.js";

const DIRECTIONS: ReadonlyArray<{ readonly dr: number; readonly dc: number }> = [
  { dr: -1, dc: 0 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 1 },
];

function keyOf(row: number, col: number): string {
  return `${String(row)},${String(col)}`;
}

function reconstructPath(parents: ReadonlyMap<string, Coord>, end: Coord): Coord[] {
  const path: Coord[] = [end];
  let cursor: Coord | undefined = parents.get(keyOf(end.row, end.col));
  while (cursor !== undefined) {
    path.push(cursor);
    cursor = parents.get(keyOf(cursor.row, cursor.col));
  }
  path.reverse();
  return path;
}

export function findPath(board: Board, from: Coord, to: Coord): readonly Coord[] | null {
  if (!isInBounds(from.row, from.col)) return null;
  if (!isInBounds(to.row, to.col)) return null;
  if (from.row === to.row && from.col === to.col) return [from];

  // The destination must be empty; intermediate cells must be empty.
  if (getCell(board, to.row, to.col) !== null) return null;

  const visited = new Set<string>();
  const parents = new Map<string, Coord>();
  const queue: Coord[] = [from];
  visited.add(keyOf(from.row, from.col));

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;

    for (const { dr, dc } of DIRECTIONS) {
      const nr = current.row + dr;
      const nc = current.col + dc;
      if (!isInBounds(nr, nc)) continue;
      const k = keyOf(nr, nc);
      if (visited.has(k)) continue;
      if (getCell(board, nr, nc) !== null) continue;
      visited.add(k);
      parents.set(k, current);
      if (nr === to.row && nc === to.col) {
        return reconstructPath(parents, { row: nr, col: nc });
      }
      queue.push({ row: nr, col: nc });
    }
  }
  return null;
}

export function findReachableCells(board: Board, from: Coord): ReadonlySet<string> {
  const reachable = new Set<string>();
  if (!isInBounds(from.row, from.col)) return reachable;

  // The `from` cell is reachable in zero steps from itself.
  reachable.add(keyOf(from.row, from.col));

  const visited = new Set<string>();
  visited.add(keyOf(from.row, from.col));
  const queue: Coord[] = [from];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;

    for (const { dr, dc } of DIRECTIONS) {
      const nr = current.row + dr;
      const nc = current.col + dc;
      if (!isInBounds(nr, nc)) continue;
      const k = keyOf(nr, nc);
      if (visited.has(k)) continue;
      if (getCell(board, nr, nc) !== null) continue;
      visited.add(k);
      reachable.add(k);
      queue.push({ row: nr, col: nc });
    }
  }
  return reachable;
}
