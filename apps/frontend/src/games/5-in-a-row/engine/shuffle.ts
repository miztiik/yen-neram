// Stuck-valve shuffle (ADR-0038). Pure, deterministic (seeded rng).
//
// When a near-full board has buried the player, ONE honest lifeline per run:
// re-colour every filled tile with a fresh random colour (positions kept), then
// clear any complete lines the re-colour happened to form so the board comes
// back PLAYABLE (not with a finished line sitting unclear). No score -- a
// lifeline UNBLOCKS, it does not earn points (Palm: no pay-to-win, no dark
// pattern). The re-colour uses the same seeded RNG as spawns, so the move
// stays reproducible and survives a reload via the persisted rng_cursor.

import type { Board, RunGroup } from "../types.js";
import { BOARD_SIZE, getCell, setCell } from "./board.js";
import { detectLines } from "./line-detect.js";
import type { Rng } from "./rng.js";

export function shuffleBoard(
  board: Board,
  rng: Rng,
  numRunGroups: number,
  minLineLength: number,
): Board {
  let next = board;
  // Re-colour every filled cell.
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (getCell(next, r, c) !== null) {
        next = setCell(next, r, c, { runGroup: (rng.nextInt(numRunGroups) + 1) as RunGroup });
      }
    }
  }
  // Sweep: clear any lines the re-colour produced (no scoring).
  const toClear = new Set<string>();
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (getCell(next, r, c) === null) continue;
      const res = detectLines(next, { row: r, col: c }, minLineLength);
      for (const key of res.cells) toClear.add(key);
    }
  }
  for (const key of toClear) {
    const parts = key.split(",");
    const r = Number(parts[0]);
    const c = Number(parts[1]);
    if (Number.isInteger(r) && Number.isInteger(c)) next = setCell(next, r, c, null);
  }
  return next;
}
