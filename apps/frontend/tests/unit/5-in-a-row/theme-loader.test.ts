import { afterEach, describe, expect, it, vi } from "vitest";
import { loadTheme } from "@/games/5-in-a-row/ui/theme-loader.js";

// The clear-burst's last-resort colour when a run-group has no declared colour.
// Mirrors DEFAULT_SPLASH_COLOR in theme-loader.ts (ADR-0028).
const DEFAULT_SPLASH = "rgba(244, 114, 182, 0.5)";

const RUN_GROUPS = ["1", "2", "3", "4", "5", "6"] as const;

const baseManifest = {
  schema_version: 2,
  id: "demo",
  display_name: "Demo",
  description: "Demo theme",
  license: "CC0-1.0",
  background: { fill: "#0f172a", grid: "#1e293b" },
  motifs: { "1": "a.svg", "2": "b.svg", "3": "c.svg", "4": "d.svg", "5": "e.svg", "6": "f.svg" },
};

// fetch is mocked (sanctioned carve-out (a): fetch in loader unit tests). The
// loader only inspects response.ok + response.json(), so a minimal stub suffices.
function mockManifest(manifest: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(manifest) })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadTheme motifColors (ADR-0028: per-motif clear-burst colour)", () => {
  it("maps each run-group to its declared colour", async () => {
    mockManifest({
      ...baseManifest,
      motif_colors: {
        "1": "#38bdf8",
        "2": "#fb923c",
        "3": "#cbd5e1",
        "4": "#4f46e5",
        "5": "#fbbf24",
        "6": "#ef4444",
      },
    });
    const theme = await loadTheme("demo");
    expect(theme.motifColors["1"]).toBe("#38bdf8");
    expect(theme.motifColors["4"]).toBe("#4f46e5");
    expect(theme.motifColors["6"]).toBe("#ef4444");
  });

  it("falls back to the default splash colour for run-groups without a declared colour", async () => {
    mockManifest({ ...baseManifest, motif_colors: { "1": "#38bdf8" } });
    const theme = await loadTheme("demo");
    expect(theme.motifColors["1"]).toBe("#38bdf8");
    expect(theme.motifColors["2"]).toBe(DEFAULT_SPLASH);
    expect(theme.motifColors["6"]).toBe(DEFAULT_SPLASH);
  });

  it("uses the default splash colour for every run-group when motif_colors is absent", async () => {
    mockManifest(baseManifest);
    const theme = await loadTheme("demo");
    for (const k of RUN_GROUPS) {
      expect(theme.motifColors[k]).toBe(DEFAULT_SPLASH);
    }
  });
});
