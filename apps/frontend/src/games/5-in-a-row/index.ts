import type { GameMount, GameInstance } from "@/shared/contracts/game-module.js";
import type { Save } from "@/shared/schemas/5-in-a-row.save.schema.js";
import { balance } from "./balance.schema.js";
import { readSave, writeSave, makeFreshSave, makeFreshGame } from "./save.js";
import { createRng } from "./engine/rng.js";
import { countFilled, getCell } from "./engine/board.js";
import { findPath, findReachableCells } from "./engine/pathfind.js";
import { breakdownChain } from "./engine/score.js";
import { shuffleBoard } from "./engine/shuffle.js";
import type { Board, Coord, GameMode, ModeState, PreviewItem } from "./types.js";
import { createBoardView, DEFAULT_TILE_SIZE, type ClearStyle } from "./ui/board-view.js";
import { buildHud } from "./ui/hud.js";
import { createScoreChip } from "./ui/score-chip.js";
import { createRunRecords, type RecordedScore } from "./ui/run-records.js";
import {
  attemptMove,
  createInitialTurnState,
  selectCell,
  deselect,
  type BalanceLike,
  type TurnState,
} from "./ui/turn-loop.js";
import { loadTheme } from "./ui/theme-loader.js";
import { extendTimeForClear, freshModeState, isGameOver, seedForMode } from "./modes/index.js";
import { consumeReplayMode, setReplayMode, showModePicker } from "./ui/mode-picker.js";
import {
  discoverAvailableThemes,
  openSettingsDrawer,
  readAppPrefs,
  updateAppPref,
  type SettingsState,
} from "./ui/settings-drawer.js";
import { openHowToPlay } from "./ui/how-to-play.js";
import { openLeaderboard } from "./ui/leaderboard.js";
import {
  openGameOverModal,
  type GameOverContext,
  type ModeMeta,
  type TopThreeRow,
} from "./ui/game-over-modal.js";
import { derivePills, hasNamedBonus } from "./ui/bonus-pills.js";
import { centroidOfClearedCells, createBonusWave, elementCenter } from "./ui/bonus-wave.js";
import { assetPaths } from "@/shared/asset-paths.js";

type RewardTimings = {
  readonly wave_pill_rise_ms: number;
  readonly wave_pill_hold_ms: number;
  readonly wave_pill_exit_ms: number;
  readonly wave_pill_stagger_ms: number;
  readonly wave_fly_to_score_ms: number;
  readonly score_count_up_min_ms: number;
  readonly score_count_up_per_delta_ms: number;
  readonly score_count_up_max_ms: number;
  readonly score_chip_glow_ms: number;
  readonly best_chip_pulse_ms: number;
};
type ClearTimings = {
  readonly preclear_glow_ms: number;
  // Per-distance-ring delay for the centroid shockwave (ADR-0030 / ADR-0032).
  // "flash" (reduce-motion) uses 0 (every cell fires on the same frame).
  readonly shockwave_step_ms: number;
  readonly splash_scale_by_length: Readonly<Record<string, number>>;
  // Concentric shockwave rings emitted at the cleared-line centroid, escalating
  // with line length (ADR-0032): a longer line drops a heavier stone. 1 = the
  // base per-cell burst only; 2-3 add staggered centre rings. The signature
  // stays ONE effect that grows in intensity, never a different effect per
  // length (Palm/Jony/Carmack council 2026-06-28).
  readonly splash_ring_count_by_length: Readonly<Record<string, number>>;
  readonly splash_ring_step_ms: number;
};
type MilestoneConfig = {
  readonly fractions: readonly number[];
  readonly cold_start: Readonly<Record<string, readonly number[]>>;
  readonly toast_ms: number;
};
type ExtendedBalance = BalanceLike & {
  readonly top_scores_max: number;
  readonly recent_window: number;
  readonly milestones: MilestoneConfig;
  readonly shuffle: { readonly fullness: number };
  readonly reward: RewardTimings;
  readonly clear: ClearTimings;
};
// Runtime-validated tuning config (ADR-0034): balance.schema.ts parses
// balance.json against BalanceSchema at module load, so a malformed knob throws
// at startup instead of becoming a silent NaN. ExtendedBalance stays the
// consuming type (Balance is structurally assignable to it).
const balanceConfig: ExtendedBalance = balance;

// Peak-scale multiplier for the clear-burst, by the cleared line's length
// (size-by-length, ADR-0028). Clamped to the configured 5..9 keys; a longer
// line bursts bigger.
function splashPeakScale(longestLine: number): number {
  const byLength = balanceConfig.clear.splash_scale_by_length;
  const key = String(Math.max(5, Math.min(9, longestLine)));
  return byLength[key] ?? 1;
}
// Concentric-ring count for the centroid shockwave, by cleared-line length
// (ADR-0032, escalate-by-length). Clamped to the configured 5..9 keys.
function splashRingCount(longestLine: number): number {
  const byLength = balanceConfig.clear.splash_ring_count_by_length;
  const key = String(Math.max(5, Math.min(9, longestLine)));
  return byLength[key] ?? 1;
}
const DEFAULT_THEME_ID = "planets";
const REDUCE_MOTION_CLASS = "prefers-reduced-motion-override";
// Timer granularity. Fine enough that the displayed seconds digit never
// visibly jitters; coarse enough that even on a hidden tab the wasted
// work is negligible (visibility-change actually stops the interval).
const TIMER_TICK_MS = 100;

// Pure helper: 4-adjacent neighbours of `at` that hold a piece. Used to
// highlight the BLOCKERS that fence in a tapped-but-unreachable empty
// destination, so the player learns the movement rule (pieces in the way
// block a path) visually rather than from text. If every neighbour is
// empty, the destination is unreachable because the WIDER region is
// fenced off; in that case we still flash the neighbours we DO find that
// are filled (often zero), and the red shake alone carries the signal.
// Off-board neighbours are silently skipped.
const FOUR_DIR: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
function neighborBlockers(board: Board, at: Coord): readonly Coord[] {
  const out: Coord[] = [];
  for (const [dr, dc] of FOUR_DIR) {
    const r = at.row + dr;
    const c = at.col + dc;
    if (getCell(board, r, c) !== null) out.push({ row: r, col: c });
  }
  return out;
}

