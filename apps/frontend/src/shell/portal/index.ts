import type { GameManifestEntry } from "@/shared/contracts/game-manifest.js";
import type { Router } from "@/shell/router/index.js";
import { assetPaths } from "@/shared/asset-paths.js";

export type PortalOptions = {
  readonly router: Router;
  readonly games: readonly GameManifestEntry[];
};

export function mountPortal(container: HTMLElement, options: PortalOptions): () => void {
  container.replaceChildren();

  const root = document.createElement("main");
  root.setAttribute("role", "main");
  root.setAttribute("aria-label", "Yen-Neram games");
  // yn-portal owns the warm backdrop + staggered entrance (index.css).
  // min-h-full + top-aligned so content scrolls naturally on short viewports.
  root.className =
    "yn-portal min-h-full flex flex-col items-center justify-start gap-8 px-5 py-10 sm:py-14";

  root.appendChild(buildHeader());

  // Structural heading for the games region (kept off-screen; the wordmark is
  // the visible h1, this is the "what do I do here" h2).
  const srHeading = document.createElement("h2");
  srHeading.className = "sr-only";
  srHeading.textContent = "Pick a game to play";
  root.appendChild(srHeading);

  const shipped = options.games.filter((entry) => entry.status === "shipped");
  const placeholders = options.games.filter((entry) => entry.status !== "shipped");

  if (shipped.length > 0) {
    const heroes = document.createElement("div");
    heroes.className =
      "yn-portal__heroes flex flex-col sm:flex-row sm:flex-wrap justify-center gap-4 w-full max-w-3xl";
    for (const entry of shipped) {
      heroes.appendChild(buildHeroCard(entry, options.router));
    }
    root.appendChild(heroes);
  }

  if (placeholders.length > 0) {
    root.appendChild(buildComingSoonShelf(placeholders));
  }

  container.appendChild(root);

  return () => {
    container.replaceChildren();
  };
}

function buildHeader(): HTMLElement {
  const header = document.createElement("header");
  header.className = "yn-portal__header flex flex-col items-center gap-2 text-center";

  const title = document.createElement("h1");
  title.className = "yn-portal__wordmark";
  title.textContent = "Yen-Neram";
  header.appendChild(title);

  const subtitle = document.createElement("p");
  subtitle.className = "yn-portal__subtitle";
  subtitle.textContent = "Quick games. No sign-up. Just play.";
  header.appendChild(subtitle);

  return header;
}

function buildHeroCard(entry: GameManifestEntry, router: Router): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "yn-hero w-full sm:w-[22rem]";

  const badge = document.createElement("span");
  badge.className = "yn-hero__badge";
  badge.setAttribute("aria-hidden", "true");
  appendMaskedIcon(badge, entry.tile_silhouette, "yn-hero__icon");
  button.appendChild(badge);

  const text = document.createElement("span");
  text.className = "yn-hero__text";

  const label = document.createElement("span");
  label.className = "yn-hero__title";
  label.textContent = entry.title;
  text.appendChild(label);

  if (entry.tagline !== undefined && entry.tagline.length > 0) {
    const tagline = document.createElement("span");
    tagline.className = "yn-hero__tagline";
    tagline.textContent = entry.tagline;
    text.appendChild(tagline);
  }
  button.appendChild(text);

  const cue = document.createElement("span");
  cue.className = "yn-hero__cue";
  cue.setAttribute("aria-hidden", "true");
  const play = document.createElement("span");
  play.textContent = "Play";
  cue.appendChild(play);
  cue.appendChild(arrowIcon());
  button.appendChild(cue);

  button.addEventListener("click", () => {
    router.go({
      kind: "play",
      slug: entry.slug,
      queryParams: new URLSearchParams(),
    });
  });

  return button;
}

function buildComingSoonShelf(placeholders: readonly GameManifestEntry[]): HTMLElement {
  const section = document.createElement("section");
  section.className = "yn-portal__soon flex flex-col items-center gap-3 w-full max-w-3xl";
  section.setAttribute("aria-label", "Coming soon");

  const label = document.createElement("p");
  label.className = "yn-portal__soon-label";
  label.textContent = "More on the way";
  section.appendChild(label);

  const grid = document.createElement("div");
  grid.className = "grid w-full gap-3 grid-cols-3 sm:grid-cols-5";
  for (const entry of placeholders) {
    grid.appendChild(buildPlaceholderTile(entry));
  }
  section.appendChild(grid);

  return section;
}

function buildPlaceholderTile(entry: GameManifestEntry): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "yn-soon-tile";
  button.disabled = true;
  button.setAttribute("aria-disabled", "true");
  button.setAttribute("aria-label", "Coming soon");
  appendMaskedIcon(button, entry.tile_silhouette, "yn-soon-tile__icon");
  return button;
}

// Render a portal silhouette as a CSS mask so the warm chrome palette (not the
// baked-in SVG fill) paints it. One color source of truth; a new game's tile
// inherits the palette automatically. aria-hidden: the button label carries the
// accessible name, the glyph is decoration.
function appendMaskedIcon(
  parent: HTMLElement,
  silhouette: string | undefined,
  className: string,
): void {
  const icon = document.createElement("span");
  icon.className = className;
  icon.setAttribute("aria-hidden", "true");
  if (silhouette !== undefined && silhouette.length > 0) {
    icon.style.setProperty("--yn-mask", `url("${assetPaths.publicAsset(silhouette)}")`);
  }
  parent.appendChild(icon);
}

function arrowIcon(): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2.4");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", "M5 12h14M13 6l6 6-6 6");
  svg.appendChild(path);
  return svg;
}
