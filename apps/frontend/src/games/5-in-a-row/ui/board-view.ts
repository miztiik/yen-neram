// Pure SVG board renderer for 5-in-a-row.
// 9x9 grid, tap + long-press input, compositor-only animations (zero rAF).

import "./board-view.css";
import type { Board, Coord, PreviewItem } from "../types.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const BOARD_SIZE = 9;
const CELL_SIZE = 40;
const VIEW_SIZE = BOARD_SIZE * CELL_SIZE; // 360
// Motif occupies 75% of the cell (30 of 40 SVG units), leaving a 5-unit
// margin on every side. The 25% headroom is the budget for shrink/grow
// bounce animations (`yn-pulse`, `yn-land`) defined in board-view.css --
// peak scale of 1.30 reaches the cell edge exactly. Applies uniformly to
// every theme since all motifs render through the same <image> sizing.
const MOTIF_SIZE = 30;
// Preview motifs render at 45% of the cell (18 of 40 SVG units); real
// pieces fill 75% (MOTIF_SIZE = 30). The 12-unit gap between preview and
// real keeps the "next vs placed" cue legible while previews stay readable
// at a glance. Size journey: 16 (original, too faint) -> 22 (too close to
// real, lost the hierarchy) -> 18 (this); the visibility win is now
// carried mostly by `.yn-preview-motif { opacity: 0.7 }` (was 0.4) in
// board-view.css. The optional `yn-preview-breathe` animation (CSS,
// gated by `previewBounceEnabled`) peaks at scale 1.06 -> 18 * 1.06 = 19.1
// SVG units, well below MOTIF_SIZE, so it never overlaps an adjacent
// placed piece.
const PREVIEW_SIZE = 18;
const PREVIEW_BOUNCE_CLASS = "yn-preview-bounce";
const LONG_PRESS_MS = 500;
// Pixel distance after which a press is treated as "the finger is moving"
// for the purpose of cancelling the long-press preview timer. This is NOT
// a tap-cancellation threshold -- tap detection uses cell-match between
// pointerdown and pointerup (see onPointerUp). Keeping this value tight
// (8px) means a small finger wiggle still cancels the long-press preview
// (which is the right call: a long-press is a deliberate hold), but it
// does NOT swallow the tap.
const MOVE_THRESHOLD_PX = 8;
const SLIDE_MS = 150;
const LAND_MS = 200;
const SHAKE_MS = 200;
// Lifetime of the per-blocker red wash. Slightly longer than the shake
// so the eye lands on the blockers AFTER the destination's red flash --
// reads as "this is why you couldn't move there". 380ms is the keyframe
// duration in board-view.css `yn-cell-bg-blocker-flash`; this constant
// is the safety-fallback for animationend not firing.
const BLOCKER_FLASH_MS = 380;
const CLEAR_MS = 400;
const SPLASH_TAIL_MS = 150;
const SPLASH_RADIUS = 14;
const SPLASH_FILL = "rgba(244, 114, 182, 0.5)";

