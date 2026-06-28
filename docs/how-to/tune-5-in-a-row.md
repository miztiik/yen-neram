# How To Tune 5-in-a-Row

**Last Updated**: 2026-06-28

Use this runbook when changing 5-in-a-Row game feel: spawn pacing, tile sizing, clear ceremony, scoring feedback, milestones, shuffle behaviour, or mode parameters.

## Before Editing

1. Read [../concepts/5-in-a-row-gameplay.md](../concepts/5-in-a-row-gameplay.md), [../concepts/5-in-a-row-board-and-input.md](../concepts/5-in-a-row-board-and-input.md), and [../concepts/5-in-a-row-rewards.md](../concepts/5-in-a-row-rewards.md).
2. Identify whether the change is gameplay, rendering feel, save shape, or asset contract. Save and asset contracts need schema handling.
3. Check for an existing balance/config knob before adding a new value. Do not bury tunables in code.

## Edit Rules

- Keep current-state rules in concept docs, not new ADRs.
- Add or change a schema before changing persisted data.
- Keep renderer animation compositor-friendly: transform, opacity, CSS variables, or SVG attributes that do not require a JS animation loop.
- Preserve `motifSize * landPeak <= CELL_SIZE` when changing tile tiers.
- Preserve daily determinism when changing RNG, spawn, undo, or reload behaviour.
- Treat experiments that shipped and got reverted as rejected gameplay notes in the relevant concept doc.

## Tests To Update

Use the narrowest test tier that can catch the behaviour:

- Pure math, scoring, line detection, tile tier invariants, RNG, and schema changes -> unit or contract tests.
- Save reload, mode picker, undo lifecycle, menu controls, and persisted preferences -> e2e tests.
- Rendering feel that depends on real layout -> Playwright screenshot or browser smoke when a test can be stable.

Do not add mocks for game logic. Use real fixtures and deterministic seeds.

## Validation

Run the focused tests for the touched area first. Before merge, run the repo gates appropriate to the change: typecheck, lint, unit/contract tests, e2e for runtime behaviour, format check, and a browser smoke for visual/runtime changes.

Docs-only tuning notes require `pnpm format:check` and a reference grep for stale ADR links.

## See also

- [../concepts/5-in-a-row-gameplay.md](../concepts/5-in-a-row-gameplay.md) - gameplay rules and rejected spawn experiment.
- [../concepts/5-in-a-row-board-and-input.md](../concepts/5-in-a-row-board-and-input.md) - board and input invariants.
- [../concepts/5-in-a-row-rewards.md](../concepts/5-in-a-row-rewards.md) - reward-loop rules.
- [../concepts/save-format.md](../concepts/save-format.md) - persisted state versioning.
