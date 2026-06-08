// Bonus-wave renderer: stages a vertical stack of pills that rises
// from the cleared-cells centroid, ends in a delta badge that flies
// into the score chip. Compositor-only (transform + opacity); no rAF.
// Per ADR-0017.
//
// The renderer is INTENTIONALLY thin: pill derivation is in
// `bonus-pills.ts` (pure, unit-tested), keyframes are in
// `board-view.css`. This file is the DOM staging glue.

import type { BonusPill } from "./bonus-pills.js";

const WAVE_CONTAINER_CLASS = "yn-bonus-wave";
const PILL_CLASS = "yn-bonus-pill";
const PILL_KIND_PREFIX = "yn-bonus-pill--";
const PILL_STACK_GAP_PX = 34;

export type ScreenPoint = { readonly x: number; readonly y: number };

export type WaveTiming = {
  readonly pill_rise_ms: number;
  readonly pill_hold_ms: number;
  readonly pill_exit_ms: number;
  readonly pill_stagger_ms: number;
  readonly fly_to_score_ms: number;
};

export type WavePlayOptions = {
  /**
   * When true, the final +N delta badge renders with the vibrant
   * multiplier style (`.yn-bonus-pill--delta-mult`): larger, gradient
   * fill, soft accent-bleed ring. Reserved for moments where the
   * pill stack carries at least one NAMED bonus pill (LENGTH /
   * INTERSECT / CASCADE) -- a tier-2-and-above scoring beat. Plain
   * tier-1 +5 stays on the calmer baseline so it doesn't shout.
   * Defaults to false.
   */
  readonly vibrantDelta?: boolean;
};

export type BonusWave = {
  /**
   * Stage the wave. Resolves when the FINAL delta pill begins its
   * fly-to-score (i.e. the moment the count-up should start). The
   * non-delta pills continue their hold-and-exit in the background;
   * they self-clean.
   *
   * If `pills` is empty (suppressed tier-1 floor per `isSilentTier`),
   * the promise resolves immediately and nothing is rendered.
   */
  play(
    centroid: ScreenPoint,
    pills: readonly BonusPill[],
    target: ScreenPoint,
    options?: WavePlayOptions,
  ): Promise<void>;
  destroy(): void;
};

