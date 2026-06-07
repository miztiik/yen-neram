# ADR-0016: License removed; codebase is all-rights-reserved

**Last Updated**: 2026-06-07
**Status**: Accepted
**Born in**: v2 wave 3 (`feat/v2`)
**Supersedes**: ADR-0008 (CC0)

## Context

ADR-0008 picked CC0 1.0 for both code and assets. In v2 wave 3 the user
decided to remove the `LICENSE` file. Per CLAUDE.md sec 0 (user approval
supersedes every agent and every rule), the rule that mandated CC0 is
amended in the same commit.

## Decision

No `LICENSE` file at the repo root. Without an SPDX-recognized license,
GitHub and most package registries treat the codebase as
**all-rights-reserved**: the author retains exclusive copyright; nobody
may legally copy, modify, redistribute, or build on the code without
explicit permission.

`package.json` "license" fields are set to `"UNLICENSED"` (the npm
convention for "this package is intentionally not open-source").

Theme asset manifests under `apps/frontend/public/assets/themes/<id>/manifest.json`
retain their per-asset `license` field. Those manifests still say
`"CC0-1.0"` because they describe the original asset provenance (the
motifs we drew in-house we are happy to keep public-domain even when
the surrounding code is not). The two boundaries are intentional.

## Rejected alternatives

- **Keep CC0** - the user's explicit call was to remove the LICENSE.
- **Switch to MIT or Apache 2.0** - the user's choice was deletion, not
  replacement. A future PR can re-add a license; the cost is one file +
  one ADR.
- **Drop the per-asset CC0 claims too** - costs nothing to keep; the
  per-asset metadata is useful provenance even if the codebase is closed.

## Consequences

The project becomes legally proprietary. Forks are still possible on
GitHub (fork-button is a platform feature) but redistribution is not
sanctioned. Bots that read SPDX headers will tag the repo as
"non-OSI". Contributors must be granted permission explicitly.

The asset manifests remain CC0 so the SVGs themselves can be reused
independently of the codebase, if anyone ever asks.

## Reversal cost

Cheap. Re-add a `LICENSE` file at the repo root + update
`package.json` "license" fields + amend or supersede this ADR. The
codebase's history is not rewritten.

## See also

- [0008-license-cc0.md](0008-license-cc0.md) (superseded).
- [../../../CLAUDE.md](../../../CLAUDE.md) section 0 - user approval supersedes
  every agent and every rule; conflicting rules are amended in the same
  commit (which is this PR).
