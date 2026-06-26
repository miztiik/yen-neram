// Game-over modal for 5-in-a-row.
// Floating card over the dimmed-but-visible board. Shows final score with an
// optional "New best!" pip, a mode-specific context line (max-points seed /
// timed time + bonuses / infinite blank), an inline top-3 preview of the
// current mode's high scores (re-using formatTimestamp from leaderboard.ts),
// an optional daily-streak pip, and "Play again" / "Home" buttons.
//
// Mounted on document.body to escape any stacking context the game container
// creates (same lesson as leaderboard.ts).

import type { GameMode } from "../types.js";
import { formatTimestamp } from "./leaderboard.js";

export type TopThreeRow = {
  readonly score: number;
  readonly timestamp_iso: string;
  readonly isThisGame: boolean;
};

export type ModeMeta =
  | { readonly kind: "max-points"; readonly seedDate: string }
  | { readonly kind: "timed"; readonly msWindow: number; readonly bonusesEarnedMs: number }
  | { readonly kind: "infinite" };

export type GameOverContext = {
  readonly mode: GameMode;
  readonly score: number;
  readonly isNewPersonalBest: boolean;
  readonly topThree: ReadonlyArray<TopThreeRow>;
  readonly modeMeta: ModeMeta;
  readonly streak: { readonly current: number; readonly longest: number } | null;
};

export type GameOverActions = {
  readonly onPlayAgain: () => void | Promise<void>;
  readonly onBackToHome: () => void;
  readonly onShowFullLeaderboard: () => void;
};

// Pure helper (exported for unit tests). Returns true iff `score` is strictly
// greater than every entry in `otherScores`. An empty list returns true (the
// player's first recorded score is vacuously a new personal best). Ties are
// NOT a new best, mirroring the stable-sort behaviour of insertScore where a
// newly-recorded equal score lands BELOW the existing equal entry.
export function computeIsNewBest(
  score: number,
  otherScores: ReadonlyArray<{ readonly score: number }>,
): boolean {
  for (const e of otherScores) {
    if (e.score >= score) return false;
  }
  return true;
}

function secondsLabel(ms: number): string {
  return String(Math.round(ms / 1000));
}

function modeContextLine(meta: ModeMeta): string | null {
  if (meta.kind === "max-points") return `Today's seed: ${meta.seedDate}`;
  if (meta.kind === "timed") {
    return `Time used: ${secondsLabel(meta.msWindow)}s + ${secondsLabel(meta.bonusesEarnedMs)}s bonus`;
  }
  return null;
}

// Palm pass 2026-06-08. Frame the run's outcome as progress, not failure.
// Returns the title + subtitle pair for the modal heading area. Three
// branches:
//   (a) new personal best (rare moment) -- the celebration copy.
//   (b) not new best, has a stored top score -- "X points to your best."
//   (c) not new best, NO stored top score (first ever run scored 0 or
//       only ever scored 0 before) -- skip the subtitle, the empty
//       leaderboard already communicates "no record yet".
// Helper is pure + exported for unit tests; the modal does the DOM glue.
export function buildHeaderCopy(context: GameOverContext): {
  readonly title: string;
  readonly subtitle: string | null;
} {
  if (context.isNewPersonalBest) {
    // Previous top-1 is topThree[1] AFTER recording (this game inserted
    // at position 0). If there was no previous score, this is the
    // player's first recorded run -- celebrate without a delta.
    const prevBest = context.topThree[1];
    if (prevBest === undefined) {
      return { title: "New best!", subtitle: "Your first run on the board." };
    }
    const delta = context.score - prevBest.score;
    if (delta <= 0) {
      // Defensive: isNewPersonalBest implies score > all others, so
      // delta should be > 0. Fall back to a clean celebration line.
      return { title: "New best!", subtitle: "Top of the board." };
    }
    return { title: "New best!", subtitle: `+${String(delta)} over your last.` };
  }
  const top1 = context.topThree[0];
  if (top1 === undefined) {
    // No leaderboard yet AND not a new best (e.g. scored 0 on the first
    // ever run). Just acknowledge the run with no comparison line.
    return { title: "Nice run.", subtitle: null };
  }
  const deficit = top1.score - context.score;
  if (deficit <= 0) {
    // Tied your best (recorded equally but not strictly greater).
    return { title: "Nice run.", subtitle: "Tied your best." };
  }
  return {
    title: "Nice run.",
    subtitle: `${String(deficit)} points to your best.`,
  };
}

