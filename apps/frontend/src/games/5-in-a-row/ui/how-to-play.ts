// "How to play" modal for 5-in-a-row. Centred dialog over a dimming backdrop.
// Stacks ABOVE the settings drawer (z-[60]) because it is typically opened
// from within the drawer; without the bump the drawer panel (z-50) would
// occlude the modal panel.

type Section = readonly [title: string, body: string];

const SECTIONS: readonly Section[] = [
  [
    "The board",
    "A 9 by 9 grid of cells. Tap a piece to select it, then tap an empty cell to move it there.",
  ],
  [
    "Lines clear",
    "Line up 5 or more pieces of the same kind (horizontal, vertical, or diagonal) and they clear.",
  ],
  [
    "After every move",
    "If your move did not clear a line, 3 new pieces appear from the preview shown at the top. Plan ahead by checking the preview.",
  ],
  ["Game over", "When the board fills up with no valid path for any piece, the game ends."],
];

export function openHowToPlay(parent: HTMLElement): () => void {
  const backdrop = document.createElement("div");
  backdrop.className = "fixed inset-0 bg-black/50 z-[60] flex items-center justify-center";

  const modal = document.createElement("div");
  modal.className =
    "bg-yn-tile rounded-xl p-6 max-w-[480px] max-h-[80vh] overflow-y-auto m-4 flex flex-col gap-4 border border-yn-border";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-label", "How to play");

  const title = document.createElement("h2");
  title.className = "text-xl font-semibold text-yn-ink";
  title.textContent = "How to play";
  modal.appendChild(title);

  for (const [heading, body] of SECTIONS) {
    const sec = document.createElement("section");
    sec.className = "flex flex-col gap-1";
    const h = document.createElement("h3");
    h.className = "text-sm font-semibold text-yn-ink";
    h.textContent = heading;
    const p = document.createElement("p");
    p.className = "text-sm text-yn-muted";
    p.textContent = body;
    sec.append(h, p);
    modal.appendChild(sec);
  }

  const gotIt = document.createElement("button");
  gotIt.type = "button";
  gotIt.className =
    "self-end px-4 py-2 rounded-lg bg-yn-accent text-white border border-yn-accent text-sm font-semibold";
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
