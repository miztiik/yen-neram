import { describe, expect, it } from "vitest";
import type { Board } from "@/games/5-in-a-row/types.js";
import {
  createEmptyBoard,
  findPath,
  findReachableCells,
  setCell,
} from "@/games/5-in-a-row/engine/index.js";

// Build a 9x9 board from a 9-line ASCII map.
// Each line is 9 chars. "." = empty cell. "X" = filled with runGroup 1.
function fromMap(lines: readonly string[]): Board {
  let board = createEmptyBoard();
  for (let r = 0; r < lines.length; r++) {
    const line = lines[r];
    if (line === undefined) continue;
    for (let c = 0; c < line.length; c++) {
      if (line[c] === "X") {
        board = setCell(board, r, c, { runGroup: 1 });
      }
    }
  }
  return board;
}

describe("findPath", () => {
  it("finds a shortest path on an empty board from (0,0) to (8,8) of length 17", () => {
    const path = findPath(createEmptyBoard(), { row: 0, col: 0 }, { row: 8, col: 8 });
    expect(path).not.toBeNull();
    if (path === null) return;
    expect(path.length).toBe(17);
    expect(path[0]).toEqual({ row: 0, col: 0 });
    expect(path[path.length - 1]).toEqual({ row: 8, col: 8 });
  });

  it("returns a single-cell path when from equals to", () => {
    const path = findPath(createEmptyBoard(), { row: 3, col: 3 }, { row: 3, col: 3 });
    expect(path).toEqual([{ row: 3, col: 3 }]);
  });

  it("returns null when the destination is filled", () => {
    const board = setCell(createEmptyBoard(), 5, 5, { runGroup: 1 });
    const path = findPath(board, { row: 0, col: 0 }, { row: 5, col: 5 });
    expect(path).toBeNull();
  });

  it("returns null when a full-row wall blocks all paths", () => {
    const board = fromMap([
      ".........",
      ".........",
      ".........",
      ".........",
      "XXXXXXXXX",
      ".........",
      ".........",
      ".........",
      ".........",
    ]);
    const path = findPath(board, { row: 0, col: 0 }, { row: 8, col: 8 });
    expect(path).toBeNull();
  });

  it("detours around a partial wall (row 4 cols 4-6 filled)", () => {
    // Direct vertical (3,5) -> (4,5) -> (5,5) would be length 3.
    // With cols 4,5,6 of row 4 blocked, the path must detour.
    const board = fromMap([
      ".........",
      ".........",
      ".........",
      ".........",
      "....XXX..",
      ".........",
      ".........",
      ".........",
      ".........",
    ]);
    const path = findPath(board, { row: 3, col: 5 }, { row: 5, col: 5 });
    expect(path).not.toBeNull();
    if (path === null) return;
    expect(path.length).toBeGreaterThan(3);
    expect(path[0]).toEqual({ row: 3, col: 5 });
    expect(path[path.length - 1]).toEqual({ row: 5, col: 5 });
  });
});

describe("findReachableCells", () => {
  it("reaches all 81 cells from (0,0) on an empty board", () => {
    const reachable = findReachableCells(createEmptyBoard(), {
      row: 0,
      col: 0,
    });
    expect(reachable.size).toBe(81);
  });

  it("reaches only the 36 cells of rows 0-3 when row 4 is a full wall", () => {
    const board = fromMap([
      ".........",
      ".........",
      ".........",
      ".........",
      "XXXXXXXXX",
      ".........",
      ".........",
      ".........",
      ".........",
    ]);
    const reachable = findReachableCells(board, { row: 0, col: 0 });
    expect(reachable.size).toBe(36);
  });
});
