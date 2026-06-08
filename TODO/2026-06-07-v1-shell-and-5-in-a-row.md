# v1: shell + 5-in-a-row

**Last Updated**: 2026-06-08

**Status**: PLAN COMPLETE. v1 + v2 + cleanup + deploy lifecycle all landed on `main`. Site live at https://miztiik.github.io/yen-neram/. See `## Plan complete` at the bottom of this file for the merge-SHA ledger and distillation routing. Plan-doc remains as the audit ledger only; do not edit further. New work starts a new plan-doc.

## Scope

Ship the Yen-Neram portal shell (3x2 / 2x3 responsive tile grid, 6 tiles, 5 placeholders) plus the first game tile: 5-in-a-row (9x9 Color Lines clone, two modes — Infinite + Max-Points, 6 silhouettes, 3 themes). Static bundle on GitHub Pages. CC0. No backend, no sound, no account, no telemetry.

## Active PRs

The 8 PRs ship in this order. Dependencies in column 4. A row stays `Open` until its merge SHA lands on `main`; on close it gets a `CLOSED YYYY-MM-DD (PR #NNN)` sub-section per [ship-a-pr.md](../docs/how-to/ship-a-pr.md). Findings distil per [distill-a-plan.md](../docs/how-to/distill-a-plan.md) on close.

| #   | Branch                             | Status  | Depends on                   | Ships                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ---------------------------------- | ------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `chore/scaffolding-and-adrs`       | Open    | -                            | Vite + TypeScript + vanilla + Vitest + Playwright + Zod + ESLint + Prettier + pnpm + GitHub Actions CI + LICENSE (CC0) + ADRs 0001-0008 + base concept docs + folder skeleton.                                                                                                                                                                                                                                                              |
| 2   | `design/motif-silhouette-sketches` | Open    | -                            | 5 candidate silhouette sets (Gemstones, Glyphs, Pure Geometric, Origami, Tropical Fruits) as 30 SVG files under `reference-images/sketches/`. Design review artefact only; no commit to `assets/` until pick.                                                                                                                                                                                                                               |
| 3   | `feat/shell-portal-and-routing`    | Blocked | PR 1                         | Shell HTML + Tailwind + portal tile grid (3x2 landscape, 2x3 portrait, square 1:1) + path router (`/play/<slug>/`) + GH Pages 404 fallback + `tools/build-game-manifest.mjs` aggregator + 5 placeholder tile silhouettes (generic abstract) + per-game `manifest.json` schema.                                                                                                                                                              |
| 4   | `feat/5-in-a-row-engine`           | Blocked | PR 1                         | Pure engine: board state, BFS pathfinder, line-detect (4 axes), scoring (length-graded + intersection + cascade), seeded RNG, save reader/writer (schema_version 1), mode-state tagged union. Unit + contract tests. `src/games/5-in-a-row/balance.json` for tunable knobs (N=10 top-scores, motif count = 6, scoring constants).                                                                                                           |
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

## Plan complete

Closed 2026-06-08. v1 + v2 + cleanup + deploy lifecycle all merged on `main`. Site live at https://miztiik.github.io/yen-neram/.

### Merge ledger

The 8 planned PRs were collapsed into squash-merges on `main` rather than landing serially on `feat/v1-skeleton` (that branch was the staging integration branch, squashed at PR-1 merge time). Subsequent v2 + maintenance + polish + dependency PRs landed as separate squash-merges. The actual main-line history:

