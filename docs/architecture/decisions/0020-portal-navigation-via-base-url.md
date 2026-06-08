# ADR-0020: Portal navigation goes through `assetPaths.portal()`, not literal `"/"`

**Last Updated**: 2026-06-08
**Status**: Accepted
**Born in**: Live-site bug uncovered after PR #27 (ADR-0019), 2026-06-08

## Context

ADR-0019 consolidated in-game navigation under the Menu drawer. Two of
its handlers (`onBackToHome` fallback path + `onModeSwitch`) called
`window.location.assign("/")` directly. The intent: "navigate to the
SPA home".

On the GH-Pages project deploy, the SPA base is `/yen-neram/` (set via
the `GH_PAGES_BASE` env var in `deploy.yml`; see ADR-0010). The literal
string `"/"` resolves at the BROWSER level, not the Vite-base level, so
`location.assign("/")` navigates to `https://miztiik.github.io/` -- the
GitHub-Pages-account index, NOT the `/yen-neram/` SPA. The user lands on
a 404 (no `/index.html` at the account root).

The bug was invisible during local dev (base `/`), local preview (base
`/`), and Playwright e2e (base `/`); it only fires on the live deploy
where the base is `/yen-neram/`. Caught when the user clicked Menu ->
Switch mode and got bounced out of the app.

## Decision

Add a new method `assetPaths.portal()` to the existing
`apps/frontend/src/shared/asset-paths.ts` module (the single source of
truth for runtime URLs that respect Vite's base; already established
2026-06-07 to fix the same class of bug for `/games.json` and theme
manifests).

```ts
/** Use for any window.location.assign() that intends to navigate to the
 *  SPA home, NEVER literal "/" -- see ADR-0020. */
portal(): string {
  return import.meta.env.BASE_URL;
}
```

Replace both `window.location.assign("/")` call-sites in
`src/games/5-in-a-row/index.ts` (the Menu drawer's `onBackToHome`
fallback + `onModeSwitch`) with `window.location.assign(assetPaths.portal())`.

Comments at both call-sites cite this ADR so the next reader sees WHY
in context.

## Rejected alternatives

### Inline `window.location.assign(import.meta.env.BASE_URL)` at the call-sites

Workable, but every future "navigate home" call-site has to remember
the `import.meta.env.BASE_URL` recipe. The helper makes it a one-import
+ one-method-call, the helper's docstring carries the warning, and the
sibling methods (`assetPaths.games()`, `assetPaths.themeManifest()`,
etc.) already established the centralisation pattern in this module
for the same class of bug. Consistency with the existing module
outweighs the negligible saving of skipping the wrapper.

### Hash routing (`#/`) instead of path routing

Would dodge the base-path problem entirely (the hash is browser-side
and never crosses the server). But ADR-0001 explicitly chose path
routing with GH Pages 404 SPA fallback; switching to hash routing now
would invalidate every existing shareable URL (`/play/5-in-a-row/`
becomes `/#/play/5-in-a-row/`), defeat the 404.html-as-index pattern,
and force a documentation rewrite. The actual fix is much smaller than
the cost of changing routing modes.

### Use `<a href>` + click-handler intercept instead of `location.assign`

The Menu drawer is opened from a button, the handler runs imperatively
after writing save state + closing the drawer. An anchor would mean
faking the click flow, which is more code than the helper-method
approach and obscures the intent ("navigate after side-effects").

## Consequences

- Two call-sites in `5-in-a-row/index.ts` change from literal `"/"` to
  `assetPaths.portal()`. No behaviour change in dev/preview/e2e (base
  `/`); fixes the live-site bug on GH Pages (base `/yen-neram/`).
- Future "navigate to portal" call-sites use the helper. Code-review
  rule: any `window.location.assign("/")` is a red flag; refer back to
  this ADR.
- The helper is colocated with the rest of the `assetPaths.*` family
  (which already centralises asset URLs to dodge the same class of bug
  for `/games.json` and theme manifests).

## Reversal cost

Trivial. Delete the `portal()` method, find-replace `assetPaths.portal()`
back to `"/"` at the two call-sites, drop the import line. The helper
is a thin wrapper around `import.meta.env.BASE_URL`; nothing downstream
depends on its shape.

## See also

- [0001-routing-path-with-404-fallback.md](0001-routing-path-with-404-fallback.md) -- why path routing + 404 fallback (the rule this ADR cleans up around).
- [0010-gh-pages-base-path-override.md](0010-gh-pages-base-path-override.md) -- where `GH_PAGES_BASE` becomes Vite's `base`.
- [0019-cool-slate-score-menu-drawer-hamburger-flame-streak.md](0019-cool-slate-score-menu-drawer-hamburger-flame-streak.md) -- the Menu drawer redesign that introduced the buggy call-sites.
- [../../../CLAUDE.md](../../../CLAUDE.md) sec 10 (no hardcoded paths at callsites).
