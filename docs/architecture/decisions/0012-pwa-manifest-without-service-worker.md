# ADR-0012: PWA manifest without a service worker

**Last Updated**: 2026-06-07
**Status**: Accepted
**Born in**: PR (`feat/v2`) - v2 production polish (PWA installability + brand assets + social-share meta)

## Context

v2 production polish wants two things the v1 shell did not ship: an
installable "Add to Home Screen" affordance, and brand/social-share
meta tags so the app looks intentional in link previews and in the
home-screen launcher.

ADR-0007 deferred a service worker until game #2 lands (the trigger
being lazy-loaded per-game chunks becoming the dominant load cost).
That deferral could be misread as deferring all PWA features, but the
PWA manifest and the service worker are independent specs:

- `manifest.webmanifest` is metadata: name, icons, theme colour,
  display mode, start URL. The browser uses it for the install prompt
  and for the standalone-window look once installed.
- The service worker is a runtime script that intercepts fetch and
  enables offline play + cache strategy.

Shipping the manifest alone gives the install affordance and the
standalone-window experience without touching ADR-0007's deferred
contract. The app remains online-only.

## Decision

Ship `apps/frontend/public/manifest.webmanifest` + an SVG icon set
(`icon.svg` + `favicon.svg`) + Open Graph / Twitter card / description
meta in `index.html`. No service worker.

Icons are SVG, single source, vector (no PNG fallback set). Modern
Android Chrome and iOS 14+ Safari accept SVG icons for both the home
screen and the install prompt; explicit `<link rel="apple-touch-icon">`
points iOS Safari at the same SVG.

## Rejected alternatives

- **Skip the manifest until the service worker lands.** Costs nothing
  now and gives users an install affordance immediately; deferring it
  buys nothing.
- **Generate PNG fallbacks at 192 / 512 / apple-touch sizes.** Modern
  Android and iOS 14+ accept SVG icons. Supporting older targets is
  not worth ~50 KB of PNGs against the v1 bundle budget (ADR-0006).
- **Generate a minimal no-op service worker just to satisfy older
  PWA-install criteria.** Adds the lifecycle cost (registration,
  update prompts, cache versioning) without the offline benefit. The
  v2 trigger from ADR-0007 has not fired.
- **Vite PWA / Workbox plugin.** Pulls in a framework dependency and
  build-time codegen for what is one hand-written 25-line JSON file.

## Consequences

- Players on Android can "Install" Yen-Neram from the address-bar menu
  and get a standalone-window app shortcut.
- iOS Safari users get the SVG apple-touch-icon when they "Add to
  Home Screen".
- Search engines and chat-app link previews use the OG meta tags and
  description.
- No offline play. The app still 404s on a cold load with no network.
  That is the explicit v2 trade and matches ADR-0007.
- The deploy is static-bundle still (Holy Law #1). No new runtime
  dependency, no new build step.

## Reversal cost

Cheap. Delete the `<link rel="manifest">` line from `index.html` and
the install prompt stops appearing. The icon and meta files are inert
without the manifest link and can be deleted with one `git rm`.

## See also

- [0006-bundle-budget-and-codesplit.md](0006-bundle-budget-and-codesplit.md).
- [0007-no-service-worker-v1.md](0007-no-service-worker-v1.md).
- [0008-license-cc0.md](0008-license-cc0.md).
- [../../../CLAUDE.md](../../../CLAUDE.md) Holy Law #1, #2.
