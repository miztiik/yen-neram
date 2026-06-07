// Pure board operations. Board is immutable: every mutation returns a new board.

import type { Board, Cell, Coord } from "../types.js";

export const BOARD_SIZE = 9;

export function createEmptyBoard(): Board {
  const rows: Cell[][] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < BOARD_SIZE; c++) {
      row.push(null);
    }
    rows.push(row);
  }
  return rows;
}

export function isInBounds(row: number, col: number): boolean {
  return (
    Number.isInteger(row) &&
    Number.isInteger(col) &&
    row >= 0 &&
    row < BOARD_SIZE &&
    col >= 0 &&
    col < BOARD_SIZE
  );
}

export function getCell(board: Board, row: number, col: number): Cell {
  if (!isInBounds(row, col)) return null;
  const r = board[row];
  if (r === undefined) return null;
  const c = r[col];
  return c ?? null;
}

export function setCell(board: Board, row: number, col: number, cell: Cell): Board {
  if (!isInBounds(row, col)) {
    throw new RangeError(`setCell: out of bounds (row=${String(row)}, col=${String(col)})`);
  }
  return board.map((existingRow, ri) => {
    if (ri !== row) return existingRow;
    return existingRow.map((existingCell, ci) => (ci === col ? cell : existingCell));
  });
}

export function countEmpty(board: Board): number {
  let n = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell === null) n++;
    }
  }
  return n;
}

export function countFilled(board: Board): number {
  let n = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell !== null) n++;
    }
  }
  return n;
}

export function findEmptyCoords(board: Board): readonly Coord[] {
  const out: Coord[] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (getCell(board, r, c) === null) {
        out.push({ row: r, col: c });
      }
    }
  }
  return out;
}
