# Documentation Structure

**Last Updated**: 2026-06-07

How `docs/` is organised, and where a new statement of project knowledge belongs. Companion to [CLAUDE.md](../../CLAUDE.md) §5 (Documentation Discipline) - this doc defines the *placement rules*; CLAUDE.md §5 defines the *constraints* (ASCII, single source of truth, no duplicate definitions).

## Diataxis tiers

Every document belongs to exactly one tier:

| Tier | Directory | Reader question |
| --- | --- | --- |
| Architecture | `docs/architecture/` | Why is it designed this way? |
| How-to | `docs/how-to/` | How do I perform a specific task? |
| Concepts | `docs/concepts/` | What is this concept / vocabulary? |
| Reference | `docs/reference/` | What are the exact options / values / contracts? |

Support tiers:

- `docs/getting-started/` - onboarding entry points.
- `docs/archive/` - historical / superseded material.

## Depth rule (maximum 3 levels)

- Allowed: `docs/<tier>/<topic>/<file>.md`
- Forbidden: `docs/<tier>/<topic>/<subtopic>/<file>.md` or deeper.

A topic that needs deeper nesting is two topics. Split it.

## Required elements (every doc)

- One H1 title.
- `**Last Updated**: YYYY-MM-DD` line directly under the title.
- "See also" callout with cross-tier links (architecture <-> how-to <-> concepts <-> reference).
- Content that stays in its tier (no mixed-purpose docs).
- ASCII only - see CLAUDE.md §5.

## Doc-class routing contract

Within the architecture tier, four typed classes exist. Each has one audience, one mutability rule, one allowed content type, and one forbidden content type. Routing is enforced at PR review time, not by tooling.

| Class | Path pattern | Audience | Mutability | Contains | Forbidden |
| --- | --- | --- | --- | --- | --- |
| **ADR** | `docs/architecture/decisions/NNNN-*.md` | Future agent debugging *why* | Immutable once Accepted (Status field flips only) | One decision + rejected alternatives + reversal cost + consequences | Implementation detail; current-state snapshot |
| **Subsystem doc** | `docs/architecture/<area>/*.md` | Engineer extending the subsystem | Living snapshot (edit in place) | Shape, layout, contracts, invariants, write/read paths | Rationale prose; rejected alternatives |
| **Concept doc** | `docs/concepts/*.md` | Anyone learning project vocabulary | Living, terse | One term, defined once, with cross-links | Duplication of any term defined elsewhere |
| **Plan-doc** | `TODO/<YYYY-MM-DD>-<slug>.md` | Next person picking up work | Single-snapshot (no stacked headers) | Phase status, active PR breakdown, TBD list, pointers | Rationale prose; decisions; rejected alternatives |

### Routing rules (decide a new statement's home)

1. Has a credible rejected alternative with non-trivial reversal cost AND cross-cuts multiple subsystems? -> **New ADR.**
2. Current shape / layout / contract of one subsystem? -> **Subsystem doc.** Cite the ADR for rationale; do not restate it.
3. Vocabulary term used across multiple subsystems? -> **Concept doc.** Defined once.
4. "Which PRs land when"? -> **Plan-doc.** Cite both ADR and subsystem doc; carry no rationale.
5. Step-by-step procedure an operator runs? -> **How-to doc.** Cite the ADR or subsystem doc for *why*.

### Cross-doc consistency mechanism

- ADRs are source-of-truth events. Once Accepted, the decision text is immutable; only the Status field changes.
- Subsystem docs link UP to the ADR(s) that birthed each invariant (inline `(per ADR-NNNN)`).
- Plan-docs link ACROSS to both (`**Spec**:` + `**Decision rationale**:`).
- Concept docs link laterally and DOWN to operationalising subsystem docs.

### Plan-doc single-snapshot rule

The top of a plan-doc is exactly one block - title, Last Updated, and one-paragraph Status. Previous status text is **deleted** at every phase boundary. Stacked "previous header" layers are a band-aid for missing snapshot semantics and are forbidden by CLAUDE.md Holy Law #5. History lives in `git blame` and merge-commit titles.

## See also

- [CLAUDE.md](../../CLAUDE.md) §5 (Documentation Discipline) - the constraints every doc honours.
- [how-to/ship-a-pr.md](../how-to/ship-a-pr.md) - the PR lifecycle that triggers doc updates.
- [how-to/distill-a-plan.md](../how-to/distill-a-plan.md) - how a finding in a plan-doc gets lifted into the right canonical home.
