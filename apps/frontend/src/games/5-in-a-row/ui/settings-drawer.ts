// Settings drawer for 5-in-a-row. Slides in from the right edge over a
// dimming backdrop. The drawer is purely view + DOM events; all behaviour
// (theme swap, preference persistence, save mutations, reload) is routed
// through the `SettingsActions` callbacks the game mount supplies.
//
// Co-located helpers (kept here to keep `index.ts` lean per the PR brief):
//   - AppPrefsSchema + read/write/update for the `yn:app` blob.
//   - discoverAvailableThemes() that probes the known theme manifests.

import { z } from "zod";

import { SAVE_KEY_APP, readJson, writeJson } from "@/shared/save/index.js";
import { ThemeManifestSchema } from "@/shared/schemas/theme-manifest.schema.js";
import { assetPaths } from "@/shared/asset-paths.js";

// ---- Public types ----------------------------------------------------------

export type SettingsState = {
  themeId: string;
  reduceMotion: boolean;
  pathPreviewEnabled: boolean;
  showNextPreview: boolean;
  previewBounceEnabled: boolean;
};

export type SettingsActions = {
  readonly onThemeChange: (themeId: string) => Promise<void> | void;
  readonly onReduceMotionChange: (enabled: boolean) => void;
  readonly onPathPreviewChange: (enabled: boolean) => void;
  readonly onShowNextPreviewChange: (enabled: boolean) => void;
  readonly onPreviewBounceChange: (enabled: boolean) => void;
  readonly onResetGame: () => Promise<void> | void;
  readonly onClearHighScores: () => Promise<void> | void;
  readonly onModeSwitch: () => Promise<void> | void;
  readonly onShowHowToPlay: () => void;
  readonly onShowLeaderboard: () => void;
  // Fired when the drawer closes for any reason (X button, Escape,
  // backdrop click, or programmatic close). Lets the caller resume
  // anything it paused for the duration of the drawer (e.g., the
  // timed-mode countdown). Optional so existing callers don't break.
  readonly onClose?: () => void;
};

export type AvailableTheme = {
  readonly id: string;
  readonly displayName: string;
};

// ---- App preferences (yn:app) ---------------------------------------------
//
// Inline schema co-located with its only readers/writers. Additive bumps:
// missing fields fall back to the default applied at the call site.

export const AppPrefsSchema = z
  .object({
    schema_version: z.literal(1),
    selected_theme: z.string().min(1).optional(),
    reduce_motion: z.boolean().optional(),
    path_preview_enabled: z.boolean().optional(),
    show_next_preview: z.boolean().optional(),
    // Subtle scale 1.00 -> 1.06 -> 1.00 breathing on preview motifs.
    // Default on at the call site; persists when the player toggles it off.
    preview_bounce_enabled: z.boolean().optional(),
    last_mode: z.enum(["infinite", "max-points", "timed"]).nullable().optional(),
  })
  .strict();

export type AppPrefs = z.infer<typeof AppPrefsSchema>;

export function readAppPrefs(): AppPrefs {
  const v = readJson(SAVE_KEY_APP, AppPrefsSchema);
  return v ?? { schema_version: 1 };
}

export function writeAppPrefs(prefs: AppPrefs): void {
  writeJson(SAVE_KEY_APP, AppPrefsSchema.parse(prefs));
}

export function updateAppPref(patch: Partial<Omit<AppPrefs, "schema_version">>): void {
  const cur = readAppPrefs();
  writeAppPrefs({ ...cur, ...patch, schema_version: 1 });
}

// ---- Theme discovery -------------------------------------------------------
//
// V1: hard-coded roster + tolerant fetch. A future PR can replace this with
// a build-time-emitted `/assets/themes/index.json` (a discovery manifest at
// the same URL root the motifs sit at) without touching callers.

const KNOWN_THEME_IDS: readonly string[] = ["origami", "tropical-fruits"];

export async function discoverAvailableThemes(): Promise<AvailableTheme[]> {
  const results = await Promise.all(
    KNOWN_THEME_IDS.map(async (id): Promise<AvailableTheme | null> => {
      try {
        const r = await fetch(assetPaths.themeManifest(id));
        if (!r.ok) return null;
        const raw: unknown = await r.json();
        const parsed = ThemeManifestSchema.safeParse(raw);
        if (!parsed.success) return null;
        return { id: parsed.data.id, displayName: parsed.data.display_name };
      } catch {
        return null;
      }
    }),
  );
  return results.filter((t): t is AvailableTheme => t !== null);
}

