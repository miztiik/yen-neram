import type { GameMount, GameInstance } from "@/shared/contracts/game-module.js";

const mount: GameMount = async (container, _options) => {
  container.innerHTML = "";
  const wrapper = document.createElement("div");
  wrapper.className = "h-full flex flex-col items-center justify-center gap-4 p-6 text-center";
  const title = document.createElement("h2");
  title.className = "text-2xl font-bold text-yn-ink";
  title.textContent = "5-in-a-Row";
  const note = document.createElement("p");
  note.className = "text-sm text-yn-muted max-w-[420px]";
  note.textContent =
    "Game UI ships in PR 5. The shell, routing, and portal work; the playable board is the next PR.";
  const homeBtn = document.createElement("button");
  homeBtn.className =
    "mt-4 px-4 py-2 rounded-lg border border-yn-border bg-yn-tile text-yn-ink hover:border-yn-accent transition-colors";
  homeBtn.textContent = "Back to home";
  homeBtn.addEventListener("click", () => {
    history.back();
  });
  wrapper.appendChild(title);
  wrapper.appendChild(note);
  wrapper.appendChild(homeBtn);
  container.appendChild(wrapper);

  const instance: GameInstance = {
    unmount() {
      container.innerHTML = "";
    },
  };
  return instance;
};

export default mount;
