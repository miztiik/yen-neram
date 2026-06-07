import { describe, expect, it } from "vitest";
import {
  BOARD_SIZE,
  countEmpty,
  countFilled,
  createEmptyBoard,
  findEmptyCoords,
  getCell,
  isInBounds,
  setCell,
} from "@/games/5-in-a-row/engine/index.js";

describe("createEmptyBoard", () => {
  it("returns a 9x9 board of all nulls", () => {
    const b = createEmptyBoard();
    expect(b.length).toBe(BOARD_SIZE);
    for (const row of b) {
      expect(row.length).toBe(BOARD_SIZE);
      for (const cell of row) {
        expect(cell).toBeNull();
      }
    }
  });
});

describe("getCell", () => {
  it("returns null for the top-left of an empty board", () => {
    expect(getCell(createEmptyBoard(), 0, 0)).toBeNull();
  });

  it("returns null for the bottom-right of an empty board", () => {
    expect(getCell(createEmptyBoard(), 8, 8)).toBeNull();
  });
});

describe("setCell", () => {
  it("returns a new board reference (does not mutate the input)", () => {
    const empty = createEmptyBoard();
    const result = setCell(empty, 4, 4, { runGroup: 3 });
    expect(result).not.toBe(empty);
  });

  it("places the requested cell at the requested coordinate", () => {
    const empty = createEmptyBoard();
    const result = setCell(empty, 4, 4, { runGroup: 3 });
    expect(getCell(result, 4, 4)).toEqual({ runGroup: 3 });
  });

  it("does not mutate the source board", () => {
    const empty = createEmptyBoard();
    setCell(empty, 4, 4, { runGroup: 3 });
    expect(getCell(empty, 4, 4)).toBeNull();
  });

  it("throws RangeError on row = -1", () => {
    expect(() => setCell(createEmptyBoard(), -1, 0, { runGroup: 1 })).toThrow(RangeError);
  });

  it("throws RangeError on row = 9", () => {
    expect(() => setCell(createEmptyBoard(), 9, 0, { runGroup: 1 })).toThrow(RangeError);
  });

  it("throws RangeError on col = -1", () => {
    expect(() => setCell(createEmptyBoard(), 0, -1, { runGroup: 1 })).toThrow(RangeError);
  });

  it("throws RangeError on col = 9", () => {
    expect(() => setCell(createEmptyBoard(), 0, 9, { runGroup: 1 })).toThrow(RangeError);
  });
});

describe("isInBounds", () => {
  it("accepts (0, 0)", () => {
    expect(isInBounds(0, 0)).toBe(true);
  });

  it("accepts (8, 8)", () => {
    expect(isInBounds(8, 8)).toBe(true);
  });

  it("rejects (-1, 0)", () => {
    expect(isInBounds(-1, 0)).toBe(false);
  });

  it("rejects (9, 0)", () => {
    expect(isInBounds(9, 0)).toBe(false);
  });

  it("rejects (0, 9)", () => {
    expect(isInBounds(0, 9)).toBe(false);
  });

  it("rejects non-integer (0.5, 0)", () => {
    expect(isInBounds(0.5, 0)).toBe(false);
  });
});

describe("countEmpty and countFilled", () => {
  it("an empty board has 81 empty cells and 0 filled cells", () => {
    const b = createEmptyBoard();
    expect(countEmpty(b)).toBe(81);
    expect(countFilled(b)).toBe(0);
  });

  it("after 3 setCell calls, countFilled is 3 and countEmpty is 78", () => {
    let b = createEmptyBoard();
    b = setCell(b, 0, 0, { runGroup: 1 });
    b = setCell(b, 1, 1, { runGroup: 2 });
    b = setCell(b, 2, 2, { runGroup: 3 });
    expect(countFilled(b)).toBe(3);
    expect(countEmpty(b)).toBe(78);
  });
});

describe("findEmptyCoords", () => {
  it("returns 81 entries on an empty board", () => {
    expect(findEmptyCoords(createEmptyBoard()).length).toBe(81);
  });

  it("returns 78 entries after 3 placements and excludes the placed coords", () => {
    let b = createEmptyBoard();
    const placed = [
      { row: 0, col: 0 },
      { row: 4, col: 4 },
      { row: 8, col: 8 },
    ];
    for (const p of placed) {
      b = setCell(b, p.row, p.col, { runGroup: 1 });
    }
    const empties = findEmptyCoords(b);
    expect(empties.length).toBe(78);
    for (const p of placed) {
      const hit = empties.find((c) => c.row === p.row && c.col === p.col);
      expect(hit).toBeUndefined();
    }
  });
});
