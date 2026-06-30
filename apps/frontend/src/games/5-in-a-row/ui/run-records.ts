// Run-records: the persisted-record write path for 5-in-a-Row, extracted from
// the game host. ONE seam (commitRun) shared by game-over and run-abandon, plus
// the adaptive-milestone toasts. The host owns the live `save` / `state` /
// `mode`; this module reaches them through narrow accessors (so a `persist()`
// reassignment of `save` is always seen live -- capture-by-value would go
// stale). Everything else (writeSave, makeFreshGame, recordPlayedToday,
// deriveMilestones, appendCapped, computeIsNewBest, balance) is a module-level
// import, not a closure dependency. Structural-only: behaviour unchanged.

import type { Save } from "@/shared/schemas/5-in-a-row.save.schema.js";
import type { GameMode } from "../types.js";
import { writeSave, makeFreshGame } from "../save.js";
import { recordPlayedToday } from "../modes/index.js";
import { deriveMilestones, appendCapped } from "../engine/milestones.js";
import { computeIsNewBest } from "./game-over-modal.js";
import { balance } from "../balance.schema.js";

export type HighScoreEntry = { readonly score: number; readonly timestamp_iso: string };
export type RecordedScore = {
  readonly entry: HighScoreEntry;
  readonly isNewPersonalBest: boolean;
};

export type RunRecordsDeps = {
  /** Live read of the host's current save (reassigned by persist(), etc.). */
  readonly getSave: () => Save;
  /** Write the host's `save` closure variable (mirrors `save = next`). */
  readonly setSave: (next: Save) => void;
  /** Live read of the current run score (`state.score`). */
  readonly getScore: () => number;
  readonly mode: GameMode;
  /** Re-render the streak chip after a commit changes it. */
  readonly renderStreak: () => void;
};

export type RunRecords = {
  /** Game-over: commit the score (folding it into recent_scores) + report PB. */
  recordHighScore(): RecordedScore;
  /** Restart / Reset / Switch-mode: commit a mid-run score (no recent fold) or wipe to a fresh game. */
  abandonCurrentRun(): void;
  /** Fire the adaptive-milestone toast for the highest newly-crossed threshold. */
  checkMilestones(score: number): void;
  /** The leaderboard slice for the current mode (used by the game-over modal). */
  highScoresForCurrentMode(): readonly HighScoreEntry[];
};

