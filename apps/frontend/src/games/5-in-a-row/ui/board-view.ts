// Pure SVG board renderer for 5-in-a-row.
// 9x9 grid, tap + long-press input, compositor-only animations (zero rAF).

import "./board-view.css";
import type { Board, Coord, PreviewItem } from "../types.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const BOARD_SIZE = 9;
// Exported so the tile-size invariant test (tests/unit/5-in-a-row/
// tile-size.test.ts) asserts the geometry contract against the real cell
// size rather than a magic 40.
export const CELL_SIZE = 40;
const VIEW_SIZE = BOARD_SIZE * CELL_SIZE; // 360

// Tile size is a player preference (ADR-0026). The player chooses how much of
// each cell the theme motif fills, because theme images carry very different
// internal padding (a tropical fruit fills its viewBox differently than a thin
// glyph) and eyesight/feel vary. Three named steps; default "medium" is the
// historical ADR-0017 75% fill, so a player who never opens the menu sees no
// change at all.
//
// HARD INVARIANT (ADR-0017 + ADR-0026): the land bounce must never cross the
// cell boundary, or it clips the always-on grid hairline and the chrome
// flickers. So `motif * landPeak <= CELL_SIZE` holds for EVERY tier -- the
// bounce peak is not a free multiplier layered on top of size; it is part of
// each tier's geometry. Larger tiles therefore get a gentler bounce (there is
// no room to grow past the edge). The peaks are pushed to CSS custom
// properties (`--yn-land-peak`, `--yn-pulse-peak`) consumed by the keyframes
// in board-view.css, keeping the renderer the single source of truth.
//
// `preview` is the next-piece preview size, kept well below `motif` so
// "upcoming" stays visually distinct from "placed" (the medium preview size,
// 18, is the value tuned across 16 -> 22 -> 18 in earlier rounds; the other
// tiers scale it with the motif). The `yn-preview-breathe` animation peaks at
// scale 1.06, which stays within headroom even for the large preview
// (21 * 1.06 = 22.3 < 35). The invariant is pinned by the unit test.
export const TILE_SIZE_VALUES = ["small", "medium", "large"] as const;
export type TileSize = (typeof TILE_SIZE_VALUES)[number];
export type TileSizeTier = {
  readonly motif: number;
  readonly preview: number;
  readonly landPeak: number;
  readonly pulsePeak: number;
};
export const TILE_SIZE_TIERS: Readonly<Record<TileSize, TileSizeTier>> = {
  small: { motif: 25, preview: 15, landPeak: 1.3, pulsePeak: 1.18 },
  medium: { motif: 30, preview: 18, landPeak: 1.3, pulsePeak: 1.18 },
  large: { motif: 35, preview: 21, landPeak: 1.14, pulsePeak: 1.08 },
};
export const DEFAULT_TILE_SIZE: TileSize = "medium";

// Line-clear animation. The clear is ONE signature (ADR-0032): a centroid
// shockwave that escalates in intensity with line length. The player no longer
// picks a style (the ADR-0030 picker was retired); the two values below are the
// renderer's internal render modes:
//   - "shockwave": ripples outward from the cleared line's CENTRE; the burst
//      ring is biggest at the centre and dissipates toward the rim. The one
//      signature for all normal play.
//   - "flash": every cell bursts on the same frame; the forced render under
//      reduce-motion (the CSS then clamps it to ~1ms).
// The per-cell delay is the Chebyshev (chessboard) distance in CELLS from the
// centre times a step (planClearTiming), NEVER the iteration index -- that is
// what makes a horizontal and a vertical line of the same length ripple
// identically.
export const CLEAR_STYLE_VALUES = ["shockwave", "flash"] as const;
export type ClearStyle = (typeof CLEAR_STYLE_VALUES)[number];
export const DEFAULT_CLEAR_STYLE: ClearStyle = "shockwave";

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
// Base peak scale of the splash ring's expansion (the yn-splash keyframe's
// default 100% scale). A longer cleared line multiplies this via peakScale so a
// big clear bursts bigger (ADR-0028, size-by-length).
const SPLASH_BASE_PEAK = 2.5;
// Last-resort splash colour when a run-group is missing from the theme's
// motifColors map. The theme loader normally populates every run-group, so this
// only guards createBoardView calls with a partial map (e.g. a unit test).
const SPLASH_FALLBACK_COLOR = "rgba(244, 114, 182, 0.5)";

