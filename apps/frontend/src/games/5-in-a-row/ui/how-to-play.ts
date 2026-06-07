// "How to play" modal for 5-in-a-row. Centred dialog over a dimming backdrop.
// Stacks ABOVE the settings drawer (z-[60]) because it is typically opened
// from within the drawer; without the bump the drawer panel (z-50) would
// occlude the modal panel.

type Section = readonly [heading: string, paragraphs: readonly string[]];

const SECTIONS: readonly Section[] = [
  [
    "The board",
    [
      "A 9 by 9 grid of cells. Each cell is empty or holds a piece.",
      "Pieces come in 6 colours. Match 5 or more of the same colour in a line to clear them and score.",
    ],
  ],
  [
    "Your move",
    [
      "Tap a piece to pick it up (it lifts and glows pink).",
      "Tap an empty cell to drop it there. The piece slides along the shortest path through other empty cells. If there is no path, the cell shakes.",
    ],
  ],
  [
    "Lines that clear",
    [
      "Pieces clear when 5 or more of the same colour sit in a row - horizontally, vertically, or diagonally.",
      "Bigger lines score more: 5 = base, 6 = 1.5x, 7 = 2x, 8 = 3x, 9 = 5x. Crossing 2 lines at once adds a 1.5x bonus. A clear that triggers more clears chains: +2x per chained step.",
    ],
  ],
  [
    "After every move",
    [
      "If your move did not clear a line, 3 new pieces appear. The 3 pieces shown in the top right are the ones about to spawn - plan around them.",
      "If your move did clear, no new pieces spawn this turn.",
    ],
  ],
  [
    "Game over",
    [
      "Infinite: the game ends when the board fills with no valid move.",
      "Max Points: same as Infinite, but everyone gets the same daily-seed board today; come back tomorrow for a new one.",
      "Timed: you have 60 seconds. Each clear adds time (+5s for a 5-line, +10s for 6, +15s for 7+). The clock running out ends the game.",
    ],
  ],
  [
    "Tips",
    [
      "Long-press an empty cell while a piece is selected to preview the path before committing.",
      "You get one undo per game. Use it after a bad pick, not after seeing the next spawn.",
      "Switch theme in the pause menu - your piece colour codes stay the same; only the artwork changes.",
    ],
  ],
];

export function openHowToPlay(parent: HTMLElement): () => void {
  const backdrop = document.createElement("div");
  backdrop.className = "fixed inset-0 bg-black/50 z-[60] flex items-center justify-center";

  const modal = document.createElement("div");
  modal.className =
    "bg-yn-tile rounded-xl p-6 max-w-[480px] max-h-[80vh] overflow-y-auto m-4 flex flex-col gap-4";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-label", "How to play");

  const title = document.createElement("h2");
  title.className = "text-xl font-semibold text-yn-ink";
  title.textContent = "How to play";
  modal.appendChild(title);

  for (const [heading, paragraphs] of SECTIONS) {
    const sec = document.createElement("section");
    sec.className = "flex flex-col gap-1";
    const h = document.createElement("h3");
    h.className = "text-sm font-semibold text-yn-ink uppercase tracking-wider mt-2";
    h.textContent = heading;
    sec.appendChild(h);
    for (const body of paragraphs) {
      const p = document.createElement("p");
      p.className = "text-sm text-yn-muted leading-relaxed";
      p.textContent = body;
      sec.appendChild(p);
    }
    modal.appendChild(sec);
  }

  const gotIt = document.createElement("button");
  gotIt.type = "button";
  gotIt.className =
    "mt-4 self-end px-4 py-2 rounded-lg bg-yn-accent text-yn-bg font-semibold border border-yn-accent";
  gotIt.textContent = "Got it";
  modal.appendChild(gotIt);

  // Clicks inside the modal panel must not bubble up and trigger the
  // backdrop's close handler.
  modal.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey);
    backdrop.remove();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };
  backdrop.addEventListener("click", () => close());
  gotIt.addEventListener("click", () => close());
  document.addEventListener("keydown", onKey);

  backdrop.appendChild(modal);
  parent.appendChild(backdrop);
  gotIt.focus();
  return close;
}
