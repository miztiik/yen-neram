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

  // Track resolvers of in-flight play() promises so destroy() can settle them
  // on teardown (otherwise a caller awaiting play() at unmount would hang and
  // its move's `finally` -- which clears the input lock -- would never run).
  const pendingResolvers = new Set<() => void>();

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
    // Only the "+N" delta badge is rendered (word pills retired 2026-06-29).
    const deltaPill = pills.find((p) => p.isFinalBadge);
    if (deltaPill === undefined) return;
    const vibrantDelta = options?.vibrantDelta === true;

    // Single-flight: a fresh clear supersedes any badge still in the air, so
    // rapid consecutive clears never pile up overlapping "+N" badges or leave
    // zombie nodes on screen. The count-up resolves on its own timer below,
    // independent of the DOM node, so clearing the node never loses the tween.
    container.replaceChildren();

    const deltaEl = document.createElement("div");
    // Vibrant variant when the clear earned a named bonus (length 6+, intersect,
    // or cascade): a bigger, brighter +N -- the bonus is size+colour, never a
    // printed word. Plain tier-1 stays on the calmer baseline.
    const deltaModifierClass = vibrantDelta ? ` ${PILL_KIND_PREFIX}delta-mult` : "";
    deltaEl.className = `${PILL_CLASS} ${PILL_KIND_PREFIX}delta${deltaModifierClass}`;
    deltaEl.textContent = deltaPill.text;
    deltaEl.style.left = `${String(Math.round(centroid.x))}px`;
    deltaEl.style.top = `${String(Math.round(centroid.y))}px`;
    deltaEl.style.setProperty("--yn-pill-stack-offset", "0px");
    deltaEl.style.setProperty("--yn-pill-stagger-ms", "0ms");
    deltaEl.style.setProperty("--yn-pill-rise-ms", `${String(timing.pill_rise_ms)}ms`);
    deltaEl.style.setProperty("--yn-pill-hold-ms", `${String(timing.pill_hold_ms)}ms`);
    deltaEl.style.setProperty("--yn-pill-fly-ms", `${String(timing.fly_to_score_ms)}ms`);
    // Fly vector: from the badge's centroid position to the score chip.
    deltaEl.style.setProperty("--yn-fly-dx", `${String(target.x - centroid.x)}px`);
    deltaEl.style.setProperty("--yn-fly-dy", `${String(target.y - centroid.y)}px`);
    container.appendChild(deltaEl);
    scheduleCleanup(deltaEl, timing.pill_rise_ms + timing.pill_hold_ms + timing.fly_to_score_ms);

    // Resolve when the badge BEGINS its fly (= the count-up should start):
    // rise + hold. destroy() resolves this early so an awaited play() that is
    // torn down mid-flight never hangs.
    const startOfFlyMs = timing.pill_rise_ms + timing.pill_hold_ms;
    return new Promise<void>((resolve) => {
      const settle = (): void => {
        pendingResolvers.delete(settle);
        resolve();
      };
      pendingResolvers.add(settle);
      const settleTimer = window.setTimeout(() => {
        pendingTimers.delete(settleTimer);
        settle();
      }, startOfFlyMs);
      pendingTimers.add(settleTimer);
    });
  }

  function destroy(): void {
    for (const t of pendingTimers) window.clearTimeout(t);
    pendingTimers.clear();
    // Settle any in-flight play() promise so a torn-down caller's await resolves.
    for (const settle of pendingResolvers) settle();
    pendingResolvers.clear();
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
