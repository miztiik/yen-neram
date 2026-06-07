# ADR-0008: License is CC0 1.0 Universal (code and assets)

**Last Updated**: 2026-06-07
**Status**: Accepted
**Born in**: PR 1 (`chore/scaffolding-and-adrs`)

## Context

Yen-Neram is a hobby project. The license affects whether contributors can build on it, whether assets can be sourced from CC0 libraries, and whether forks can be relicensed.

## Decision

CC0 1.0 Universal for code and assets both. The `LICENSE` file at the repo root carries the full CC0 legal text or a short pointer to it. Every motif source in `assets/themes/` declares `license: "CC0-1.0"` in its manifest. The asset pipeline fails the build if any asset is missing a license field.

## Rejected alternatives

- **MIT**: permissive but still asserts copyright; CC0 is more permissive.
- **Apache 2.0**: verbose; patent grant unnecessary for a hobby game.
- **Proprietary**: defeats the hobby-open-source intent.
- **Mixed MIT-code + CC0-assets**: adds a license boundary inside one repo for no benefit.

## Consequences

Anyone can fork, modify, redistribute, or relicense any part of the project without attribution. Assets can be freely sourced from CC0 libraries (Kenney, OpenGameArt CC0 collection). License compliance is one line per asset manifest entry.

## Reversal cost

Cheap forward (CC0 -> any restrictive license for future commits). Impossible backward - past CC0 commits remain CC0 forever.

## See also

- [../../../CLAUDE.md](../../../CLAUDE.md) section 10 (every new asset names its license)
