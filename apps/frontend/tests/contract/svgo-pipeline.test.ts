import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const themesRoot = resolve(here, "../../public/assets/themes");

function listMotifFiles(): string[] {
  const out: string[] = [];
  for (const themeId of readdirSync(themesRoot).sort()) {
    const themeDir = join(themesRoot, themeId);
    try {
      if (!statSync(themeDir).isDirectory()) continue;
    } catch {
      continue;
    }
    for (const name of readdirSync(themeDir).sort()) {
      if (/^motif-.*\.svg$/.test(name)) out.push(join(themeDir, name));
    }
  }
  return out;
}

describe("SVGO pipeline contract (per ADR-0011)", () => {
  const files = listMotifFiles();

  it("at least one motif SVG on disk", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("every motif SVG is under 3000 bytes after optimisation", () => {
    const oversize: string[] = [];
    for (const file of files) {
      const size = statSync(file).size;
      if (size >= 3000) oversize.push(`${file}: ${size}b`);
    }
    expect(oversize, oversize.join("\n")).toEqual([]);
  });

  it("every motif SVG is well-formed (starts with <svg, ends with </svg>)", () => {
    const malformed: string[] = [];
    for (const file of files) {
      const raw = readFileSync(file, "utf-8").trim();
      if (!raw.startsWith("<svg")) malformed.push(`${file}: missing <svg open`);
      if (!raw.endsWith("</svg>")) malformed.push(`${file}: missing </svg> close`);
    }
    expect(malformed, malformed.join("\n")).toEqual([]);
  });

  it("no motif SVG contains an <?xml declaration (SVGO strips it)", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const raw = readFileSync(file, "utf-8");
      if (raw.includes("<?xml")) offenders.push(file);
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("no motif SVG contains <title> or <desc> (SVGO strips them)", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const raw = readFileSync(file, "utf-8");
      if (/<title[\s>]/.test(raw)) offenders.push(`${file}: <title>`);
      if (/<desc[\s>]/.test(raw)) offenders.push(`${file}: <desc>`);
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
