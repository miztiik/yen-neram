// Single source of truth for runtime asset URLs.
//
// CLAUDE.md sec 10 forbids hardcoded paths/strings at callsites. Without
// this module, a path like `/games.json` lived in `shell/index.ts` and
// `/assets/themes/<id>/manifest.json` in two other files. That bit us on
// 2026-06-07: GitHub Pages serves from base `/yen-neram/`, the absolute
// paths 404'd, the portal silently fell back to an empty games array, and
// the live URL rendered with no tiles.
//
// All asset URLs are now built here and respect Vite's `base` via
// `import.meta.env.BASE_URL`. To add a new asset, add a builder. To
// rename the on-disk location, change the template in ONE place.
//
// Pattern: builders are pure functions that take params (themeId, file)
// and return a fully-qualified URL ready for fetch() or <img src>.

function join(rel: string): string {
  // `import.meta.env.BASE_URL` is always slash-suffixed by Vite (e.g. "/"
  // or "/yen-neram/"). Strip a leading "/" from the relative segment so
  // we never produce "/yen-neram//games.json".
  const base = import.meta.env.BASE_URL;
  const clean = rel.startsWith("/") ? rel.slice(1) : rel;
  return base + clean;
}

export const assetPaths = {
  /** Game manifest array served from public/games.json. */
  games(): string {
    return join("games.json");
  },

  /**
   * The SPA portal home (`import.meta.env.BASE_URL`). Use this for any
   * `window.location.assign()` that intends to navigate to the in-SPA
   * home, NEVER the literal `"/"`. On the GH-Pages project deploy the
   * base is `/yen-neram/` and `"/"` bounces OUT of the SPA to
   * `https://miztiik.github.io/` -- a 404 (see ADR-0020).
   */
  portal(): string {
    return import.meta.env.BASE_URL;
  },

  /** Theme manifest JSON for a given themeId. */
  themeManifest(themeId: string): string {
    return join(`assets/themes/${themeId}/manifest.json`);
  },

  /**
   * Motif file URL inside a theme directory. `file` is the manifest's
   * declared `motif.file` field (e.g. "motif-3.png", "motif-5.svg").
   */
  themeMotif(themeId: string, file: string): string {
    return join(`assets/themes/${themeId}/${file}`);
  },

  /**
   * Resolves a path stored inside an authored JSON file (e.g. the
   * `tile_silhouette` field in games.json) against the document base.
   * Authors write the paths AS IF the SPA were served from the host
   * root (`/assets/foo/bar.svg`); this helper strips the leading slash
   * and joins with `import.meta.env.BASE_URL`. Use this anywhere a path
   * coming from data (not code) needs to be turned into a URL.
   */
  publicAsset(rawPath: string): string {
    return join(rawPath);
  },
} as const;