export type BoardViewOptions = {
  readonly motifSymbolUrl: string;
  readonly motifFiles: Readonly<Record<string, string>>;
  readonly onCellTap: (coord: Coord) => void;
  readonly onCellLongPress: (coord: Coord) => void;
  // When true, the SVG root carries the `yn-preview-bounce` class so the
  // CSS keyframe `yn-preview-breathe` runs on preview motifs. Subtle by
  // design (peak scale 1.06); honoured for non-reduce-motion only via the
  // CSS media query. Defaults to false at the createBoardView boundary so
  // forgetting the option does not silently animate.
  readonly previewBounceEnabled?: boolean;
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
  // Brief red wash on the listed cells' backgrounds, used to highlight
  // pieces that fence in a tapped-but-unreachable destination. Fire-and-
  // forget (no promise) -- the shake animation governs the input gate;
  // this is decorative reinforcement that plays in parallel.
  showBlockersFlash(coords: readonly Coord[]): void;
  showPathTrace(path: readonly Coord[]): Promise<void>;
  showPathPreview(path: readonly Coord[]): void;
  clearPathPreview(): void;
  showClearFlash(cells: ReadonlySet<string>): Promise<void>;
  showLandBounce(coord: Coord): Promise<void>;
  setTheme(motifFiles: Readonly<Record<string, string>>): Promise<void>;
  setPreviewBounceEnabled(enabled: boolean): void;
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
  if (options.previewBounceEnabled === true) {
    svg.classList.add(PREVIEW_BOUNCE_CLASS);
  }

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

  // Outer-boundary rect: a single accent-coloured stroke around the
  // full 9x9 area so the board reads as a defined surface rather than
  // a free-floating grid (ADR-0021 polish round). Painted AFTER the
  // cell <g>s so it sits on top of the per-cell backgrounds; pointer-
  // events disabled so it never intercepts taps. Width 2 in SVG units
  // (~3.6px at the 720px max board size) gives a crisp edge without
  // visually claiming any cell.
  const boundary = document.createElementNS(SVG_NS, "rect");
  boundary.setAttribute("class", "yn-board-boundary");
  boundary.setAttribute("x", "0");
  boundary.setAttribute("y", "0");
  boundary.setAttribute("width", String(VIEW_SIZE));
  boundary.setAttribute("height", String(VIEW_SIZE));
  boundary.setAttribute("pointer-events", "none");
  svg.appendChild(boundary);

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

  // Brief red flash on the listed cells' backgrounds. Fire-and-forget by
  // design: the destination's shake is the input gate; blocker flashes
  // play in parallel as visual reinforcement of WHY the destination was
  // unreachable. Class is removed via the same animationend pattern as
  // awaitClassAnimation but we don't await -- so no busyCount touch.
  function showBlockersFlash(coords: readonly Coord[]): void {
    for (const c of coords) {
      const g = getCellG(c.row, c.col);
      if (g === null) continue;
      // Restart the animation if it's already running on this cell
      // (rare but possible if two shakes overlap on edge cases).
      g.classList.remove("yn-cell-blocker-flash");
      void g.getBoundingClientRect();
      g.classList.add("yn-cell-blocker-flash");
      const onEnd = (): void => {
        g.classList.remove("yn-cell-blocker-flash");
        g.removeEventListener("animationend", onEnd);
      };
      g.addEventListener("animationend", onEnd, { once: true });
      // Safety fallback if the animationend never fires (tab hidden,
      // reduce-motion media query drops the keyframe to 1ms, etc).
      window.setTimeout(onEnd, BLOCKER_FLASH_MS + 80);
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

  function setPreviewBounceEnabled(enabled: boolean): void {
    if (enabled) {
      svg.classList.add(PREVIEW_BOUNCE_CLASS);
    } else {
      svg.classList.remove(PREVIEW_BOUNCE_CLASS);
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

  // Input handling: tap + long-press.
  //
  // Tap invariant: a tap is `pointerdown` and `pointerup` landing on the
  // SAME cell. Pixel-level finger jitter between down and up does NOT
  // cancel a tap -- the cell-match check on pointerup is the only
  // authoritative test. A real finger tap on a phone routinely wiggles
  // 10-20px (thumb contact area, micro-movement as the finger lands),
  // which is well above any "drag" threshold a hand-feel pick would
  // suggest. The previous design nulled `pressCoord` when a pointermove
  // exceeded MOVE_THRESHOLD_PX (8) and `onPointerUp` then bailed because
  // it could not verify the cell of origin -- so quick taps on the move
  // target silently did nothing on touch devices. See the
  // `tap-with-finger-jitter still registers as a tap` e2e regression in
  // tests/e2e/game-smoke.spec.ts.
  //
  // MOVE_THRESHOLD_PX is now used SOLELY to cancel the long-press timer
  // (a moving finger isn't a hold); the long-press preview will not fire
  // if the user starts dragging within LONG_PRESS_MS.
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
    if (pressCoord === null) return;
    const dx = e.clientX - pressStartX;
    const dy = e.clientY - pressStartY;
    if (dx * dx + dy * dy > MOVE_THRESHOLD_PX * MOVE_THRESHOLD_PX) {
      // Finger is moving: cancel the long-press timer so the preview
      // doesn't fire mid-drag. Do NOT clear pressCoord or longPressFired
      // -- a tap-up on the same cell is still a tap (see invariant
      // comment above), and longPressFired (if already true) must
      // remain true so onPointerUp bails out instead of double-firing.
      cancelPressTimer();
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
    cancelPressTimer();
    const wasLongPress = longPressFired;
    const startCoord = pressCoord;
    longPressFired = false;
    pressCoord = null;
    if (wasLongPress || startCoord === null) return;
    const releaseCoord = findCellCoordFromEvent(svg, e.target);
    if (
      releaseCoord !== null &&
      releaseCoord.row === startCoord.row &&
      releaseCoord.col === startCoord.col
    ) {
      options.onCellTap(releaseCoord);
    }
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

  svg.addEventListener("keydown", onSvgKeyDown);

  function destroy(): void {
    cancelPressTimer();
    clearPathPreview();
    svg.removeEventListener("pointerdown", onPointerDown);
    svg.removeEventListener("pointermove", onPointerMove);
    svg.removeEventListener("pointerup", onPointerUp);
    svg.removeEventListener("pointercancel", onPointerCancel);
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
    showBlockersFlash,
    showPathTrace,
    showPathPreview,
    clearPathPreview,
    showClearFlash,
    showLandBounce,
    setTheme,
    setPreviewBounceEnabled,
    destroy,
  };
}