// ---- DOM helpers -----------------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function makeSection(title: string): HTMLElement {
  const wrap = el("section", "flex flex-col gap-2");
  wrap.appendChild(el("h3", "text-xs uppercase tracking-wider text-yn-muted", title));
  return wrap;
}

function makeToggle(
  label: string,
  initial: boolean,
  onChange: (v: boolean) => void,
): HTMLDivElement {
  const row = el("div", "flex items-center justify-between gap-3");
  row.appendChild(el("span", "text-sm text-yn-ink", label));
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("role", "switch");
  let on = initial;
  const apply = (): void => {
    btn.setAttribute("aria-checked", on ? "true" : "false");
    btn.className = on
      ? "px-3 py-1 rounded-full text-xs font-semibold bg-yn-accent text-white border border-yn-accent"
      : "px-3 py-1 rounded-full text-xs font-semibold bg-yn-tile text-yn-muted border border-yn-border";
    btn.textContent = on ? "On" : "Off";
  };
  apply();
  btn.addEventListener("click", () => {
    on = !on;
    apply();
    onChange(on);
  });
  row.appendChild(btn);
  return row;
}

function makeDestructiveButton(
  label: string,
  confirmLabel: string,
  onConfirm: () => Promise<void> | void,
): HTMLElement {
  const wrap = el("div", "flex flex-col gap-2");
  const button = document.createElement("button");
  button.type = "button";
  button.className =
    "px-4 py-2 rounded-lg bg-yn-tile text-yn-accent border border-yn-border hover:bg-orange-200 text-sm self-start";
  button.textContent = label;
  let confirmRow: HTMLElement | null = null;
  button.addEventListener("click", () => {
    if (confirmRow !== null) return;
    const row = el("div", "flex items-center gap-2");
    row.appendChild(el("span", "text-xs text-yn-muted", "Are you sure?"));
    const yes = document.createElement("button");
    yes.type = "button";
    yes.className =
      "px-3 py-1 rounded-lg bg-yn-accent text-white border border-yn-accent text-xs font-semibold";
    yes.textContent = confirmLabel;
    yes.addEventListener("click", () => {
      void onConfirm();
    });
    const no = document.createElement("button");
    no.type = "button";
    no.className = "px-3 py-1 rounded-lg bg-yn-tile text-yn-muted border border-yn-border text-xs";
    no.textContent = "Cancel";
    no.addEventListener("click", () => {
      row.remove();
      confirmRow = null;
    });
    row.append(yes, no);
    wrap.appendChild(row);
    confirmRow = row;
  });
  wrap.appendChild(button);
  return wrap;
}

// ---- openSettingsDrawer ----------------------------------------------------

