# ADR-0015: Service worker via vite-plugin-pwa (autoUpdate)

**Last Updated**: 2026-06-07
**Status**: Accepted
**Born in**: v2 wave 3 (`feat/v2`)
**Supersedes**: ADR-0007 (no-SW-v1)

## Context

ADR-0007 deferred service workers until game #2 lands. The user chose
to land SW earlier as part of v2 production polish - the trade is more
generous than the ADR-0007 assumption: a single playable game still
benefits from offline support (the player on the subway), and the
~3 KB runtime + ~10 KB build-time tooling earn their bytes against the
"player on the move" use case.

## Decision

Use vite-plugin-pwa with Workbox under the hood. Registration is
`autoUpdate` - silent shell update on next navigation, no "reload to
update" prompt. Precache all build artefacts (HTML, JS, CSS, SVG,
JSON, manifest). Navigation fallback to /index.html so deep links work
offline (mirrors the GH Pages 404.html behaviour per ADR-0001).

## Rejected alternatives

- **Hand-written sw.js with manual cache management**: CLAUDE.md sec 10
  forbids reinventing what mature OSS does well. Workbox covers
  versioning, cleanup, navigation fallback, and update flows.
- **Workbox CLI directly (without vite-plugin-pwa)**: the plugin
  handles the precache-manifest injection (which files exist + their
  revision hashes) at build time. Doing this by hand re-runs every
  build.
- **next-pwa**: we don't use Next.
- **Manual prompt-to-update flow ("New version available, refresh?")**:
  adds a modal nag for a hobby game. The autoUpdate model is silent
  and lossless (state is in localStorage which persists across SW
  swaps).
- **Don't ship SW until game #2 (ADR-0007's original trigger)**:
  superseded by user decision; the trigger was a heuristic, not a hard
  constraint.

## Consequences

Players can install Yen-Neram to home screen (already via the PWA
manifest from v2 wave 1) AND play it offline. First page load installs
the SW; second page load is served from cache. SW updates apply
silently on the next navigation - no stale-version trap (a known SW
failure mode).

Build bundle adds ~10 KB of Workbox tooling (build-time only, not
shipped). Client SW is ~3 KB gzipped. Precache list size grows linearly
with assets - currently ~12 SVGs + 2 JSON manifests + 2 JS chunks + 2
CSS chunks + 1 HTML + 1 webmanifest = ~22 entries.

dev mode is unchanged - SW is disabled during `vite dev` to avoid
shadow-caching issues during development. SW only runs after `vite
build` -> served from `dist/sw.js`.

## Reversal cost

Cheap. Delete VitePWA plugin from vite.config.ts + delete the SW
registration in main.ts + delete this ADR. Manifest stays (it's
independent per ADR-0012).

## See also

- [0007-no-service-worker-v1.md](0007-no-service-worker-v1.md) (superseded).
- [0012-pwa-manifest-without-service-worker.md](0012-pwa-manifest-without-service-worker.md) - the manifest that was already there.
- [0001-routing-path-with-404-fallback.md](0001-routing-path-with-404-fallback.md) - the GH Pages SPA fallback that mirrors the offline navigation behaviour.
- [../../../CLAUDE.md](../../../CLAUDE.md) Holy Law 1 (static-first; SW does NOT change this).
