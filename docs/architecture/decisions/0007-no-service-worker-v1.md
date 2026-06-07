# ADR-0007: No service worker in v1

**Last Updated**: 2026-06-07
**Status**: Superseded by ADR-0015 (2026-06-07)
**Born in**: PR 1 (`chore/scaffolding-and-adrs`)

> Superseded by [ADR-0015](0015-service-worker-pwa.md): the user chose to land a service worker in v2 wave 3 (before game #2), so the deferral trigger named below no longer applies.

## Context

A service worker enables offline play and faster repeat loads, but adds lifecycle complexity (registration, update prompts, cache versioning, "stale shell forever" footguns) and PR-level engineering cost.

## Decision

No service worker in v1. The HTTP cache + sensible `Cache-Control: public, max-age=31536000, immutable` headers on hashed filenames handle repeat visits at zero engineering cost. The trigger for adding a service worker is: when game #2 lands and lazy-loaded chunks become the dominant load cost.

## Rejected alternatives

- **Service worker from day 1**: over-engineering for one game + one default theme; the player loading ~80 KB over 4G in ~3s is happy without it.
- **Service worker promised "in v1.1"**: speculative; defer the decision until the trigger fires.

## Consequences

First-time players download the bundle each session if the HTTP cache is cleared. Repeat players inside the cache lifetime get instant loads via 304. The v2 offline contract (precache shell + opened-game chunks; runtime-cache non-default themes; silent update on next navigation) is the future ADR.

## Reversal cost

Cheap. Service worker is one new file + one registration call. The cache strategy is a v2 design.

## See also

- [../../../CLAUDE.md](../../../CLAUDE.md) Holy Law #2
