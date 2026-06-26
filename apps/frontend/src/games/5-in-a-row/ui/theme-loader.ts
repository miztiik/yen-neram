// Theme loader: fetches a theme manifest and builds the motifFiles map.
// On validation or network failure, falls back to "tropical-fruits".
//
// Motif URLs come from `manifest.motifs[k].file` joined to the theme dir;
// the file extension is whatever the manifest declares (svg, png; mixed in
// one theme is fine). The loader does NOT synthesise file names except in
// the last-ditch fallback path (when even the fallback manifest fetch fails),
// where it assumes the canonical `.svg` extension as a final escape hatch.

import { type ThemeManifest, ThemeManifestSchema } from "@/shared/schemas/theme-manifest.schema.js";
import { assetPaths } from "@/shared/asset-paths.js";

export type LoadedTheme = {
  readonly id: string;
  readonly display_name: string;
  readonly motifFiles: Readonly<Record<string, string>>;
};

const FALLBACK_THEME_ID = "tropical-fruits";
const MOTIF_KEYS: readonly string[] = ["1", "2", "3", "4", "5", "6"];

// Last-ditch motif filenames for the fallback theme (tropical-fruits), used only
// when even its manifest fetch fails. Mirrors that theme's manifest; the
// theme-manifest contract test (every declared file exists) keeps both honest.
const FALLBACK_MOTIF_FILES: Readonly<Record<string, string>> = {
  "1": "watermelon.png",
  "2": "kiwi.png",
  "3": "strawberry.png",
  "4": "apple.png",
  "5": "banana.png",
  "6": "lemon.png",
};

function buildMotifFiles(
  themeId: string,
  motifs: ThemeManifest["motifs"],
): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const k of MOTIF_KEYS) {
    const file = motifs[k];
    if (file === undefined) continue;
    out[k] = assetPaths.themeMotif(themeId, file);
  }
  return out;
}

function buildDefaultMotifFiles(themeId: string): Readonly<Record<string, string>> {
  // Last-ditch only: the fallback theme's known filenames, used when even the
  // fallback manifest fetch failed (network completely down, etc).
  const out: Record<string, string> = {};
  for (const k of MOTIF_KEYS) {
    const file = FALLBACK_MOTIF_FILES[k];
    if (file === undefined) continue;
    out[k] = assetPaths.themeMotif(themeId, file);
  }
  return out;
}

async function fetchManifest(themeId: string): Promise<ThemeManifest | null> {
  try {
    const response = await fetch(assetPaths.themeManifest(themeId));
    if (!response.ok) return null;
    const data: unknown = await response.json();
    const parsed = ThemeManifestSchema.safeParse(data);
    if (!parsed.success) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export async function loadTheme(id: string): Promise<LoadedTheme> {
  const primary = await fetchManifest(id);
  if (primary !== null) {
    return {
      id: primary.id,
      display_name: primary.display_name,
      motifFiles: buildMotifFiles(primary.id, primary.motifs),
    };
  }
  if (id !== FALLBACK_THEME_ID) {
    const fallback = await fetchManifest(FALLBACK_THEME_ID);
    if (fallback !== null) {
      return {
        id: fallback.id,
        display_name: fallback.display_name,
        motifFiles: buildMotifFiles(fallback.id, fallback.motifs),
      };
    }
  }
  // Last-ditch: synthesize a fallback descriptor pointing at the canonical theme directory.
  return {
    id: FALLBACK_THEME_ID,
    display_name: "Tropical Fruits",
    motifFiles: buildDefaultMotifFiles(FALLBACK_THEME_ID),
  };
}