export function openGameOverModal(
  parent: HTMLElement,
  context: GameOverContext,
  actions: GameOverActions,
): () => void {
  const overlay = document.createElement("div");
  overlay.className = "fixed inset-0 z-50 flex items-center justify-center bg-black/60";

  const card = document.createElement("div");
  card.className =
    "bg-yn-tile rounded-xl p-6 max-w-[480px] w-full m-4 max-h-[80vh] overflow-y-auto flex flex-col gap-4";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-label", "Game over");

  const { title: titleText, subtitle: subtitleText } = buildHeaderCopy(context);

  const title = document.createElement("h2");
  title.className = "text-2xl font-semibold text-yn-ink";
  title.textContent = titleText;
  card.appendChild(title);

  if (subtitleText !== null) {
    const subtitle = document.createElement("p");
    subtitle.className = "text-sm text-yn-muted -mt-2";
    subtitle.textContent = subtitleText;
    card.appendChild(subtitle);
  }

  // Final score row. Always scales-in on mount (`.yn-game-over-score`).
  // On a NEW BEST the row also carries the burst container + 6 dots
  // that radiate behind the score and fade out over 900ms. Both
  // animations defang under prefers-reduced-motion (see board-view.css
  // game-over ceremony block).
  const scoreRow = document.createElement("div");
  scoreRow.className = context.isNewPersonalBest
    ? "yn-game-over-burst flex items-baseline gap-3"
    : "flex items-baseline gap-3";
  if (context.isNewPersonalBest) {
    // Six absolute-positioned colour dots, 60deg-staggered around the
    // score number. Per Palm's prescription: cream / coral / sage from
    // the warm-vibrant palette family + one accent + one amber +
    // another coral. Dots inherit colour via :nth-child rules in CSS.
    for (let i = 0; i < 6; i++) {
      const dot = document.createElement("span");
      dot.className = "yn-game-over-burst-dot";
      dot.style.setProperty("--yn-burst-angle", `${String(i * 60)}deg`);
      dot.setAttribute("aria-hidden", "true");
      scoreRow.appendChild(dot);
    }
  }
  const scoreEl = document.createElement("span");
  scoreEl.className =
    "yn-game-over-score text-5xl font-semibold text-yn-ink tabular-nums tracking-tight";
  scoreEl.textContent = String(context.score);
  scoreRow.appendChild(scoreEl);
  card.appendChild(scoreRow);

  const contextLine = modeContextLine(context.modeMeta);
  if (contextLine !== null) {
    const ctxEl = document.createElement("p");
    ctxEl.className = "text-xs text-yn-muted";
    ctxEl.textContent = contextLine;
    card.appendChild(ctxEl);
  }

  // Inline top-3 preview. Always renders 3 rows; missing entries pad with "-".
  // The row matching the just-recorded score+timestamp is highlighted via the
  // isThisGame flag set by the caller (no equality check duplicated here).
  const section = document.createElement("section");
  section.className = "flex flex-col gap-2 mt-2";
  const heading = document.createElement("h3");
  heading.className = "text-xs uppercase tracking-wider text-yn-muted";
  heading.textContent = `Top 3 (${context.mode})`;
  section.appendChild(heading);

  const list = document.createElement("ol");
  list.className = "flex flex-col divide-y divide-yn-border";
  for (let i = 0; i < 3; i++) {
    const row = document.createElement("li");
    const entry = context.topThree[i];
    const isThisGame = entry?.isThisGame === true;
    row.className = isThisGame
      ? "flex items-center justify-between py-2 px-2 rounded border border-yn-accent bg-orange-200"
      : "flex items-center justify-between py-2 px-2";

    const rank = document.createElement("span");
    rank.className = "text-yn-muted text-sm w-10";
    rank.textContent = `#${String(i + 1)}`;

    const sc = document.createElement("span");
    sc.className = "text-yn-ink text-base tabular-nums flex-1 text-right pr-4";
    sc.textContent = entry === undefined ? "-" : String(entry.score);

    const dt = document.createElement("span");
    dt.className = "text-yn-muted text-xs w-24 text-right";
    dt.textContent = entry === undefined ? "-" : formatTimestamp(entry.timestamp_iso);

    row.append(rank, sc, dt);
    list.appendChild(row);
  }
  section.appendChild(list);

  const viewAllBtn = document.createElement("button");
  viewAllBtn.type = "button";
  viewAllBtn.className =
    "self-end text-xs text-yn-accent underline underline-offset-2 cursor-pointer bg-transparent";
  viewAllBtn.textContent = "View all";
  section.appendChild(viewAllBtn);

  card.appendChild(section);

  if (context.streak !== null) {
    const streakEl = document.createElement("p");
    streakEl.className = "text-xs text-yn-muted";
    streakEl.textContent = `${String(context.streak.current)}-day streak (best: ${String(context.streak.longest)})`;
    card.appendChild(streakEl);
  }

  const buttons = document.createElement("div");
  buttons.className = "flex gap-2 w-full mt-2";
  const playAgainBtn = document.createElement("button");
  playAgainBtn.type = "button";
  playAgainBtn.className =
    "flex-1 px-4 py-2 rounded-lg bg-yn-accent text-white font-semibold text-sm";
  playAgainBtn.textContent = "Play again";
  const homeBtn = document.createElement("button");
  homeBtn.type = "button";
  homeBtn.className =
    "flex-1 px-4 py-2 rounded-lg bg-yn-tile text-yn-ink border border-yn-border text-sm";
  homeBtn.textContent = "Home";
  buttons.append(playAgainBtn, homeBtn);
  card.appendChild(buttons);

  overlay.appendChild(card);

  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKeyDown);
    overlay.remove();
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      actions.onBackToHome();
    }
  }

  // Backdrop click (outside the card) returns to home rather than leaving the
  // player on a defunct board.
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      close();
      actions.onBackToHome();
    }
  });

  // Stop clicks inside the card from bubbling to the overlay handler so
  // tapping a button does not also fire the backdrop dismiss.
  card.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  playAgainBtn.addEventListener("click", () => {
    close();
    void actions.onPlayAgain();
  });
  homeBtn.addEventListener("click", () => {
    close();
    actions.onBackToHome();
  });
  viewAllBtn.addEventListener("click", () => {
    close();
    actions.onShowFullLeaderboard();
  });

  document.addEventListener("keydown", onKeyDown);
  (parent.ownerDocument?.body ?? document.body).appendChild(overlay);
  playAgainBtn.focus();

  return close;
}
