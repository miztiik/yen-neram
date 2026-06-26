import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ThemeIndexSchema } from "@/shared/schemas/theme-index.schema.js";

const here = dirname(fileURLToPath(import.meta.url));
const themesRoot = resolve(here, "../../public/assets/themes");
const indexPath = resolve(themesRoot, "index.json");

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// Independently re-derive the expected roster from the manifests on disk - the
// same projection tools/themes-index.mjs emits. If the committed index.json is
// stale (a theme was added / renamed but the generator was not re-run) the
// deep-equal below fails, which is the staleness guard.
function deriveExpected(): { id: string; display_name: string }[] {
  const out: { id: string; display_name: string }[] = [];
  for (const name of readdirSync(themesRoot).sort()) {
    const dir = resolve(themesRoot, name);
    if (!isDir(dir)) continue;
    let raw: string;
    try {
      raw = readFileSync(resolve(dir, "manifest.json"), "utf-8");
    } catch {
      continue;
    }
    const m = JSON.parse(raw) as { id: string; display_name: string };
    out.push({ id: m.id, display_name: m.display_name });
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

describe("theme index contract (ADR-0023)", () => {
  const raw: unknown = JSON.parse(readFileSync(indexPath, "utf-8"));

  it("index.json validates against ThemeIndexSchema", () => {
    const result = ThemeIndexSchema.safeParse(raw);
    expect(result.success, JSON.stringify(result, null, 2)).toBe(true);
  });

  it("roster matches the manifests on disk (regenerate index.json if this fails)", () => {
    const parsed = ThemeIndexSchema.parse(raw);
    expect(parsed.themes).toEqual(deriveExpected());
  });

  it("every indexed theme id matches its folder's manifest id", () => {
    const parsed = ThemeIndexSchema.parse(raw);
    for (const t of parsed.themes) {
      const manifestPath = resolve(themesRoot, t.id, "manifest.json");
      const m = JSON.parse(readFileSync(manifestPath, "utf-8")) as { id: string };
      expect(m.id, `theme ${t.id}`).toBe(t.id);
    }
  });
});
