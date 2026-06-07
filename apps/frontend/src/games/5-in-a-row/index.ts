import type { GameMount, GameInstance } from "@/shared/contracts/game-module.js";
import type { SaveV1 } from "@/shared/schemas/5-in-a-row.save.schema.js";
import balanceJson from "./balance.json";
import { readSave, writeSave, makeFreshSave } from "./save.js";
import { createRng } from "./engine/rng.js";
import { getCell, setCell } from "./engine/board.js";
import { findPath } from "./engine/pathfind.js";
import type { Coord, GameMode } from "./types.js";
import { createBoardView } from "./ui/board-view.js";
import {
  attemptMove,
  createInitialTurnState,
  selectCell,
  type BalanceLike,
  type TurnState,
} from "./ui/turn-loop.js";
import { loadTheme } from "./ui/theme-loader.js";
import { freshModeState, isGameOver, seedForMode } from "./modes/index.js";
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
const HINT_LINGER_MS = 1500;
const DEFAULT_THEME_ID = "tropical-fruits";
const REDUCE_MOTION_CLASS = "prefers-reduced-motion-override";

const mount: GameMount = async (container, options) => {
  container.replaceChildren();

  let save: SaveV1 = readSave() ?? makeFreshSave("infinite");

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
  const previewEl = document.createElement("div");
  previewEl.className = "text-xs text-yn-muted tabular-nums";
  previewEl.textContent = "Next: ...";
  previewEl.setAttribute("aria-live", "polite");
  topBar.append(scoreEl, previewEl);

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
  const [theme, availableThemes] = await Promise.all([
    loadTheme(themeId),
    discoverAvailableThemes(),
  ]);

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
  let hintTimer: number | null = null;
  const pendingTimers = new Set<number>();
  const scheduleTimer = (cb: () => void, ms: number): number => {
    const id = window.setTimeout(() => {
      pendingTimers.delete(id);
      cb();
    }, ms);
    pendingTimers.add(id);
    return id;
  };

  const boardView = createBoardView({
    motifSymbolUrl: "",
    motifFiles: theme.motifFiles,
    onCellTap,
    onCellLongPress,
  });
  boardWrap.replaceChildren(boardView.element);

  const render = (): void => {
    scoreEl.textContent = `Score: ${String(state.score)}`;
    previewEl.textContent = "Next: " + state.nextPreview.map((p) => String(p.kind)).join(" ");
    boardView.setBoard(state.board, state.nextPreview, state.selected);
  };

  function persist(): void {
    const boardMut = state.board.map((row) => row.slice());
    const previewMut = state.nextPreview.map((p) => ({ ...p }));
    const next: SaveV1 = {
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
    const next_high_scores =
      mode === "max-points"
        ? {
            ...save.high_scores,
            max_points: [...save.high_scores.max_points, entry]
              .sort((a, b) => b.score - a.score)
              .slice(0, cap),
          }
        : {
            ...save.high_scores,
            infinite: [...save.high_scores.infinite, entry]
              .sort((a, b) => b.score - a.score)
              .slice(0, cap),
          };
    save = { ...save, high_scores: next_high_scores, in_progress: null };
    writeSave(save);
  }

  function onCellLongPress(coord: Coord): void {
    if (isAnimating || state.selected === null) return;
    const path = findPath(state.board, state.selected, coord);
    if (path === null) return;
    const hints = new Set<string>();
    for (const p of path) hints.add(`${String(p.row)},${String(p.col)}`);
    boardView.setReachabilityHints(hints);
    if (hintTimer !== null) {
      window.clearTimeout(hintTimer);
      pendingTimers.delete(hintTimer);
    }
    hintTimer = scheduleTimer(() => {
      hintTimer = null;
      boardView.clearReachabilityHints();
    }, HINT_LINGER_MS);
  }

  async function onCellTap(coord: Coord): Promise<void> {
    if (isAnimating) return;
    boardView.clearReachabilityHints();
    if (getCell(state.board, coord.row, coord.col) !== null) {
      state = selectCell(state, coord);
      render();
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
      } else {
        persist();
      }
    } finally {
      isAnimating = false;
    }
  }

  render();
  persist();

  let drawerClose: (() => void) | null = null;
  let modalClose: (() => void) | null = null;
  pauseBtn.addEventListener("click", () => {
    drawerClose = openSettingsDrawer(container, { ...settingsState }, availableThemes, {
      onThemeChange(nextThemeId) {
        // TODO: hot-swap when boardView.setTheme lands. v1: persist selection;
        // the next mount reads selected_theme from yn:app and loads from there.
        settingsState.themeId = nextThemeId;
        updateAppPref({ selected_theme: nextThemeId });
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
        writeSave({ ...save, high_scores: { infinite: [], max_points: [] } });
        window.location.reload();
      },
      onModeSwitch() {
        // PR 6 will wire the mode-picker. v1: clear in-progress + last_mode,
        // bounce to home so the next entry picks a fresh mode.
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
    });
  });

  const instance: GameInstance = {
    unmount() {
      for (const id of pendingTimers) window.clearTimeout(id);
      pendingTimers.clear();
      if (modalClose !== null) modalClose();
      if (drawerClose !== null) drawerClose();
      boardView.destroy();
      container.replaceChildren();
    },
  };
  return instance;
};

export default mount;
