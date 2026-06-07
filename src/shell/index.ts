import { createRouter, type Route } from "@/shell/router/index.js";
import { mountPortal } from "@/shell/portal/index.js";
import { GameManifestArraySchema } from "@/shared/schemas/game-manifest.schema.js";
import type { GameManifestEntry } from "@/shared/contracts/game-manifest.js";
import type { GameInstance, GameModule, MountOptions } from "@/shared/contracts/game-module.js";

// Vite scans this glob at build time and produces one code-split chunk per
// matching file. The shell never references game internals directly; it only
// dispatches by slug. Adding a new game = create src/games/<slug>/index.ts
// and append a row to the GameManifest; no shell edit required.
const gameLoaders = import.meta.glob<GameModule>("/src/games/*/index.ts");

export async function mountShell(container: HTMLElement): Promise<void> {
  const router = createRouter();
  const games = await fetchGames();
  let currentInstance: GameInstance | null = null;

  const render = async (route: Route): Promise<void> => {
    if (currentInstance !== null) {
      currentInstance.unmount();
      currentInstance = null;
    }
    container.replaceChildren();

    if (route.kind === "home") {
      mountPortal(container, { router, games });
      return;
    }

    if (route.kind === "play") {
      const entry = games.find((g) => g.slug === route.slug);
      if (entry === undefined || entry.status !== "shipped") {
        renderUnavailable(container, router, route.slug);
        return;
      }
      const loaderKey = `/src/games/${route.slug}/index.ts`;
      const loader = gameLoaders[loaderKey];
      if (loader === undefined) {
        renderUnavailable(container, router, route.slug);
        return;
      }
      try {
        const mod = await loader();
        const mode = route.queryParams.get("mode");
        const theme = route.queryParams.get("theme");
        const mountOptions: MountOptions = {
          queryParams: route.queryParams,
          ...(mode !== null ? { mode } : {}),
          ...(theme !== null ? { theme } : {}),
        };
        currentInstance = await mod.default(container, mountOptions);
      } catch {
        renderUnavailable(container, router, route.slug);
      }
      return;
    }

    renderNotFound(container, router, route.path);
  };

  router.subscribe((route) => {
    void render(route);
  });
  router.start();
  await render(router.current());
}

async function fetchGames(): Promise<GameManifestEntry[]> {
  try {
    const response = await fetch("/games.json");
    if (!response.ok) {
      return [];
    }
    const data: unknown = await response.json();
    const parsed = GameManifestArraySchema.safeParse(data);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function renderUnavailable(
  container: HTMLElement,
  router: ReturnType<typeof createRouter>,
  slug: string,
): void {
  container.replaceChildren();
  const wrap = document.createElement("div");
  wrap.className = "h-full flex flex-col items-center justify-center p-6 gap-4 text-center";

  const msg = document.createElement("p");
  msg.className = "text-yn-muted";
  msg.textContent = `Game "${slug}" is not available.`;
  wrap.appendChild(msg);

  const home = document.createElement("button");
  home.type = "button";
  home.className =
    "px-4 py-2 rounded-lg border border-yn-border bg-yn-tile text-yn-ink hover:bg-slate-700 hover:border-yn-accent";
  home.textContent = "Back to home";
  home.addEventListener("click", () => {
    router.go({ kind: "home" });
  });
  wrap.appendChild(home);

  container.appendChild(wrap);
}

function renderNotFound(
  container: HTMLElement,
  router: ReturnType<typeof createRouter>,
  path: string,
): void {
  container.replaceChildren();
  const wrap = document.createElement("div");
  wrap.className = "h-full flex flex-col items-center justify-center p-6 gap-4 text-center";

  const title = document.createElement("h2");
  title.className = "text-xl font-semibold text-yn-ink";
  title.textContent = "Page not found";
  wrap.appendChild(title);

  const detail = document.createElement("p");
  detail.className = "text-sm text-yn-muted";
  detail.textContent = path;
  wrap.appendChild(detail);

  const home = document.createElement("button");
  home.type = "button";
  home.className =
    "px-4 py-2 rounded-lg border border-yn-border bg-yn-tile text-yn-ink hover:bg-slate-700 hover:border-yn-accent";
  home.textContent = "Back to home";
  home.addEventListener("click", () => {
    router.go({ kind: "home" });
  });
  wrap.appendChild(home);

  container.appendChild(wrap);
}
