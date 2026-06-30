// Score-chip count-up for 5-in-a-Row. Extracted from the game host so the rAF
// tween + its single-flight state live in one small, owned unit. The host
// provides the chip elements, the reward timings, a reduce-motion getter, and an
// `onFrame` callback (the BEST chip + milestone, driven each celebratory frame).
//
// The tween is a bounded JS requestAnimationFrame loop, NOT a CSS @property
// transition (Carmack council 2026-06-30). The CSS-transition approach animated
// `--yn-score-count` only where @property <integer> interpolation is supported
// (Chrome 85+/Safari 16.4+/Firefox 128+) and silently JUMPED everywhere else --
// including older Android WebViews, the mid-tier target device. A rAF loop climbs
// identically on every engine, writes ONE custom property on ONE element
// (counter() renders it; no layout read in the loop), dedupes unchanged integers,
// and snaps under reduce-motion / tab-hidden. It runs only in the post-input
// cosmetic tail. See docs/architecture/runtime/perf-budget.md (sanctioned rAF).

export type ScoreChipReward = {
  readonly score_chip_glow_ms: number;
  readonly score_count_up_min_ms: number;
  readonly score_count_up_per_delta_ms: number;
  readonly score_count_up_max_ms: number;
};

export type ScoreChipDeps = {
  readonly scoreEl: HTMLElement;
  readonly scoreValue: HTMLElement;
  readonly reward: ScoreChipReward;
  readonly getReduceMotion: () => boolean;
  /**
   * Driven with the running value on each CELEBRATORY count-up frame (and at the
   * final frame). The host uses it to climb the BEST chip + fire the milestone
   * toast in lockstep with the number, never ahead of it.
   */
  readonly onFrame: (current: number) => void;
  /** Initial displayed score (so the first tween's `from` is correct on a restored save). */
  readonly initial: number;
};

export type ScoreChip = {
  /** Tween the chip to `target`. celebrate=true plays the glow + drives onFrame each frame. */
  animateScoreTo(target: number, celebrate: boolean): void;
  /** Set the displayed value with NO tween (mount / restore): writes the property + aria. */
  seed(value: number): void;
  /** Cancel an in-flight tween and snap to the final value (tab-hidden); drives onFrame at final. */
  snapToFinal(): void;
  /** Cancel an in-flight tween (teardown). */
  destroy(): void;
};

export function createScoreChip(deps: ScoreChipDeps): ScoreChip {
  const { scoreEl, scoreValue, reward, getReduceMotion, onFrame } = deps;
  // Most-recent on-screen integer; the first tween reads it as `from`.
  let displayedScore = deps.initial;
  // Handle of the in-flight count-up rAF (null = idle). Single-flight: a fresh
  // count-up cancels the prior one so two clears never drive the chip at once.
  let scoreRafId: number | null = null;

  const writeScoreCount = (n: number): void => {
    scoreValue.style.setProperty("--yn-score-count", String(n));
  };

  const seed = (value: number): void => {
    displayedScore = value;
    writeScoreCount(value);
    scoreEl.setAttribute("aria-label", `Score ${String(value)}`);
  };

  const animateScoreTo = (target: number, celebrate: boolean): void => {
    scoreEl.setAttribute("aria-label", `Score ${String(target)}`);
    // Single-flight: supersede any tween still climbing toward an older target.
    if (scoreRafId !== null) {
      cancelAnimationFrame(scoreRafId);
      scoreRafId = null;
    }
    if (target === displayedScore) {
      // No-op (deselect / theme hot-swap / non-scoring move). Leave the custom
      // property untouched so it keeps reading the settled value.
      return;
    }
    const from = displayedScore;
    displayedScore = target;
    const driveFrame = celebrate ? onFrame : null;
    if (celebrate) {
      scoreEl.style.setProperty("--yn-score-glow-ms", `${String(reward.score_chip_glow_ms)}ms`);
      // Restart the celebration glow by toggling the class with a reflow tap.
      scoreEl.classList.remove("yn-score-celebrating");
      void scoreEl.getBoundingClientRect();
      scoreEl.classList.add("yn-score-celebrating");
      window.setTimeout(
        () => scoreEl.classList.remove("yn-score-celebrating"),
        reward.score_chip_glow_ms + 80,
      );
    }
    // Snap (no tween) when motion is reduced or the tab is hidden. The number is
    // always CORRECT; only the flourish is cut -- and now it is the SAME
    // deliberate jump on every platform, honouring the OS reduce-motion choice.
    if (getReduceMotion() || document.visibilityState === "hidden") {
      writeScoreCount(target);
      driveFrame?.(target);
      return;
    }
    const delta = Math.abs(target - from);
    const durationMs = Math.min(
      reward.score_count_up_max_ms,
      Math.max(
        reward.score_count_up_min_ms,
        reward.score_count_up_min_ms + delta * reward.score_count_up_per_delta_ms,
      ),
    );
    const startTs = performance.now();
    let lastWritten = from;
    writeScoreCount(from);
    const stepFrame = (now: number): void => {
      const t = Math.min(1, (now - startTs) / durationMs);
      // easeOutCubic -- matches the prior cubic-bezier(0.22, 1, 0.36, 1) feel.
      const eased = 1 - Math.pow(1 - t, 3);
      const current = Math.round(from + (target - from) * eased);
      if (current !== lastWritten) {
        writeScoreCount(current);
        driveFrame?.(current);
        lastWritten = current;
      }
      if (t < 1) {
        scoreRafId = requestAnimationFrame(stepFrame);
      } else {
        // Clean terminate: write the EXACT final integer and drive the final
        // frame so the BEST chip + milestone land on the true total.
        scoreRafId = null;
        writeScoreCount(target);
        driveFrame?.(target);
      }
    };
    scoreRafId = requestAnimationFrame(stepFrame);
  };

  const snapToFinal = (): void => {
    if (scoreRafId === null) return;
    cancelAnimationFrame(scoreRafId);
    scoreRafId = null;
    writeScoreCount(displayedScore);
    onFrame(displayedScore);
  };

  const destroy = (): void => {
    if (scoreRafId !== null) {
      cancelAnimationFrame(scoreRafId);
      scoreRafId = null;
    }
  };

  return { animateScoreTo, seed, snapToFinal, destroy };
}
