import type { GameMount, GameInstance } from "@/shared/contracts/game-module.js";
import type { Save } from "@/shared/schemas/5-in-a-row.save.schema.js";
import balanceJson from "./balance.json";
import { readSave, writeSave, makeFreshSave } from "./save.js";
import { createRng } from "./engine/rng.js";
import { getCell, setCell } from "./engine/board.js";
import { findPath, findReachableCells } from "./engine/pathfind.js";
import { breakdownChain } from "./engine/score.js";
import type { Board, Coord, GameMode, ModeState } from "./types.js";
import { createBoardView } from "./ui/board-view.js";
import {
  attemptMove,
  createInitialTurnState,
  selectCell,
  deselect,
  type BalanceLike,
  type TurnState,
} from "./ui/turn-loop.js";
import { loadTheme } from "./ui/theme-loader.js";
import {
  extendTimeForClear,
  freshModeState,
  isGameOver,
  recordPlayedToday,
  seedForMode,
} from "./modes/index.js";
import { getLastMode, setLastMode, showModePicker } from "./ui/mode-picker.js";
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
  computeIsNewBest,
  openGameOverModal,
  type GameOverContext,
  type ModeMeta,
  type TopThreeRow,
} from "./ui/game-over-modal.js";
import { derivePills } from "./ui/bonus-pills.js";
import { centroidOfClearedCells, createBonusWave, elementCenter } from "./ui/bonus-wave.js";

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
type ExtendedBalance = BalanceLike & {
  readonly top_scores_max: number;
  readonly reward: RewardTimings;
};
const balanceConfig = balanceJson as unknown as ExtendedBalance;
const DEFAULT_THEME_ID = "tropical-fruits";
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
    mode = save.mode;
  } else {
    mode = getLastMode() ?? (await showModePicker(container));
  }
  setLastMode(mode);
  if (save.mode !== mode) {
    save = { ...save, mode };
    writeSave(save);
  }

  container.replaceChildren();

  const root = document.createElement("div");
  // Responsive 3-cell grid (Jony pass 2026-06-07, side-gutters lift):
  //   Mobile / portrait tablet: stacked rows (HUD bar / board / actions bar)
  //   Wide (lg+ = 1024px):      3 columns (HUD col | board | actions col)
  // yn-board-bg sits on root so the ambient glyph pattern fills the gutters
  // when the bars become side columns; on mobile the bars cover the pattern
  // strip behind them anyway, so the visual is unchanged.
  root.className =
    "grid h-full yn-board-bg " +
    "grid-rows-[auto_minmax(0,1fr)_auto] grid-cols-1 " +
    "lg:grid-rows-1 lg:grid-cols-[minmax(160px,1fr)_minmax(0,800px)_minmax(160px,1fr)]";
  root.setAttribute("role", "application");
  root.setAttribute("aria-label", "5 in a Row game");

  const topBar = document.createElement("div");
  topBar.className =
    // Mobile: horizontal bar with cream panel chrome
    "flex flex-row items-center justify-between gap-3 px-3 py-2 " +
    "bg-yn-tile/95 backdrop-blur border-b border-yn-border " +
    // Wide: vertical column, chips float on the patterned bg
    "lg:flex-col lg:items-center lg:justify-center lg:gap-3 lg:px-4 lg:py-6 " +
    "lg:bg-transparent lg:backdrop-blur-none lg:border-b-0";

  // Score chip (ADR-0017 "Stacked Wave" pass): the NUMBER is the hero.
  // Killed the "SCORE" label entirely -- the only big number on the bar
  // after first play is the score, labelling it is redundant. Cream pill
  // with terracotta digits; the accent orange is reserved for events
  // (count-up celebration glow, BEST bump, the bonus-wave delta badge).
  // Count-up animates via CSS @property --yn-score-count + counter() on
  // ::after; JS only needs to write the integer + the per-event duration
  // (no rAF, compositor-only). See board-view.css .yn-score-display /
  // .yn-score-chip and the @property declaration at the top of that
  // file's reward-loop block.
  const scoreEl = document.createElement("div");
  scoreEl.className =
    "yn-score-chip flex items-center justify-center px-5 py-2 rounded-2xl " +
    "bg-yn-tile border border-yn-border text-yn-ink shadow-sm " +
    "text-4xl sm:text-5xl font-bold tabular-nums tracking-tight";
  scoreEl.setAttribute("aria-live", "polite");
  scoreEl.setAttribute("aria-label", "Score 0");
  const scoreValue = document.createElement("span");
  scoreValue.className = "yn-score-display";
  // Seed the custom property at 0; the first render() bumps it to the
  // restored save value (or stays at 0 on fresh game). The transition is
  // applied per-update inline so duration scales with delta.
  scoreValue.style.setProperty("--yn-score-count", "0");
  scoreEl.appendChild(scoreValue);

  // BEST chip (Palm's one-more-turn hook, revised 2026-06-08): tracks the
  // ALL-TIME high score for the current mode (read once from
  // save.high_scores[mode][0] at mount). Was previously a session-best,
  // which is a tautology in a monotonically-increasing-score game (current
  // score == session best, always, since score never decreases mid-run).
  // Now it shows a PERSISTENT target to chase across reloads.
  //
  // When the player's live score CROSSES the stored all-time best, the
  // chip swaps its label to "NEW BEST", flips to the accent-filled
  // colourway, and tracks the live score (so the player sees the
  // milestone climb). The cross-moment plays one yn-best-bump pulse.
  // The chip is hidden iff the all-time best is 0 AND the player has not
  // scored yet (there is nothing to chase and nothing to celebrate).
  const bestEl = document.createElement("div");
  bestEl.className =
    "yn-best-chip hidden items-center gap-2 px-4 py-1.5 rounded-2xl " +
    "bg-yn-tile border border-yn-border text-yn-ink shadow-sm " +
    "text-base sm:text-lg font-bold tabular-nums";
  bestEl.setAttribute("aria-live", "polite");
  const bestLabel = document.createElement("span");
  bestLabel.className = "uppercase tracking-wider text-yn-muted text-[10px] font-semibold";
  bestLabel.textContent = "Best";
  const bestValue = document.createElement("span");
  bestValue.className = "yn-best-display";
  bestValue.style.setProperty("--yn-best-count", "0");
  bestEl.append(bestLabel, bestValue);

  // Streak chip: cream pill with day count. Hidden at 0 (no streak to brag).
  const streakEl = document.createElement("div");
  streakEl.className =
    "flex items-center gap-1 px-2.5 py-1 rounded-full bg-yn-bg border border-yn-border text-yn-muted text-xs tabular-nums";
  streakEl.setAttribute("aria-live", "polite");
  streakEl.style.display = "none";

  // Timer chip: cream pill with mono mm:ss. Hidden outside timed mode.
  const timerEl = document.createElement("div");
  timerEl.className =
    "flex items-center gap-1 px-3 py-1 rounded-full bg-yn-bg border border-yn-border text-yn-ink font-semibold tabular-nums";
  // Coalesced updates only at second boundaries (see renderTimer) so
  // "polite" announcements don't flood the screen reader at 10Hz.
  timerEl.setAttribute("aria-live", "polite");
  timerEl.setAttribute("aria-label", "Time remaining");
  if (mode !== "timed") timerEl.style.display = "none";

  // Next chip: 3 mini motif thumbnails in a pill. Replaces "Next: 4 3 1"
  // which was unreadable (run-group integers). Thumbnails are populated
  // by render() once the theme has loaded.
  const previewEl = document.createElement("div");
  previewEl.className =
    "flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yn-bg border border-yn-border";
  previewEl.setAttribute("aria-label", "Next pieces");
  const previewLabel = document.createElement("span");
  previewLabel.className = "text-[10px] uppercase tracking-wider text-yn-muted mr-0.5";
  previewLabel.textContent = "Next";
  previewEl.appendChild(previewLabel);
  const nextPipsEl = document.createElement("div");
  nextPipsEl.className = "flex items-center gap-1";
  previewEl.appendChild(nextPipsEl);

  topBar.append(scoreEl, bestEl, streakEl, timerEl, previewEl);

  const boardArea = document.createElement("div");
  // No flex-1 (grid row/col handles sizing) and no yn-board-bg (moved to
  // root). Just a flex centerer for the board itself.
  boardArea.className = "flex items-center justify-center p-2 min-h-0 overflow-hidden";
  const boardWrap = document.createElement("div");
  // aspect-square + max-w-[800px] + max-h-full lets the browser pick the
  // smaller of (parent.width, parent.height, 800) and keeps the board square
  // at every viewport. Cap bumped 720 -> 800 to match the new middle-column
  // ceiling on lg+ layouts.
  boardWrap.className = "aspect-square w-full max-w-[800px] max-h-full";
  const loadingEl = document.createElement("p");
  loadingEl.className = "text-sm text-yn-muted text-center";
  loadingEl.textContent = "Loading theme...";
  boardWrap.appendChild(loadingEl);
  boardArea.appendChild(boardWrap);

  const bottomBar = document.createElement("div");
  bottomBar.className =
    // Mobile: horizontal bar with cream panel chrome
    "flex flex-row items-center justify-between gap-2 px-3 py-2 " +
    "bg-yn-tile/95 backdrop-blur border-t border-yn-border " +
    // Wide: vertical column, buttons float on the patterned bg
    "lg:flex-col lg:items-center lg:justify-center lg:gap-3 lg:px-4 lg:py-6 " +
    "lg:bg-transparent lg:backdrop-blur-none lg:border-t-0";
  const backBtn = document.createElement("button");
  backBtn.type = "button";
  // Ghost pill: bg-transparent, border, rounded-full, hover deepens to bg-bg.
  backBtn.className =
    "px-4 py-1.5 rounded-full text-yn-ink text-sm font-medium border border-yn-border hover:bg-yn-bg transition-colors";
  backBtn.textContent = "\u2190 Back";
  backBtn.setAttribute("aria-label", "Back to home");
  backBtn.addEventListener("click", () => {
    window.history.back();
  });
  const undoBtn = document.createElement("button");
  undoBtn.type = "button";
  undoBtn.className =
    "px-4 py-1.5 rounded-full text-yn-muted text-sm font-medium border border-yn-border opacity-50 cursor-not-allowed";
  undoBtn.textContent = "\u21BA Undo";
  undoBtn.disabled = true;
  undoBtn.setAttribute("aria-disabled", "true");
  const pauseBtn = document.createElement("button");
  pauseBtn.type = "button";
  // Primary pill: accent-filled. Pause is the high-frequency action; it
  // earns the visual weight.
  pauseBtn.className =
    "px-5 py-1.5 rounded-full bg-yn-accent text-white text-sm font-semibold shadow-sm hover:bg-orange-700 transition-colors";
  pauseBtn.textContent = "Pause";
  pauseBtn.setAttribute("aria-label", "Pause and open settings");
  bottomBar.append(backBtn, undoBtn, pauseBtn);

  root.append(topBar, boardArea, bottomBar);
  container.appendChild(root);

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
  };
  document.documentElement.classList.toggle(REDUCE_MOTION_CLASS, settingsState.reduceMotion);
  if (!settingsState.showNextPreview) previewEl.style.display = "none";

  const restoredSeed = save.in_progress?.turn_seed;
  const turnSeed =
    restoredSeed !== undefined && restoredSeed !== null ? restoredSeed : seedForMode(mode);
  const rng = createRng(turnSeed);

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
  // Most-recent on-screen score integer. Drives the CSS @property tween
  // by changing only when state.score actually changes (otherwise theme
  // hot-swap re-renders would retrigger a 0-delta count-up).
  let displayedScore = state.score;

  const boardView = createBoardView({
    motifSymbolUrl: "",
    motifFiles: theme.motifFiles,
    onCellTap,
    onCellLongPress,
    previewBounceEnabled: settingsState.previewBounceEnabled,
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

  const renderStreak = (): void => {
    const current = save.streak?.current ?? 0;
    if (current <= 0) {
      streakEl.style.display = "none";
      return;
    }
    streakEl.style.display = "";
    streakEl.textContent = `${String(current)}-day streak`;
    streakEl.setAttribute("aria-label", `${String(current)}-day streak`);
  };

  const renderTimer = (): void => {
    if (state.modeState.kind !== "timed") return;
    const seconds = Math.ceil(state.modeState.ms_remaining / 1000);
    if (seconds === timerDisplayedSec) return;
    timerDisplayedSec = seconds;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    timerEl.textContent = `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const renderNextPips = (): void => {
    nextPipsEl.replaceChildren();
    for (const p of state.nextPreview) {
      const src = theme.motifFiles[String(p.kind)];
      if (src === undefined || src.length === 0) continue;
      const img = document.createElement("img");
      img.className = "w-5 h-5 sm:w-6 sm:h-6 rounded-sm";
      img.src = src;
      img.alt = `Piece type ${String(p.kind)}`;
      img.setAttribute("draggable", "false");
      nextPipsEl.appendChild(img);
    }
  };

  // Drive the count-up tween on the score chip. Duration scales with the
  // delta per ADR-0017: a small +5 ticks in ~450ms (almost subliminal),
  // the rare +135 takes the full ~1100ms cap so the player actually
  // WATCHES it climb. Equal-time-per-event would make a 5-clear feel as
  // heavy as a 135-clear; proportional time IS the recognition.
  // Implementation note: the integer transition uses CSS @property
  // (registered as <integer> in board-view.css) -- the browser interpolates
  // the int, counter() re-evaluates each paint, and the ::after text
  // updates without rAF.
  const animateScoreTo = (target: number, celebrate: boolean): void => {
    if (target === displayedScore) {
      // No-op (likely a non-score-changing render like a deselect).
      scoreEl.setAttribute("aria-label", `Score ${String(target)}`);
      return;
    }
    const delta = Math.max(0, target - displayedScore);
    const durationMs = Math.min(
      balanceConfig.reward.score_count_up_max_ms,
      Math.max(
        balanceConfig.reward.score_count_up_min_ms,
        balanceConfig.reward.score_count_up_min_ms +
          delta * balanceConfig.reward.score_count_up_per_delta_ms,
      ),
    );
    scoreValue.style.transition = `--yn-score-count ${String(durationMs)}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    scoreValue.style.setProperty("--yn-score-count", String(target));
    scoreEl.setAttribute("aria-label", `Score ${String(target)}`);
    displayedScore = target;
    if (celebrate) {
      scoreEl.style.setProperty(
        "--yn-score-glow-ms",
        `${String(balanceConfig.reward.score_chip_glow_ms)}ms`,
      );
      // Restart the celebration animation by toggling the class with a
      // reflow tap (mirrors the pattern in awaitClassAnimation).
      scoreEl.classList.remove("yn-score-celebrating");
      void scoreEl.getBoundingClientRect();
      scoreEl.classList.add("yn-score-celebrating");
      window.setTimeout(
        () => scoreEl.classList.remove("yn-score-celebrating"),
        balanceConfig.reward.score_chip_glow_ms + 80,
      );
    }
  };

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
    if (crossedAllTimeBest) {
      bestEl.classList.add("yn-best-chip--crossed");
      bestLabel.textContent = "New Best";
      bestEl.setAttribute("aria-label", `New best ${String(display)}`);
    } else {
      bestEl.classList.remove("yn-best-chip--crossed");
      bestLabel.textContent = "Best";
      bestEl.setAttribute("aria-label", `Best ${String(display)}`);
    }
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
  const syncScoreSilently = (): void => animateScoreTo(state.score, false);
  const render = (): void => {
    renderNextPips();
    boardView.setBoard(state.board, state.nextPreview, state.selected);
    renderStreak();
    renderTimer();
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
        undo: { available: true, snapshot: null },
        mode_state: state.modeState,
      },
    };
    save = next;
    writeSave(next);
  }

  type HighScoreEntry = { readonly score: number; readonly timestamp_iso: string };
  type RecordedScore = {
    readonly entry: HighScoreEntry;
    readonly isNewPersonalBest: boolean;
  };

  function highScoresForCurrentMode(): readonly HighScoreEntry[] {
    if (mode === "max-points") return save.high_scores.max_points;
    if (mode === "timed") return save.high_scores.timed;
    return save.high_scores.infinite;
  }

  function recordHighScore(): RecordedScore {
    const entry: HighScoreEntry = {
      score: state.score,
      timestamp_iso: new Date().toISOString(),
    };
    const oldScores = highScoresForCurrentMode();
    const isNewPersonalBest = computeIsNewBest(entry.score, oldScores);
    const cap = balanceConfig.top_scores_max;
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
      next_high_scores = { ...save.high_scores, infinite: insertEntry(save.high_scores.infinite) };
    }
    const nextStreak = recordPlayedToday(save.streak);
    save = { ...save, high_scores: next_high_scores, in_progress: null, streak: nextStreak };
    writeSave(save);
    renderStreak();
    return { entry, isNewPersonalBest };
  }

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
    const topThree: TopThreeRow[] = highScoresForCurrentMode()
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
        writeSave(makeFreshSave(mode));
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
    if (isAnimating) return;
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
    try {
      const outcome = attemptMove(state, coord, balanceConfig);
      if (outcome.kind === "no-source") return;
      if (outcome.kind === "unreachable") {
        boardView.showBlockersFlash(neighborBlockers(state.board, outcome.to));
        await boardView.showShake(outcome.to);
        return;
      }
      boardView.clearReachabilityHints();
      await boardView.showPathTrace(outcome.path);
      const moving = getCell(state.board, outcome.from.row, outcome.from.col);
      let intermediate = setCell(state.board, outcome.from.row, outcome.from.col, null);
      intermediate = setCell(intermediate, outcome.to.row, outcome.to.col, moving);
      boardView.setBoard(intermediate, state.nextPreview, null);
      await boardView.showLandBounce(outcome.to);
      const scoreBefore = state.score;
      if (outcome.clears.length > 0 && outcome.spawnedAt.length === 0) {
        const keys = new Set<string>();
        for (const r of outcome.clears) for (const k of r.cells) keys.add(k);
        await boardView.showClearFlash(keys);
        // Bonus-wave staging (ADR-0017, amended 2026-06-08). Pure-derived
        // from the engine breakdown. Every scoring clear now plays the
        // wave so the +delta badge flies into the score chip (the cause-
        // and-effect beat for the score change). Named bonus pills
        // (LENGTH N, INTERSECT, CASCADE) remain tier-2-and-above
        // ornaments via the existing derivePills rules: tier-1 simply
        // has no named pills, only the delta. The old isSilentTier
        // suppression was wrong: it suppressed the FEEDBACK along with
        // the celebration, leaving the score chip ticking up with no
        // visible source. The pink cell-splash is celebration; the
        // flying +N is feedback.
        const totalDelta = outcome.postMoveState.score - scoreBefore;
        const breakdowns = breakdownChain(outcome.clears, balanceConfig);
        const pills = derivePills(breakdowns, totalDelta);
        const waveSuppressed = pills.length === 0;
        if (!waveSuppressed) {
          const centroid = centroidOfClearedCells(boardView.element, keys);
          const target = elementCenter(scoreEl);
          // wave.play resolves when the FINAL delta pill begins flying
          // toward the score chip -- the cause-and-effect beat. The
          // count-up + chip glow fire on the same tick.
          await bonusWave.play(centroid, pills, target);
          state = outcome.postMoveState;
          render();
          animateScoreTo(state.score, true);
          updateBestOnScoreChange(state.score);
        } else {
          state = outcome.postMoveState;
          render();
          syncScoreSilently();
          updateBestOnScoreChange(state.score);
        }
      } else {
        state = outcome.postMoveState;
        render();
        syncScoreSilently();
        // No clears = no score change in normal play; the silent sync
        // above is a no-op in animateScoreTo (delta === 0 early return).
      }
      if (outcome.spawnedAt.length > 0) {
        await Promise.all(outcome.spawnedAt.map((c) => boardView.showLandBounce(c)));
      }
      if (isGameOver(state)) {
        const recorded = recordHighScore();
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
    }
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
  // Seed the chip's initial integer WITHOUT a tween (a restored save with
  // score 42 shouldn't visibly count up from 0 on every page load). The
  // next animateScoreTo call (triggered by the player's first scoring
  // move) explicitly overwrites the inline transition with its
  // event-scaled duration, so we don't need to "restore" the empty
  // transition here -- the no-op transition is harmless until then.
  scoreValue.style.transition = "none";
  scoreValue.style.setProperty("--yn-score-count", String(state.score));
  scoreEl.setAttribute("aria-label", `Score ${String(state.score)}`);
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
      const recorded = recordHighScore();
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
      stopTimer();
    } else if (state.modeState.kind === "timed" && !drawerOpen) {
      startTimer();
    }
  }
  document.addEventListener("visibilitychange", onVisibilityChange);

  if (mode === "timed") startTimer();

  let drawerClose: (() => void) | null = null;
  let modalClose: (() => void) | null = null;
  pauseBtn.addEventListener("click", () => {
    drawerOpen = true;
    stopTimer();
    drawerClose = openSettingsDrawer(container, { ...settingsState }, availableThemes, {
      async onThemeChange(nextThemeId) {
        const newTheme = await loadTheme(nextThemeId);
        await boardView.setTheme(newTheme.motifFiles);
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
        settingsState.showNextPreview = enabled;
        previewEl.style.display = enabled ? "" : "none";
        updateAppPref({ show_next_preview: enabled });
      },
      onPreviewBounceChange(enabled) {
        settingsState.previewBounceEnabled = enabled;
        boardView.setPreviewBounceEnabled(enabled);
        updateAppPref({ preview_bounce_enabled: enabled });
      },
      onResetGame() {
        writeSave(makeFreshSave(save.mode));
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
        // Clear in-progress + last_mode and bounce to home so the next
        // entry shows the mode picker again.
        writeSave({ ...save, in_progress: null });
        updateAppPref({ last_mode: null });
        window.location.assign("/");
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
