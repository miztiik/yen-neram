import { describe, expect, it } from "vitest";
import type { Board } from "@/games/5-in-a-row/types.js";
import { createEmptyBoard, detectLines, setCell } from "@/games/5-in-a-row/engine/index.js";

// Place `length` consecutive cells of the same runGroup starting at
// (startRow, startCol), stepping by (dr, dc) each cell. Returns a new board.
function placeRun(
  board: Board,
  startRow: number,
  startCol: number,
  dr: number,
  dc: number,
  length: number,
  runGroup: number,
): Board {
  let b = board;
  for (let i = 0; i < length; i++) {
    b = setCell(b, startRow + dr * i, startCol + dc * i, { runGroup });
  }
  return b;
}

describe("detectLines (minLineLength = 5)", () => {
  it("detects a 5-cell horizontal run through the placed cell", () => {
    // Cells (4,2)..(4,6) filled with runGroup 1.
    const board = placeRun(createEmptyBoard(), 4, 2, 0, 1, 5, 1);
    const result = detectLines(board, { row: 4, col: 4 }, 5);
    expect(result.cells.size).toBe(5);
    expect(result.lineCount).toBe(1);
    expect(result.longestLineLength).toBe(5);
  });

  it("detects a 5-cell vertical run", () => {
    // Cells (2,4)..(6,4) filled with runGroup 1.
    const board = placeRun(createEmptyBoard(), 2, 4, 1, 0, 5, 1);
    const result = detectLines(board, { row: 4, col: 4 }, 5);
    expect(result.cells.size).toBe(5);
    expect(result.lineCount).toBe(1);
    expect(result.longestLineLength).toBe(5);
  });

  it("detects a 5-cell diagonal down-right run", () => {
    // Cells (0,0),(1,1),(2,2),(3,3),(4,4) filled with runGroup 1.
    const board = placeRun(createEmptyBoard(), 0, 0, 1, 1, 5, 1);
    const result = detectLines(board, { row: 2, col: 2 }, 5);
    expect(result.cells.size).toBe(5);
    expect(result.lineCount).toBe(1);
    expect(result.longestLineLength).toBe(5);
  });

  it("detects a 5-cell diagonal up-right run", () => {
    // Cells (0,4),(1,3),(2,2),(3,1),(4,0) filled with runGroup 1.
    const board = placeRun(createEmptyBoard(), 0, 4, 1, -1, 5, 1);
    const result = detectLines(board, { row: 2, col: 2 }, 5);
    expect(result.cells.size).toBe(5);
    expect(result.lineCount).toBe(1);
    expect(result.longestLineLength).toBe(5);
  });

  it("does not clear a 4-cell horizontal run", () => {
    // Cells (4,2)..(4,5) filled with runGroup 1. Length is 4, below threshold.
    const board = placeRun(createEmptyBoard(), 4, 2, 0, 1, 4, 1);
    const result = detectLines(board, { row: 4, col: 3 }, 5);
    expect(result.cells.size).toBe(0);
    expect(result.lineCount).toBe(0);
    expect(result.longestLineLength).toBe(0);
  });

  it("detects a 6-cell horizontal run", () => {
    // Cells (4,1)..(4,6) filled with runGroup 1.
    const board = placeRun(createEmptyBoard(), 4, 1, 0, 1, 6, 1);
    const result = detectLines(board, { row: 4, col: 4 }, 5);
    expect(result.cells.size).toBe(6);
    expect(result.lineCount).toBe(1);
    expect(result.longestLineLength).toBe(6);
  });

  it("detects a 7-cell horizontal run", () => {
    // Cells (4,1)..(4,7) filled with runGroup 1.
    const board = placeRun(createEmptyBoard(), 4, 1, 0, 1, 7, 1);
    const result = detectLines(board, { row: 4, col: 4 }, 5);
    expect(result.cells.size).toBe(7);
    expect(result.lineCount).toBe(1);
    expect(result.longestLineLength).toBe(7);
  });

  it("detects two intersecting 9-cell lines through (4,4)", () => {
    // Full row 4 and full col 4 filled with runGroup 1. They share (4,4).
    let board = placeRun(createEmptyBoard(), 4, 0, 0, 1, 9, 1);
    board = placeRun(board, 0, 4, 1, 0, 9, 1);
    const result = detectLines(board, { row: 4, col: 4 }, 5);
    expect(result.lineCount).toBe(2);
    expect(result.longestLineLength).toBe(9);
    // 9 horizontal cells + 9 vertical cells - 1 shared centre = 17 unique cells.
    expect(result.cells.size).toBe(17);
  });

  it("returns an empty result when the placedAt cell is empty", () => {
    const result = detectLines(createEmptyBoard(), { row: 4, col: 4 }, 5);
    expect(result.cells.size).toBe(0);
    expect(result.lineCount).toBe(0);
    expect(result.longestLineLength).toBe(0);
  });

  it("returns an empty result when placedAt has a colour but no 5-run", () => {
    const board = setCell(createEmptyBoard(), 4, 4, { runGroup: 1 });
    const result = detectLines(board, { row: 4, col: 4 }, 5);
    expect(result.cells.size).toBe(0);
    expect(result.lineCount).toBe(0);
    expect(result.longestLineLength).toBe(0);
  });

  it("carries the run-group of the cleared line (drives the per-motif burst colour, ADR-0028)", () => {
    // A 5-run of run-group 4 -> the result reports runGroup 4 so the renderer
    // can burst the cleared cells in motif 4's own colour.
    const board = placeRun(createEmptyBoard(), 4, 2, 0, 1, 5, 4);
    const result = detectLines(board, { row: 4, col: 4 }, 5);
    expect(result.cells.size).toBe(5);
    expect(result.runGroup).toBe(4);
  });

  it("reports run-group 0 when there is no cleared line", () => {
    expect(detectLines(createEmptyBoard(), { row: 4, col: 4 }, 5).runGroup).toBe(0);
    const noRun = setCell(createEmptyBoard(), 4, 4, { runGroup: 2 });
    expect(detectLines(noRun, { row: 4, col: 4 }, 5).runGroup).toBe(0);
  });
});
