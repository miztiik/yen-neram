import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(here, "../../public/manifest.webmanifest");
const raw = readFileSync(manifestPath, "utf-8");
const manifest: unknown = JSON.parse(raw);

type ManifestShape = {
  start_url?: unknown;
  scope?: unknown;
  icons?: ReadonlyArray<{ src?: unknown }>;
};

const m = manifest as ManifestShape;

// Per ADR-0022. On the GitHub-Pages PROJECT deploy the app is served under
// "/<repo>/" (e.g. "/yen-neram/"). The static manifest ships verbatim --
// VitePWA runs with `manifest: false`, so Vite never rewrites its JSON
// content the way it rewrites the base-relative links in index.html. A
// root-absolute member ("/" start_url, "/icon.svg" icon) therefore resolves
// OUTSIDE the app scope; the browser rejects the out-of-scope start_url and
// relaunches the install-time URL (the game) instead of the portal, and the
// icons 404. A RELATIVE member resolves against the manifest's own URL (the
// deploy root) and is correct for BOTH the root deploy and the project
// deploy. This contract keeps every launch-affecting member relative.
describe("public/manifest.webmanifest PWA launch contract (ADR-0022)", () => {
  it("start_url is relative, not root-absolute", () => {
    expect(typeof m.start_url).toBe("string");
    expect((m.start_url as string).startsWith("/")).toBe(false);
  });

  it("declares a relative scope", () => {
    expect(typeof m.scope).toBe("string");
    expect((m.scope as string).startsWith("/")).toBe(false);
  });

  it("every icon src is relative, not root-absolute", () => {
    const icons = m.icons ?? [];
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      expect(typeof icon.src).toBe("string");
      expect((icon.src as string).startsWith("/")).toBe(false);
    }
  });
});
