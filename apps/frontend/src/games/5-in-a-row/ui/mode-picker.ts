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

    // Root sizing: h-full so the picker owns the game-container area, and
    // overflow-y-auto so worst-case the player can scroll. On mobile the
    // three tiles + heading must FIT one screen on a mid-tier Android
    // (393x681 effective viewport on Pixel 5); see the mode-picker
    // single-screen e2e in full-flow.spec.ts.
    const root = document.createElement("div");
    root.className =
      "h-full flex flex-col items-center justify-center gap-3 sm:gap-4 px-4 py-4 sm:p-6 bg-yn-bg overflow-y-auto";

    const title = document.createElement("h2");
    title.className = "text-xl sm:text-2xl font-bold text-yn-ink";
    title.textContent = "Pick a mode";

    // Mobile (<sm): single column of short horizontal banner tiles so the
    // three tiles + heading FIT a 393x681 mid-tier Android viewport with
    // no scroll (3 x ~96px tile + 2 x 12px gap + heading + page padding
    // = ~440px well under 681). Tablet/desktop (sm+): three aspect-square
    // tiles in a row, which is the existing premium-feel grid layout.
    const grid = document.createElement("div");
    grid.className = "grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 w-full max-w-[720px]";

    for (const contract of MODE_CONTRACTS) {
      const btn = document.createElement("button");
      btn.type = "button";
      // Mobile: horizontal banner (auto-height, ~96px from py-5 + content).
      // sm+: aspect-square premium tile that fills the column.
      btn.className =
        "flex flex-col items-center justify-center gap-1.5 sm:gap-3 px-4 py-5 sm:p-6 " +
        "rounded-xl bg-yn-tile border-2 border-yn-border hover:border-yn-accent transition-colors " +
        "sm:aspect-square";

      const label = document.createElement("span");
      label.className = "text-lg sm:text-xl font-semibold text-yn-ink";
      label.textContent = contract.label;

      const desc = document.createElement("span");
      desc.className = "text-xs sm:text-sm text-yn-muted text-center max-w-[260px]";
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
