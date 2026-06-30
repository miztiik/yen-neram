import { describe, expect, it } from "vitest";

import { createRng, dailySeed } from "@/games/5-in-a-row/engine/rng.js";
import type { Rng } from "@/games/5-in-a-row/engine/rng.js";
import { createInitialTurnState, type BalanceLike } from "@/games/5-in-a-row/ui/turn-loop.js";
import type { Board, ModeState } from "@/games/5-in-a-row/types.js";

// Golden master for the daily-seed contract (ADR-0034, hardens ADR-0009).
// The daily board is meant to be reproducible: a fixed seed + fixed tuning must
// ALWAYS produce the same initial board + first preview. This test pins the RNG
// DRAW ORDER -- the hidden contract behind "the same daily board today". Any
// refactor that reorders engine draws (seed-board vs preview, or a fourth draw
// slipped in) breaks this snapshot loudly instead of silently changing every
// player's daily board. It uses a FIXED inline tuning (not the live
// balance.json) so a legitimate balance edit does not look like a determinism
// regression -- only a draw-order change does.

const FIXED_BALANCE: BalanceLike = {
  board_size: 9,
  min_line_length: 5,
  num_run_groups: 6,
  spawn_per_turn: 3,
  preview_count: 3,
  initial_seed_count: 5,
  length_multipliers: { "5": 1, "6": 1.5, "7": 2, "8": 3, "9": 5 },
  intersection_bonus: 1.5,
  cascade_bonus: 2,
};

const INFINITE: ModeState = { kind: "infinite" };

function renderBoard(board: Board): string {
  return board
    .map((row) => row.map((cell) => (cell === null ? "." : String(cell.runGroup))).join(""))
    .join("\n");
}

function renderPreview(state: ReturnType<typeof createInitialTurnState>): string {
  return state.nextPreview
    .map((p) => `${String(p.row)},${String(p.col)}:${String(p.kind)}`)
    .join(" ");
}

describe("daily-seed golden master (ADR-0034)", () => {
  it("a fixed seed + fixed tuning always yields the SAME initial board", () => {
    const state = createInitialTurnState(createRng(123456789), INFINITE, FIXED_BALANCE);
    expect(renderBoard(state.board)).toMatchInlineSnapshot(`
      ".1.......
      .........
      ..6..5...
      .........
      .........
      .........
      ......2.2
      .........
      ........."
    `);
  });

  it("a fixed seed always yields the SAME first preview (positions + colours)", () => {
    const state = createInitialTurnState(createRng(123456789), INFINITE, FIXED_BALANCE);
    // Regenerated 2026-06-30 for the line-aware spawn placement (engine/
    // spawn-weight.ts): the preview POSITIONS shifted because the same RNG draws
    // now map to different cells (the weight favours cells that don't extend a
    // line). The draw ORDER + COUNT are unchanged -- the board snapshot above is
    // untouched and the draw-count guard below pins it -- so this is a knowing
    // gameplay-version regen, not a determinism regression.
    expect(renderPreview(state)).toMatchInlineSnapshot(`"3,3:3 5,0:2 4,3:5"`);
  });

  it("the initial board + preview cost a FIXED number of RNG draws (draw-order/count guard)", () => {
    // The real contract behind "the same daily board": a fixed number of draws in
    // a fixed order. A counting decorator (not a mock) over the real RNG catches
    // a slipped or dropped draw WITHOUT false-positiving on placement tuning (the
    // snapshot above is the position pin; this is the structural pin). Spawn
    // placement weights are pure board-math and must add ZERO draws, so a
    // line-aware (or any future) weighting must not move this number.
    let draws = 0;
    const inner = createRng(123456789);
    const counting: Rng = {
      next: () => inner.next(),
      nextInt: (m) => {
        draws++;
        return inner.nextInt(m);
      },
      pick: (items) => {
        if (items.length === 0) throw new RangeError("empty");
        return items[counting.nextInt(items.length)]!;
      },
      getCursor: () => inner.getCursor(),
    };
    createInitialTurnState(counting, INFINITE, FIXED_BALANCE);
    // 5 seeds x (1 position + 1 colour) + 3 preview x (1 position + 1 colour).
    expect(draws).toBe(16);
  });

  it("is reproducible: two runs from the same seed are byte-identical", () => {
    const a = createInitialTurnState(createRng(42), INFINITE, FIXED_BALANCE);
    const b = createInitialTurnState(createRng(42), INFINITE, FIXED_BALANCE);
    expect(renderBoard(a.board)).toEqual(renderBoard(b.board));
    expect(a.nextPreview).toEqual(b.nextPreview);
  });

  it("different seeds diverge (the seed actually drives the board)", () => {
    const a = createInitialTurnState(createRng(1), INFINITE, FIXED_BALANCE);
    const b = createInitialTurnState(createRng(2), INFINITE, FIXED_BALANCE);
    expect(renderBoard(a.board)).not.toEqual(renderBoard(b.board));
  });

  it("dailySeed is a pure function of slug + local date (pins the seed itself)", () => {
    expect(dailySeed("5-in-a-row", new Date(2026, 0, 1))).toMatchInlineSnapshot(`78847860`);
  });
});

describe("opening cluster (ADR-0035, fast first clear)", () => {
  const CLUSTER_BALANCE: BalanceLike = { ...FIXED_BALANCE, opening_cluster_size: 4 };
  const cellAt = (b: Board, r: number, c: number): Board[number][number] => b[r]?.[c] ?? null;

  it("plants a contiguous same-colour run of at least opening_cluster_size", () => {
    const state = createInitialTurnState(createRng(7), INFINITE, CLUSTER_BALANCE);
    let maxRun = 0;
    for (let r = 0; r < 9; r++) {
      let runLen = 0;
      let runGroup = -1;
      for (let c = 0; c < 9; c++) {
        const cell = cellAt(state.board, r, c);
        if (cell !== null && cell.runGroup === runGroup) {
          runLen += 1;
        } else if (cell !== null) {
          runGroup = cell.runGroup;
          runLen = 1;
        } else {
          runGroup = -1;
          runLen = 0;
        }
        if (runLen > maxRun) maxRun = runLen;
      }
    }
    expect(maxRun).toBeGreaterThanOrEqual(4);
  });

  it("still seeds exactly initial_seed_count tiles (the cluster counts toward it)", () => {
    const state = createInitialTurnState(createRng(7), INFINITE, CLUSTER_BALANCE);
    let count = 0;
    for (const row of state.board) {
      for (const cell of row) {
        if (cell !== null) count += 1;
      }
    }
    expect(count).toBe(CLUSTER_BALANCE.initial_seed_count);
  });

  it("opening_cluster_size 0/omitted = the pure-random opening (golden-master path)", () => {
    const omitted = createInitialTurnState(createRng(123456789), INFINITE, FIXED_BALANCE);
    const zero = createInitialTurnState(createRng(123456789), INFINITE, {
      ...FIXED_BALANCE,
      opening_cluster_size: 0,
    });
    expect(renderBoard(omitted.board)).toEqual(renderBoard(zero.board));
  });
});
