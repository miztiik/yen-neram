#!/usr/bin/env node
// Theme index generator (per ADR-0023). Scans
// apps/frontend/public/assets/themes/<id>/manifest.json and emits index.json -
// the roster (id + display_name) the settings-drawer theme picker reads at
// runtime. Wired into `build` + `build:assets`. ASCII output only.
//
// The index is a generated projection of the manifests; display_name is never
// hand-duplicated. tests/contract/theme-index.test.ts re-derives the expected
// index independently and fails if the committed file is stale.

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// here = apps/frontend/tools/  ->  workspaceRoot = apps/frontend/
const workspaceRoot = resolve(here, "..");
const themesRoot = resolve(workspaceRoot, "public/assets/themes");
const indexPath = resolve(themesRoot, "index.json");

function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// Pure: scan theme folders -> { schema_version, themes:[{id, display_name}] }
// sorted by id. Asserts each manifest.id matches its folder (a mismatch makes
// the loader build 404 motif URLs). Folders without a manifest.json are skipped
// (so index.json itself, a file not a dir, is never treated as a theme).
export function buildIndex(root = themesRoot) {
  const themes = [];
  for (const name of readdirSync(root).sort()) {
    const dir = join(root, name);
    if (!isDir(dir)) continue;
    let raw;
    try {
      raw = readFileSync(join(dir, "manifest.json"), "utf-8");
    } catch {
      continue;
    }
    const manifest = JSON.parse(raw);
    if (manifest.id !== name) {
      throw new Error(
        `themes-index: manifest id "${manifest.id}" != folder "${name}" (would 404 motifs)`,
      );
    }
    if (typeof manifest.display_name !== "string" || manifest.display_name.length === 0) {
      throw new Error(`themes-index: theme "${name}" missing display_name`);
    }
    themes.push({ id: manifest.id, display_name: manifest.display_name });
  }
  themes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { schema_version: 1, themes };
}

function main() {
  const index = buildIndex();
  const json = JSON.stringify(index, null, 2) + "\n";
  writeFileSync(indexPath, json, "utf-8");
  const rel = relative(workspaceRoot, indexPath).split("\\").join("/");
  console.log(`themes-index: wrote ${rel} (${String(index.themes.length)} themes)`);
  return 0;
}

// Run main only when invoked directly, so a test can import buildIndex without
// triggering a write.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exit(main());
}