| Merge SHA | PR    | Title                                                                                                | Covers                                                                                                            |
| --------- | ----- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| dd302c0   | #1    | v1: Yen-Neram shell + 5-in-a-Row                                                                     | Planned PRs 1-8 (scaffolding, sketches, shell+routing, engine, UI, modes, settings+highscores, e2e+deploy)        |
| 8684655   | #2    | v2 (in progress): monorepo + 3 scopes (polish + depth + production)                                  | Cleanup + monorepo restructure + SVGO + a11y + Timed mode + daily-streak + service worker + license removed       |
| 364f55a   | #12   | fix(ci): remove pnpm version pin (defer to package.json)                                             | CI/deploy unblock (pnpm 9 version conflict)                                                                       |
| 9bc1c7b   | #13   | feat(hud): chip-style HUD + board focus fix (Jony+Palm polish lift)                                  | Chip HUD + ambient pattern + focus-on-arrow-key                                                                   |
| 86644e1   | #14   | fix(spa): dist/404.html byte-identical + peach palette + click/Escape deselect                       | Vite SPA 404-stamp plugin + peach palette + click-outside/Escape deselect                                         |
| 0826b65   | #15   | feat(themes): PNG motifs first-class; per-motif byte cap removed (ADR-0011 amend)                    | PNG motif support + theme-loader fix + per-motif cap removed                                                      |
| (merged)  | #16   | fix(paths): centralise asset URLs (assetPaths module); fixes empty-tiles bug on GH Pages             | `assetPaths` module born; fixes tile-loading on base path                                                         |
| (merged)  | #17   | fix(paths): tile silhouettes resolve through assetPaths.publicAsset                                  | follow-up to #16                                                                                                  |
| (merged)  | #18   | feat(ui): bump preview motif visibility and gate breathe animation behind app pref                   | Preview chip visibility + breathe                                                                                  |
| (merged)  | #19   | chore(ui): shrink PREVIEW_SIZE from 22 to 18                                                         | Visual-hierarchy restore                                                                                           |
| 8061a04   | #20   | feat(ui): reward-loop stacked wave (ADR-0017)                                                        | Reward-loop ceremony                                                                                              |
| 870406a   | #21   | chore(ci): pin pnpm/action-setup version and drop packageManager from root                           | CI hardening                                                                                                       |
| f0ba723   | #22   | chore(deps): bump 5 github actions to current majors                                                 | Dependabot action bumps                                                                                            |
| 2acc6f3   | #23   | feat: HUD clarity + feedback (BEST chip rebind + tier-1 +delta + illegal-move red flash)             | HUD micro-polish                                                                                                  |
| 40db93a   | #24   | chore(theme): upgrade tropical-fruits strawberry motif (PR #24 also has motif-3_1 PNG)               | First PNG motif consumer                                                                                          |
| c56b23f   | #25   | feat: undo + mobile mode-picker fit + Jony score chip + multiplier-vibrant +delta + Palm game-over   | Undo + ceremony + ADR-0018                                                                                         |
| df5c97f   | #27   | feat: cool-slate score + Menu drawer consolidates Back/Restart/Switch mode + hamburger + flame chip  | Menu drawer consolidation + ADR-0019                                                                               |
| 72aa2fe   | #28   | chore(deps-dev): bump typescript 5.9 -> 6.0.3                                                        | TS major bump                                                                                                      |
| a3b066c   | #29   | chore(deps-dev): bump eslint 9 -> 10.4.1                                                             | ESLint major bump                                                                                                  |
| 0a85ed5   | #30   | chore(deps): bump zod 3.25 -> 4.4.3                                                                  | Zod major bump                                                                                                     |
| b1bb867   | #31   | chore(deps-dev): bump tailwindcss 3.4 -> 4.3 + ADR-0020 portal fix                                   | Tailwind 4 + Vite plugin migration + ADR-0020 (`assetPaths.portal()` for Menu nav)                                |

### Distillation routing

All planned ADRs (0001-0010) landed in PR #1's squash, supplemented by v2-era ADRs (0011-0020) born in subsequent PRs:

