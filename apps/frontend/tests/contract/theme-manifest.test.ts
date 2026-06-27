import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ThemeManifestSchema } from "@/shared/schemas/theme-manifest.schema.js";

const here = dirname(fileURLToPath(import.meta.url));
const themesRoot = resolve(here, "../../public/assets/themes");

function listThemeIds(): string[] {
  return readdirSync(themesRoot)
    .filter((name) => {
      const p = resolve(themesRoot, name);
      try {
        return statSync(p).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();
}

function readManifest(id: string): unknown {
  const raw = readFileSync(resolve(themesRoot, id, "manifest.json"), "utf-8");
  return JSON.parse(raw);
}

describe("theme manifests contract", () => {
  const ids = listThemeIds();

  it("at least one theme on disk", () => {
    expect(ids.length).toBeGreaterThan(0);
  });

  for (const id of ids) {
    describe(`theme '${id}'`, () => {
      it("manifest.json parses against schema", () => {
        const data = readManifest(id);
        const result = ThemeManifestSchema.safeParse(data);
        expect(result.success, JSON.stringify(result, null, 2)).toBe(true);
      });

      it("manifest id matches folder name", () => {
        const data = readManifest(id) as { id: string };
        expect(data.id).toBe(id);
      });

      it("every declared motif file exists on disk", () => {
        const data = readManifest(id) as { motifs: Record<string, string> };
        for (const [rg, file] of Object.entries(data.motifs)) {
          const p = resolve(themesRoot, id, file);
          expect(statSync(p).isFile(), `rg=${rg} expected ${p}`).toBe(true);
        }
      });

      it("has motifs 1-6 (the default 6 run-groups)", () => {
        const data = readManifest(id) as { motifs: Record<string, unknown> };
        for (const rg of ["1", "2", "3", "4", "5", "6"]) {
          expect(data.motifs[rg], `missing run-group ${rg}`).toBeDefined();
        }
      });

      it("motif_colors, when present, key only declared motifs and are valid hex (ADR-0028)", () => {
        const data = readManifest(id) as {
          motifs: Record<string, string>;
          motif_colors?: Record<string, string>;
        };
        if (data.motif_colors === undefined) return;
        for (const [rg, color] of Object.entries(data.motif_colors)) {
          expect(data.motifs[rg], `motif_colors rg=${rg} has no matching motif`).toBeDefined();
          expect(color, `motif_colors rg=${rg} not a hex colour`).toMatch(/^#[0-9a-fA-F]{3,8}$/);
        }
      });
    });
  }
});

describe("ThemeManifestSchema motif_colors field (ADR-0028, additive optional)", () => {
  const base = {
    schema_version: 2 as const,
    id: "demo",
    display_name: "Demo",
    description: "Demo theme",
    license: "CC0-1.0",
    background: { fill: "#0f172a", grid: "#1e293b" },
    motifs: { "1": "a.svg", "2": "b.svg", "3": "c.svg", "4": "d.svg", "5": "e.svg", "6": "f.svg" },
  };

  it("accepts a manifest WITHOUT motif_colors (optional -> stays schema_version 2)", () => {
    expect(ThemeManifestSchema.safeParse(base).success).toBe(true);
  });

  it("accepts valid per-motif hex colours (incl. 8-digit alpha)", () => {
    const ok = { ...base, motif_colors: { "1": "#38bdf8", "2": "#fb923c80" } };
    expect(ThemeManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects a non-hex motif colour", () => {
    const bad = { ...base, motif_colors: { "1": "blue" } };
    expect(ThemeManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an out-of-range motif-colour key", () => {
    const bad = { ...base, motif_colors: { "8": "#38bdf8" } };
    expect(ThemeManifestSchema.safeParse(bad).success).toBe(false);
  });
});