export function createRunRecords(deps: RunRecordsDeps): RunRecords {
  const { getSave, setSave, getScore, mode, renderStreak } = deps;

  function highScoresForCurrentMode(): readonly HighScoreEntry[] {
    const save = getSave();
    if (mode === "max-points") return save.high_scores.max_points;
    if (mode === "timed") return save.high_scores.timed;
    return save.high_scores.infinite;
  }

  // --- Adaptive milestones (ADR-0036) ------------------------------------
  // Quiet "you reached N" beats whose targets ADAPT to the player's own recent
  // runs (median of recent_scores[mode]) so they stay reachable-but-a-stretch.
  // Thresholds are frozen at construction (this mount; a new run reloads via
  // Play-again so they re-derive with the just-finished run folded in) and are
  // NEVER shown before they are crossed.
  const recentScoresForMode = (): readonly number[] => {
    const rs = getSave().recent_scores;
    if (rs === undefined) return [];
    if (mode === "max-points") return rs.max_points;
    if (mode === "timed") return rs.timed;
    return rs.infinite;
  };
  const milestoneThresholds = deriveMilestones(
    recentScoresForMode(),
    balance.milestones.cold_start[mode] ?? [],
    balance.milestones.fractions,
  );
  const firedMilestones = new Set<number>();
  let recordedThisGame = false;

  function appendRunToRecent(score: number): NonNullable<Save["recent_scores"]> {
    const cap = balance.recent_window;
    const cur: NonNullable<Save["recent_scores"]> = getSave().recent_scores ?? {
      infinite: [],
      max_points: [],
      timed: [],
    };
    if (mode === "max-points") {
      return { ...cur, max_points: appendCapped(cur.max_points, score, cap) };
    }
    if (mode === "timed") return { ...cur, timed: appendCapped(cur.timed, score, cap) };
    return { ...cur, infinite: appendCapped(cur.infinite, score, cap) };
  }

  function showMilestoneToast(value: number): void {
    // Single-flight: the count-up calls checkMilestones every frame, so a climb
    // that crosses two thresholds would otherwise stack two toasts. Drop any
    // toast still on screen before showing the newest.
    for (const stale of document.querySelectorAll(".yn-milestone-toast")) stale.remove();
    const toast = document.createElement("div");
    toast.className = "yn-milestone-toast";
    toast.textContent = String(value);
    toast.setAttribute("aria-hidden", "true");
    toast.style.setProperty("--yn-milestone-ms", `${String(balance.milestones.toast_ms)}ms`);
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), balance.milestones.toast_ms + 120);
  }

  // Fire a beat for the HIGHEST newly-crossed threshold this update (a cascade
  // can jump two at once; only the top one pops, so it never stacks toasts).
  function checkMilestones(score: number): void {
    let highest = 0;
    for (const t of milestoneThresholds) {
      if (!firedMilestones.has(t) && score >= t) {
        firedMilestones.add(t);
        if (t > highest) highest = t;
      }
    }
    if (highest > 0) showMilestoneToast(highest);
  }

  // Commit the CURRENT run's score to the persisted records. ONE seam shared by
  // game-over and run-abandon so a record set mid-run is never lost.
  //   - high_scores[mode]: ALWAYS. streak: ALWAYS (recordPlayedToday is per-day
  //     idempotent). in_progress: nulled. recent_scores[mode]: ONLY when
  //     foldRecent (a partial abandoned run must not drag the median down).
  // The `recordedThisGame` latch keeps it idempotent within a mount.
  function commitRun(opts: { readonly foldRecent: boolean }): HighScoreEntry {
    const save = getSave();
    const score = getScore();
    const entry: HighScoreEntry = {
      score,
      timestamp_iso: new Date().toISOString(),
    };
    if (recordedThisGame) return entry;
    recordedThisGame = true;
    const cap = balance.top_scores_max;
    const insertEntry = (arr: readonly HighScoreEntry[]): HighScoreEntry[] =>
      [...arr, entry].sort((a, b) => b.score - a.score).slice(0, cap);
    let next_high_scores = save.high_scores;
    if (mode === "max-points") {
      next_high_scores = {
        ...save.high_scores,
        max_points: insertEntry(save.high_scores.max_points),
      };
    } else if (mode === "timed") {
      next_high_scores = { ...save.high_scores, timed: insertEntry(save.high_scores.timed) };
    } else {
      next_high_scores = {
        ...save.high_scores,
        infinite: insertEntry(save.high_scores.infinite),
      };
    }
    const next: Save = {
      ...save,
      high_scores: next_high_scores,
      in_progress: null,
      streak: recordPlayedToday(save.streak),
      // `...save` already carries the prior recent_scores; only OVERRIDE it on a
      // completed run (conditional spread, not `recent_scores: undefined`).
      ...(opts.foldRecent ? { recent_scores: appendRunToRecent(score) } : {}),
    };
    setSave(next);
    writeSave(next);
    renderStreak();
    return entry;
  }

  function recordHighScore(): RecordedScore {
    // isNewPersonalBest is computed against the PRE-insert leaderboard, before
    // commitRun mutates the save.
    const isNewPersonalBest = computeIsNewBest(getScore(), highScoresForCurrentMode());
    const entry = commitRun({ foldRecent: true });
    return { entry, isNewPersonalBest };
  }

  function abandonCurrentRun(): void {
    const save = getSave();
    // Commit the score FIRST so a mid-run personal best survives. foldRecent:false
    // -- a partial run must not poison the adaptive-milestone median. Score 0 = a
    // misclick restart with nothing to record; wipe to a fresh shape (preserving
    // high_scores + streak + recent_scores). The else-branch writes WITHOUT
    // reassigning the host save -- the caller reloads immediately, exactly as
    // before the extraction.
    if (getScore() > 0) {
      commitRun({ foldRecent: false });
    } else {
      writeSave(makeFreshGame(save, save.mode));
    }
  }

  return { recordHighScore, abandonCurrentRun, checkMilestones, highScoresForCurrentMode };
}
