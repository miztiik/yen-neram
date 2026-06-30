// HUD construction for 5-in-a-Row. PURE DOM scaffolding extracted from the game
// host (index.ts) so the host reads as wiring, not 240 lines of createElement.
// No game logic, no state, no event listeners -- buildHud returns the element
// handles + the undo enabled/disabled toggle, and the host wires behaviour onto
// them. (Layout / class strings unchanged from the inline version they replace.)

import type { GameMode } from "../types.js";

// Bottom-bar control trio (Jony 2026-06-28): Undo + Shuffle + Menu share ONE
// circular icon-button form; hierarchy is fill ONLY. Menu is the solid accent
// anchor; Undo + Shuffle are frosted peer tools.
const ICON_BTN =
  "w-11 h-11 rounded-full grid place-items-center transition-transform " +
  "active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80";
const ICON_BTN_TOOL = `${ICON_BTN} bg-white/10 border border-white/15 text-yn-hud-ink hover:bg-white/20`;

export type Hud = {
  /** Root grid element; the host appends it to the game container. */
  readonly root: HTMLDivElement;
  readonly scoreEl: HTMLDivElement;
  readonly scoreValue: HTMLSpanElement;
  readonly bestEl: HTMLDivElement;
  readonly bestValue: HTMLSpanElement;
  readonly streakEl: HTMLDivElement;
  readonly streakCount: HTMLSpanElement;
  readonly timerEl: HTMLDivElement;
  readonly timerValue: HTMLSpanElement;
  readonly boardArea: HTMLDivElement;
  readonly boardWrap: HTMLDivElement;
  readonly undoBtn: HTMLButtonElement;
  readonly shuffleBtn: HTMLButtonElement;
  readonly menuBtn: HTMLButtonElement;
  /** Toggle the undo button between the enabled (frosted) and disabled (ghosted) colourway. */
  readonly setUndoEnabled: (enabled: boolean) => void;
};

