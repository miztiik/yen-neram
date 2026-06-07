import type { GameManifestEntry } from "@/shared/contracts/game-manifest.js";
import type { Router } from "@/shell/router/index.js";

export type PortalOptions = {
  readonly router: Router;
  readonly games: readonly GameManifestEntry[];
};

const TILE_BASE_CLASSES =
  "aspect-square rounded-xl border border-yn-border bg-yn-tile flex flex-col items-center justify-center gap-2 p-3 transition-transform active:scale-95";
const TILE_PLACEHOLDER_CLASSES = "opacity-40 cursor-not-allowed";
const TILE_SHIPPED_CLASSES = "hover:bg-slate-700 hover:border-yn-accent cursor-pointer";

export function mountPortal(container: HTMLElement, options: PortalOptions): () => void {
  container.replaceChildren();

  const root = document.createElement("div");
  // min-h-full + py-8 + justify-start so content scrolls naturally on short
  // viewports (landscape phone, dev preview). On taller viewports the content
  // hugs the top with breathing room.
  root.className = "min-h-full flex flex-col items-center justify-start py-8 px-4 gap-6";

  const title = document.createElement("h1");
  title.className = "text-3xl font-bold text-yn-ink";
  title.textContent = "Yen-Neram";
  root.appendChild(title);

  const subtitle = document.createElement("p");
  subtitle.className = "text-sm text-yn-muted";
  subtitle.textContent = "Tap a tile";
  root.appendChild(subtitle);

  const grid = document.createElement("div");
  grid.className = "grid gap-3 w-full max-w-[640px] grid-cols-2 sm:grid-cols-3";

  for (const entry of options.games) {
    grid.appendChild(buildTile(entry, options.router));
  }

  root.appendChild(grid);
  container.appendChild(root);

  return () => {
    container.replaceChildren();
  };
}

function buildTile(entry: GameManifestEntry, router: Router): HTMLButtonElement {
  const button = document.createElement("button");
  const isShipped = entry.status === "shipped";
  const stateClasses = isShipped ? TILE_SHIPPED_CLASSES : TILE_PLACEHOLDER_CLASSES;
  button.className = `${TILE_BASE_CLASSES} ${stateClasses}`;
  button.type = "button";

  if (entry.tile_silhouette !== undefined && entry.tile_silhouette.length > 0) {
    const img = document.createElement("img");
    img.className = "w-12 h-12";
    img.src = entry.tile_silhouette;
    img.alt = "";
    button.appendChild(img);
  } else {
    const spacer = document.createElement("div");
    spacer.className = "w-12 h-12";
    button.appendChild(spacer);
  }

  const label = document.createElement("span");
  label.className = isShipped
    ? "text-xs font-medium text-yn-ink"
    : "text-xs font-medium text-yn-muted";
  label.textContent = entry.title;
  button.appendChild(label);

  if (isShipped) {
    button.addEventListener("click", () => {
      router.go({
        kind: "play",
        slug: entry.slug,
        queryParams: new URLSearchParams(),
      });
    });
  } else {
    button.disabled = true;
  }

  return button;
}
