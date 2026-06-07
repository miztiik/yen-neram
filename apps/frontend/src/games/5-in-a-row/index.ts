import type { GameMount, GameInstance } from "@/shared/contracts/game-module.js";
import type { Save } from "@/shared/schemas/5-in-a-row.save.schema.js";
import balanceJson from "./balance.json";
import { readSave, writeSave, makeFreshSave } from "./save.js";
import { createRng } from "./engine/rng.js";
import { getCell, setCell } from "./engine/board.js";
import { findPath, findReachableCells } from "./engine/pathfind.js";
import type { Coord, GameMode, ModeState } from "./types.js";
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

type ExtendedBalance = BalanceLike & { readonly top_scores_max: number };
const balanceConfig = balanceJson as unknown as ExtendedBalance;
const DEFAULT_THEME_ID = "tropical-fruits";
const REDUCE_MOTION_CLASS = "prefers-reduced-motion-override";
// Timer granularity. Fine enough that the displayed seconds digit never
// visibly jitters; coarse enough that even on a hidden tab the wasted
// work is negligible (visibility-change actually stops the interval).
const TIMER_TICK_MS = 100;

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
  root.className = "flex flex-col h-full bg-yn-bg";
  root.setAttribute("role", "application");
  root.setAttribute("aria-label", "5 in a Row game");

  const topBar = document.createElement("div");
  topBar.className =
    "flex justify-between items-center gap-3 px-3 sm:px-5 py-2 bg-yn-tile/95 backdrop-blur border-b border-yn-border";

  // Score chip: SCORE label above big number in an accent-filled pill.
  // The number itself is the meaning; "Score:" prefix was 1990s.
  const scoreEl = document.createElement("div");
  scoreEl.className =
    "flex items-center gap-2 px-3 py-1 rounded-full bg-yn-accent text-white shadow-sm tabular-nums";
  scoreEl.setAttribute("aria-live", "polite");
  scoreEl.setAttribute("aria-label", "Score 0");
  const scoreLabel = document.createElement("span");
  scoreLabel.className = "text-[10px] uppercase tracking-wider opacity-80";
  scoreLabel.textContent = "Score";
  const scoreValue = document.createElement("span");
  scoreValue.className = "text-base font-bold tabular-nums";
  scoreValue.textContent = "0";
  scoreEl.append(scoreLabel, scoreValue);

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

  topBar.append(scoreEl, streakEl, timerEl, previewEl);

  const boardArea = document.createElement("div");
  boardArea.className =
    "flex-1 min-h-0 flex items-center justify-center p-2 yn-board-bg overflow-hidden";
  const boardWrap = document.createElement("div");
  // aspect-square + max-w-[720px] + max-h-full lets the browser pick the
  // smaller of (parent.width, parent.height, 720) and keeps the board square
  // at every viewport. Phone-portrait stays full-width (the prior 480 cap
  // was leaving headroom on big phones); desktop grows to 720; a landscape
  // laptop with a short vertical slot shrinks square via max-h-full.
  boardWrap.className = "aspect-square w-full max-w-[720px] max-h-full";
  const loadingEl = document.createElement("p");
  loadingEl.className = "text-sm text-yn-muted text-center";
  loadingEl.textContent = "Loading theme...";
  boardWrap.appendChild(loadingEl);
  boardArea.appendChild(boardWrap);

  const bottomBar = document.createElement("div");
  bottomBar.className =
    "flex justify-between items-center gap-2 px-3 sm:px-5 py-2 bg-yn-tile/95 backdrop-blur border-t border-yn-border";
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

  const boardView = createBoardView({
    motifSymbolUrl: "",
    motifFiles: theme.motifFiles,
    onCellTap,
    onCellLongPress,
  });
  boardWrap.replaceChildren(boardView.element);

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

  const render = (): void => {
    scoreValue.textContent = String(state.score);
    scoreEl.setAttribute("aria-label", `Score ${String(state.score)}`);
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
      if (outcome.clears.length > 0 && outcome.spawnedAt.length === 0) {
        const keys = new Set<string>();
        for (const r of outcome.clears) for (const k of r.cells) keys.add(k);
        await boardView.showClearFlash(keys);
      }
      state = outcome.postMoveState;
      render();
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

  render();
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
      if (gameOverModalClose !== null) gameOverModalClose();
      if (modalClose !== null) modalClose();
      if (drawerClose !== null) drawerClose();
      boardView.destroy();
      container.replaceChildren();
    },
  };
  return instance;
};

export default mount;