const mount: GameMount = async (container, options) => {
  container.replaceChildren();

  let save: Save = readSave() ?? makeFreshSave("infinite");

  let mode: GameMode;
  if (save.in_progress !== null) {
    // An unfinished run resumes straight into its board (no picker).
    mode = save.mode;
  } else {
    // A fresh launch shows the picker so the three modes are always on
    // offer (ADR-0023); only a one-shot replay flag (Play Again / Restart
    // / Reset) skips it to restart the same mode.
    const replay = consumeReplayMode();
    mode = replay ?? (await showModePicker(container));
  }
  if (save.mode !== mode) {
    save = { ...save, mode };
    writeSave(save);
  }

  container.replaceChildren();

  // HUD scaffolding is built by ui/hud.ts (pure DOM, no logic). Destructure the
  // handles into the same names the host body already uses, so wiring below is
  // unchanged; only the ~240 lines of createElement moved out.
  const hud = buildHud(mode);
  container.appendChild(hud.root);
  const {
    scoreEl,
    scoreValue,
    bestEl,
    bestValue,
    streakEl,
    streakCount,
    timerValue,
    boardArea,
    boardWrap,
    undoBtn,
    shuffleBtn,
    menuBtn,
    setUndoEnabled,
  } = hud;

  const appPrefs = readAppPrefs();
  const themeId = options.theme ?? appPrefs.selected_theme ?? DEFAULT_THEME_ID;
  const [initialTheme, availableThemes] = await Promise.all([
    loadTheme(themeId),
    discoverAvailableThemes(),
  ]);
  let theme = initialTheme;

  const settingsState: SettingsState = {
    themeId: theme.id,
    reduceMotion: appPrefs.reduce_motion ?? false,
    pathPreviewEnabled: appPrefs.path_preview_enabled ?? true,
    showNextPreview: appPrefs.show_next_preview ?? true,
    previewBounceEnabled: appPrefs.preview_bounce_enabled ?? true,
    tileSize: appPrefs.tile_size ?? DEFAULT_TILE_SIZE,
  };
  document.documentElement.classList.toggle(REDUCE_MOTION_CLASS, settingsState.reduceMotion);

  const restoredSeed = save.in_progress?.turn_seed;
  const turnSeed =
    restoredSeed !== undefined && restoredSeed !== null ? restoredSeed : seedForMode(mode);
  // Resume the RNG at the EXACT cursor the in-progress save left off at, so a
  // mid-game reload does not rewind the spawn stream to turn_seed (ADR-0034).
  // Older saves (written before rng_cursor) fall back to the seed = the prior
  // behaviour. createRng(cursor) reconstructs the precise stream position
  // because the Mulberry32 cursor IS the full generator state.
  const restoredCursor = save.in_progress?.rng_cursor;
  const rng = createRng(restoredCursor ?? turnSeed);

  let state: TurnState;
  if (save.in_progress !== null) {
    const ip = save.in_progress;
    state = {
      board: ip.board,
      selected: ip.selected_cell,
      nextPreview: ip.next_preview,
      score: ip.score,
      rng,
      gameOver: false,
      modeState: ip.mode_state,
    };
  } else {
    state = createInitialTurnState(rng, freshModeState(mode), balanceConfig);
  }

  let isAnimating = false;
  let drawerOpen = false;
  // Input buffer (2026-06-28). A scoring move locks input for ~1.8s
  // (slide + land + clear + reward wave). On touch the player's NEXT move
  // -- which is TWO taps, select-source then tap-destination -- was
  // silently dropped by the `if (isAnimating) return;` gate, the reported
  // "second touch not registering" bug. We now buffer the taps made
  // during the lock and replay them through onCellTap on settle
  // (Carmack + Player). Cap is one move's worth so we never flush a deep
  // queue ("feels possessed", Player); the first replayed move re-locks
  // isAnimating, so further taps re-buffer and the pipeline stays one
  // move at a time. Replay re-runs attemptMove against the LIVE board,
  // so a now-filled / cleared destination self-revalidates.
  const MAX_BUFFERED_TAPS = 2;
  let bufferedTaps: Coord[] = [];
  let timerId: number | null = null;
  let timerDisplayedSec = -1;
  let gameOverModalClose: (() => void) | null = null;
  // Cumulative time added by timed-mode clear bonuses since this game began.
  // Not persisted to the save schema (per design freeze 2026-06-07); only
  // surfaced in the game-over modal as "60s + Xs bonus". Reset implicitly on
  // reload because the closure goes away.
  let bonusesEarnedMs = 0;
  // All-time best for the CURRENT mode (revised 2026-06-08, supersedes the
  // session-best from ADR-0017). Read once from save.high_scores[mode][0]
  // at mount; the chip then tracks the LIVE score once the player has
  // crossed it, surfacing the "you are setting a new record right now"
  // moment that the session-best variant could never deliver (since the
  // game's score never decreases mid-run, session-best == current-score
  // was an identity, never a target). Re-reads can happen safely after
  // recordHighScore() if we ever want to show the latest persisted best
  // across rounds within the same mount; today the per-game save flow
  // reloads the page on Play Again / Reset so this is not needed.
  const allTimeBestAtMount = (() => {
    if (mode === "max-points") return save.high_scores.max_points[0]?.score ?? 0;
    if (mode === "timed") return save.high_scores.timed[0]?.score ?? 0;
    return save.high_scores.infinite[0]?.score ?? 0;
  })();
  // Track whether the live score has crossed the all-time best yet during
  // this mount. Once crossed, the chip stays in "NEW BEST" mode for the
  // rest of the game (label, chip colourway, tracks state.score live).
  let crossedAllTimeBest = state.score > allTimeBestAtMount;

  // Undo state (2026-06-08). Doctrine per how-to-play.ts: "You get one
  // undo per game". Snapshot is in-memory (NOT persisted to the
  // UndoSnapshotSchema field on save.in_progress.undo this PR -- that
  // field stays null; reload-survival of an unconsumed undo is a
  // follow-up that would extend the schema with rng_cursor + selected +
  // mode_state per CLAUDE.md sec 11). What IS persisted is the
  // boolean `undo.available` so a reload of a game whose undo has
  // already been spent stays disabled. RNG cursor IS snapshotted so
  // the player's second-attempt move produces the same spawn the first
  // attempt would have (otherwise the undo would let them re-roll the
  // RNG by retrying the same move). modeState snapshotted so a timed-
  // mode undo doesn't refund the seconds the player spent thinking.
  type UndoSnap = {
    readonly board: Board;
    readonly score: number;
    readonly nextPreview: readonly PreviewItem[];
    readonly selected: Coord | null;
    readonly rngCursor: number;
    readonly modeState: ModeState;
  };
  let undoSnap: UndoSnap | null = null;
  // True once the player has spent their single per-game undo. Persists
  // across reloads via save.in_progress.undo.available (false means
  // spent). Reset to false on freshMakeSave / Play Again / Reset (the
  // freshly-minted save has available: true by schema default).
  let undoUsedThisGame = save.in_progress !== null && save.in_progress.undo.available === false;
  let shuffleUsedThisGame = save.in_progress?.shuffle_used ?? false;

  const boardView = createBoardView({
    motifSymbolUrl: "",
    motifFiles: theme.motifFiles,
    motifColors: theme.motifColors,
    onCellTap,
    onCellLongPress,
    previewBounceEnabled: settingsState.previewBounceEnabled,
    tileSize: settingsState.tileSize,
  });
  boardWrap.replaceChildren(boardView.element);

  // Reward-loop overlay (ADR-0017). Single instance for the game's lifetime.
  // The wave fixed-positions itself over document.body and computes
  // spawn/target coordinates from getBoundingClientRect each play, so it
  // tolerates resize / settings drawer / orientation change without
  // re-creation.
  const bonusWave = createBonusWave({
    pill_rise_ms: balanceConfig.reward.wave_pill_rise_ms,
    pill_hold_ms: balanceConfig.reward.wave_pill_hold_ms,
    pill_exit_ms: balanceConfig.reward.wave_pill_exit_ms,
    pill_stagger_ms: balanceConfig.reward.wave_pill_stagger_ms,
    fly_to_score_ms: balanceConfig.reward.wave_fly_to_score_ms,
  });

  // Initial state: disabled. The first snapshot capture in onCellTap
  // enables it. A reload with `undo.available === true` and no in-memory
  // snapshot also leaves it disabled until the player makes a move
  // (snapshot is not persisted this PR, see UndoSnap type comment).
  setUndoEnabled(false);

  // --- Stuck-valve shuffle (ADR-0038) -----------------------------------
  // One honest lifeline per run: when the board is crowded past a fullness
  // threshold, re-colour every tile in place (engine/shuffleBoard) to unblock.
  // No score, once per game, survives reload via shuffle_used. The button only
  // shows while it is usable, so normal play stays uncluttered.
  function shuffleFullnessReached(): boolean {
    const total = balanceConfig.board_size * balanceConfig.board_size;
    return total > 0 && countFilled(state.board) / total >= balanceConfig.shuffle.fullness;
  }
  function canShuffle(): boolean {
    return !shuffleUsedThisGame && !state.gameOver && shuffleFullnessReached();
  }
  function updateShuffleButton(): void {
    const show = canShuffle();
    const wasHidden = shuffleBtn.style.display === "none";
    shuffleBtn.style.display = show ? "" : "none";
    if (show && wasHidden) {
      // One-shot entrance pop when the lifeline first appears (Jony 2026-06-28).
      // Reflow tap so the keyframe replays on every reveal; reduce-motion no-ops.
      shuffleBtn.classList.remove("yn-icon-enter");
      void shuffleBtn.getBoundingClientRect();
      shuffleBtn.classList.add("yn-icon-enter");
    }
  }
  function doShuffle(): void {
    if (isAnimating || !canShuffle()) return;
    state = {
      ...state,
      board: shuffleBoard(
        state.board,
        state.rng,
        balanceConfig.num_run_groups,
        balanceConfig.min_line_length,
      ),
      selected: null,
    };
    shuffleUsedThisGame = true;
    boardView.clearPathPreview();
    render();
    syncScoreSilently();
    persist();
  }
  shuffleBtn.addEventListener("click", () => {
    doShuffle();
  });

  undoBtn.addEventListener("click", () => {
    // Guards: no replay during an animation, no double-undo, no undo
    // when there's nothing to revert.
    if (isAnimating) return;
    if (undoSnap === null) return;
    if (undoUsedThisGame) return;
    const snap = undoSnap;
    // Restore RNG state by re-seeding with the snapshot cursor; the new
    // Rng instance replaces the in-state one so the next move sees the
    // same spawn the player would have got had they made a different
    // first move. The closure-level `rng` const is only used at mount
    // (initial state), so we can rebind state.rng safely here.
    const restoredRng = createRng(snap.rngCursor);
    state = {
      board: snap.board,
      selected: snap.selected,
      nextPreview: snap.nextPreview,
      score: snap.score,
      rng: restoredRng,
      gameOver: false,
      modeState: snap.modeState,
    };
    undoSnap = null;
    undoUsedThisGame = true;
    setUndoEnabled(false);
    boardView.clearPathPreview();
    if (state.selected !== null) {
      boardView.setReachabilityHints(findReachableCells(state.board, state.selected));
    } else {
      boardView.clearReachabilityHints();
    }
    render();
    // Score chip tweens DOWN to the restored score (the rAF tween handles
    // negative deltas fine; duration clamps to the min). No celebration glow --
    // undo isn't a win.
    scoreChip.animateScoreTo(state.score, false);
    // BEST chip: if the undo drops the live score back to or below the
    // all-time-best-at-mount, revert the "NEW BEST" mode so the chip
    // stops claiming a record the player no longer holds. Otherwise
    // (still above the persistent best after undo) keep the NEW BEST
    // colourway; the chip just tracks the lower live score.
    if (crossedAllTimeBest && state.score <= allTimeBestAtMount) {
      crossedAllTimeBest = false;
    }
    renderBestChip(state.score, false);
    persist();
  });

  const renderStreak = (): void => {
    const current = save.streak?.current ?? 0;
    if (current <= 0) {
      streakEl.style.display = "none";
      return;
    }
    streakEl.style.display = "";
    streakCount.textContent = String(current);
    streakEl.setAttribute("aria-label", `${String(current)} day streak`);
  };

  const renderTimer = (): void => {
    if (state.modeState.kind !== "timed") return;
    const seconds = Math.ceil(state.modeState.ms_remaining / 1000);
    if (seconds === timerDisplayedSec) return;
    timerDisplayedSec = seconds;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    timerValue.textContent = `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    // Under 10s the timer is the HUD's only urgency signal (ADR-0033): red + pulse.
    timerValue.classList.toggle("yn-timer-urgent", seconds <= 10 && seconds > 0);
  };

  // Score-chip count-up lives in ui/score-chip.ts (a bounded rAF tween). onFrame
  // climbs the BEST chip + fires the milestone toast in lockstep with the number
  // (never ahead of it -- the old "says 80 but only added 45" desync was the
  // best/milestone firing ~0.8 s before the count-up). The onFrame closure
  // forward-refs updateBestOnScoreChange + checkMilestones (defined below); both
  // run only at tween time, well after mount.
  const scoreChip = createScoreChip({
    scoreEl,
    scoreValue,
    reward: balanceConfig.reward,
    getReduceMotion: () => settingsState.reduceMotion,
    onFrame: (current: number): void => {
      updateBestOnScoreChange(current);
      runRecords.checkMilestones(current);
    },
    initial: state.score,
  });

  // Update the BEST chip to reflect the live score. There are two phases:
  //
  // 1. Pre-cross: chip shows the all-time best (from save.high_scores).
  //    Hidden iff allTimeBestAtMount === 0 AND state.score === 0 (nothing
  //    to chase, nothing to celebrate). Visible iff allTimeBestAtMount > 0
  //    so the new player sees the target on their first move.
  //
  // 2. Post-cross (state.score > allTimeBestAtMount): chip becomes the
  //    "NEW BEST" pill, label swaps, colourway flips to accent, value
  //    tracks state.score live so the player watches the milestone climb.
  //    Pulse fires ONCE on the cross transition.
  const renderBestChip = (newScore: number, justCrossed: boolean): void => {
    const display = crossedAllTimeBest ? newScore : allTimeBestAtMount;
    const visible = display > 0 || crossedAllTimeBest;
    if (!visible) {
      bestEl.classList.add("hidden");
      bestEl.classList.remove("flex");
      return;
    }
    bestEl.classList.remove("hidden");
    bestEl.classList.add("flex");
    bestValue.style.setProperty("--yn-best-count", String(display));
    // Crossed = accent tint only (Jony 2026-06-28): keep the label "Best" (no
    // text churn to "New Best"); the colour shift carries the record state, and
    // the aria-label mirrors the live value as "Best <n>" throughout.
    bestEl.classList.toggle("yn-best-chip--crossed", crossedAllTimeBest);
    bestEl.setAttribute("aria-label", `Best ${String(display)}`);
    if (justCrossed) {
      bestEl.style.setProperty(
        "--yn-best-bump-ms",
        `${String(balanceConfig.reward.best_chip_pulse_ms)}ms`,
      );
      bestEl.classList.remove("yn-best-bumping");
      void bestEl.getBoundingClientRect();
      bestEl.classList.add("yn-best-bumping");
      window.setTimeout(
        () => bestEl.classList.remove("yn-best-bumping"),
        balanceConfig.reward.best_chip_pulse_ms + 80,
      );
    }
  };

  // Called after each scoring move. If the score has just crossed the
  // all-time best, flip the chip into NEW BEST mode (one pulse). After
  // that, every further increase just updates the displayed number.
  const updateBestOnScoreChange = (newScore: number): void => {
    const wasCrossed = crossedAllTimeBest;
    const isCrossedNow = newScore > allTimeBestAtMount;
    const justCrossed = isCrossedNow && !wasCrossed;
    if (isCrossedNow) crossedAllTimeBest = true;
    renderBestChip(newScore, justCrossed);
  };

  // Seed the BEST chip visibility on initial render. Two cases:
  //  - Fresh game (state.score === 0): show "BEST <allTimeBestAtMount>"
  //    if allTimeBestAtMount > 0; otherwise hide.
  //  - Restored in-progress where state.score already beats the stored
  //    record (rare but legitimate): jump straight into NEW BEST mode
  //    without a pulse (the player isn't seeing the moment of crossing,
  //    they're returning to a record-breaking run already underway).
  renderBestChip(state.score, false);

  // render() is now layout-only (board, preview, streak, timer chips).
  // The score chip is updated SEPARATELY via animateScoreTo so the
  // wave-driven move path can defer the count-up tween to the exact
  // moment the delta pill begins flying into the chip. Non-clearing
  // moves still call render() + animateScoreTo together (the explicit
  // syncScoreSilently helper) so a deselect / theme hot-swap re-render
  // never bumps the count-up.
  const syncScoreSilently = (): void => scoreChip.animateScoreTo(state.score, false);
  const render = (): void => {
    // "Show next 2 preview" now gates the ON-BOARD ghosts (ADR-0033): pass an
    // empty preview when the player turned it off, so the toggle actually hides
    // the previews instead of the (now-removed) HUD pill.
    const preview = settingsState.showNextPreview ? state.nextPreview : [];
    boardView.setBoard(state.board, preview, state.selected);
    renderStreak();
    renderTimer();
    updateShuffleButton();
  };

  function persist(): void {
    const boardMut = state.board.map((row) => row.slice());
    const previewMut = state.nextPreview.map((p) => ({ ...p }));
    const next: Save = {
      ...save,
      in_progress: {
        board: boardMut,
        selected_cell: state.selected,
        next_preview: previewMut,
        score: state.score,
        turn_seed: turnSeed,
        // Live RNG cursor so a mid-game reload resumes the exact spawn stream
        // (ADR-0034) instead of rewinding to turn_seed.
        rng_cursor: state.rng.getCursor(),
        shuffle_used: shuffleUsedThisGame,
        // Persist the spent/unspent state of this game's single undo so a
        // reload of a game whose undo has been spent stays disabled. The undo
        // SNAPSHOT itself is still in-memory only (reload-survival of an unspent
        // undo would also need the snapshot's board + cursor persisted -- a
        // separate follow-up); rng_cursor above governs the MAIN stream.
        undo: { available: !undoUsedThisGame, snapshot: null },
        mode_state: state.modeState,
      },
    };
    save = next;
    writeSave(next);
  }

  // Persisted records (leaderboard + recent_scores + streak) and the adaptive
  // milestone toasts live in ui/run-records.ts. It reaches the host's live save
  // through getSave/setSave (capture-by-value would go stale once persist()
  // reassigns `save`); everything else it needs is a module-level import.
  const runRecords = createRunRecords({
    getSave: () => save,
    setSave: (next) => {
      save = next;
    },
    getScore: () => state.score,
    mode,
    renderStreak,
  });

  function buildModeMeta(): ModeMeta {
    if (state.modeState.kind === "max-points") {
      return { kind: "max-points", seedDate: state.modeState.seed_date };
    }
    if (state.modeState.kind === "timed") {
      return { kind: "timed", msWindow: state.modeState.ms_window, bonusesEarnedMs };
    }
    return { kind: "infinite" };
  }

  function presentGameOver(record: RecordedScore): void {
    if (gameOverModalClose !== null) return;
    const topThree: TopThreeRow[] = runRecords
      .highScoresForCurrentMode()
      .slice(0, 3)
      .map((e) => ({
        score: e.score,
        timestamp_iso: e.timestamp_iso,
        isThisGame:
          e.score === record.entry.score && e.timestamp_iso === record.entry.timestamp_iso,
      }));
    const streak =
      save.streak === null ? null : { current: save.streak.current, longest: save.streak.longest };
    const ctx: GameOverContext = {
      mode,
      score: state.score,
      isNewPersonalBest: record.isNewPersonalBest,
      topThree,
      modeMeta: buildModeMeta(),
      streak,
    };
    gameOverModalClose = openGameOverModal(container, ctx, {
      onPlayAgain() {
        // Preserve high_scores + streak across the run boundary;
        // wipe only in_progress. Bug fix per ADR-0021 -- the prior
        // `makeFreshSave(mode)` call wiped the leaderboard on every
        // game-end. setReplayMode keeps the SAME mode on the reload so
        // "Play again" does not re-prompt the picker (ADR-0023).
        setReplayMode(mode);
        writeSave(makeFreshGame(save, mode));
        window.location.reload();
      },
      onBackToHome() {
        window.history.back();
      },
      onShowFullLeaderboard() {
        modalClose = openLeaderboard(container, { initialMode: save.mode });
      },
    });
  }

  // Clear animation is now ONE signature (ADR-0032): a centroid shockwave that
  // escalates with line length (size + concentric rings). The player no longer
  // picks a style; reduce-motion is the only fork and snaps to the instant
  // "flash" path (the CSS then clamps it to ~1ms).
  function resolveClearStyle(): ClearStyle {
    return settingsState.reduceMotion ? "flash" : "shockwave";
  }
  function clearStepFor(style: ClearStyle): number {
    return style === "flash" ? 0 : balanceConfig.clear.shockwave_step_ms;
  }

  function onCellLongPress(coord: Coord): void {
    if (isAnimating || state.selected === null) return;
    // Long-press only previews destinations on EMPTY cells (we move motifs
    // INTO empties); long-pressing a filled cell is a no-op.
    if (getCell(state.board, coord.row, coord.col) !== null) return;
    const path = findPath(state.board, state.selected, coord);
    if (path === null) {
      void boardView.showShake(coord);
      boardView.showBlockersFlash(neighborBlockers(state.board, coord));
      return;
    }
    boardView.showPathPreview(path);
  }

  async function onCellTap(coord: Coord): Promise<void> {
    if (isAnimating) {
      // Queue the player's next intent rather than dropping it (the
      // reported touch bug). Sliding window keeps the most recent
      // move-worth of taps; replayed on settle (see flushBufferedTaps).
      bufferedTaps.push(coord);
      if (bufferedTaps.length > MAX_BUFFERED_TAPS) bufferedTaps.shift();
      return;
    }
    boardView.clearPathPreview();
    if (getCell(state.board, coord.row, coord.col) !== null) {
      // Tap-the-same-cell-again toggles deselection. Standard pattern in
      // every cell-grid game: pick up a piece, change your mind, tap it
      // again to put it back down.
      const isAlreadySelected =
        state.selected !== null &&
        state.selected.row === coord.row &&
        state.selected.col === coord.col;
      state = isAlreadySelected ? deselect(state) : selectCell(state, coord);
      render();
      if (state.selected !== null) {
        boardView.setReachabilityHints(findReachableCells(state.board, state.selected));
      } else {
        boardView.clearReachabilityHints();
      }
      return;
    }
    if (state.selected === null) return;
    isAnimating = true;
    // Flag (in function scope so the finally block can see it) that
    // tracks whether a snapshot was captured this move. The button is
    // enabled in finally based on this so an enabled button is always
    // a click-ready button.
    let snapshotCapturedThisMove = false;
    // Cosmetic reward tail (flying +N badge + score count-up). Captured at
    // board-commit and fired AFTER the input lock reopens, so the player can
    // line up their next move while the score still animates (async reward;
    // Carmack/Fowler/Player council 2026-06-30). null = no scoring this move.
    let rewardTail: (() => void) | null = null;
    try {
      const outcome = attemptMove(state, coord, balanceConfig);
      if (outcome.kind === "no-source") return;
      if (outcome.kind === "unreachable") {
        boardView.showBlockersFlash(neighborBlockers(state.board, outcome.to));
        await boardView.showShake(outcome.to);
        return;
      }
      // Capture undo snapshot BEFORE applying the move (one undo per
      // game per how-to-play.ts). The snapshot is in-memory only this
      // PR; what we persist via persist() is the boolean availability
      // flag so a reload of a game whose undo has already been spent
      // stays disabled. The button is ENABLED at the END of the move
      // (in the finally block) so the player never sees an enabled-but-
      // inert button mid-animation -- isAnimating gates the click
      // handler too, so an enabled button must be a click-ready button.
      if (!undoUsedThisGame) {
        undoSnap = {
          board: state.board,
          score: state.score,
          nextPreview: state.nextPreview,
          selected: state.selected,
          rngCursor: state.rng.getCursor(),
          modeState: state.modeState,
        };
        snapshotCapturedThisMove = true;
      }
      boardView.clearReachabilityHints();
      // The slide hands the moved piece node off to the destination cell
      // (showPathTrace), so there is NO full-board setBoard wedged in the
      // slide->settle seam anymore: the 81-cell teardown that used to
      // drop a frame mid-motion is gone. The piece that slid in IS the piece
      // that settles; the render() after spawns/clears reconciles the rest.
      await boardView.showPathTrace(outcome.path);
      // A piece that SLID in never vanished, so it settles with a small impact
      // overshoot (1 -> 1.08 -> 1), NOT the spawn pop-in (0.3 -> 1.3) that
      // showLandBounce plays for newly spawned pieces. The 0.3-shrink right
      // after a smooth slide was the perceived "stutter" (Jony).
      await boardView.showMoveSettle(outcome.to);
      const scoreBefore = state.score;
      const totalDelta = outcome.postMoveState.score - scoreBefore;
      // Three post-move shapes from the engine:
      //   (1) move-triggered clear: clears > 0, spawnedAt == 0
      //   (2) spawn-cascade clear:  clears > 0, spawnedAt  > 0
      //   (3) plain move (no clear): clears == 0, spawnedAt > 0
      //
      // Sequence priorities, in order:
      //   (a) Move-triggered clears flash WHILE the board view still
      //       shows the cleared cells filled -- so the flash is visible
      //       on the motifs, not on empty cells. Then state mutates and
      //       the view rerenders empty.
      //   (b) Spawns then land-bounce on the FINAL board so the player
      //       sees what arrived. (Note: a spawn that immediately got
      //       cascade-cleared land-bounces on an empty cell -- accepted
      //       limitation; fixing requires an engine change to return
      //       the intermediate post-spawn pre-clear board.)
      //   (c) Spawn-cascade clears flash AFTER the spawn lands so the
      //       cleared cells get any acknowledgement at all (they were
      //       never visibly occupied for long; the flash on the cell
      //       background is the only ack).
      //   (d) If totalDelta > 0: play the bonus wave -- pills derive
      //       from the breakdown chain; the +N delta badge flies into
      //       the score chip; count-up tween + chip glow + BEST chip
      //       fire on the same tick. Vibrant delta variant when the
      //       pill stack carries at least one NAMED pill (LENGTH /
      //       INTERSECT / CASCADE) -- a multiplier moment earns the
      //       larger gradient badge; plain tier-1 +5 stays on the
      //       calmer baseline so it doesn't shout.
      const moveTriggeredClear = outcome.clears.length > 0 && outcome.spawnedAt.length === 0;
      const spawnCascadeClear = outcome.clears.length > 0 && outcome.spawnedAt.length > 0;
      // clearedKeys (a Set) feeds the bonus-wave centroid; clearedColorMap
      // (cellKey -> run-group) drives the per-motif burst colour (ADR-0028).
      const clearedKeys = new Set<string>();
      const clearedColorMap = new Map<string, number>();
      let longestClearedLine = 0;
      for (const r of outcome.clears) {
        for (const k of r.cells) {
          clearedKeys.add(k);
          clearedColorMap.set(k, r.runGroup);
        }
        if (r.longestLineLength > longestClearedLine) longestClearedLine = r.longestLineLength;
      }
      // Burst tuning (ADR-0028): a bigger line bursts bigger; cascades ripple
      // cell-by-cell; a pre-clear glow lights the line a beat before it goes.
      // The app reduce-motion toggle zeroes the glow + ripple so there is no
      // added latency (the splash itself is already defanged in CSS).
      const reduceMotion = settingsState.reduceMotion;
      const peakScale = splashPeakScale(longestClearedLine);
      const ringCount = splashRingCount(longestClearedLine);
      // ONE signature clear (ADR-0032): a centroid shockwave that escalates with
      // line length -- bigger ring (peakScale) plus more concentric rings
      // (ringCount) for a longer line. reduce-motion is the only fork and snaps
      // to the instant "flash" path. Both the move-clear and the spawn-cascade
      // clear render with the identical signature now (no per-origin variants).
      const clearStyle = resolveClearStyle();
      const stepMs = clearStepFor(clearStyle);
      const ringStepMs = balanceConfig.clear.splash_ring_step_ms;
      const preClearGlowMs = reduceMotion ? 0 : balanceConfig.clear.preclear_glow_ms;

      if (moveTriggeredClear) {
        await boardView.showPreClearGlow(clearedColorMap, preClearGlowMs);
        await boardView.showClearFlash(clearedColorMap, {
          peakScale,
          ringCount,
          ringStepMs,
          style: clearStyle,
          stepMs,
        });
      }
      state = outcome.postMoveState;
      render();
      if (outcome.spawnedAt.length > 0) {
        await Promise.all(outcome.spawnedAt.map((c) => boardView.showLandBounce(c)));
      }
      if (spawnCascadeClear) {
        await boardView.showClearFlash(clearedColorMap, {
          peakScale,
          ringCount,
          ringStepMs,
          style: clearStyle,
          stepMs,
        });
      }
      if (totalDelta > 0) {
        // Capture the committed score NOW so the count-up targets THIS move's
        // total even if a fast next move commits a higher score while the badge
        // is still flying (Fowler: no lost-update from a live state.score read).
        const committedScore = state.score;
        const breakdowns = breakdownChain(outcome.clears, balanceConfig);
        const pills = derivePills(breakdowns, totalDelta);
        if (pills.length > 0) {
          const centroid = centroidOfClearedCells(boardView.element, clearedKeys);
          const target = elementCenter(scoreEl);
          const vibrantDelta = hasNamedBonus(breakdowns);
          // The tail is FIRED after the lock reopens (in finally), never awaited
          // -- the wave + count-up are cosmetic and must not gate the next move.
          // bonusWave.play resolves at start-of-fly, so the count-up begins
          // exactly as the +N reaches the chip; the count-up then drives the BEST
          // chip + milestone in lockstep (onCountUpFrame), so they no longer lead
          // the score number by ~0.8 s.
          rewardTail = (): void => {
            void bonusWave.play(centroid, pills, target, { vibrantDelta }).then(() => {
              scoreChip.animateScoreTo(committedScore, true);
            });
          };
        } else {
          // Defensive: totalDelta > 0 should always yield the +N pill, so this
          // is dead in practice. Still drive the count-up (which carries the BEST
          // chip + milestone) so the chip stays truthful without a flying badge.
          rewardTail = (): void => scoreChip.animateScoreTo(committedScore, true);
        }
      } else {
        // No clears = no score change; silent sync is a no-op in animateScoreTo
        // (target === displayedScore early return). Best chip + milestone are
        // driven only by a celebratory count-up, so they don't change either.
        syncScoreSilently();
      }
      if (isGameOver(state)) {
        const recorded = runRecords.recordHighScore();
        stopTimer();
        presentGameOver(recorded);
      } else {
        if (mode === "timed" && outcome.clears.length > 0) {
          let longest = 0;
          for (const c of outcome.clears) {
            if (c.longestLineLength > longest) longest = c.longestLineLength;
          }
          const beforeRemaining =
            state.modeState.kind === "timed" ? state.modeState.ms_remaining : 0;
          const newModeState = extendTimeForClear(state.modeState, longest);
          if (newModeState.kind === "timed") {
            bonusesEarnedMs += newModeState.ms_remaining - beforeRemaining;
          }
          state = { ...state, modeState: newModeState };
          // Refresh the displayed time after a bonus so the player sees
          // the bump immediately rather than waiting for the next tick.
          timerDisplayedSec = -1;
          renderTimer();
        }
        persist();
      }
    } finally {
      isAnimating = false;
      // Enable the undo button ONLY after the move animation has fully
      // settled. Setting disabled=false earlier (e.g. at snapshot
      // capture time) would show an interactive button while the click
      // handler's `if (isAnimating) return;` guard still rejects the
      // click. Enable here so "enabled" === "click-ready". If a snap
      // wasn't captured this move (player already spent their undo),
      // leave the button in whatever state it was (disabled).
      if (snapshotCapturedThisMove && !undoUsedThisGame) {
        setUndoEnabled(true);
      }
      flushBufferedTaps();
      // Fire the cosmetic reward tail AFTER the lock is released and buffered
      // taps are flushed: the flying +N badge and score count-up play in the
      // background while the player is already free to pick their next piece.
      // It never touches isAnimating or board state, so it cannot race the
      // next move (the wave is a fixed body overlay; the count-up rides the
      // score chip). null on a non-scoring move.
      if (rewardTail !== null) rewardTail();
    }
  }

  // Replay any taps the player made during the animation lock (input
  // buffer, 2026-06-28). Scheduled off the finally stack via
  // queueMicrotask so onCellTap is never re-entered synchronously (which
  // would nest the move stack on a scoring chain). Taps are discarded if
  // a menu/drawer or the game-over modal is up -- those were not aimed at
  // a live board. The first replayed move re-locks isAnimating, so any
  // remaining taps re-buffer: the pipeline stays one move at a time.
  function flushBufferedTaps(): void {
    if (bufferedTaps.length === 0) return;
    if (drawerOpen || gameOverModalClose !== null) {
      bufferedTaps = [];
      return;
    }
    const pending = bufferedTaps;
    bufferedTaps = [];
    queueMicrotask(() => {
      for (const c of pending) void onCellTap(c);
    });
  }

  // Click-outside-the-board (on the padded boardArea bg, NOT on the SVG
  // itself) deselects, mirroring the tap-same-cell-again pattern.
  boardArea.addEventListener("pointerdown", (e) => {
    if (e.target !== boardArea) return;
    if (isAnimating || state.selected === null) return;
    state = deselect(state);
    boardView.clearReachabilityHints();
    boardView.clearPathPreview();
    render();
  });

  // Document-level Escape: deselect when no drawer/modal is open.
  function onDocKeyDown(e: KeyboardEvent): void {
    if (e.key !== "Escape") return;
    if (drawerOpen || gameOverModalClose !== null) return;
    if (state.selected === null) return;
    e.preventDefault();
    state = deselect(state);
    boardView.clearReachabilityHints();
    boardView.clearPathPreview();
    render();
  }
  document.addEventListener("keydown", onDocKeyDown);

  render();
  // Seed the chip's initial integer WITHOUT a tween (a restored save with score
  // 42 shouldn't visibly count up from 0 on every load). The score-chip module
  // owns displayedScore + the --yn-score-count property; seed() sets both.
  scoreChip.seed(state.score);
  persist();

  // ---- Timed-mode countdown -------------------------------------------
  // Decrements ms_remaining at TIMER_TICK_MS resolution. Paused (early
  // return) while a move is animating OR while the settings drawer is
  // open, and the interval is actually stopped while the page is hidden
  // (visibilitychange listener below). When time hits 0, we record the
  // score, persist, and open the timed-mode game-over modal.

  function timerTick(): void {
    if (state.modeState.kind !== "timed") {
      stopTimer();
      return;
    }
    if (isAnimating || drawerOpen) return;
    const next = Math.max(0, state.modeState.ms_remaining - TIMER_TICK_MS);
    const updated: ModeState = { ...state.modeState, ms_remaining: next };
    state = { ...state, modeState: updated };
    renderTimer();
    if (next <= 0) {
      stopTimer();
      const recorded = runRecords.recordHighScore();
      presentGameOver(recorded);
    }
  }

  function startTimer(): void {
    if (timerId !== null) return;
    if (state.modeState.kind !== "timed") return;
    if (document.visibilityState === "hidden") return;
    timerId = window.setInterval(timerTick, TIMER_TICK_MS);
  }

  function stopTimer(): void {
    if (timerId === null) return;
    window.clearInterval(timerId);
    timerId = null;
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === "hidden") {
      // Snap any in-flight score count-up straight to its final value -- don't
      // leave a tween frozen mid-climb for a player who tabbed away (Carmack
      // guardrail). The chip + BEST + milestone all land on the true total.
      scoreChip.snapToFinal();
      stopTimer();
    } else if (state.modeState.kind === "timed" && !drawerOpen) {
      startTimer();
    }
  }
  document.addEventListener("visibilitychange", onVisibilityChange);

  if (mode === "timed") startTimer();

  let drawerClose: (() => void) | null = null;
  let modalClose: (() => void) | null = null;
  menuBtn.addEventListener("click", () => {
    drawerOpen = true;
    stopTimer();
    drawerClose = openSettingsDrawer(container, { ...settingsState }, availableThemes, {
      async onThemeChange(nextThemeId) {
        const newTheme = await loadTheme(nextThemeId);
        await boardView.setTheme(newTheme.motifFiles, newTheme.motifColors);
        theme = newTheme;
        settingsState.themeId = newTheme.id;
        updateAppPref({ selected_theme: newTheme.id });
      },
      onReduceMotionChange(enabled) {
        settingsState.reduceMotion = enabled;
        document.documentElement.classList.toggle(REDUCE_MOTION_CLASS, enabled);
        updateAppPref({ reduce_motion: enabled });
      },
      onPathPreviewChange(enabled) {
        settingsState.pathPreviewEnabled = enabled;
        updateAppPref({ path_preview_enabled: enabled });
      },
      onShowNextPreviewChange(enabled) {
        // Toggle the ON-BOARD ghost previews (the HUD pill is gone, ADR-0033).
        settingsState.showNextPreview = enabled;
        render();
        updateAppPref({ show_next_preview: enabled });
      },
      onPreviewBounceChange(enabled) {
        settingsState.previewBounceEnabled = enabled;
        boardView.setPreviewBounceEnabled(enabled);
        updateAppPref({ preview_bounce_enabled: enabled });
      },
      onTileSizeChange(size) {
        // Live rescale: re-size every motif in place + push the per-tier
        // bounce ceiling to CSS, then persist (ADR-0026). The change is
        // visible immediately behind the dimmed drawer backdrop.
        settingsState.tileSize = size;
        boardView.setTileSize(size);
        updateAppPref({ tile_size: size });
      },
      onBackToHome() {
        // Was a standalone bottom-bar button; relocated under the menu
        // 2026-06-08. Closes the drawer + navigates home via the
        // browser history if there's a previous entry, falling back to
        // explicit portal navigation (e.g., direct deep-link load).
        // ADR-0020: use `assetPaths.portal()` NOT literal "/" so the
        // GH Pages project deploy stays inside the SPA base.
        if (window.history.length > 1) {
          window.history.back();
        } else {
          window.location.assign(assetPaths.portal());
        }
      },
      onRestartGame() {
        // Mid-game "I'm done with this run, give me a fresh board"
        // intent. Same code path as "Reset game" in Danger zone, but
        // promoted to the Navigate section because abandoning a bad
        // run is a normal play action, not a destructive one.
        // abandonCurrentRun COMMITS the in-progress score first so a
        // personal best earned mid-run is never lost (council 2026-06-30),
        // then leaves a fresh in_progress; high_scores + streak +
        // recent_scores survive. setReplayMode keeps the SAME mode on the
        // reload (ADR-0023).
        runRecords.abandonCurrentRun();
        setReplayMode(save.mode);
        window.location.reload();
      },
      onResetGame() {
        // Kept under Danger zone for parity / discoverability; behaves
        // identically to onRestartGame today. If a future PR adds
        // confirmation copy to one but not the other they can diverge.
        // Also commits the in-progress score before wiping.
        runRecords.abandonCurrentRun();
        setReplayMode(save.mode);
        window.location.reload();
      },
      onClearHighScores() {
        writeSave({
          ...save,
          high_scores: { infinite: [], max_points: [], timed: [] },
        });
        window.location.reload();
      },
      onModeSwitch() {
        // Open the mode picker IN PLACE (ADR-0023): commit the in-progress
        // score (so a mid-run best earned in THIS mode is recorded before
        // leaving it), clear the run, and reload WITHOUT the replay flag so
        // the entry path falls through to showModePicker() right here in the
        // game route. No bounce to the portal -- the player asked to change
        // the mode, not to leave the game. high_scores + streak survive.
        runRecords.abandonCurrentRun();
        window.location.reload();
      },
      onShowHowToPlay() {
        modalClose = openHowToPlay(container);
      },
      onShowLeaderboard() {
        modalClose = openLeaderboard(container, { initialMode: save.mode });
      },
      onClose() {
        drawerOpen = false;
        if (mode === "timed") startTimer();
      },
    });
  });

  const instance: GameInstance = {
    unmount() {
      stopTimer();
      // Cancel an in-flight score count-up so its rAF loop doesn't keep firing
      // (writing to a now-detached chip) after teardown.
      scoreChip.destroy();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("keydown", onDocKeyDown);
      if (gameOverModalClose !== null) gameOverModalClose();
      if (modalClose !== null) modalClose();
      if (drawerClose !== null) drawerClose();
      boardView.destroy();
      bonusWave.destroy();
      container.replaceChildren();
    },
  };
  return instance;
};

export default mount;
