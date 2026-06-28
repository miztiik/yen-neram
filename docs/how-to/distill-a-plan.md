# How to distill a plan-doc

**Last Updated**: 2026-06-07

The procedure for lifting durable findings out of a `TODO/<date>-<slug>.md` plan-doc into the right canonical home under `docs/`. The plan-doc is the work ledger; once a row closes, anything worth keeping past the merge belongs somewhere else.

## When to run

- After any plan-doc row closes (PR merged + status flipped to `Closed` / `Done`).
- Before declaring an entire plan-doc complete.
- When picking up a stale plan-doc and noticing it has grown rationale narrative that belongs elsewhere.

Do NOT run for in-flight rows. Distillation only happens after the finding has stabilised through merge.

## Inputs

- One closed plan-doc row + its `CLOSED` narrative sub-section (per the [ship-a-pr.md](ship-a-pr.md) 2-commit-then-squash stamp pattern).
- The merged commit SHA on `main` (for cross-reference).

## The routing decision

For each finding in the closed row's narrative, apply the routing rules in [../reference/documentation-structure.md](../reference/documentation-structure.md#routing-rules-decide-a-new-statements-home) and route to ONE home:

| Finding shape                                                                                                            | Destination                                                    | Example                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Current gameplay rule, UI shape, tuning invariant, or cross-subsystem vocabulary                                         | **Concept doc** under `docs/concepts/<slug>.md`                | "How does the daily board seed work?" -> `docs/concepts/5-in-a-row-gameplay.md`                    |
| Current shape / layout / contract of one subsystem                                                                       | **Subsystem doc** under `docs/architecture/<area>/<slug>.md`   | "How is the save format laid out on disk?" -> `docs/architecture/save-format/layout.md`            |
| Operator runbook / step-by-step procedure                                                                                | **How-to doc** under `docs/how-to/<verb>-<slug>.md`            | "How do I tune a game-feel knob?" -> `docs/how-to/tune-5-in-a-row.md`                              |
| Architecture choice with actively explored rejected alternatives + non-trivial reversal cost + cross-system consequences | **Architecture decision** under `docs/architecture/decisions/` | "Why Rapier WASM instead of cannon-es for the physics engine?" -> architecture decision + doc link |
| Agent-only execution lesson (gotcha, recurring trap, tool quirk)                                                         | **`/memories/lessons.md`** (memory tool)                       | "the cosmetic gh-merge confirmation pattern"; "PowerShell BOM bites `git commit -F`"               |
| Per-PR audit trail                                                                                                       | **Stays in the plan-doc `CLOSED` sub-section**                 | Diff stat, gate results, discoveries specific to this PR's execution                               |

If a finding fits two destinations, pick the living doc that a future maintainer would search first. Do not create a new architecture decision unless the rejected alternative and reversal cost are both concrete. If it fits none, it probably is not durable - leave it in the plan-doc `CLOSED` sub-section and move on.

## What to distill, what to leave

### Distill

- New invariants the PR established (e.g. "every level JSON carries a `schema_version` field").
- New architecture rationale only when the PR actively explored and rejected a real alternative with meaningful reversal cost.
- New player-facing behaviour rules ("hold-and-drag re-aims the shot until release; tap is a one-frame fire").
- New vocabulary the PR introduced or sharpened.
- New operator procedures the PR exposed gaps in.

### Leave in the plan-doc

- The diff stat, the gate results, the merge commit SHA - these are per-PR execution context, not durable knowledge.
- "Discovery" notes that are PR-specific framing of a finding that has already been distilled. The distilled doc is the source of truth; the plan-doc points to it.
- Anything that was distilled by an earlier PR in the same plan. Do not re-distill.

### Leave nowhere (delete from the plan-doc on close)

- In-flight TODO bullets the row resolved.
- Speculative scope-expansion sketches that did not ship.
- Stacked "previous header" status blocks (the plan-doc has a single-snapshot header per [../reference/documentation-structure.md](../reference/documentation-structure.md#plan-doc-single-snapshot-rule)).

## The mechanics

### Step 1 - read the closed `CLOSED` sub-section

For row `X.Y` in plan-doc `TODO/<date>-<slug>.md`, the merge commit landed a sub-section titled `#### X.Y - CLOSED YYYY-MM-DD (PR #NNN)`. List its discoveries, findings, and audit notes.

### Step 2 - route each finding

For each finding, apply the routing table above. Open the target doc; add the finding in the doc's existing tone and structure (do not paste plan-doc prose verbatim - the plan-doc was action-narrative; the target is reference).

### Step 3 - back-reference

In the plan-doc `CLOSED` sub-section, replace the finding's full text with a one-line pointer:

```
- Finding 1: [now-canonical title](../docs/concepts/<slug>.md) - distilled from this PR.
```

This preserves the audit trail (someone reading the plan-doc later sees what was discovered + where it lives now) without duplicating the content.

### Step 4 - agent-only lessons go to `/memories/lessons.md`

Use the memory tool. Findings that are about _how to do agent work_ (PR-shipping gotchas, command-line quirks, parallelisation traps, recurring failure modes) belong in user memory, not in `docs/`. The line is: `docs/` is for project knowledge a developer would read; `/memories/lessons.md` is for agent execution craft.

### Step 5 - declare the plan-doc closed

When the last live row closes, append a final block:

```
## Plan complete

Closed YYYY-MM-DD. All rows merged. Distillation complete:
- Row X.Y -> [target](path)
- Row X.Z -> [target](path)
- ...

Plan-doc remains as the audit ledger; do not edit further. New work starts a new plan-doc.
```

Do NOT delete the plan-doc. It is the durable record of what was tried, in what order, by which PR - a tree-ring artifact. The distilled findings are the live knowledge; the plan-doc is the history of how they came to be.

## Anti-patterns

- **Plan-doc as the only home for a finding.** A future agent searching `docs/` for the topic will not find the plan-doc; plan-docs are not browseable knowledge. If the finding is durable, lift it to `docs/`.
- **Re-distillation in a later PR.** Once a finding is in `docs/`, later PRs that touch the same area edit the doc directly. Do not re-lift the same finding from a new plan-doc.
- **Distilling speculation.** Only distill what shipped. A considered approach we did not take goes in a living doc's rejected-experiment note unless it is a costly architecture choice that earns a new decision record.
- **Editorial bloat in the lifted doc.** The target doc gets a sentence or two, not the plan-doc's full narrative. If the lifted text is longer than the doc it joins, you are pasting, not distilling.
- **Skipping the back-reference step.** Without the pointer, the plan-doc reads like the finding vanished. The pointer is a one-liner; do it.

## See also

- [ship-a-pr.md](ship-a-pr.md) - the PR lifecycle whose `CLOSED` sub-sections are this runbook's input.
- [CLAUDE.md](../../CLAUDE.md) §5 (Documentation Discipline) - the rules every distilled doc must honour.
- [../reference/documentation-structure.md](../reference/documentation-structure.md) - the Diataxis tier definitions and the doc-class routing contract.