| ADR  | Title                                                                   | Born in PR     | File                                                                                |
| ---- | ----------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------- |
| 0001 | Path routing with GH Pages 404 SPA fallback                             | #1             | [0001](../docs/architecture/decisions/0001-routing-path-with-404-fallback.md)       |
| 0002 | Per-game localStorage keys + versioned save schema                      | #1             | [0002](../docs/architecture/decisions/0002-save-per-game-localstorage-keys.md)      |
| 0003 | Mode is a parameter, not a separate game                                | #1             | [0003](../docs/architecture/decisions/0003-mode-is-a-parameter-not-a-game.md)       |
| 0004 | Renderer: inline SVG + CSS keyframes, zero rAF v1                       | #1             | [0004](../docs/architecture/decisions/0004-renderer-pick-svg.md)                    |
| 0005 | Build stack: Vite + TypeScript + vanilla + pnpm                         | #1             | [0005](../docs/architecture/decisions/0005-build-stack-vite-typescript-vanilla.md)  |
| 0006 | Bundle budget + per-game code-split                                     | #1             | [0006](../docs/architecture/decisions/0006-bundle-budget-and-codesplit.md)          |
| 0007 | No service worker v1 (superseded by 0015)                               | #1; superseded | [0007](../docs/architecture/decisions/0007-no-service-worker-v1.md)                 |
| 0008 | License: CC0 (superseded by 0016)                                       | #1; superseded | [0008](../docs/architecture/decisions/0008-license-cc0.md)                          |
| 0009 | Daily-seed client-derived                                               | #1             | [0009](../docs/architecture/decisions/0009-daily-seed-client-derived.md)            |
| 0010 | GH Pages base path override (vite `base` from `GH_PAGES_BASE`)          | #1             | [0010](../docs/architecture/decisions/0010-gh-pages-base-path-override.md)          |
| 0011 | SVGO build-time asset pipeline (amended #15: PNG first-class)           | #2; amended    | [0011](../docs/architecture/decisions/0011-svgo-build-time-asset-pipeline.md)       |
| 0012 | PWA manifest without service worker (superseded by 0015)                | #2; superseded | [0012](../docs/architecture/decisions/0012-pwa-manifest-without-service-worker.md)  |
| 0013 | Basic a11y: keyboard + ARIA                                             | #2             | [0013](../docs/architecture/decisions/0013-basic-a11y-keyboard-and-aria.md)         |
| 0014 | Timed mode + daily-streak                                               | #2             | [0014](../docs/architecture/decisions/0014-timed-mode-and-daily-streak.md)          |
| 0015 | Service worker via vite-plugin-pwa (supersedes 0007 + 0012)             | #2             | [0015](../docs/architecture/decisions/0015-service-worker-pwa.md)                   |
| 0016 | License removed (supersedes 0008)                                       | #2             | [0016](../docs/architecture/decisions/0016-license-removed.md)                      |
| 0017 | Motif fills 75% of cell / Reward-loop stacked wave (duplicate ID, 2 files exist) | #20 + later | [0017a](../docs/architecture/decisions/0017-motif-fills-75-percent-of-cell.md), [0017b](../docs/architecture/decisions/0017-reward-loop-stacked-wave.md) |
| 0018 | Undo + mobile mode-picker fit + Jony+Palm polish                        | #25            | [0018](../docs/architecture/decisions/0018-undo-mobile-picker-jony-palm-polish.md)  |
| 0019 | Cool-slate score + Menu drawer + hamburger + flame streak chip          | #27            | [0019](../docs/architecture/decisions/0019-cool-slate-score-menu-drawer-hamburger-flame-streak.md) |
| 0020 | Portal navigation via `assetPaths.portal()`, not literal `/`            | #31            | [0020](../docs/architecture/decisions/0020-portal-navigation-via-base-url.md)       |

Concept docs landed:

| Concept              | Born in PR | File                                                                |
| -------------------- | ---------- | ------------------------------------------------------------------- |
| Multi-game shell     | #1         | [docs/concepts/multi-game-shell.md](../docs/concepts/multi-game-shell.md) |
| Save format          | #1         | [docs/concepts/save-format.md](../docs/concepts/save-format.md)     |

Subsystem docs landed:

| Subsystem doc | Born in PR | File                                                                                  |
| ------------- | ---------- | ------------------------------------------------------------------------------------- |
| Perf budget   | #2         | [docs/architecture/runtime/perf-budget.md](../docs/architecture/runtime/perf-budget.md) |

How-to docs landed:

| How-to doc            | Born in PR | File                                                                  |
| --------------------- | ---------- | --------------------------------------------------------------------- |
| Ship a PR             | (pre-v1)   | [docs/how-to/ship-a-pr.md](../docs/how-to/ship-a-pr.md)               |
| Distill a plan        | (pre-v1)   | [docs/how-to/distill-a-plan.md](../docs/how-to/distill-a-plan.md)     |

### Distillation NOT done (deliberate)

These subsystem and concept docs were planned but not lifted:

- `docs/architecture/runtime/frame-budget.md` -- collapsed into perf-budget.md, no separate file earned its place.
- `docs/architecture/runtime/input-and-animation.md` -- invariants live in the renderer code (board-view.ts CSS animations + `isAnimating` gate); no separate doc earned its place yet.
- `docs/architecture/assets/theme-pipeline.md` -- README at `apps/frontend/public/assets/themes/README.md` is the operator doc; ADR-0011 + amendment cover the rationale. A subsystem doc would duplicate.
- `docs/architecture/save-format/5-in-a-row.md` -- schema-file + concept doc (`save-format.md`) cover the subsystem; a per-game subsystem doc would duplicate the schema file.
- `docs/architecture/routing/shell-and-games.md` -- ADR-0001 + ADR-0010 + ADR-0020 + `multi-game-shell.md` cover routing; a subsystem doc would duplicate.
- `docs/concepts/game-manifest.md` -- the zod schema file IS the source of truth; concept doc would duplicate.
- `docs/concepts/motif.md` -- the README + ADR-0011 + theme-manifest schema cover the term.
- `docs/concepts/theme.md` -- same; covered by README + ADR-0011.
- `docs/concepts/game-design-5-in-a-row.md` -- covered by `how-to-play.ts` in-product help + ADR-0014 (Timed) + ADR-0009 (daily-seed); no separate doc earned its place.
- `docs/how-to/add-a-game-tile.md` -- deferred until game #2 lands (would be written from imagination).
- `docs/how-to/add-a-theme.md` -- covered by `apps/frontend/public/assets/themes/README.md` (the operator README is the how-to).

Per [distill-a-plan.md](../docs/how-to/distill-a-plan.md) "Distilling speculation" anti-pattern: a doc that does not have a real reader is not earned. These can be born when the next PR creates a real need for them.

### Cleanup

- `feat/v1-skeleton` branch deleted (was the staging integration branch; squashed at PR-1 merge).
- `feat/v2` branch deleted (was staging integration; squashed at PR-2 merge).
- Session memory `/memories/session/yen-neram-design-consultation.md`: superseded by ADRs 0001-0020; may be deleted.
- This plan-doc is the audit ledger; new work starts a new plan-doc per [distill-a-plan.md](../docs/how-to/distill-a-plan.md) "Step 5".
