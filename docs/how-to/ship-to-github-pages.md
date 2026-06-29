# How To Ship To GitHub Pages

**Last Updated**: 2026-06-29

Use this runbook when changing routing, deployment, PWA metadata, service-worker behaviour, or URLs that need to work under the GitHub Pages project base path.

## Base Path Rules

Production runs under the repository project path. Local dev and preview usually run at `/`.

- Vite `base` is controlled by `GH_PAGES_BASE` in deploy builds.
- Runtime navigation must use `import.meta.env.BASE_URL` or a base-aware asset/path helper.
- Do not navigate to a literal `/` from in-app buttons; that leaves the project page on GitHub Pages.
- Persisted paths, logs, manifests, and docs use relative POSIX paths.

Forks deploying under a different repository name set the same env var to their repo path. Local dev, preview, and Playwright use `/`.

## SPA Fallback

The app uses path routing with a GitHub Pages `404.html` fallback. The production `dist/404.html` must match `dist/index.html` so deep links boot the SPA.

GitHub Pages may return HTTP 404 status with the fallback body. For smoke checks, inspect the body as well as the status.

## PWA Manifest

The PWA manifest is a static file. `start_url`, `scope`, and icon paths stay relative so installed launches work under the project base path.

Do not make manifest URLs root-absolute unless the app stops being a GitHub Pages project page.

## Service Worker

The service worker precaches the shell and opened-game chunks. Theme motif art is not part of the precache budget by default; non-default themes are runtime assets.

The service worker uses Workbox through `vite-plugin-pwa` with silent `autoUpdate`. It is disabled in `vite dev` to avoid shadow-caching during development. If it is removed later, the PWA manifest can stay because the manifest is independent static metadata.

Service-worker changes require browser smoke in a production-like build because dev-server behaviour does not prove the install/update contract.

## Validation

1. Run the relevant build and tests.
2. Inspect `dist/index.html` and `dist/404.html` when fallback behaviour changes.
3. Check that generated asset URLs include the expected base in production builds.
4. Smoke a deep route and the installed-app start URL when manifest or service-worker behaviour changes.

## See also

- [../concepts/multi-game-shell.md](../concepts/multi-game-shell.md) - shell routing and game loading.
- [../architecture/runtime/perf-budget.md](../architecture/runtime/perf-budget.md) - load and bundle budgets.
- [../reference/toolchain.md](../reference/toolchain.md) - build commands and toolchain.