export type ClearFlashOptions = {
  // Multiplier on the splash ring's base peak scale (size-by-length). 1 keeps
  // the historical size; >1 makes a longer line burst bigger.
  readonly peakScale?: number;
  // Which clear render to play. Defaults to "shockwave"; reduce-motion passes
  // "flash".
  readonly style?: ClearStyle;
  // Concentric centroid rings (ADR-0032, escalate-by-length). 1 (default) = the
  // per-cell burst only; 2-3 add extra staggered rings at the cleared-line
  // centroid so a longer line reads as a heavier stone dropped in water.
  readonly ringCount?: number;
  // Delay in ms between successive centroid rings (the "stone drop" cadence).
  // Only used when ringCount > 1.
  readonly ringStepMs?: number;
  // Per-distance-ring delay in ms. Each cell's delay is this times its
  // Chebyshev distance from the centre (planClearTiming), so the ripple is
  // orientation-free. 0 (or "flash") fires every cell at once.
  readonly stepMs?: number;
};

export type BoardViewOptions = {
  readonly motifSymbolUrl: string;
  readonly motifFiles: Readonly<Record<string, string>>;
  // Per-motif clear-burst colour keyed by run-group "1".."N" (ADR-0028).
  readonly motifColors: Readonly<Record<string, string>>;
  readonly onCellTap: (coord: Coord) => void;
  readonly onCellLongPress: (coord: Coord) => void;
  // When true, the SVG root carries the `yn-preview-bounce` class so the
  // CSS keyframe `yn-preview-breathe` runs on preview motifs. Subtle by
  // design (peak scale 1.06); honoured for non-reduce-motion only via the
  // CSS media query. Defaults to false at the createBoardView boundary so
  // forgetting the option does not silently animate.
  readonly previewBounceEnabled?: boolean;
  // Player tile-size preference (ADR-0026). Controls how much of each cell
  // the motif fills and the per-tier bounce ceiling. Defaults to
  // DEFAULT_TILE_SIZE ("medium" == the historical 75% fill) at the
  // createBoardView boundary, so omitting it preserves prior behaviour.
  readonly tileSize?: TileSize;
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
  // Pre-clear glow: light the about-to-clear cells in their motif colour for a
  // beat so the player sees the line before it bursts (ADR-0028). cells maps
  // cellKey -> run-group; glowMs <= 0 is a no-op (reduce-motion path).
  showPreClearGlow(cells: ReadonlyMap<string, number>, glowMs: number): Promise<void>;
  // Clear-burst. cells maps cellKey -> run-group so each cell bursts in its own
  // motif colour (ADR-0028). options scales the burst by line length and
  // ripples cascades.
  showClearFlash(cells: ReadonlyMap<string, number>, options?: ClearFlashOptions): Promise<void>;
  showLandBounce(coord: Coord): Promise<void>;
  setTheme(
    motifFiles: Readonly<Record<string, string>>,
    motifColors: Readonly<Record<string, string>>,
  ): Promise<void>;
  setPreviewBounceEnabled(enabled: boolean): void;
  // Rescale every motif in place to the chosen tier and push the per-tier
  // bounce ceiling to the CSS custom properties. No structural re-render --
  // existing <image>s are re-sized via attributes (ADR-0026).
  setTileSize(tile: TileSize): void;
  destroy(): void;
};

function cellKey(row: number, col: number): string {
  return `${String(row)},${String(col)}`;
}

function parseCellKey(key: string): { readonly r: number; readonly c: number } | null {
  const parts = key.split(",");
  const r = Number(parts[0]);
  const c = Number(parts[1]);
  if (!Number.isInteger(r) || !Number.isInteger(c)) return null;
  return { r, c };
}

// Resolve the cell a clear ripples out FROM. "flash" has no origin (every cell
// fires together). "shockwave" uses the rounded centroid of the cleared cells
// -- a virtual point is fine because Chebyshev distance does not require an
// actual cell. See ADR-0030 / ADR-0032.
function resolveClearOrigin(
  coords: readonly { readonly r: number; readonly c: number }[],
  style: ClearStyle,
): { readonly r: number; readonly c: number } | null {
  if (style === "flash") return null;
  if (coords.length === 0) return null;
  let sumR = 0;
  let sumC = 0;
  for (const a of coords) {
    sumR += a.r;
    sumC += a.c;
  }
  return { r: Math.round(sumR / coords.length), c: Math.round(sumC / coords.length) };
}

