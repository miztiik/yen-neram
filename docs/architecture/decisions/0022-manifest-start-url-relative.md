# ADR-0022: PWA manifest `start_url` / `scope` / icons are relative, not root-absolute

**Last Updated**: 2026-06-26
**Status**: Accepted
**Born in**: Live-site bug - "opening the app lands in the game, not the portal"

## Context

On the GitHub-Pages project deploy the SPA base is `/yen-neram/` (set via
`GH_PAGES_BASE` in `deploy.yml`; see ADR-0010). Vite rewrites the
base-relative links INSIDE `index.html` at build time - the built shell
correctly references `/yen-neram/manifest.webmanifest`, `/yen-neram/favicon.svg`,
and the hashed JS/CSS. Confirmed by inspecting `dist/index.html`.

The web app manifest is different. `vite-plugin-pwa` runs with
`manifest: false` (per ADR-0012 the manifest is a hand-authored static file
in `public/`), so Vite copies `public/manifest.webmanifest` to `dist/`
**verbatim** - it never rewrites the JSON body. The shipped manifest
therefore kept its authored root-absolute members:

```json
"start_url": "/",
"icons": [{ "src": "/icon.svg" }, { "src": "/favicon.svg" }]
```

with no `scope` (which defaults to the manifest directory, `/yen-neram/`).

`start_url: "/"` resolves to the account root `https://<owner>.github.io/`,
which is **outside** the app scope `/yen-neram/`. Per the Web App Manifest
spec an out-of-scope `start_url` is invalid; the browser discards it and
falls back to the URL the app was installed from. A player who installs or
adds-to-home-screen while a game is open captures `/yen-neram/play/5-in-a-row/`
as the effective launch URL - so every subsequent launch drops them straight
into the game instead of the portal. The icons (`/icon.svg`) also 404.

This is the manifest-level twin of the bug ADR-0020 fixed for the in-app
`window.location.assign("/")` call-sites. ADR-0020 fixed the runtime
navigation; it did not touch the manifest, so the launch path stayed broken.

## Decision

Make every launch-affecting manifest member **relative**, so it resolves
against the manifest's own URL (the deploy root) on any base:

```json
"start_url": ".",
"scope": ".",
"icons": [{ "src": "icon.svg" }, { "src": "favicon.svg" }]
```

- On the project deploy the manifest is fetched from
  `/yen-neram/manifest.webmanifest`, so `.` -> `/yen-neram/` (the portal)
  and `icon.svg` -> `/yen-neram/icon.svg`.
- On a root deploy or local dev/preview (base `/`) the manifest is at
  `/manifest.webmanifest`, so `.` -> `/` and `icon.svg` -> `/icon.svg`.

One authored manifest is now correct for every deploy base, mirroring how
`assetPaths` (ADR-0020) made the runtime URLs base-agnostic.

A contract test - `tests/contract/pwa-manifest.test.ts` - asserts that
`start_url`, `scope`, and every icon `src` are relative (do not start with
`/`), so a future edit cannot silently reintroduce the root-absolute form.

## Rejected alternatives

- **Generate the manifest through `vite-plugin-pwa` (`manifest: {...}`) so
  Vite injects the base.** Larger change: moves the hand-authored manifest
  into `vite.config.ts`, and the plugin's manifest handling would also want
  to own the `<link rel="manifest">` injection that `index.html` does today.
  The relative-URL fix is one file and deploy-base-agnostic without coupling
  the manifest to the build tool.
- **Hardcode `start_url: "/yen-neram/"`.** Breaks local dev / preview / e2e
  (base `/`) and re-breaks if the repo is ever renamed or moved to a user/org
  root page. Relative URLs need no knowledge of the base.
- **Leave it and document "install from the home screen".** Pushes a
  spec-conformance bug onto the player; the launch target must be correct
  regardless of where the user installed from.

## Consequences

The installed PWA (and the browser "open" of the bare site root) launches at
the portal. The install prompt gets its icons. No runtime code changes; the
SPA router is unchanged. Reversal cost is one file plus the contract test.

## Also fixed: PWA base hardening

Three other places assumed base `/` (latent - not the "lands in the game"
symptom, which is purely `start_url` - but fixed in the same PR so the whole
PWA respects the base):

- **Service worker navigation fallback.** `vite.config.ts` set
  `navigateFallback: "/index.html"` (root), but the precached shell is keyed
  `${REPO_BASE}index.html`, so the OFFLINE deep-link fallback missed off-base.
  Now `navigateFallback: ${REPO_BASE}index.html` with a base-aware denylist.
  (Online deep links already work via the GH-Pages `404.html`, ADR-0001.)
- **Redundant SW registration in `main.ts`.** It registered
  `new Workbox("/sw.js")` (root) - duplicating the registration script
  `vite-plugin-pwa` auto-injects (`registerSW.js`, which already registers
  `${BASE_URL}sw.js` with the right scope) AND 404-ing on the project deploy.
  Removed; the injected script is the single registration path. (The now-unused
  `workbox-window` devDependency is left in place to avoid lockfile churn; it
  no longer ships in the bundle.)
- **`og:image`.** `index.html` pointed at `/icon.svg`; now the relative
  `icon.svg`, so the canonical root share resolves to `${BASE_URL}icon.svg`.

## See also

- [0020-portal-navigation-via-base-url.md](0020-portal-navigation-via-base-url.md) - the runtime twin of this bug.
- [0010-gh-pages-base-path-override.md](0010-gh-pages-base-path-override.md) - the `/yen-neram/` base.
- [0012-pwa-manifest-without-service-worker.md](0012-pwa-manifest-without-service-worker.md) - why the manifest is hand-authored.
- [0015-service-worker-pwa.md](0015-service-worker-pwa.md) - the service worker whose fallback is in the out-of-scope list above.
