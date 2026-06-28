import { describe, expect, it } from "vitest";
import {
  BOARD_SIZE,
  countFilled,
  createEmptyBoard,
  createRng,
  getCell,
  setCell,
} from "@/games/5-in-a-row/engine/index.js";
import { shuffleBoard } from "@/games/5-in-a-row/engine/shuffle.js";
import type { Board } from "@/games/5-in-a-row/types.js";

// Stuck-valve shuffle (ADR-0038): re-colour every filled tile IN PLACE, then
// clear any line the re-colour happened to complete. Pure + seeded, so the move
// is reproducible and survives a reload via the persisted rng_cursor.

// Four cells too far apart to ever form a line of 5 -- lets us assert the
// "positions preserved" property without a stray line clearing one of them.
function isolatedBoard(): Board {
  let b = createEmptyBoard();
  b = setCell(b, 0, 0, { runGroup: 1 });
  b = setCell(b, 0, 2, { runGroup: 2 });
  b = setCell(b, 2, 0, { runGroup: 3 });
  b = setCell(b, 8, 8, { runGroup: 4 });
  return b;
}

describe("shuffleBoard (ADR-0038)", () => {
  it("keeps every filled position filled and every empty position empty (no line case)", () => {
    const before = isolatedBoard();
    const after = shuffleBoard(before, createRng(123), 6, 5);
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        expect(getCell(after, r, c) === null).toBe(getCell(before, r, c) === null);
      }
    }
    expect(countFilled(after)).toBe(countFilled(before));
  });

  it("re-colours to valid run groups within 1..numRunGroups", () => {
    const after = shuffleBoard(isolatedBoard(), createRng(7), 6, 5);
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const cell = getCell(after, r, c);
        if (cell !== null) {
          expect(cell.runGroup).toBeGreaterThanOrEqual(1);
          expect(cell.runGroup).toBeLessThanOrEqual(6);
        }
      }
    }
  });

  it("is deterministic for a given seed", () => {
    const a = shuffleBoard(isolatedBoard(), createRng(999), 6, 5);
    const b = shuffleBoard(isolatedBoard(), createRng(999), 6, 5);
    expect(a).toEqual(b);
  });

  it("clears a line the re-colour completes (board returns playable)", () => {
    // Five-in-a-row filled; numRunGroups = 1 forces every tile to colour 1, so
    // the re-colour necessarily completes the line -> the sweep clears it.
    let b = createEmptyBoard();
    for (let c = 0; c < 5; c++) b = setCell(b, 0, c, { runGroup: 2 });
    const after = shuffleBoard(b, createRng(1), 1, 5);
    expect(countFilled(after)).toBe(0);
  });

  it("does not throw on an empty board", () => {
    const after = shuffleBoard(createEmptyBoard(), createRng(5), 6, 5);
    expect(countFilled(after)).toBe(0);
  });

  it("does not mutate the input board (returns a new board)", () => {
    const before = isolatedBoard();
    const snapshot = countFilled(before);
    shuffleBoard(before, createRng(3), 6, 5);
    expect(countFilled(before)).toBe(snapshot);
    expect(getCell(before, 0, 0)?.runGroup).toBe(1);
  });
});