// Pure timing plan for a clear (exported for unit tests). Maps each cleared
// cellKey to its animation delay + splash peak. The delay is the Chebyshev
// distance from the style's origin times `stepMs` -- orientation-free, so a
// horizontal and a vertical line of the same length share the same delay
// multiset (the fix for the reported inconsistency, ADR-0030). For "shockwave"
// the splash peak also dissipates outward (biggest at the centre); other
// styles keep a uniform peak.
export function planClearTiming(
  cellKeys: readonly string[],
  style: ClearStyle,
  stepMs: number,
  basePeak: number,
): Map<string, { readonly delayMs: number; readonly peak: number }> {
  const coords: { readonly key: string; readonly r: number; readonly c: number }[] = [];
  for (const key of cellKeys) {
    const at = parseCellKey(key);
    if (at !== null) coords.push({ key, r: at.r, c: at.c });
  }
  const origin = resolveClearOrigin(coords, style);
  const plan = new Map<string, { readonly delayMs: number; readonly peak: number }>();
  for (const { key, r, c } of coords) {
    const dist = origin === null ? 0 : Math.max(Math.abs(r - origin.r), Math.abs(c - origin.c));
    const delayMs = stepMs * dist;
    const peak = style === "shockwave" ? basePeak * Math.max(0.66, 1 - 0.16 * dist) : basePeak;
    plan.set(key, { delayMs, peak });
  }
  return plan;
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
  let currentMotifColors: Readonly<Record<string, string>> = options.motifColors;
  let currentPathPreview: SVGPolylineElement | null = null;
  let busyCount = 0;

  // Tile-size state (ADR-0026). `motifSize` / `previewSize` are mutable so the
  // player can rescale live via setTileSize without re-creating the board. The
  // per-tier bounce peaks are pushed to CSS custom properties on the SVG root
  // (function declaration `applyTierVars` is hoisted) so the keyframes in
  // board-view.css read the correct ceiling for the active tier.
  const initialTier = TILE_SIZE_TIERS[options.tileSize ?? DEFAULT_TILE_SIZE];
  let motifSize = initialTier.motif;
  let previewSize = initialTier.preview;
  applyTierVars(initialTier);

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

  // The board's single visual edge is the slab tray (ADR-0031): the white
  // rounded panel + elevation shadow IS the board boundary now, so the old
  // in-SVG accent rim + violet glow (ADR-0021) was removed -- it was a redundant
  // second frame inside the tray (Jony council, 2026-06-28). One frame, not
  // three (tray edge / gutter / rim).

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

  // Position + size a motif <image> centred in its cell. Shared by
  // createMotifImage (initial render) and setTileSize (live rescale) so the
  // centring math lives in exactly one place.
  function sizeMotifImage(img: SVGImageElement, size: number): void {
    const offset = (CELL_SIZE - size) / 2;
    img.setAttribute("width", String(size));
    img.setAttribute("height", String(size));
    img.setAttribute("x", String(offset));
    img.setAttribute("y", String(offset));
  }

  function createMotifImage(runGroup: number, isPreview: boolean): SVGImageElement {
    const img = document.createElementNS(SVG_NS, "image");
    const href = currentMotifFiles[String(runGroup)] ?? "";
    img.setAttribute("href", href);
    img.setAttribute("class", isPreview ? "yn-preview-motif" : "yn-motif");
    img.setAttribute("data-run-group", String(runGroup));
    sizeMotifImage(img, isPreview ? previewSize : motifSize);
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

  function splashColorFor(runGroup: number): string {
    return currentMotifColors[String(runGroup)] ?? SPLASH_FALLBACK_COLOR;
  }

  // Light the about-to-clear cells in their own motif colour for a beat so the
  // player SEES the line they made before it bursts (ADR-0028, Player). The
  // halo colour is set on the <g> as the --yn-splash custom property which the
  // descendant .yn-motif reads in board-view.css. glowMs <= 0 is a no-op (the
  // reduce-motion path passes 0 from the host so there is no added latency).
  async function showPreClearGlow(
    cells: ReadonlyMap<string, number>,
    glowMs: number,
  ): Promise<void> {
    if (glowMs <= 0 || cells.size === 0) return;
    busyCount += 1;
    try {
      const glowing: SVGGElement[] = [];
      for (const [key, runGroup] of cells) {
        const at = parseCellKey(key);
        if (at === null) continue;
        const g = getCellG(at.r, at.c);
        if (g === null) continue;
        g.style.setProperty("--yn-splash", splashColorFor(runGroup));
        g.classList.add("yn-cell-preclear-glow");
        glowing.push(g);
      }
      await new Promise<void>((resolve) => window.setTimeout(resolve, glowMs));
      for (const g of glowing) {
        g.classList.remove("yn-cell-preclear-glow");
      }
    } finally {
      busyCount -= 1;
    }
  }

  async function showClearFlash(
    cells: ReadonlyMap<string, number>,
    options?: ClearFlashOptions,
  ): Promise<void> {
    busyCount += 1;
    try {
      const basePeak = SPLASH_BASE_PEAK * (options?.peakScale ?? 1);
      const stepMs = options?.stepMs ?? 0;
      const style = options?.style ?? DEFAULT_CLEAR_STYLE;
      // Distance-from-origin timing plan (ADR-0030): orientation-free, so a row
      // and a column ripple identically. Replaces the old per-iteration stagger
      // that made vertical and horizontal clears look different.
      const plan = planClearTiming([...cells.keys()], style, stepMs, basePeak);
      const promises: Promise<void>[] = [];
      const splashEls: SVGCircleElement[] = [];
      let maxDelayMs = 0;
      for (const [key, runGroup] of cells) {
        const at = parseCellKey(key);
        if (at === null) continue;
        const g = getCellG(at.r, at.c);
        if (g === null) continue;

        const timing = plan.get(key) ?? { delayMs: 0, peak: basePeak };
        const delayMs = timing.delayMs;
        if (delayMs > maxDelayMs) maxDelayMs = delayMs;

        // Splash RING: stroked (not filled), so it reads as an expanding
        // shockwave rather than a blob (ADR-0028, Jony). Stroke colour is the
        // cleared motif's own colour; --yn-splash-peak scales the burst by line
        // length. Spawned as a SIBLING on the SVG root so it paints above the
        // grid and is not clipped by sibling z-order.
        const splash = document.createElementNS(SVG_NS, "circle");
        splash.setAttribute("class", "yn-splash");
        splash.setAttribute("cx", String(at.c * CELL_SIZE + CELL_SIZE / 2));
        splash.setAttribute("cy", String(at.r * CELL_SIZE + CELL_SIZE / 2));
        splash.setAttribute("r", String(SPLASH_RADIUS));
        splash.style.setProperty("--yn-splash", splashColorFor(runGroup));
        splash.setAttribute("data-splash-temp", "1");
        splash.style.setProperty("--yn-splash-peak", String(timing.peak));
        if (delayMs > 0) splash.style.animationDelay = `${String(delayMs)}ms`;
        svg.appendChild(splash);
        splashEls.push(splash);

        // Match the motif shrink to the ripple so a tile and its burst leave
        // together on a cascade.
        const motif = g.querySelector<SVGElement>(".yn-motif");
        if (motif !== null && delayMs > 0) {
          motif.style.animationDelay = `${String(delayMs)}ms`;
        }

        promises.push(awaitClassAnimation(g, "yn-cell-clearing", CLEAR_MS + delayMs));
      }

      // Concentric centroid rings (ADR-0032): a longer line drops a heavier
      // stone. ringCount 1 adds nothing (the per-cell bursts above are the
      // signature for short lines); 2-3 add extra staggered rings at the
      // cleared-line centroid -- bigger peak + bolder stroke -- so the eye reads
      // "more" without a different effect. Fire-and-forget: they do NOT extend
      // the input gate (the per-cell `promises` already bound it); only the
      // cleanup timer waits for them. transform + opacity only, like every other
      // splash, so they stay compositor-cheap (Carmack council 2026-06-28).
      const ringCount = Math.max(1, Math.floor(options?.ringCount ?? 1));
      if (style !== "flash" && ringCount > 1 && cells.size > 0) {
        const ringStepMs = options?.ringStepMs ?? 0;
        let sumR = 0;
        let sumC = 0;
        let centroidColor = SPLASH_FALLBACK_COLOR;
        let gotColor = false;
        for (const [key, runGroup] of cells) {
          const at = parseCellKey(key);
          if (at === null) continue;
          sumR += at.r;
          sumC += at.c;
          if (!gotColor) {
            centroidColor = splashColorFor(runGroup);
            gotColor = true;
          }
        }
        const cx = (sumC / cells.size) * CELL_SIZE + CELL_SIZE / 2;
        const cy = (sumR / cells.size) * CELL_SIZE + CELL_SIZE / 2;
        for (let i = 1; i < ringCount; i++) {
          const ring = document.createElementNS(SVG_NS, "circle");
          ring.setAttribute("class", "yn-splash");
          ring.setAttribute("cx", String(cx));
          ring.setAttribute("cy", String(cy));
          ring.setAttribute("r", String(SPLASH_RADIUS));
          ring.style.setProperty("--yn-splash", centroidColor);
          ring.style.setProperty("--yn-splash-peak", String(basePeak * (1 + i * 0.6)));
          ring.style.strokeWidth = String(3 + i);
          ring.setAttribute("data-splash-temp", "1");
          const ringDelay = i * ringStepMs;
          if (ringDelay > 0) ring.style.animationDelay = `${String(ringDelay)}ms`;
          if (ringDelay > maxDelayMs) maxDelayMs = ringDelay;
          svg.appendChild(ring);
          splashEls.push(ring);
        }
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
        const cleanupTimer = window.setTimeout(
          () => {
            pendingSplashTimers.delete(cleanupTimer);
            const stale = svg.querySelectorAll('[data-splash-temp="1"]');
            for (const el of Array.from(stale)) {
              if (el.parentNode !== null) el.parentNode.removeChild(el);
            }
          },
          CLEAR_MS + SPLASH_TAIL_MS + maxDelayMs,
        );
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
      const startX = from.col * CELL_SIZE + (CELL_SIZE - motifSize) / 2;
      const startY = from.row * CELL_SIZE + (CELL_SIZE - motifSize) / 2;
      const endX = to.col * CELL_SIZE + (CELL_SIZE - motifSize) / 2;
      const endY = to.row * CELL_SIZE + (CELL_SIZE - motifSize) / 2;
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

  // Push the per-tier bounce ceiling to CSS custom properties on the SVG root.
  // The keyframes `yn-land` / `yn-pulse` read these (with the medium values as
  // fallbacks), so the bounce never exceeds the cell for the active tier
  // (ADR-0026 invariant). Custom properties inherit, so setting them on the
  // root reaches every `.yn-motif` descendant.
  function applyTierVars(tier: TileSizeTier): void {
    svg.style.setProperty("--yn-land-peak", String(tier.landPeak));
    svg.style.setProperty("--yn-pulse-peak", String(tier.pulsePeak));
  }

  function setTileSize(tile: TileSize): void {
    const tier = TILE_SIZE_TIERS[tile];
    motifSize = tier.motif;
    previewSize = tier.preview;
    applyTierVars(tier);
    // Rescale existing motifs in place; no structural re-render. The next
    // setBoard() would also pick up the new sizes, but rescaling here makes
    // the change visible the instant the player picks a tier (the board is
    // still painted behind the dimmed drawer backdrop).
    for (const img of Array.from(svg.querySelectorAll<SVGImageElement>(".yn-motif"))) {
      sizeMotifImage(img, motifSize);
    }
    for (const img of Array.from(svg.querySelectorAll<SVGImageElement>(".yn-preview-motif"))) {
      sizeMotifImage(img, previewSize);
    }
  }

  async function setTheme(
    motifFiles: Readonly<Record<string, string>>,
    motifColors: Readonly<Record<string, string>>,
  ): Promise<void> {
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
    currentMotifColors = motifColors;
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
    showPreClearGlow,
    showClearFlash,
    showLandBounce,
    setTheme,
    setPreviewBounceEnabled,
    setTileSize,
    destroy,
  };
}
