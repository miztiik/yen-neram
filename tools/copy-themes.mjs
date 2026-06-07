// Copy theme assets from assets/themes/<id>/ -> public/assets/themes/<id>/
// so Vite serves them at /assets/themes/<id>/* in dev and ships them in the
// production bundle. Idempotent: walks every theme directory and copies all
// files (no symlinks, no diffing). Runs via package.json predev/prebuild.

import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const srcRoot = join(repoRoot, "assets", "themes");
const dstRoot = join(repoRoot, "public", "assets", "themes");

async function copyOneTheme(themeId) {
  const srcDir = join(srcRoot, themeId);
  const dstDir = join(dstRoot, themeId);
  await mkdir(dstDir, { recursive: true });
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name.startsWith(".")) continue;
    await copyFile(join(srcDir, entry.name), join(dstDir, entry.name));
  }
}

async function main() {
  try {
    await stat(srcRoot);
  } catch {
    return;
  }
  await mkdir(dstRoot, { recursive: true });
  const themes = await readdir(srcRoot, { withFileTypes: true });
  for (const entry of themes) {
    if (!entry.isDirectory()) continue;
    await copyOneTheme(entry.name);
  }
}

main().catch((err) => {
  console.error("[copy-themes] failed:", err);
  process.exit(1);
});
