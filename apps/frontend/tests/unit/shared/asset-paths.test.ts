import { describe, expect, it } from "vitest";
import { assetPaths } from "@/shared/asset-paths.js";

// The vitest config injects `import.meta.env.BASE_URL = "/"` (Vite's
// dev/test default). These tests verify the builders join correctly
// against that base; the more important real-world case ("/yen-neram/")
// is covered by the base-path e2e test that loads the production build.
//
// Per CLAUDE.md sec 10: no hardcoded paths at callsites. This file +
// the asset-paths module are the single source of truth.

describe("assetPaths (single source of truth for runtime asset URLs)", () => {
  it("games() returns base + games.json", () => {
    expect(assetPaths.games()).toBe("/games.json");
  });

  it("themeManifest(id) interpolates the themeId into the manifest path", () => {
    expect(assetPaths.themeManifest("tropical-fruits")).toBe(
      "/assets/themes/tropical-fruits/manifest.json",
    );
    expect(assetPaths.themeManifest("origami")).toBe("/assets/themes/origami/manifest.json");
  });

  it("themeMotif(id, file) interpolates both arguments and respects the file extension", () => {
    expect(assetPaths.themeMotif("tropical-fruits", "motif-1.png")).toBe(
      "/assets/themes/tropical-fruits/motif-1.png",
    );
    expect(assetPaths.themeMotif("origami", "motif-3.svg")).toBe(
      "/assets/themes/origami/motif-3.svg",
    );
  });

  it("themesIndex() returns the generated theme roster path", () => {
    expect(assetPaths.themesIndex()).toBe("/assets/themes/index.json");
  });

  it("publicAsset(rawPath) joins authored JSON paths against the base, stripping a leading /", () => {
    // The shape that comes from games.json -> tile_silhouette: an absolute
    // path written as if served from host root. The builder must respect
    // the Vite base (whatever it is at runtime).
    expect(assetPaths.publicAsset("/assets/portal-tiles/5-in-a-row.svg")).toBe(
      "/assets/portal-tiles/5-in-a-row.svg",
    );
    // Also works for paths authored without a leading slash:
    expect(assetPaths.publicAsset("assets/portal-tiles/5-in-a-row.svg")).toBe(
      "/assets/portal-tiles/5-in-a-row.svg",
    );
  });

  it("does not produce double slashes when relative paths accidentally start with /", () => {
    // The helper strips a leading "/" so e.g. base "/yen-neram/" + "/foo"
    // yields "/yen-neram/foo", not "/yen-neram//foo". Calling the public
    // builders never produces a leading-slash relative input, but the
    // guard inside join() is the contract.
    expect(assetPaths.games().includes("//")).toBe(false);
    expect(assetPaths.themeManifest("origami").includes("//")).toBe(false);
    expect(assetPaths.themeMotif("origami", "motif-1.svg").includes("//")).toBe(false);
    expect(assetPaths.publicAsset("/assets/foo/bar.svg").includes("//")).toBe(false);
  });

  it("portal() returns the Vite-injected BASE_URL (regression for ADR-0020)", () => {
    // ADR-0020 regression: pre-2026-06-08 the in-game Menu's
    // onModeSwitch + onBackToHome handlers called
    // `window.location.assign("/")` directly. On the GH-Pages project
    // deploy the base path is `/yen-neram/`, so the literal `"/"`
    // navigated OUT of the SPA to `https://miztiik.github.io/` -- a
    // 404. The fix routes both handlers through `assetPaths.portal()`;
    // this test pins the helper's behaviour so a future refactor can't
    // silently lose it.
    expect(assetPaths.portal()).toBe(import.meta.env.BASE_URL);
    expect(assetPaths.portal()).toBe("/");
    expect(assetPaths.portal().includes("//")).toBe(false);
  });
});
