# v1: shell + 5-in-a-row

**Last Updated**: 2026-06-07

**Status**: v1 COMPLETE. All 8 PRs landed on branch `feat/v1-skeleton` (11 commits). Game playable end-to-end: portal -> mode picker -> 9x9 board with Fruit Ninja motifs on dark navy + dot-grid -> tap-tap input -> animated motif selection -> turn loop with length-graded + intersection + cascade scoring -> per-game save -> settings drawer (theme picker, reduce-motion, path-preview, mode-switch, how-to-play, top-10 leaderboard, reset/clear) -> Max-Points daily-seed flow. Gates: typecheck OK, lint 0 warnings, **167/167 unit + contract**, **18/18 Playwright e2e**, build ~30 KB gz first-playable-frame (under 50 KB Holy Law, far under 150 KB v1 cap). ADRs 0001-0010 in `docs/architecture/decisions/`. Per CLAUDE.md sec 12, browser smoke verified manually in integrated browser (portal renders, mode picker renders, board renders with motifs + previews, settings drawer opens with all 6 sections).

## Scope

Ship the Yen-Neram portal shell (3x2 / 2x3 responsive tile grid, 6 tiles, 5 placeholders) plus the first game tile: 5-in-a-row (9x9 Color Lines clone, two modes — Infinite + Max-Points, 6 silhouettes, 3 themes). Static bundle on GitHub Pages. CC0. No backend, no sound, no account, no telemetry.

## Active PRs

The 8 PRs ship in this order. Dependencies in column 4. A row stays `Open` until its merge SHA lands on `main`; on close it gets a `CLOSED YYYY-MM-DD (PR #NNN)` sub-section per [ship-a-pr.md](../docs/how-to/ship-a-pr.md). Findings distil per [distill-a-plan.md](../docs/how-to/distill-a-plan.md) on close.

