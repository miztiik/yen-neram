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
    });
  }
});
