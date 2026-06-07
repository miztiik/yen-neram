// Pure SVG board renderer for 5-in-a-row.
// 9x9 grid, tap + long-press input, compositor-only animations (zero rAF).

import "./board-view.css";
import type { Board, Coord, PreviewItem } from "../types.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const BOARD_SIZE = 9;
const CELL_SIZE = 40;
const VIEW_SIZE = BOARD_SIZE * CELL_SIZE; // 360
const MOTIF_SIZE = 36;
const PREVIEW_SIZE = 16;
const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD_PX = 8;
const SLIDE_MS = 150;
const LAND_MS = 200;
const SHAKE_MS = 200;
const CLEAR_MS = 400;

export type BoardViewOptions = {
  readonly motifSymbolUrl: string;
  readonly motifFiles: Readonly<Record<string, string>>;
  readonly onCellTap: (coord: Coord) => void;
  readonly onCellLongPress: (coord: Coord) => void;
};

export type CellVisualState =
  | { readonly kind: "empty" }
  | {
      readonly kind: "motif";
      readonly runGroup: number;
      readonly selected?: boolean;
      readonly clearing?: boolean;
    }
  | { readonly kind: "preview"; readonly runGroup: number };

export type BoardView = {
  readonly element: SVGSVGElement;
  setBoard(board: Board, preview: readonly PreviewItem[], selected: Coord | null): void;
  setReachabilityHints(reachable: ReadonlySet<string>): void;
  clearReachabilityHints(): void;
  showShake(coord: Coord): Promise<void>;
  showPathTrace(path: readonly Coord[]): Promise<void>;
  showClearFlash(cells: ReadonlySet<string>): Promise<void>;
  showLandBounce(coord: Coord): Promise<void>;
  destroy(): void;
};

function cellKey(row: number, col: number): string {
  return `${String(row)},${String(col)}`;
}

function findCellCoordFromEvent(svg: SVGSVGElement, target: EventTarget | null): Coord | null {
  let el: Element | null = target instanceof Element ? target : null;
  while (el !== null && el !== svg) {
    const r = el.getAttribute("data-r");
    const c = el.getAttribute("data-c");
    if (r !== null && c !== null) {
      const row = Number(r);
      const col = Number(c);
      if (Number.isInteger(row) && Number.isInteger(col)) {
        return { row, col };
      }
    }
    el = el.parentElement;
  }
  return null;
}

function awaitClassAnimation(el: SVGElement, className: string, fallbackMs: number): Promise<void> {
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      el.classList.remove(className);
      el.removeEventListener("animationend", onEnd);
      window.clearTimeout(timer);
      resolve();
    };
    const onEnd = (): void => finish();
    el.addEventListener("animationend", onEnd, { once: true });
    const timer = window.setTimeout(finish, fallbackMs + 80);
    // Force reflow so re-adding the same class restarts the animation.
    void el.getBoundingClientRect();
    el.classList.add(className);
  });
}

