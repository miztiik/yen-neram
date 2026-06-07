// Mode-picker view for 5-in-a-row.
// Renders two tile-style buttons into a container, resolves with the
// chosen mode, and persists "last chosen mode" to localStorage so
// subsequent launches skip the picker.

import type { GameMode } from "../types.js";
import { MODE_CONTRACTS } from "../modes/index.js";

const LAST_MODE_KEY = "yn:game:5-in-a-row:last-mode";

function isGameMode(value: string | null): value is GameMode {
  return value === "infinite" || value === "max-points" || value === "timed";
}

export function getLastMode(): GameMode | null {
  try {
    const v = localStorage.getItem(LAST_MODE_KEY);
    return isGameMode(v) ? v : null;
  } catch {
    return null;
  }
}

export function setLastMode(mode: GameMode): void {
  try {
    localStorage.setItem(LAST_MODE_KEY, mode);
  } catch {
    // no-op: localStorage unavailable (private mode, SSR, quota exceeded)
  }
}

export function showModePicker(container: HTMLElement): Promise<GameMode> {
  return new Promise<GameMode>((resolve) => {
    container.replaceChildren();

    const root = document.createElement("div");
    root.className = "h-full flex flex-col items-center justify-center p-6 gap-4 bg-yn-bg";

    const title = document.createElement("h2");
    title.className = "text-2xl font-bold text-yn-ink";
    title.textContent = "Pick a mode";

    const grid = document.createElement("div");
    grid.className = "grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-[720px]";

    for (const contract of MODE_CONTRACTS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "aspect-square flex flex-col items-center justify-center gap-3 p-6 rounded-xl bg-yn-tile border-2 border-yn-border hover:border-yn-accent transition-colors";

      const label = document.createElement("span");
      label.className = "text-xl font-semibold text-yn-ink";
      label.textContent = contract.label;

      const desc = document.createElement("span");
      desc.className = "text-sm text-yn-muted text-center max-w-[240px]";
      desc.textContent = contract.description;

      btn.append(label, desc);
      btn.addEventListener("click", () => {
        setLastMode(contract.kind);
        resolve(contract.kind);
      });
      grid.appendChild(btn);
    }

    root.append(title, grid);
    container.appendChild(root);
  });
}
