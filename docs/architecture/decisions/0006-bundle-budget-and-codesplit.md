# ADR-0006: Bundle budget and per-game code-splitting

**Last Updated**: 2026-06-07
**Status**: Accepted
**Born in**: PR 1 (`chore/scaffolding-and-adrs`)

## Context

CLAUDE.md Holy Law #2 caps the shell at <50 KB gzipped on the target device (mid-tier Android, Slow-4G). The architecture hosts multiple games; loading every game's code on shell open would defeat the budget within ~3 games.

## Decision

Total v1 bundle cap is 150 KB gzipped at first-playable-frame of 5-in-a-row. Shell (always-loaded) target: ~17 KB gz (well under the 50 KB cap). Each game is dynamically imported when its tile is entered: `import("./games/<slug>/index.js")`. Per-game payload includes the game's code + its default theme sprite + its schema. Non-default themes are separate files fetched on theme-switch.

## Rejected alternatives

- **Single bundle with all games**: breaches the 50 KB shell cap after ~2 games; player downloads code for games they never open.
- **Per-game MPA (separate HTML files)**: defeats the shared-shell purpose; loses cross-game preferences.
- **No budget**: allows accidental bloat; first regression goes unnoticed.

## Consequences

The shell's responsibility set is fixed: portal grid, router, dynamic-import loader, save-format reader, theme switcher UI, schema-migration runner. Per-game payloads are self-contained behind the dynamic import. CI gates bundle size against the budget (gate to be added when PR 3 lands the shell).

## Reversal cost

Cheap. Removing code-splitting is a Vite config flag + replacing `import()` with static imports.

## See also

- [../../../CLAUDE.md](../../../CLAUDE.md) Holy Law #2, section 9 (Definition of Done: bundle budgets)
- [0004-renderer-pick-svg.md](0004-renderer-pick-svg.md)
