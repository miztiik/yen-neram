// Theme loader: fetches a theme manifest and builds the motifFiles map.
// On validation or network failure, falls back to "tropical-fruits".

import { ThemeManifestSchema } from "@/shared/schemas/theme-manifest.schema.js";

export type LoadedTheme = {
  readonly id: string;
  readonly display_name: string;
  readonly motifFiles: Readonly<Record<string, string>>;
};

const FALLBACK_THEME_ID = "tropical-fruits";
const MOTIF_KEYS: readonly string[] = ["1", "2", "3", "4", "5", "6"];

function buildMotifFiles(themeId: string): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const k of MOTIF_KEYS) {
    out[k] = `/assets/themes/${themeId}/motif-${k}.svg`;
  }
  return out;
}

async function fetchManifest(
  themeId: string,
): Promise<{ readonly id: string; readonly display_name: string } | null> {
  try {
    const response = await fetch(`/assets/themes/${themeId}/manifest.json`);
    if (!response.ok) return null;
    const data: unknown = await response.json();
    const parsed = ThemeManifestSchema.safeParse(data);
    if (!parsed.success) return null;
    return { id: parsed.data.id, display_name: parsed.data.display_name };
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
      motifFiles: buildMotifFiles(primary.id),
    };
  }
  if (id !== FALLBACK_THEME_ID) {
    const fallback = await fetchManifest(FALLBACK_THEME_ID);
    if (fallback !== null) {
      return {
        id: fallback.id,
        display_name: fallback.display_name,
        motifFiles: buildMotifFiles(fallback.id),
      };
    }
  }
  // Last-ditch: synthesize a fallback descriptor pointing at the canonical theme directory.
  return {
    id: FALLBACK_THEME_ID,
    display_name: "Tropical Fruits",
    motifFiles: buildMotifFiles(FALLBACK_THEME_ID),
  };
}