| #   | Branch                             | Status  | Depends on                   | Ships                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ---------------------------------- | ------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `chore/scaffolding-and-adrs`       | Open    | -                            | Vite + TypeScript + vanilla + Vitest + Playwright + Zod + ESLint + Prettier + pnpm + GitHub Actions CI + LICENSE (CC0) + ADRs 0001-0008 + base concept docs + folder skeleton.                                                                                                                                                                                                                                                              |
| 2   | `design/motif-silhouette-sketches` | Open    | -                            | 5 candidate silhouette sets (Gemstones, Glyphs, Pure Geometric, Origami, Tropical Fruits) as 30 SVG files under `reference images/sketches/`. Design review artefact only; no commit to `assets/` until pick.                                                                                                                                                                                                                               |
| 3   | `feat/shell-portal-and-routing`    | Blocked | PR 1                         | Shell HTML + Tailwind + portal tile grid (3x2 landscape, 2x3 portrait, square 1:1) + path router (`/play/<slug>/`) + GH Pages 404 fallback + `tools/build-game-manifest.mjs` aggregator + 5 placeholder tile silhouettes (generic abstract) + per-game `manifest.json` schema.                                                                                                                                                              |
| 4   | `feat/5-in-a-row-engine`           | Blocked | PR 1                         | Pure engine: board state, BFS pathfinder, line-detect (4 axes), scoring (length-graded + intersection + cascade), seeded RNG, save reader/writer (schema_version 1), mode-state tagged union. Unit + contract tests. `config/games/5-in-a-row/balance.json` for tunable knobs (N=10 top-scores, motif count = 6, scoring constants).                                                                                                        |
| 5   | `feat/5-in-a-row-ui`               | Blocked | PR 1, PR 2 (user pick), PR 4 | SVG board renderer + motif `<symbol>` sprite + HUD (top: score + next-3 preview; bottom: back + undo + pause) + theme system (1 default theme inline, BAKED sprites) + selected-motif feedback (lift + halo + 2s loop) + animations (slide 150ms / bounce 200ms / shake 200ms / clear 400ms / pulse 600ms) + first-launch ghost hint + long-press path preview (500ms).                                                                     |
| 6   | `feat/5-in-a-row-modes`            | Blocked | PR 4, PR 5                   | Mode-picker screen (first launch only; remembers afterwards). Infinite mode (classic fail-state). Max-Points mode (client-derived daily seed `hash('yen-neram-5inarow-' + YYYYMMDD)`, local-midnight rollover, unlimited attempts, best-of-day = today's PB). Unsolvable-detector + re-roll.                                                                                                                                                |
| 7   | `feat/settings-and-highscores`     | Blocked | PR 5, PR 6                   | Pause drawer: theme picker (modal grid, hot-swap with 200ms cross-fade), reduce-motion toggle, path-preview toggle (default ON), reset-game (confirm), clear-high-scores (confirm), how-to-play modal, mode switcher, next-3-preview toggle. Top-10 leaderboard modal with mode-tabs (`yn:game:5-in-a-row.top_scores[]`, N from `config/`). Reduce-motion halves all animation durations. Additional 2 themes (alt + distinctive) wired in. |
| 8   | `feat/e2e-and-deploy`              | Blocked | PR 3, PR 7                   | Playwright e2e flows: first-load to playable; one turn updates state; save-and-reload preserves; portal↔game preserves save; 404 SPA fallback on deep route; mode-picker first launch; long-press path preview; theme hot-swap mid-session. CPU 4x + Slow-4G throttling perf check against frame budget (per ADR-0004). GH Pages deploy action. README.                                                                                     |

### Per-PR Definition of Done

Each PR honours [CLAUDE.md](../CLAUDE.md) §9 (DoD) + §12 (UI Verification) + §13 (Test Coverage Policy):

- Tests at the appropriate tier, no mocks beyond CLAUDE.md carve-outs.
- Lint + type-check + tests green.
- Bundle budgets respected (shell <50KB gz; total cap 150KB).
- Frame budget respected (input-disabled-during-animation rule; no rAF in v1).
- Schemas bumped + migrations written in same commit if any persisted shape changed.
- Docs updated in `docs/` at the right tier.
- No `[DEBUG]` markers, no hardcoded values, no mocks unless explicitly carved out.
- Browser smoke per §12 for any runtime change.
- Distillation per [distill-a-plan.md](../docs/how-to/distill-a-plan.md) after merge.

### Orchestration model

Per user direction (2026-06-07): main agent orchestrates only. Code, sketches, tests, ADR drafts are produced by subagents using `runSubagent` (default agent for general engineering work; persona agents — Carmack, Fowler, Jony, Palm — for advisory only). Main agent reviews subagent output, integrates, surfaces to user at checkpoints, never commits without user approval (CLAUDE.md §0).

Checkpoints where main agent pauses for user approval:

1. After PR 2 (motif sketches) — user picks one silhouette set + names 3 themes.
2. After PR 1 + PR 3 (scaffolding + shell visible in browser) — user smoke-tests the empty shell.
3. After PR 5 (UI playable with one mode) — user plays the game first time.
4. Before each PR push to `origin` — user confirms commit message + diff scope.

## ADRs to land

ADRs are immutable-once-accepted decisions with rejected alternatives and reversal cost. Born in PR 1 except where noted.

| ID   | Title                                                                   | Born in |
| ---- | ----------------------------------------------------------------------- | ------- |
| 0001 | Path routing with GH Pages 404 SPA fallback                             | PR 1    |
| 0002 | Per-game localStorage keys + versioned save schema                      | PR 1    |
| 0003 | Mode is a parameter, not a separate game                                | PR 1    |
| 0004 | Renderer: inline SVG + CSS keyframes, zero rAF v1                       | PR 1    |
| 0005 | Build stack: Vite + TypeScript + vanilla + pnpm                         | PR 1    |
| 0006 | Bundle budget + per-game code-split                                     | PR 1    |
| 0007 | No service worker v1 (defer to game #2)                                 | PR 1    |
| 0008 | License: CC0 for code and assets                                        | PR 1    |
| 0009 | Theme pipeline: baked sprites per theme (not runtime CSS-var swap)      | PR 5    |
| 0010 | Daily-seed client-derived, local-midnight rollover, unsolvable detector | PR 6    |

## Subsystem and concept docs to land

| Path                                               | Class     | Born in                                                          |
| -------------------------------------------------- | --------- | ---------------------------------------------------------------- |
| `docs/architecture/runtime/frame-budget.md`        | Subsystem | PR 4                                                             |
| `docs/architecture/runtime/input-and-animation.md` | Subsystem | PR 5                                                             |
| `docs/architecture/assets/theme-pipeline.md`       | Subsystem | PR 5                                                             |
| `docs/architecture/save-format/5-in-a-row.md`      | Subsystem | PR 4                                                             |
| `docs/architecture/routing/shell-and-games.md`     | Subsystem | PR 3                                                             |
| `docs/concepts/multi-game-shell.md`                | Concept   | PR 1                                                             |
| `docs/concepts/game-manifest.md`                   | Concept   | PR 3                                                             |
| `docs/concepts/save-format.md`                     | Concept   | PR 1                                                             |
| `docs/concepts/motif.md`                           | Concept   | PR 5                                                             |
| `docs/concepts/theme.md`                           | Concept   | PR 5                                                             |
| `docs/concepts/game-design-5-in-a-row.md`          | Concept   | PR 6                                                             |
| `docs/how-to/add-a-game-tile.md`                   | How-to    | Deferred until game #2 (would be written from imagination today) |
| `docs/how-to/add-a-theme.md`                       | How-to    | Deferred until theme #4 (same reason)                            |

## Open questions

These are user-decision-required gates. They do NOT block all PRs — they block specific PRs. PR 1 can proceed today; PR 5 cannot start until Q1 + Q2 close.

- **Q1 (blocks PR 5)**: which of the 5 motif silhouette sets ships? Resolved by reviewing PR 2 sketches.
- **Q2 (blocks PR 5 + PR 7)**: names + palettes for the 3 v1 themes. Resolved after Q1.
- **Q3 (blocks PR 3)**: 5 placeholder-tile silhouettes — generic abstract shapes; resolved by sketching alongside Q1.
- **Q4 (does not block v1)**: Yen-Neram branding (logo, app-shell colour, favicon). Placeholder OK for v1 PRs; final asset can land any time before PR 8.
- **Q5 (does not block v1)**: app meta description for HTML `<meta>` + PWA manifest copy.

## Frozen design reference

The full design freeze (motif structure, undo policy, scoring formula, mode shape, save schema sketch, HUD partition, animation timings, etc.) lives in session memory at `/memories/session/yen-neram-design-consultation.md` until the corresponding ADRs and concept docs land. Once PR 1 merges and ADRs 0001-0008 are in `docs/`, the session-memory record is superseded and may be deleted.

## See also

- [CLAUDE.md](../CLAUDE.md) — Holy Laws + Non-Goals + correction levels.
- [docs/how-to/ship-a-pr.md](../docs/how-to/ship-a-pr.md) — the 2-commit-then-squash pattern every PR in this plan follows.
- [docs/how-to/distill-a-plan.md](../docs/how-to/distill-a-plan.md) — how each closed row gets distilled into `docs/`.
- [docs/reference/documentation-structure.md](../docs/reference/documentation-structure.md) — the tier each new doc lands in.
