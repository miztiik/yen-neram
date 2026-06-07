import type { GameMount, GameInstance } from "@/shared/contracts/game-module.js";
import type { SaveV1 } from "@/shared/schemas/5-in-a-row.save.schema.js";
import balanceJson from "../../../config/games/5-in-a-row/balance.json";
import { readSave, writeSave, makeFreshSave } from "./save.js";
import { createRng } from "./engine/rng.js";
import { getCell, setCell } from "./engine/board.js";
import { findPath } from "./engine/pathfind.js";
import type { Coord } from "./types.js";
import { createBoardView } from "./ui/board-view.js";
import {
  attemptMove,
  createInitialTurnState,
  selectCell,
  type BalanceLike,
  type TurnState,
} from "./ui/turn-loop.js";
import { loadTheme } from "./ui/theme-loader.js";

const balanceConfig = balanceJson as unknown as BalanceLike;
const HINT_LINGER_MS = 1500;
const DEFAULT_THEME_ID = "tropical-fruits";

const mount: GameMount = async (container, options) => {
  container.replaceChildren();

  const root = document.createElement("div");
  root.className = "flex flex-col h-full bg-yn-bg";

  const topBar = document.createElement("div");
  topBar.className =
    "flex justify-between items-center px-4 py-3 bg-yn-tile border-b border-yn-border";
  const scoreEl = document.createElement("div");
  scoreEl.className = "text-yn-ink font-semibold tabular-nums";
  scoreEl.textContent = "Score: 0";
  const previewEl = document.createElement("div");
  previewEl.className = "text-xs text-yn-muted tabular-nums";
  previewEl.textContent = "Next: ...";
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
  const pauseBtn = document.createElement("button");
  pauseBtn.type = "button";
  pauseBtn.className =
    "px-4 py-2 rounded-lg bg-yn-tile text-yn-ink border border-yn-border opacity-50 cursor-not-allowed";
  pauseBtn.textContent = "Pause";
  pauseBtn.disabled = true;
  bottomBar.append(backBtn, undoBtn, pauseBtn);

  root.append(topBar, boardArea, bottomBar);
  container.appendChild(root);

  const themeId = options.theme ?? DEFAULT_THEME_ID;
  const theme = await loadTheme(themeId);

  let save: SaveV1 = readSave() ?? makeFreshSave("infinite");
  const restoredSeed = save.in_progress?.turn_seed;
  const turnSeed =
    restoredSeed !== undefined && restoredSeed !== null
      ? restoredSeed
      : Math.floor(Math.random() * 0xffffffff);
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
    state = createInitialTurnState(rng, { kind: "infinite" }, balanceConfig);
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
      persist();
    } finally {
      isAnimating = false;
    }
  }

  render();
  persist();

  const instance: GameInstance = {
    unmount() {
      for (const id of pendingTimers) window.clearTimeout(id);
      pendingTimers.clear();
      boardView.destroy();
      container.replaceChildren();
    },
  };
  return instance;
};

export default mount;