export function openSettingsDrawer(
  parent: HTMLElement,
  state: SettingsState,
  availableThemes: readonly AvailableTheme[],
  actions: SettingsActions,
): () => void {
  const backdrop = el("div", "fixed inset-0 bg-black/50 z-40");
  const drawer = el(
    "aside",
    "fixed top-0 right-0 h-full w-80 max-w-[80vw] bg-yn-tile border-l border-yn-border shadow-xl overflow-y-auto p-6 flex flex-col gap-6 z-50",
  );
  drawer.setAttribute("role", "dialog");
  drawer.setAttribute("aria-label", "Settings");

  // Header
  const header = el("div", "flex items-center justify-between");
  header.appendChild(el("h2", "text-lg font-semibold text-yn-ink", "Settings"));
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className =
    "px-3 py-1 rounded-lg bg-yn-tile text-yn-ink border border-yn-border hover:bg-orange-200 text-sm";
  closeBtn.textContent = "Close";
  header.appendChild(closeBtn);

  // Theme picker
  const themeSection = makeSection("Theme");
  const themeGrid = el("div", "grid grid-cols-3 gap-2");
  let selectedThemeId = state.themeId;
  const swatchButtons: HTMLButtonElement[] = [];
  const styleSwatch = (btn: HTMLButtonElement, isSelected: boolean): void => {
    btn.className = isSelected
      ? "flex flex-col items-center gap-1 p-2 rounded-lg border-2 border-yn-accent ring-2 ring-yn-accent bg-yn-bg text-yn-ink"
      : "flex flex-col items-center gap-1 p-2 rounded-lg border border-yn-border bg-yn-bg text-yn-muted hover:border-yn-accent";
  };
  for (const t of availableThemes) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset["themeId"] = t.id;
    btn.appendChild(el("span", "w-8 h-8 rounded-full bg-yn-accent"));
    btn.appendChild(el("span", "text-xs", t.displayName));
    styleSwatch(btn, t.id === selectedThemeId);
    btn.addEventListener("click", () => {
      const previous = selectedThemeId;
      selectedThemeId = t.id;
      for (const b of swatchButtons) styleSwatch(b, b.dataset["themeId"] === selectedThemeId);
      void Promise.resolve(actions.onThemeChange(t.id)).catch(() => {
        selectedThemeId = previous;
        for (const b of swatchButtons) styleSwatch(b, b.dataset["themeId"] === selectedThemeId);
      });
    });
    swatchButtons.push(btn);
    themeGrid.appendChild(btn);
  }
  if (availableThemes.length === 0) {
    themeGrid.appendChild(el("span", "text-xs text-yn-muted", "No themes available."));
  }
  themeSection.appendChild(themeGrid);

  // Display toggles
  const displaySection = makeSection("Display");
  displaySection.append(
    makeToggle("Reduce motion", state.reduceMotion, (v) => actions.onReduceMotionChange(v)),
    makeToggle("Path preview", state.pathPreviewEnabled, (v) => actions.onPathPreviewChange(v)),
    makeToggle("Show next 3 preview", state.showNextPreview, (v) =>
      actions.onShowNextPreviewChange(v),
    ),
    makeToggle("Preview bounce", state.previewBounceEnabled, (v) =>
      actions.onPreviewBounceChange(v),
    ),
  );

  // Mode + Help
  const modeSection = makeSection("Mode");
  const modeBtn = document.createElement("button");
  modeBtn.type = "button";
  modeBtn.className =
    "px-4 py-2 rounded-lg bg-yn-tile text-yn-ink border border-yn-border hover:bg-orange-200 text-sm self-start";
  modeBtn.textContent = "Switch mode";
  modeBtn.addEventListener("click", () => {
    void actions.onModeSwitch();
  });
  modeSection.appendChild(modeBtn);

  const helpSection = makeSection("Help");
  const helpBtn = document.createElement("button");
  helpBtn.type = "button";
  helpBtn.className =
    "px-4 py-2 rounded-lg bg-yn-tile text-yn-ink border border-yn-border hover:bg-orange-200 text-sm self-start";
  helpBtn.textContent = "How to play";
  helpBtn.addEventListener("click", () => {
    actions.onShowHowToPlay();
  });
  helpSection.appendChild(helpBtn);

  const scoresSection = makeSection("Scores");
  const scoresBtn = document.createElement("button");
  scoresBtn.type = "button";
  scoresBtn.className =
    "px-4 py-2 rounded-lg bg-yn-tile text-yn-ink border border-yn-border hover:bg-orange-200 text-sm self-start";
  scoresBtn.textContent = "High Scores";
  scoresBtn.addEventListener("click", () => {
    actions.onShowLeaderboard();
  });
  scoresSection.appendChild(scoresBtn);

  // Danger zone
  const dangerSection = makeSection("Danger zone");
  dangerSection.append(
    makeDestructiveButton("Reset game", "Reset", () => actions.onResetGame()),
    makeDestructiveButton("Clear high scores", "Clear", () => actions.onClearHighScores()),
  );

  drawer.append(
    header,
    themeSection,
    displaySection,
    modeSection,
    helpSection,
    scoresSection,
    dangerSection,
  );

  // Close lifecycle (Escape, backdrop, explicit close button).
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey);
    backdrop.remove();
    drawer.remove();
    if (actions.onClose !== undefined) actions.onClose();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };
  backdrop.addEventListener("click", () => close());
  closeBtn.addEventListener("click", () => close());
  document.addEventListener("keydown", onKey);

  parent.append(backdrop, drawer);
  closeBtn.focus();
  return close;
}
