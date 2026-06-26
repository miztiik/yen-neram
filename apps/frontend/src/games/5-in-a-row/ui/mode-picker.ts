// Mode-picker view for 5-in-a-row.
// Renders the mode tiles into a container and resolves with the chosen mode.
//
// Launch policy (ADR-0023): the picker is shown on EVERY fresh launch of the
// game (portal tile, deep link, or Menu -> Switch mode) so the three modes
// are always offered. The ONLY launches that skip it are (a) resuming an
// in-progress run and (b) a "play the same mode again" reload (Play Again /
// Restart / Reset), which set a one-shot replay flag just before reloading.

import type { GameMode } from "../types.js";
import { MODE_CONTRACTS } from "../modes/index.js";
import { assetPaths } from "@/shared/asset-paths.js";

// One-shot "replay this mode" signal. Set immediately before a same-mode
// reload so the relaunch skips the picker and restarts the same mode; read
// AND cleared on the next mount. sessionStorage (not localStorage): the
// intent is scoped to this tab session and must NOT survive a real app
// relaunch -- a genuine relaunch should show the picker.
const REPLAY_MODE_KEY = "yn:game:5-in-a-row:replay-mode";

function isGameMode(value: string | null): value is GameMode {
  return value === "infinite" || value === "max-points" || value === "timed";
}

export function setReplayMode(mode: GameMode): void {
  try {
    sessionStorage.setItem(REPLAY_MODE_KEY, mode);
  } catch {
    // no-op: sessionStorage unavailable (private mode, SSR, quota exceeded)
  }
}

// Read AND clear the one-shot replay flag. Returns the mode to replay, or
// null when this launch should show the picker.
export function consumeReplayMode(): GameMode | null {
  try {
    const v = sessionStorage.getItem(REPLAY_MODE_KEY);
    if (v !== null) sessionStorage.removeItem(REPLAY_MODE_KEY);
    return isGameMode(v) ? v : null;
  } catch {
    return null;
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
        resolve(contract.kind);
      });
      grid.appendChild(btn);
    }

    // Back-to-home exit (ADR-0023): the picker can appear on a fresh launch
    // or via Menu -> Switch mode, so the player needs a way out WITHOUT
    // committing to a mode -- especially in standalone PWA mode, where there
    // is no browser back button. Uses history.back() when there is a portal
    // entry to return to, else navigates to the SPA home (assetPaths.portal()
    // NOT literal "/", per ADR-0020).
    const backLink = document.createElement("button");
    backLink.type = "button";
    backLink.className =
      "mt-1 text-sm text-yn-muted underline underline-offset-2 hover:text-yn-ink";
    backLink.textContent = "Back to home";
    backLink.setAttribute("aria-label", "Back to home");
    backLink.addEventListener("click", () => {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.assign(assetPaths.portal());
      }
    });

    root.append(title, grid, backLink);
    container.appendChild(root);
  });
}