export function createBoardView(options: BoardViewOptions): BoardView {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${String(VIEW_SIZE)} ${String(VIEW_SIZE)}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.classList.add("yn-board-svg");

  const cellGs: SVGGElement[][] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    const row: SVGGElement[] = [];
    for (let c = 0; c < BOARD_SIZE; c++) {
      const g = document.createElementNS(SVG_NS, "g");
      g.setAttribute("transform", `translate(${String(c * CELL_SIZE)}, ${String(r * CELL_SIZE)})`);
      g.setAttribute("data-r", String(r));
      g.setAttribute("data-c", String(c));
      const bg = document.createElementNS(SVG_NS, "rect");
      bg.setAttribute("class", "yn-cell-bg");
      bg.setAttribute("x", "0");
      bg.setAttribute("y", "0");
      bg.setAttribute("width", String(CELL_SIZE));
      bg.setAttribute("height", String(CELL_SIZE));
      g.appendChild(bg);
      svg.appendChild(g);
      row.push(g);
    }
    cellGs.push(row);
  }

  function getCellG(row: number, col: number): SVGGElement | null {
    if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return null;
    const rowGs = cellGs[row];
    if (rowGs === undefined) return null;
    return rowGs[col] ?? null;
  }

  function createMotifImage(runGroup: number, isPreview: boolean): SVGImageElement {
    const img = document.createElementNS(SVG_NS, "image");
    const href = options.motifFiles[String(runGroup)] ?? "";
    img.setAttribute("href", href);
    img.setAttribute("class", isPreview ? "yn-preview-motif" : "yn-motif");
    const size = isPreview ? PREVIEW_SIZE : MOTIF_SIZE;
    const offset = (CELL_SIZE - size) / 2;
    img.setAttribute("width", String(size));
    img.setAttribute("height", String(size));
    img.setAttribute("x", String(offset));
    img.setAttribute("y", String(offset));
    img.setAttribute("preserveAspectRatio", "xMidYMid meet");
    return img;
  }

  function clearCellContent(g: SVGGElement): void {
    const toRemove: Element[] = [];
    for (const child of Array.from(g.children)) {
      if (!child.classList.contains("yn-cell-bg")) {
        toRemove.push(child);
      }
    }
    for (const el of toRemove) {
      g.removeChild(el);
    }
  }

  function setBoard(board: Board, preview: readonly PreviewItem[], selected: Coord | null): void {
    const previewMap = new Map<string, number>();
    for (const p of preview) {
      previewMap.set(cellKey(p.row, p.col), p.kind);
    }
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const g = getCellG(r, c);
        if (g === null) continue;
        clearCellContent(g);
        const rowCells = board[r];
        const cell = rowCells !== undefined ? rowCells[c] : null;
        const isSelected = selected !== null && selected.row === r && selected.col === c;
        if (cell !== null && cell !== undefined) {
          g.appendChild(createMotifImage(cell.runGroup, false));
          if (isSelected) {
            g.classList.add("yn-cell-selected");
          } else {
            g.classList.remove("yn-cell-selected");
          }
        } else {
          g.classList.remove("yn-cell-selected");
          const previewKind = previewMap.get(cellKey(r, c));
          if (previewKind !== undefined) {
            g.appendChild(createMotifImage(previewKind, true));
          }
        }
      }
    }
  }

  function setReachabilityHints(reachable: ReadonlySet<string>): void {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const g = getCellG(r, c);
        if (g === null) continue;
        if (reachable.has(cellKey(r, c))) {
          g.classList.add("yn-cell-reachable");
        } else {
          g.classList.remove("yn-cell-reachable");
        }
      }
    }
  }

  function clearReachabilityHints(): void {
    for (const row of cellGs) {
      for (const g of row) {
        g.classList.remove("yn-cell-reachable");
      }
    }
  }

  async function showShake(coord: Coord): Promise<void> {
    const g = getCellG(coord.row, coord.col);
    if (g === null) return;
    await awaitClassAnimation(g, "yn-cell-shake", SHAKE_MS);
  }

  async function showLandBounce(coord: Coord): Promise<void> {
    const g = getCellG(coord.row, coord.col);
    if (g === null) return;
    await awaitClassAnimation(g, "yn-cell-landing", LAND_MS);
  }

  async function showClearFlash(cells: ReadonlySet<string>): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const key of cells) {
      const parts = key.split(",");
      const r = Number(parts[0]);
      const c = Number(parts[1]);
      if (!Number.isInteger(r) || !Number.isInteger(c)) continue;
      const g = getCellG(r, c);
      if (g === null) continue;
      promises.push(awaitClassAnimation(g, "yn-cell-clearing", CLEAR_MS));
    }
    await Promise.all(promises);
  }

  async function showPathTrace(path: readonly Coord[]): Promise<void> {
    if (path.length < 2) return;
    const from = path[0];
    const to = path[path.length - 1];
    if (from === undefined || to === undefined) return;
    const fromG = getCellG(from.row, from.col);
    if (fromG === null) return;
    const motif = fromG.querySelector(".yn-motif");
    if (motif === null) return;

    // Clone the source motif as a temporary overlay on the SVG root so it paints
    // above every cell and isn't clipped by sibling z-order.
    const overlay = motif.cloneNode(true) as SVGImageElement;
    overlay.classList.remove("yn-motif");
    overlay.setAttribute("class", "yn-motif-overlay");
    const startX = from.col * CELL_SIZE + (CELL_SIZE - MOTIF_SIZE) / 2;
    const startY = from.row * CELL_SIZE + (CELL_SIZE - MOTIF_SIZE) / 2;
    const endX = to.col * CELL_SIZE + (CELL_SIZE - MOTIF_SIZE) / 2;
    const endY = to.row * CELL_SIZE + (CELL_SIZE - MOTIF_SIZE) / 2;
    overlay.setAttribute("x", String(startX));
    overlay.setAttribute("y", String(startY));
    svg.appendChild(overlay);

    (motif as SVGElement).style.visibility = "hidden";

    const dx = endX - startX;
    const dy = endY - startY;

    await new Promise<void>((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        if (overlay.parentNode !== null) {
          overlay.parentNode.removeChild(overlay);
        }
        (motif as SVGElement).style.visibility = "";
        resolve();
      };
      try {
        const animation = overlay.animate(
          [
            { transform: "translate(0px, 0px)" },
            { transform: `translate(${String(dx)}px, ${String(dy)}px)` },
          ],
          { duration: SLIDE_MS, easing: "ease-in-out", fill: "forwards" },
        );
        animation.addEventListener("finish", finish, { once: true });
        animation.addEventListener("cancel", finish, { once: true });
      } catch {
        finish();
        return;
      }
      window.setTimeout(finish, SLIDE_MS + 80);
    });
  }

  // Input handling: tap + long-press with movement-cancel.
  let pressTimer: number | null = null;
  let pressCoord: Coord | null = null;
  let pressStartX = 0;
  let pressStartY = 0;
  let longPressFired = false;

  const cancelPressTimer = (): void => {
    if (pressTimer !== null) {
      window.clearTimeout(pressTimer);
      pressTimer = null;
    }
  };

  const onPointerDown = (e: PointerEvent): void => {
    const coord = findCellCoordFromEvent(svg, e.target);
    if (coord === null) return;
    pressCoord = coord;
    pressStartX = e.clientX;
    pressStartY = e.clientY;
    longPressFired = false;
    cancelPressTimer();
    pressTimer = window.setTimeout(() => {
      pressTimer = null;
      longPressFired = true;
      if (pressCoord !== null) {
        options.onCellLongPress(pressCoord);
      }
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (e: PointerEvent): void => {
    if (pressTimer === null && !longPressFired) return;
    const dx = e.clientX - pressStartX;
    const dy = e.clientY - pressStartY;
    if (dx * dx + dy * dy > MOVE_THRESHOLD_PX * MOVE_THRESHOLD_PX) {
      cancelPressTimer();
      pressCoord = null;
      longPressFired = false;
    }
  };

  const onPointerUp = (e: PointerEvent): void => {
    const stillPending = pressTimer !== null;
    cancelPressTimer();
    if (!stillPending || longPressFired) {
      pressCoord = null;
      longPressFired = false;
      return;
    }
    const releaseCoord = findCellCoordFromEvent(svg, e.target);
    if (
      releaseCoord !== null &&
      pressCoord !== null &&
      releaseCoord.row === pressCoord.row &&
      releaseCoord.col === pressCoord.col
    ) {
      options.onCellTap(releaseCoord);
    }
    pressCoord = null;
  };

  const onPointerCancel = (): void => {
    cancelPressTimer();
    pressCoord = null;
    longPressFired = false;
  };

  svg.addEventListener("pointerdown", onPointerDown);
  svg.addEventListener("pointermove", onPointerMove);
  svg.addEventListener("pointerup", onPointerUp);
  svg.addEventListener("pointercancel", onPointerCancel);

  function destroy(): void {
    cancelPressTimer();
    svg.removeEventListener("pointerdown", onPointerDown);
    svg.removeEventListener("pointermove", onPointerMove);
    svg.removeEventListener("pointerup", onPointerUp);
    svg.removeEventListener("pointercancel", onPointerCancel);
    if (svg.parentNode !== null) {
      svg.parentNode.removeChild(svg);
    }
  }

  return {
    element: svg,
    setBoard,
    setReachabilityHints,
    clearReachabilityHints,
    showShake,
    showPathTrace,
    showClearFlash,
    showLandBounce,
    destroy,
  };
}
