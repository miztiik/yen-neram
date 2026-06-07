# ADR-0010: GH Pages base-path override via GH_PAGES_BASE env

**Last Updated**: 2026-06-07
**Status**: Accepted
**Born in**: PR 8 (`feat/e2e-and-deploy`)

## Context

ADR-0001 picked path routing for `/play/<slug>/`. Local dev + preview run
at site root `/`, but GitHub Pages project pages serve at
`/<repo-name>/`. Asset URLs (`/assets/...`) must include the sub-path
or the deployed bundle 404s on every asset.

## Decision

`vite.config.ts` reads `process.env.GH_PAGES_BASE`; defaults to `/`
(the local dev / preview / playwright-preview-server path). The deploy
workflow sets `GH_PAGES_BASE=/<repo-name>/` before `pnpm build` so
asset URLs are prefixed correctly. The shell router parses
`location.pathname` AFTER stripping `import.meta.env.BASE_URL` so it
still understands deep links at `/<repo>/play/5-in-a-row/` as `play
5-in-a-row` regardless of deploy path.

## Rejected alternatives

- **Hardcode `base: "/<repo>/"` in vite.config.ts** - forks would need
  to edit a code file just to deploy under a different repo name.
- **Always `base: "./"`** (relative) - we already tried this in PR 1;
  it broke SPA deep-link asset resolution (PR 1 fix-up commit 1b2eb7a).
- **Detect at runtime from `<base href>`** - extra HTML wiring + each
  HTML file needs the build to inject the right value; env var on the
  build step is one-line simpler.

## Consequences

The deploy workflow always knows the repo name via
`${{ github.event.repository.name }}`. Forks deploying under different
names just work. Local dev + preview + Playwright still see `/` and
everything routes normally. A future "user page" deploy at
`https://user.github.io/` would set `GH_PAGES_BASE=/` (no override
needed).

## Reversal cost

Cheap. Single env var + one line in the build step. Removing the
override forces hardcoding or repo-name parsing; not desirable but
mechanically simple.

## See also

- [0001-routing-path-with-404-fallback.md](0001-routing-path-with-404-fallback.md).
- [0006-bundle-budget-and-codesplit.md](0006-bundle-budget-and-codesplit.md).
