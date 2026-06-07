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
    "flex justify-between items-center px-4 py-3 bg-yn-tile border-b border-yn-border";
  const scoreEl = document.createElement("div");
  scoreEl.className = "text-yn-ink font-semibold tabular-nums";
  scoreEl.textContent = "Score: 0";
  scoreEl.setAttribute("aria-live", "polite");
  const streakEl = document.createElement("div");
  streakEl.className = "text-xs text-yn-muted tabular-nums";
  streakEl.setAttribute("aria-live", "polite");
  const timerEl = document.createElement("div");
  timerEl.className = "text-yn-ink font-semibold tabular-nums";
  // Coalesced updates only at second boundaries (see renderTimer) so
  // "polite" announcements don't flood the screen reader at 10Hz.
  timerEl.setAttribute("aria-live", "polite");
  timerEl.setAttribute("aria-label", "Time remaining");
  if (mode !== "timed") timerEl.style.display = "none";
  const previewEl = document.createElement("div");
  previewEl.className = "text-xs text-yn-muted tabular-nums";
  previewEl.textContent = "Next: ...";
  previewEl.setAttribute("aria-live", "polite");
  topBar.append(scoreEl, streakEl, timerEl, previewEl);

  const boardArea = document.createElement("div");
  boardArea.className = "flex-1 flex items-center justify-center p-4 yn-board-bg overflow-hidden";
  const boardWrap = document.createElement("div");
  boardWrap.className = "w-full max-w-[480px]";
  const loadingEl = document.createElement("p");
  loadingEl.className = "text-sm text-yn-muted text-center";
  loadingEl.textContent = "Loading theme...";
  boardWrap.appendChild(loadingEl);
  boardArea.appendChild(boardWrap);

  const bottomBar = document.createElement("div");
  bottomBar.className =
    "flex justify-between items-center px-4 py-3 bg-yn-tile border-t border-yn-border gap-2";
  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className =
    "px-4 py-2 rounded-lg bg-yn-tile text-yn-ink hover:bg-slate-700 border border-yn-border";
  backBtn.textContent = "Back";
  backBtn.addEventListener("click", () => {
    window.history.back();
  });
  const undoBtn = document.createElement("button");
  undoBtn.type = "button";
  undoBtn.className =
    "px-4 py-2 rounded-lg bg-yn-tile text-yn-ink border border-yn-border opacity-50 cursor-not-allowed";
  undoBtn.textContent = "Undo";
  undoBtn.disabled = true;
  undoBtn.setAttribute("aria-disabled", "true");
  const pauseBtn = document.createElement("button");
  pauseBtn.type = "button";
  pauseBtn.className =
    "px-4 py-2 rounded-lg bg-yn-tile text-yn-ink hover:bg-slate-700 border border-yn-border";
  pauseBtn.textContent = "Pause";
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

  const boardView = createBoardView({
    motifSymbolUrl: "",
    motifFiles: theme.motifFiles,
    onCellTap,
    onCellLongPress,
  });
  boardWrap.replaceChildren(boardView.element);

  const renderStreak = (): void => {
    const current = save.streak?.current ?? 0;
    streakEl.textContent = `Streak: ${String(current)}`;
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

  const render = (): void => {
    scoreEl.textContent = `Score: ${String(state.score)}`;
    previewEl.textContent = "Next: " + state.nextPreview.map((p) => String(p.kind)).join(" ");
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

  function recordHighScore(): void {
    const entry = { score: state.score, timestamp_iso: new Date().toISOString() };
    const cap = balanceConfig.top_scores_max;
    const insertEntry = (
      arr: readonly { score: number; timestamp_iso: string }[],
    ): { score: number; timestamp_iso: string }[] =>
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
      state = selectCell(state, coord);
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
        recordHighScore();
        stopTimer();
        if (state.modeState.kind === "timed") openTimedGameOverModal();
      } else {
        if (mode === "timed" && outcome.clears.length > 0) {
          let longest = 0;
          for (const c of outcome.clears) {
            if (c.longestLineLength > longest) longest = c.longestLineLength;
          }
          const newModeState = extendTimeForClear(state.modeState, longest);
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
      recordHighScore();
      openTimedGameOverModal();
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

  function openTimedGameOverModal(): void {
    if (gameOverModalClose !== null) return;
    const overlay = document.createElement("div");
    overlay.className = "fixed inset-0 z-50 flex items-center justify-center bg-black/60";
    const card = document.createElement("div");
    card.className =
      "bg-yn-tile rounded-xl p-6 max-w-[400px] w-full m-4 flex flex-col gap-4 items-center text-center";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "Time's up");
    const heading = document.createElement("h2");
    heading.className = "text-xl font-semibold text-yn-ink";
    heading.textContent = "Time's up";
    const scoreLine = document.createElement("p");
    scoreLine.className = "text-yn-ink text-lg";
    scoreLine.textContent = `Final score: ${String(state.score)}`;
    const buttons = document.createElement("div");
    buttons.className = "flex gap-2 w-full";
    const playAgain = document.createElement("button");
    playAgain.type = "button";
    playAgain.className =
      "flex-1 px-4 py-2 rounded-lg bg-yn-accent text-white font-semibold text-sm";
    playAgain.textContent = "Play again";
    const home = document.createElement("button");
    home.type = "button";
    home.className =
      "flex-1 px-4 py-2 rounded-lg bg-yn-tile text-yn-ink border border-yn-border text-sm";
    home.textContent = "Home";
    buttons.append(playAgain, home);
    card.append(heading, scoreLine, buttons);
    overlay.appendChild(card);
    const ownerBody = container.ownerDocument?.body ?? document.body;
    ownerBody.appendChild(overlay);
    const close = (): void => {
      overlay.remove();
      gameOverModalClose = null;
    };
    playAgain.addEventListener("click", () => {
      close();
      writeSave(makeFreshSave("timed"));
      window.location.reload();
    });
    home.addEventListener("click", () => {
      close();
      window.location.assign("/");
    });
    playAgain.focus();
    gameOverModalClose = close;
  }

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