export function createBonusWave(timing: WaveTiming): BonusWave {
  const container = document.createElement("div");
  container.className = WAVE_CONTAINER_CLASS;
  container.setAttribute("aria-hidden", "true");
  document.body.appendChild(container);

  // Track pill cleanup timers so destroy() can cancel them on game-
  // teardown without leaving zombie DOM nodes.
  const pendingTimers = new Set<number>();

  function scheduleCleanup(el: HTMLElement, lifespanMs: number): void {
    const timer = window.setTimeout(() => {
      pendingTimers.delete(timer);
      if (el.parentNode !== null) el.parentNode.removeChild(el);
    }, lifespanMs + 80);
    pendingTimers.add(timer);
  }

  async function play(
    centroid: ScreenPoint,
    pills: readonly BonusPill[],
    target: ScreenPoint,
    options?: WavePlayOptions,
  ): Promise<void> {
    if (pills.length === 0) return;
    const vibrantDelta = options?.vibrantDelta === true;

    // Non-delta pills stack UPWARD from the centroid (negative Y);
    // the delta badge sits at the top of the stack, then flies.
    // Stack offset is in CSS pixels and applied via custom property
    // so the rise/hold/exit keyframes can compose it with their
    // own per-frame transforms.
    const nonDelta = pills.filter((p) => !p.isFinalBadge);
    const deltaPill = pills.find((p) => p.isFinalBadge);

    const pillLifespanMs = timing.pill_rise_ms + timing.pill_hold_ms + timing.pill_exit_ms;
    const totalNonDeltaCount = nonDelta.length;

    // Emit non-delta pills, each above the previous (so the bottom of
    // the stack is the first-spawned bonus). Stagger order: first
    // bonus spawns at 0ms, subsequent at +stagger * index.
    nonDelta.forEach((pill, i) => {
      const el = document.createElement("div");
      el.className = `${PILL_CLASS} ${PILL_KIND_PREFIX}${pill.kind}`;
      el.textContent = pill.text;
      // Stack from the centroid upward: top of bottom-most pill at y=0,
      // then -PILL_STACK_GAP_PX per pill above. Negative offset =
      // higher on screen. The (totalNonDeltaCount - 1 - i) flip places
      // the FIRST-spawned pill at the bottom of the visible stack.
      const stackOffsetPx = -(totalNonDeltaCount - 1 - i) * PILL_STACK_GAP_PX;
      el.style.left = `${String(centroid.x)}px`;
      el.style.top = `${String(centroid.y)}px`;
      el.style.setProperty("--yn-pill-stack-offset", `${String(stackOffsetPx)}px`);
      el.style.setProperty("--yn-pill-stagger-ms", `${String(i * timing.pill_stagger_ms)}ms`);
      el.style.setProperty("--yn-pill-life-ms", `${String(pillLifespanMs)}ms`);
      container.appendChild(el);
      // Lifetime = stagger delay + rise + hold + exit (+ safety margin
      // applied inside scheduleCleanup).
      scheduleCleanup(el, i * timing.pill_stagger_ms + pillLifespanMs);
    });

    if (deltaPill === undefined) return;

    // The delta badge sits one slot ABOVE the highest non-delta pill.
    const deltaStackOffsetPx = -totalNonDeltaCount * PILL_STACK_GAP_PX;
    const deltaStaggerMs = nonDelta.length * timing.pill_stagger_ms;

    const deltaEl = document.createElement("div");
    // Vibrant variant when the pill stack carries at least one NAMED
    // pill (LENGTH / INTERSECT / CASCADE) -- a tier-2+ scoring beat.
    // Plain tier-1 +5 stays on the calmer baseline (`--delta` only)
    // so the badge style itself encodes "small win" vs "big win".
    const deltaModifierClass = vibrantDelta ? ` ${PILL_KIND_PREFIX}delta-mult` : "";
    deltaEl.className = `${PILL_CLASS} ${PILL_KIND_PREFIX}delta${deltaModifierClass}`;
    deltaEl.textContent = deltaPill.text;
    deltaEl.style.left = `${String(centroid.x)}px`;
    deltaEl.style.top = `${String(centroid.y)}px`;
    deltaEl.style.setProperty("--yn-pill-stack-offset", `${String(deltaStackOffsetPx)}px`);
    deltaEl.style.setProperty("--yn-pill-stagger-ms", `${String(deltaStaggerMs)}ms`);
    deltaEl.style.setProperty("--yn-pill-rise-ms", `${String(timing.pill_rise_ms)}ms`);
    deltaEl.style.setProperty("--yn-pill-hold-ms", `${String(timing.pill_hold_ms)}ms`);
    deltaEl.style.setProperty("--yn-pill-fly-ms", `${String(timing.fly_to_score_ms)}ms`);
    // Fly vector: from the delta-pill's screen position to the score
    // chip's screen position. The pill's screen pos accounts for the
    // (centroid + stackOffset) translation, so dx/dy is straightforward.
    const startX = centroid.x;
    const startY = centroid.y + deltaStackOffsetPx;
    const flyDx = target.x - startX;
    const flyDy = target.y - startY;
    deltaEl.style.setProperty("--yn-fly-dx", `${String(flyDx)}px`);
    deltaEl.style.setProperty("--yn-fly-dy", `${String(flyDy)}px`);
    container.appendChild(deltaEl);
    scheduleCleanup(
      deltaEl,
      deltaStaggerMs + timing.pill_rise_ms + timing.pill_hold_ms + timing.fly_to_score_ms,
    );

    // Resolve when the delta pill BEGINS its fly (= count-up should
    // start). That is: stagger delay + rise time + hold time.
    const startOfFlyMs = deltaStaggerMs + timing.pill_rise_ms + timing.pill_hold_ms;
    return new Promise<void>((resolve) => {
      const settleTimer = window.setTimeout(() => {
        pendingTimers.delete(settleTimer);
        resolve();
      }, startOfFlyMs);
      pendingTimers.add(settleTimer);
    });
  }

  function destroy(): void {
    for (const t of pendingTimers) window.clearTimeout(t);
    pendingTimers.clear();
    if (container.parentNode !== null) container.parentNode.removeChild(container);
  }

  return { play, destroy };
}

/**
 * Compute the screen-coordinate centroid of a set of cleared cells.
 * Used as the spawn point for the bonus-wave stack.
 *
 * The keys are the same "{r},{c}" strings the engine emits in
 * `LineDetectResult.cells`. The function resolves each cell's
 * on-screen position by querying the corresponding `<g data-r="..."
 * data-c="...">` element inside the SVG. Returns the SVG's centre as
 * a graceful fallback if no cells resolve (defensive: never NaN).
 */
export function centroidOfClearedCells(
  svg: SVGSVGElement,
  cellKeys: ReadonlySet<string>,
): ScreenPoint {
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (const key of cellKeys) {
    const parts = key.split(",");
    const r = parts[0];
    const c = parts[1];
    if (r === undefined || c === undefined) continue;
    const g = svg.querySelector(`g[data-r="${r}"][data-c="${c}"]`);
    if (g === null) continue;
    const rect = (g as SVGGraphicsElement).getBoundingClientRect();
    sumX += rect.left + rect.width / 2;
    sumY += rect.top + rect.height / 2;
    count += 1;
  }
  if (count === 0) {
    const fallback = svg.getBoundingClientRect();
    return {
      x: fallback.left + fallback.width / 2,
      y: fallback.top + fallback.height / 2,
    };
  }
  return { x: sumX / count, y: sumY / count };
}

/**
 * Element centre in screen coordinates. Used to resolve the score
 * chip's position as the fly-target for the delta badge.
 */
export function elementCenter(el: Element): ScreenPoint {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}
