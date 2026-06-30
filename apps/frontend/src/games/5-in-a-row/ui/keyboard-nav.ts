// Keyboard navigation for the 5-in-a-row board (extracted from board-view.ts).
//
// tabindex on the SVG makes it focusable; arrow keys move a visible focus
// indicator across cells; Space/Enter dispatch as a tap on the focused cell;
// Escape clears the focus indicator. `focusedCoord` persists across re-renders
// so a screen-reader user keeps their place -- setBoard never removes the
// `yn-cell-focused` class, so the indicator survives a board repaint.
//
// This unit fully owns `focusedCoord` and the `yn-cell-focused` class; nothing
// else in the board reads them. The pointer/tap path lives separately in
// board-view.ts and is untouched by this module.

import type { Coord } from "../types.js";

export interface KeyboardNav {
  destroy(): void;
}

export function setupKeyboardNavigation(
  svg: SVGSVGElement,
  cellGs: readonly (readonly SVGGElement[])[],
  boardSize: number,
  onCellTap: (coord: Coord) => void,
): KeyboardNav {
  let focusedCoord: Coord | null = null;

  function getCellG(row: number, col: number): SVGGElement | null {
    if (row < 0 || row >= boardSize || col < 0 || col >= boardSize) return null;
    const rowGs = cellGs[row];
    if (rowGs === undefined) return null;
    return rowGs[col] ?? null;
  }

  function updateFocusVisual(): void {
    for (const row of cellGs) {
      for (const g of row) {
        g.classList.remove("yn-cell-focused");
      }
    }
    if (focusedCoord !== null) {
      const g = getCellG(focusedCoord.row, focusedCoord.col);
      if (g !== null) g.classList.add("yn-cell-focused");
    }
  }

  // Keyboard-focus visual is progressive: a mouse click that lands focus
  // on the SVG (e.g. clicking a cell) MUST NOT paint the focused-cell
  // indicator (it was painting an out-of-context orange box at (0,0) on
  // every click). The indicator only appears the moment the user presses
  // their first arrow key — same UX pattern as data-tables and trees
  // across modern apps.
  const onSvgKeyDown = (e: KeyboardEvent): void => {
    if (focusedCoord === null) focusedCoord = { row: 0, col: 0 };
    let handled = true;
    switch (e.key) {
      case "ArrowUp":
        focusedCoord = { row: Math.max(0, focusedCoord.row - 1), col: focusedCoord.col };
        break;
      case "ArrowDown":
        focusedCoord = {
          row: Math.min(boardSize - 1, focusedCoord.row + 1),
          col: focusedCoord.col,
        };
        break;
      case "ArrowLeft":
        focusedCoord = { row: focusedCoord.row, col: Math.max(0, focusedCoord.col - 1) };
        break;
      case "ArrowRight":
        focusedCoord = {
          row: focusedCoord.row,
          col: Math.min(boardSize - 1, focusedCoord.col + 1),
        };
        break;
      case " ":
      case "Enter":
        onCellTap(focusedCoord);
        break;
      case "Escape":
        focusedCoord = null;
        break;
      default:
        handled = false;
    }
    if (handled) {
      e.preventDefault();
      updateFocusVisual();
    }
  };

  svg.addEventListener("keydown", onSvgKeyDown);

  return {
    destroy(): void {
      svg.removeEventListener("keydown", onSvgKeyDown);
    },
  };
}
