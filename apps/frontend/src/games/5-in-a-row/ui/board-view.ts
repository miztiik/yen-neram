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
const SPLASH_TAIL_MS = 150;
const SPLASH_RADIUS = 14;
const SPLASH_FILL = "rgba(244, 114, 182, 0.5)";

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
  showPathPreview(path: readonly Coord[]): void;
  clearPathPreview(): void;
  showClearFlash(cells: ReadonlySet<string>): Promise<void>;
  showLandBounce(coord: Coord): Promise<void>;
  setTheme(motifFiles: Readonly<Record<string, string>>): Promise<void>;
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
  svg.setAttribute("tabindex", "0");
  svg.setAttribute("role", "grid");
  svg.setAttribute(
    "aria-label",
    "9 by 9 game board, use arrow keys to navigate, space or enter to select",
  );
  svg.classList.add("yn-board-svg");

  const pendingSplashTimers = new Set<number>();

  // Mutable refs so theme hot-swap can replace the active motif map without
  // tearing down the board. `busyCount` lets setTheme wait for any in-flight
  // animation method to settle before swapping image hrefs.
  let currentMotifFiles: Readonly<Record<string, string>> = options.motifFiles;
  let currentPathPreview: SVGPolylineElement | null = null;
  let busyCount = 0;

  const cellGs: SVGGElement[][] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    const row: SVGGElement[] = [];
    for (let c = 0; c < BOARD_SIZE; c++) {
      const g = document.createElementNS(SVG_NS, "g");
      g.setAttribute("transform", `translate(${String(c * CELL_SIZE)}, ${String(r * CELL_SIZE)})`);
      g.setAttribute("data-r", String(r));
      g.setAttribute("data-c", String(c));
      g.setAttribute("role", "gridcell");
      g.setAttribute("aria-label", `Empty cell at row ${String(r + 1)}, column ${String(c + 1)}`);
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

  // Keyboard navigation: tabindex makes the SVG focusable; arrows move a
  // visible focus indicator across cells; Space/Enter dispatch as a tap on
  // the focused cell; Escape clears the focus indicator. focusedCoord
  // persists across re-renders so a screen-reader user keeps their place.
  let focusedCoord: Coord | null = null;
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

  function getCellG(row: number, col: number): SVGGElement | null {
    if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return null;
    const rowGs = cellGs[row];
    if (rowGs === undefined) return null;
    return rowGs[col] ?? null;
  }

  function createMotifImage(runGroup: number, isPreview: boolean): SVGImageElement {
    const img = document.createElementNS(SVG_NS, "image");
    const href = currentMotifFiles[String(runGroup)] ?? "";
    img.setAttribute("href", href);
    img.setAttribute("class", isPreview ? "yn-preview-motif" : "yn-motif");
    img.setAttribute("data-run-group", String(runGroup));
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
          g.setAttribute(
            "aria-label",
            `Piece type ${String(cell.runGroup)} at row ${String(r + 1)}, column ${String(c + 1)}`,
          );
        } else {
          g.classList.remove("yn-cell-selected");
          const previewKind = previewMap.get(cellKey(r, c));
          if (previewKind !== undefined) {
            g.appendChild(createMotifImage(previewKind, true));
          }
          g.setAttribute(
            "aria-label",
            `Empty cell at row ${String(r + 1)}, column ${String(c + 1)}`,
          );
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
    busyCount += 1;
    try {
      await awaitClassAnimation(g, "yn-cell-shake", SHAKE_MS);
    } finally {
      busyCount -= 1;
    }
  }

  async function showLandBounce(coord: Coord): Promise<void> {
    const g = getCellG(coord.row, coord.col);
    if (g === null) return;
    busyCount += 1;
    try {
      await awaitClassAnimation(g, "yn-cell-landing", LAND_MS);
    } finally {
      busyCount -= 1;
    }
  }

  async function showClearFlash(cells: ReadonlySet<string>): Promise<void> {
    busyCount += 1;
    try {
      const promises: Promise<void>[] = [];
      const splashEls: SVGCircleElement[] = [];
      for (const key of cells) {
        const parts = key.split(",");
        const r = Number(parts[0]);
        const c = Number(parts[1]);
        if (!Number.isInteger(r) || !Number.isInteger(c)) continue;
        const g = getCellG(r, c);
        if (g === null) continue;

        // Spawn a splash circle as a SIBLING of the cell <g> on the SVG root so
        // it paints above the grid and is not clipped by sibling z-order.
        const splash = document.createElementNS(SVG_NS, "circle");
        splash.setAttribute("class", "yn-splash");
        splash.setAttribute("cx", String(c * CELL_SIZE + CELL_SIZE / 2));
        splash.setAttribute("cy", String(r * CELL_SIZE + CELL_SIZE / 2));
        splash.setAttribute("r", String(SPLASH_RADIUS));
        splash.setAttribute("fill", SPLASH_FILL);
        splash.setAttribute("data-splash-temp", "1");
        svg.appendChild(splash);
        splashEls.push(splash);

        promises.push(awaitClassAnimation(g, "yn-cell-clearing", CLEAR_MS));
      }

      if (splashEls.length > 0) {
        // Toggle the firing class on the next frame so the browser commits the
        // initial styles before the keyframes start (zero rAF loop, one-shot).
        requestAnimationFrame(() => {
          for (const s of splashEls) {
            s.classList.add("yn-splash-firing");
          }
        });

        // Teardown happens in the background after the splash completes; the
        // function's Promise still resolves at the clear-flash boundary below.
        const cleanupTimer = window.setTimeout(() => {
          pendingSplashTimers.delete(cleanupTimer);
          const stale = svg.querySelectorAll('[data-splash-temp="1"]');
          for (const el of Array.from(stale)) {
            if (el.parentNode !== null) el.parentNode.removeChild(el);
          }
        }, CLEAR_MS + SPLASH_TAIL_MS);
        pendingSplashTimers.add(cleanupTimer);
      }

      await Promise.all(promises);
    } finally {
      busyCount -= 1;
    }
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

    busyCount += 1;
    try {
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
    } finally {
      busyCount -= 1;
    }
  }

  function showPathPreview(path: readonly Coord[]): void {
    clearPathPreview();
    if (path.length < 2) return;
    const polyline = document.createElementNS(SVG_NS, "polyline");
    const points = path
      .map(
        (c) =>
          `${String(c.col * CELL_SIZE + CELL_SIZE / 2)},${String(c.row * CELL_SIZE + CELL_SIZE / 2)}`,
      )
      .join(" ");
    polyline.setAttribute("points", points);
    polyline.setAttribute("class", "yn-path-preview");
    const onEnd = (): void => {
      if (polyline.parentNode !== null) {
        polyline.parentNode.removeChild(polyline);
      }
      if (currentPathPreview === polyline) {
        currentPathPreview = null;
      }
    };
    polyline.addEventListener("animationend", onEnd, { once: true });
    svg.appendChild(polyline);
    currentPathPreview = polyline;
  }

  function clearPathPreview(): void {
    if (currentPathPreview !== null) {
      if (currentPathPreview.parentNode !== null) {
        currentPathPreview.parentNode.removeChild(currentPathPreview);
      }
      currentPathPreview = null;
    }
  }

  async function setTheme(motifFiles: Readonly<Record<string, string>>): Promise<void> {
    // Wait briefly for any in-flight animation method to settle; if still busy
    // after the cap, force the swap anyway (a stuck animation must not block
    // the player from changing themes).
    const MAX_WAIT_MS = 1000;
    const POLL_MS = 50;
    let waited = 0;
    while (busyCount > 0 && waited < MAX_WAIT_MS) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, POLL_MS));
      waited += POLL_MS;
    }
    // Update internal ref so future spawns use the new theme.
    currentMotifFiles = motifFiles;
    svg.classList.add("yn-theme-swapping");
    // Wait for the fade-out (CSS opacity transition: 100ms).
    await new Promise<void>((resolve) => window.setTimeout(resolve, 110));
    const imgs = svg.querySelectorAll<SVGImageElement>(".yn-motif, .yn-preview-motif");
    for (const img of Array.from(imgs)) {
      const rg = img.getAttribute("data-run-group");
      if (rg === null) continue;
      img.setAttribute("href", currentMotifFiles[rg] ?? "");
    }
    svg.classList.remove("yn-theme-swapping");
    // Wait through most of the fade-in to settle at ~250ms total.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 140));
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
      for (const t of pendingSplashTimers) {
        window.clearTimeout(t);
      }
      pendingSplashTimers.clear();
      const stale = svg.querySelectorAll('[data-splash-temp="1"]');
      for (const el of Array.from(stale)) {
        if (el.parentNode !== null) el.parentNode.removeChild(el);
      }
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

  const onSvgFocus = (): void => {
    if (focusedCoord === null) focusedCoord = { row: 0, col: 0 };
    updateFocusVisual();
  };

  const onSvgKeyDown = (e: KeyboardEvent): void => {
    if (focusedCoord === null) focusedCoord = { row: 0, col: 0 };
    let handled = true;
    switch (e.key) {
      case "ArrowUp":
        focusedCoord = { row: Math.max(0, focusedCoord.row - 1), col: focusedCoord.col };
        break;
      case "ArrowDown":
        focusedCoord = {
          row: Math.min(BOARD_SIZE - 1, focusedCoord.row + 1),
          col: focusedCoord.col,
        };
        break;
      case "ArrowLeft":
        focusedCoord = { row: focusedCoord.row, col: Math.max(0, focusedCoord.col - 1) };
        break;
      case "ArrowRight":
        focusedCoord = {
          row: focusedCoord.row,
          col: Math.min(BOARD_SIZE - 1, focusedCoord.col + 1),
        };
        break;
      case " ":
      case "Enter":
        options.onCellTap(focusedCoord);
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

  svg.addEventListener("focus", onSvgFocus);
  svg.addEventListener("keydown", onSvgKeyDown);

  function destroy(): void {
    cancelPressTimer();
    clearPathPreview();
    svg.removeEventListener("pointerdown", onPointerDown);
    svg.removeEventListener("pointermove", onPointerMove);
    svg.removeEventListener("pointerup", onPointerUp);
    svg.removeEventListener("pointercancel", onPointerCancel);
    svg.removeEventListener("focus", onSvgFocus);
    svg.removeEventListener("keydown", onSvgKeyDown);
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
    showPathPreview,
    clearPathPreview,
    showClearFlash,
    showLandBounce,
    setTheme,
    destroy,
  };
}
