// Top-10 leaderboard modal for 5-in-a-row.
// Mode-tabs (Infinite / Max-Points) over save.high_scores[mode].
// Pure helpers (formatTimestamp, insertScore) are exported for unit tests.

import type { SaveV1 } from "@/shared/schemas/5-in-a-row.save.schema.js";
import type { GameMode } from "../types.js";
import { readSave } from "../save.js";

const MONTHS: readonly string[] = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const MAX_ENTRIES = 10;
const FALLBACK = "-";

export type LeaderboardOptions = {
  readonly initialMode?: GameMode;
};

export type TopScoreEntry = {
  readonly score: number;
  readonly timestamp_iso: string;
};

export function formatTimestamp(timestampIso: string): string {
  const d = new Date(timestampIso);
  if (isNaN(d.getTime())) return FALLBACK;
  const month = MONTHS[d.getMonth()] ?? FALLBACK;
  const day = d.getDate();
  const year = d.getFullYear();
  const currentYear = new Date().getFullYear();
  if (year === currentYear) {
    return `${month} ${String(day)}`;
  }
  return `${month} ${String(day)}, ${String(year)}`;
}

export function insertScore(
  entries: ReadonlyArray<{ score: number; timestamp_iso: string }>,
  score: number,
  timestampIso: string,
  maxLength: number,
): ReadonlyArray<{ score: number; timestamp_iso: string }> {
  const combined: { score: number; timestamp_iso: string }[] = [
    ...entries,
    { score, timestamp_iso: timestampIso },
  ];
  // Stable sort: Array.prototype.sort is stable in ES2019+ (V8, JSC, SpiderMonkey).
  combined.sort((a, b) => b.score - a.score);
  return combined.slice(0, Math.max(0, maxLength));
}

function entriesForMode(
  save: SaveV1 | null,
  mode: GameMode,
): ReadonlyArray<{ score: number; timestamp_iso: string }> {
  if (save === null) return [];
  return mode === "infinite" ? save.high_scores.infinite : save.high_scores.max_points;
}

export function openLeaderboard(parent: HTMLElement, options?: LeaderboardOptions): () => void {
  const save: SaveV1 | null = readSave();
  let currentMode: GameMode = options?.initialMode ?? "infinite";

  const overlay = document.createElement("div");
  overlay.className = "fixed inset-0 z-50 flex items-center justify-center bg-black/60";

  const modal = document.createElement("div");
  modal.className =
    "bg-yn-tile rounded-xl p-6 max-w-[480px] w-full m-4 max-h-[80vh] overflow-y-auto flex flex-col gap-4";

  const title = document.createElement("h2");
  title.className = "text-xl font-semibold text-yn-ink";
  title.textContent = "High Scores";

  const tabBar = document.createElement("div");
  tabBar.className = "flex gap-0";

  const baseTabClass =
    "flex-1 py-3 border-b-2 transition-colors text-sm font-medium bg-transparent cursor-pointer";

  const infiniteTab = document.createElement("button");
  infiniteTab.type = "button";
  infiniteTab.textContent = "Infinite";

  const maxPointsTab = document.createElement("button");
  maxPointsTab.type = "button";
  maxPointsTab.textContent = "Max-Points";

  tabBar.appendChild(infiniteTab);
  tabBar.appendChild(maxPointsTab);

  const listArea = document.createElement("div");
  listArea.className = "flex-1 min-h-[12rem]";

  const closeRow = document.createElement("div");
  closeRow.className = "flex justify-end";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "Close";
  closeBtn.className =
    "px-4 py-2 rounded-lg bg-yn-border text-yn-ink text-sm font-medium cursor-pointer";
  closeRow.appendChild(closeBtn);

  modal.appendChild(title);
  modal.appendChild(tabBar);
  modal.appendChild(listArea);
  modal.appendChild(closeRow);
  overlay.appendChild(modal);

  function renderEmpty(): void {
    const empty = document.createElement("div");
    empty.className = "text-center py-12 text-yn-muted text-sm";
    empty.textContent = "No scores yet. Play a game!";
    listArea.appendChild(empty);
  }

  function renderEntries(entries: ReadonlyArray<{ score: number; timestamp_iso: string }>): void {
    const list = document.createElement("ol");
    list.className = "flex flex-col divide-y divide-yn-border";
    const shown = entries.slice(0, MAX_ENTRIES);
    for (let i = 0; i < shown.length; i++) {
      const entry = shown[i];
      if (entry === undefined) continue;
      const row = document.createElement("li");
      row.className = "flex items-center justify-between py-3";

      const rank = document.createElement("span");
      rank.className = "text-yn-muted text-sm w-10";
      rank.textContent = `#${String(i + 1)}`;

      const score = document.createElement("span");
      score.className = "text-yn-ink text-lg tabular-nums flex-1 text-right pr-4";
      score.textContent = String(entry.score);

      const date = document.createElement("span");
      date.className = "text-yn-muted text-xs w-24 text-right";
      date.textContent = formatTimestamp(entry.timestamp_iso);

      row.appendChild(rank);
      row.appendChild(score);
      row.appendChild(date);
      list.appendChild(row);
    }
    listArea.appendChild(list);
  }

  function render(): void {
    infiniteTab.className =
      currentMode === "infinite"
        ? `${baseTabClass} border-yn-accent text-yn-ink`
        : `${baseTabClass} border-yn-border text-yn-muted`;
    maxPointsTab.className =
      currentMode === "max-points"
        ? `${baseTabClass} border-yn-accent text-yn-ink`
        : `${baseTabClass} border-yn-border text-yn-muted`;

    listArea.replaceChildren();
    const entries = entriesForMode(save, currentMode);
    if (entries.length === 0) {
      renderEmpty();
    } else {
      renderEntries(entries);
    }
  }

  function close(): void {
    document.removeEventListener("keydown", onKeyDown);
    overlay.remove();
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape") close();
  }

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  closeBtn.addEventListener("click", close);
  infiniteTab.addEventListener("click", () => {
    currentMode = "infinite";
    render();
  });
  maxPointsTab.addEventListener("click", () => {
    currentMode = "max-points";
    render();
  });
  document.addEventListener("keydown", onKeyDown);

  // Mount on the document body to escape any stacking context the game
  // container creates (the settings drawer also uses fixed + z-50 inside the
  // same container, which made the modal render but be unreachable for clicks
  // and accessibility queries). We use the parent's ownerDocument so the
  // overlay still belongs to the same DOM tree as the caller.
  (parent.ownerDocument?.body ?? document.body).appendChild(overlay);
  render();

  return close;
}