export function buildHud(mode: GameMode): Hud {
  const root = document.createElement("div");
  // Responsive 3-cell grid (Jony pass 2026-06-07, side-gutters lift):
  //   Mobile / portrait tablet: stacked rows (HUD bar / board / actions bar)
  //   Wide (lg+ = 1024px):      3 columns (HUD col | board | actions col)
  root.className =
    "grid h-full yn-board-bg " +
    "grid-rows-[auto_minmax(0,1fr)_auto] grid-cols-1 " +
    "lg:grid-rows-1 lg:grid-cols-[minmax(160px,1fr)_minmax(0,800px)_minmax(160px,1fr)]";
  root.setAttribute("role", "application");
  root.setAttribute("aria-label", "5 in a Row game");

  const topBar = document.createElement("div");
  // 2027 HUD (ADR-0033): the score is the un-boxed hero; Best/Streak/Timer demote
  // to one muted stat line beneath it. A single centred column in both orientations.
  topBar.className =
    "flex flex-col items-center justify-center gap-1.5 px-3 py-3 " + "lg:gap-2 lg:px-4 lg:py-6";

  // Score chip: the NUMBER is the hero (un-boxed, big + light, ADR-0033). Count-up
  // is driven by the host (rAF tween writing --yn-score-count; counter() renders it).
  const scoreEl = document.createElement("div");
  scoreEl.className =
    "yn-score-chip flex items-center justify-center leading-none " +
    "text-7xl sm:text-8xl tabular-nums";
  scoreEl.setAttribute("aria-live", "polite");
  scoreEl.setAttribute("aria-label", "Score 0");
  const scoreValue = document.createElement("span");
  scoreValue.className = "yn-score-display";
  scoreValue.style.setProperty("--yn-score-count", "0");
  scoreEl.appendChild(scoreValue);

  // BEST chip (Palm's one-more-turn hook): a matched stat-cell with a fixed-height
  // label slot above the number; tints to accent on crossing the all-time best.
  const bestEl = document.createElement("div");
  bestEl.className = "yn-best-chip hidden flex-col items-center gap-0.5";
  bestEl.setAttribute("aria-live", "polite");
  const bestLabelSlot = document.createElement("div");
  bestLabelSlot.className = "flex items-center justify-center h-3.5";
  const bestLabel = document.createElement("span");
  bestLabel.className =
    "yn-best-label text-[10px] uppercase tracking-[0.14em] font-semibold leading-none text-yn-hud-muted";
  bestLabel.textContent = "Best";
  bestLabelSlot.appendChild(bestLabel);
  const bestValue = document.createElement("span");
  bestValue.className =
    "yn-best-display text-lg font-semibold tabular-nums leading-none text-yn-hud-ink";
  bestValue.style.setProperty("--yn-best-count", "0");
  bestEl.append(bestLabelSlot, bestValue);

  // Streak chip (Jony pass 2026-06-08): amber flame icon + the count as the hero;
  // the "day streak" wording is the aria-label only. Hidden at 0 streak.
  const streakEl = document.createElement("div");
  streakEl.className = "yn-streak-chip flex flex-col items-center gap-0.5";
  streakEl.setAttribute("aria-live", "polite");
  streakEl.setAttribute("title", "Daily play streak");
  streakEl.style.display = "none";
  const streakFlame = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  streakFlame.setAttribute("class", "yn-streak-chip__flame");
  streakFlame.setAttribute("viewBox", "0 0 24 24");
  streakFlame.setAttribute("aria-hidden", "true");
  streakFlame.setAttribute("focusable", "false");
  streakFlame.innerHTML = `
    <defs>
      <linearGradient id="yn-streak-flame-grad" x1="0%" y1="100%" x2="0%" y2="0%">
        <stop offset="0%" stop-color="#ea580c"/>
        <stop offset="60%" stop-color="#fb923c"/>
        <stop offset="100%" stop-color="#fbbf24"/>
      </linearGradient>
    </defs>
    <path d="M12 2c1.2 3 4.5 5 4.5 9 0 3.6-2 6-4.5 6S7.5 14.6 7.5 11c0-1.7.8-3 1.6-3.9.3 1.4 1.1 2 1.9 2 0-2.6.4-5 1-7Z" fill="url(#yn-streak-flame-grad)" stroke="#9a3412" stroke-width="0.6" stroke-linejoin="round"/>
    <path d="M12 11.5c.7 1.2 1.6 1.8 1.6 3.2 0 1.3-.7 2.3-1.6 2.3s-1.6-1-1.6-2.3c0-.7.3-1.3.6-1.7.1.5.4.7.6.7.1-.7.2-1.4.4-2.2Z" fill="#fef3c7" opacity="0.85"/>
  `;
  const streakFlameSlot = document.createElement("div");
  streakFlameSlot.className = "flex items-center justify-center h-3.5";
  streakFlameSlot.appendChild(streakFlame);
  const streakCount = document.createElement("span");
  streakCount.className =
    "yn-streak-chip__count text-lg font-semibold tabular-nums leading-none text-yn-hud-ink";
  streakEl.append(streakFlameSlot, streakCount);

  // Timer chip: a clock glyph in the top slot, mm:ss below -- same shape as
  // Best/Streak so timed-mode keeps the row aligned. Hidden outside timed mode.
  const timerEl = document.createElement("div");
  timerEl.className = "yn-timer flex flex-col items-center gap-0.5";
  timerEl.setAttribute("aria-live", "polite");
  timerEl.setAttribute("aria-label", "Time remaining");
  if (mode !== "timed") timerEl.style.display = "none";
  const timerIconSlot = document.createElement("div");
  timerIconSlot.className = "flex items-center justify-center h-3.5 text-yn-hud-muted";
  timerIconSlot.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;
  const timerValue = document.createElement("span");
  timerValue.className =
    "yn-timer-value text-lg font-semibold tabular-nums leading-none text-yn-hud-ink";
  timerEl.append(timerIconSlot, timerValue);

  // Stat line (ADR-0033): Best / Streak / Timer in one muted row beneath the score.
  const statLine = document.createElement("div");
  statLine.className = "flex flex-row items-start justify-center gap-6 sm:gap-8 min-h-[2.25rem]";
  statLine.append(bestEl, streakEl, timerEl);

  topBar.append(scoreEl, statLine);

  const boardArea = document.createElement("div");
  // A flex centerer for the board AND a size container (.yn-board-area ->
  // container-type: size) so the board stays square on every viewport.
  boardArea.className = "yn-board-area flex items-center justify-center p-2 min-h-0";
  const boardWrap = document.createElement("div");
  // The board is sized + shaped entirely by .yn-board-slab (index.css).
  boardWrap.className = "yn-board-slab overflow-hidden";
  const loadingEl = document.createElement("p");
  loadingEl.className = "text-sm text-white/70 text-center";
  loadingEl.textContent = "Loading theme...";
  boardWrap.appendChild(loadingEl);
  boardArea.appendChild(boardWrap);

  const bottomBar = document.createElement("div");
  // Two-button layout (Undo left, Menu right); buttons float on the violet bg.
  bottomBar.className =
    "flex flex-row items-center justify-between gap-2 px-3 py-3 " +
    "lg:flex-col lg:items-center lg:justify-center lg:gap-3 lg:px-4 lg:py-6";

  const undoBtn = document.createElement("button");
  undoBtn.type = "button";
  // Icon-only counter-clockwise back-arrow. The descriptive aria-label stays
  // ("Undo last move") -- an icon button needs a spoken name, and the undo e2e
  // selector keys off it. setUndoEnabled toggles the colourway.
  undoBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11"/></svg>`;
  undoBtn.setAttribute("aria-label", "Undo last move");
  undoBtn.setAttribute("title", "Undo");

  // Stuck-valve shuffle button (ADR-0038): appears only while usable, with a
  // one-shot entrance pop. Glyph = two weaving arrows, unlike Undo's single loop.
  const shuffleBtn = document.createElement("button");
  shuffleBtn.type = "button";
  shuffleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.8-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/><path d="m18 14 4 4-4 4"/></svg>`;
  shuffleBtn.setAttribute("aria-label", "Shuffle the board (once per game)");
  shuffleBtn.setAttribute("title", "Shuffle");
  shuffleBtn.className = ICON_BTN_TOOL;
  shuffleBtn.style.display = "none";

  // Menu button: the solid accent ANCHOR of the trio. The 3-line hamburger opens
  // the drawer (Navigate / Appearance / danger zone all live inside).
  const menuBtn = document.createElement("button");
  menuBtn.type = "button";
  menuBtn.className = `${ICON_BTN} bg-yn-accent text-white shadow-xs hover:bg-orange-700`;
  menuBtn.setAttribute("aria-label", "Open menu");
  menuBtn.setAttribute("title", "Menu");
  menuBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>`;

  // Undo + Shuffle cluster at the leading edge; Menu anchors to the trailing edge
  // so revealing Shuffle never shifts the Menu (anti-jump).
  const toolsCluster = document.createElement("div");
  toolsCluster.className = "flex flex-row items-center gap-3 lg:flex-col lg:gap-3";
  toolsCluster.append(undoBtn, shuffleBtn);
  bottomBar.append(toolsCluster, menuBtn);

  root.append(topBar, boardArea, bottomBar);

  // Undo enabled (frosted peer tool) vs disabled (same disc ghosted to 40% with
  // the glyph muted and the border dropped, Jony 2026-06-28) -- never a grey shout.
  const setUndoEnabled = (enabled: boolean): void => {
    undoBtn.disabled = !enabled;
    undoBtn.setAttribute("aria-disabled", enabled ? "false" : "true");
    undoBtn.className = enabled
      ? ICON_BTN_TOOL
      : `${ICON_BTN} bg-white/10 text-yn-hud-muted opacity-40 cursor-not-allowed`;
  };

  return {
    root,
    scoreEl,
    scoreValue,
    bestEl,
    bestValue,
    streakEl,
    streakCount,
    timerEl,
    timerValue,
    boardArea,
    boardWrap,
    undoBtn,
    shuffleBtn,
    menuBtn,
    setUndoEnabled,
  };
}
