#!/usr/bin/env node
// SVGO optimisation pass for theme motif SVGs (per ADR-0011).
// Walks apps/frontend/public/assets/themes/<id>/motif-*.svg, optimises in place.
// Exits 1 if any file grew (regression). ASCII output only.

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { optimize } from "svgo";

const here = dirname(fileURLToPath(import.meta.url));
// here = apps/frontend/tools/  ->  workspaceRoot = apps/frontend/
const workspaceRoot = resolve(here, "..");
const themesRoot = resolve(workspaceRoot, "public/assets/themes");

const svgoConfig = {
  multipass: true,
  plugins: [
    {
      name: "preset-default",
      params: {
        overrides: {
          removeViewBox: false,
          cleanupNumericValues: { floatPrecision: 2 },
        },
      },
    },
    "removeDimensions",
    "removeUselessStrokeAndFill",
  ],
};

function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function listMotifSvgs() {
  if (!isDir(themesRoot)) {
    throw new Error(`themes root not found: ${relative(workspaceRoot, themesRoot)}`);
  }
  const out = [];
  for (const themeId of readdirSync(themesRoot).sort()) {
    const themeDir = join(themesRoot, themeId);
    if (!isDir(themeDir)) continue;
    for (const name of readdirSync(themeDir).sort()) {
      if (!/^motif-.*\.svg$/.test(name)) continue;
      out.push(join(themeDir, name));
    }
  }
  return out;
}

function pct(before, after) {
  if (before === 0) return "0.0";
  return (((before - after) / before) * 100).toFixed(1);
}

function main() {
  const files = listMotifSvgs();
  if (files.length === 0) {
    console.log("svgo-themes: no motif SVGs found; nothing to do.");
    return 0;
  }
  let totalBefore = 0;
  let totalAfter = 0;
  let regressed = 0;
  for (const file of files) {
    const rel = relative(workspaceRoot, file).split("\\").join("/");
    const input = readFileSync(file, "utf-8");
    const before = Buffer.byteLength(input, "utf-8");
    const result = optimize(input, { path: file, ...svgoConfig });
    if ("error" in result && result.error) {
      console.error(`svgo-themes: failed to optimise ${rel}: ${result.error}`);
      return 1;
    }
    const output = result.data;
    const after = Buffer.byteLength(output, "utf-8");
    writeFileSync(file, output, "utf-8");
    totalBefore += before;
    totalAfter += after;
    if (after > before) regressed += 1;
    console.log(`${rel}: ${before}b -> ${after}b (${pct(before, after)}% saved)`);
  }
  console.log(
    `${files.length} files; ${totalBefore}b -> ${totalAfter}b (${pct(totalBefore, totalAfter)}% saved)`,
  );
  if (regressed > 0) {
    console.error(`svgo-themes: ${regressed} file(s) grew after optimisation; failing.`);
    return 1;
  }
  return 0;
}

process.exit(main());
