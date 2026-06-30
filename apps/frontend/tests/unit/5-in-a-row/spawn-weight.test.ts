import { describe, expect, it } from "vitest";
import { createEmptyBoard, setCell } from "@/games/5-in-a-row/engine/board.js";
import { spawnWeight, longestExtendableRun } from "@/games/5-in-a-row/engine/spawn-weight.js";
import type { Board } from "@/games/5-in-a-row/types.js";

const MIN = 5; // min line length

// Helper: place a horizontal run of `len` cells of `color` at row r from col c0.
function hRun(board: Board, r: number, c0: number, len: number, color: number): Board {
  let b = board;
  for (let i = 0; i < len; i++) b = setCell(b, r, c0 + i, { runGroup: color });
  return b;
}

describe("spawn-weight (line-aware placement, 2026-06-30 council)", () => {
  it("a clear-completing cell is strongly down-weighted but NEVER banned (floor >= 1)", () => {
    // A 4-in-a-row of colour 1 at row 4 cols 1..4. Placing at (4,5) or (4,0)
    // completes a 5 -> the clear cell. It must be much less likely than open
    // ground, but still possible (ADR-0040: unlikely, not banned).
    const board = hRun(createEmptyBoard(), 4, 1, 4, 1);
    const completing = spawnWeight(board, { row: 4, col: 5 }, MIN);
    const openCell = spawnWeight(board, { row: 0, col: 0 }, MIN);
    expect(completing).toBeLessThan(openCell);
    expect(completing).toBeGreaterThanOrEqual(1);
  });

  it("a cell next to a lone tile is NOT penalised (open weight)", () => {
    const board = setCell(createEmptyBoard(), 0, 0, { runGroup: 2 });
    const nextToLone = spawnWeight(board, { row: 0, col: 1 }, MIN);
    const farOpen = spawnWeight(board, { row: 8, col: 8 }, MIN);
    expect(nextToLone).toBe(farOpen); // both are open ground -- a 1-run is noise
  });

  it("protection scales with run length: open > near (3-run) > completing (4-run)", () => {
    const open = spawnWeight(hRun(createEmptyBoard(), 4, 1, 2, 1), { row: 4, col: 3 }, MIN); // extends a 2-run
    const near = spawnWeight(hRun(createEmptyBoard(), 4, 1, 3, 1), { row: 4, col: 4 }, MIN); // extends a 3-run
    const completing = spawnWeight(hRun(createEmptyBoard(), 4, 1, 4, 1), { row: 4, col: 5 }, MIN); // extends a 4-run
    expect(open).toBeGreaterThan(near);
    expect(near).toBeGreaterThan(completing);
  });

  it("DIAGONAL lines are protected (the orthogonal-only bug is fixed)", () => {
    // A diagonal 4-run of colour 1; (4,4) completes it to 5. (4,4) has ZERO
    // filled ORTHOGONAL neighbours, so the old density weight treated it as wide
    // open. Line-aware must strongly avoid it.
    let board = createEmptyBoard();
    for (let i = 0; i < 4; i++) board = setCell(board, i, i, { runGroup: 1 });
    const diagComplete = spawnWeight(board, { row: 4, col: 4 }, MIN);
    const openCell = spawnWeight(board, { row: 0, col: 8 }, MIN);
    expect(diagComplete).toBeLessThan(openCell);
    expect(diagComplete).toBeGreaterThanOrEqual(1);
  });

  it("BRIDGE: a cell joining two same-colour 2-runs counts as completing", () => {
    // colour-1 at cols 1,2 and 4,5; the gap (4,3) bridges them into a 5.
    let board = hRun(createEmptyBoard(), 4, 1, 2, 1);
    board = hRun(board, 4, 4, 2, 1);
    const bridge = spawnWeight(board, { row: 4, col: 3 }, MIN);
    const completingEnd = spawnWeight(
      hRun(createEmptyBoard(), 4, 1, 4, 1),
      { row: 4, col: 5 },
      MIN,
    );
    expect(bridge).toBe(completingEnd); // both are clear-completing cells
  });

  it("DIFFERENT-colour neighbours do NOT bridge (max single side, not sum)", () => {
    // colour 1 on the left (2), colour 2 on the right (2); (4,3) can only be one
    // colour, so it extends at most a 3 -- not a completion.
    let board = hRun(createEmptyBoard(), 4, 1, 2, 1);
    board = hRun(board, 4, 4, 2, 2);
    const cell = spawnWeight(board, { row: 4, col: 3 }, MIN);
    const open = spawnWeight(board, { row: 0, col: 0 }, MIN);
    expect(cell).toBe(open); // a 2-run each side, different colours -> noise
  });

  it("longestExtendableRun caps + early-exits at the cap", () => {
    const board = hRun(createEmptyBoard(), 4, 0, 8, 1); // a long run
    // Cell (4,8) sits at the end of an 8-run; capped at 4.
    expect(longestExtendableRun(board, { row: 4, col: 8 }, 4)).toBe(4);
    // An open cell extends nothing.
    expect(longestExtendableRun(createEmptyBoard(), { row: 4, col: 4 }, 4)).toBe(0);
  });
});
