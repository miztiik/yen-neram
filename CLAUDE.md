# CLAUDE.md - yen-neram Engineering Contract

**Last Updated**: 2026-06-07

Non-negotiable contract for any human or AI agent working in this repo.

You are a game development agent.

## 0. User Approval

User approval supersedes every agent and every rule in this file. Amend conflicting rules in the same commit.

## 0a. Non-Goals

- **Accessibility** (a11y / ARIA / WCAG / axe-core / contrast-ratio tooling / screen-reader hints). Descoped at project level. No a11y deps, assertions, agent doctrine, or `aria-*` enforcement. Re-scope by editing this entry.
- **Production backend.** See Holy Law #1.
- **Account systems** (login, signup, email collection, cross-device sync that requires a server). Game state is `localStorage` / `IndexedDB` only.
- **Push notifications.** The player decides when to play.
- **Runtime telemetry / analytics SDKs / third-party scripts that fetch at runtime.** Static-first means no runtime calls home. Measure perf locally in DevTools.
- **Monetisation patterns** (ads, IAP, timers, lives-with-IAP, pay-to-skip, streak-savers). This is a hobby project; if it ever needs monetisation, the contract changes first.

## 1. Holy Laws (Read First, Every Session)

1. **Static-first production.** Deployed game is a static bundle on GitHub Pages. No production backend. Everything the game needs at runtime ships in the bundle.
2. **The player's phone is the architecture.** Every runtime decision is measured against: input-to-photon <50ms, sustained 60fps (frame budget 16.7ms, game-logic budget ~4ms), <50KB shell + declared total-bundle cap, on a mid-tier Android (Snapdragon 6-series, 4GB RAM, ~2022 vintage) over patchy 4G. The target device is the contract; features bend to it. (See `.github/agents/carmack.agent.md`.)
3. **Contracts before logic.** Every persisted shape - save format, level data, asset manifest - gets a typed schema before logic is written.
4. **docs/ = agent memory.** Every design decision, however granular, is documented in the same commit as the code. Default home: `docs/architecture/<area>/` or `docs/concepts/`.
5. **Structural fixes only.** No band-aids, no monkey patches, no "temporary" hacks. Escalate the correction level instead.
6. **No hardcoding.** Tunable knobs (game-balance numbers, asset paths, difficulty thresholds) live in `config/`; schema-validated.
7. **No mocks unless asked.** Real implementations and real fixtures. Mocks only on explicit user request or for genuinely untestable external boundaries (DuckDB-style WASM modules in unit tests, `fetch` in loader unit tests).
8. **Open source first.** Prefer mature OSS over custom builds. Every dependency must name a beneficiary feature and its byte cost.
9. **Tests ship with the feature.** Behaviour-changing commit lands with tests. Full suite green at merge.

## 2. Path Rules

For anything leaving the process (JSON, logs, asset manifests, agent memory, error messages, doc cross-links):

- Relative paths only. No absolute paths. No drive letters.
- POSIX separators only (`/`). Never `\`.
- Minimal reconstructable form.

In-memory `Path` objects for local I/O may stay platform-native. Rule applies at the moment a path leaves the process.

## 3. Repository Topology

| Directory         | Status     | Purpose                                                                                                                           |
| ----------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md`       | created    | This file                                                                                                                         |
| `README.md`       | TBD        | Entry point                                                                                                                       |
| `docs/`           | partial    | Canonical knowledge (Diataxis tiers, 3-level depth)                                                                               |
| `.github/agents/` | created    | Persona advisors (Carmack, Fowler, Jony, Palm, Player)                                                                            |
| `config/`         | TBD        | Human-edited tunable knobs (game balance, level thresholds)                                                                       |
| `src/`            | TBD        | Game source. Exact layout (TypeScript / Svelte / vanilla, components/, scenes/) decided by Fowler + Carmack on the first real PR. |
| `assets/`         | TBD        | Source assets pre-pipeline (raw textures, models, sounds). Never read directly by the game.                                       |
| `tools/`          | TBD        | Build-time asset pipeline (`gltf-pipeline`, `basisu`, sound compression).                                                         |
| `public/`         | TBD        | Static files served as-is (`index.html`, favicon, web manifest, service worker).                                                  |
| `dist/`           | gitignored | Built bundle for GitHub Pages.                                                                                                    |
| `tests/`          | TBD        | Unit / contract / integration / e2e tests (section 13).                                                                           |
| `TODO/` `notes/`  | optional   | Working scratchpads - non-authoritative.                                                                                          |

Folders are created only when real code is about to land. The first real PR picks the build tool (Vite / esbuild / plain), the language (TypeScript / vanilla), and the component layer (Svelte / vanilla); those picks land alongside the code, not as speculative scaffolding.

## 4. Layer and Dependency Rules

- `src/` MUST NOT depend on a runtime backend service.
- Asset-pipeline scripts in `tools/` produce files into `public/assets/` (or equivalent) at build time. The game reads only pipeline output, never raw `assets/` sources.
- The game canvas is one DOM element styled by Tailwind to fit its container. **Tailwind does NOT style canvas internals** - those are the renderer's job. (Jony worldview #6, Carmack worldview #20.)
- Game / domain code MUST NOT import build tools.
- Long compute (physics step on many bodies, pathfinding, procedural generation) runs in a Web Worker. The main thread keeps painting.

## 5. Documentation Discipline

- Diataxis tiers under `docs/`: `architecture/`, `how-to/`, `concepts/`, `reference/` (+ `getting-started/`, `archive/`, `research/`).
- Max depth: `docs/<tier>/<topic>/<file>.md`.
- Every doc: H1 title, `Last Updated: YYYY-MM-DD`, "See also" cross-links.
- One concept defined once; everywhere else links to it.
- ASCII-only in all repo text: commit messages, docs, code comments, log strings, agent markdown, CLI output (use `-`, `->`, `>=`, "section", "INR"). No curly quotes, em-dashes, or non-ASCII symbols. Applies going forward; no retroactive fixing.
- Agent memory (`AGENTS.md`, `/memories/repo/`) is derived, not authoritative; if it disagrees with `docs/`, docs win.
- Open questions live in the active plan-doc under `TODO/`, not in this file.
- Docs-only PRs are a code smell.

## 6. Correction Levels

| Level | Scope                                                      | Workflow                              |
| :---: | ---------------------------------------------------------- | ------------------------------------- |
|   0   | Comments, typos, log strings                               | Direct fix                            |
|   1   | 1 file, ~50 lines, isolated bug                            | Direct fix                            |
|   2   | 1-2 files, explicit behavior change                        | Plan -> execute once scope is clear   |
|   3   | 2-3 files, cross-cutting                                   | Plan -> phased execution              |
|   4   | 4+ files, structural                                       | Propose breakdown first               |
|   5   | Core design / save format / renderer / physics-engine pick | Design consultation only - pause work |

When in doubt, choose the higher level.

## 7. Debug Logging

- Temporary logs MUST be prefixed `[DEBUG]`.
- Before finalizing: grep for `[DEBUG]` and remove every match. Re-run tests after cleanup.

## 8. Git Hygiene

User saying finish / ship / merge authorizes the normal reversible git workflow: inspect, named branch, stage exact paths, commit, push, gates, merge.

Avoid (broad / lossy / history-rewriting):

- `git stash`
- `git reset --hard`
- `git clean -fd`
- `git checkout .` / broad `git restore .`
- `git add .` / `git add -A`
- `git push --force` / `git push --force-with-lease`
- Amending pushed commits
- Leaving a merged PR's remote branch undeleted or its `: gone]` local tracking branches unpruned.

Safe workflow: `git status --porcelain`, leave unrelated dirty files alone, stage only explicit paths, verify with `git diff --cached --name-only`, small reversible commits on a named branch, push, merge after gates pass.

Commit messages describe the change. **No AI co-author / attribution tags.**

## 9. Definition of Done

- [ ] Tests added/updated at the tier appropriate to the surface (section 13). No mocks per Holy Law #7.
- [ ] Full suite green locally before commit.
- [ ] Lint, type-check, tests all pass.
- [ ] For runtime changes: smoke-tested via integrated browser tools per section 12 - including a perf check against the target device profile when the change touches the render loop, physics, or asset load.
- [ ] Canonical docs updated in `docs/` (right tier).
- [ ] Schemas bumped/migrated if any persisted contract changed (save format, level data, asset manifest - section 11).
- [ ] Module `AGENTS.md` updated if structure or invariants changed.
- [ ] No `[DEBUG]` markers left.
- [ ] No new hardcoded values.
- [ ] No new mocks unless explicitly requested.
- [ ] Lockfiles in sync with manifests.
- [ ] Bundle-size budgets respected (shell <50KB gzipped; total-bundle within the declared cap).
- [ ] Frame budget respected (no new feature drops the target device profile below 60fps).
- [ ] Every new asset names its license in the asset manifest.

## 10. Anti-Patterns (Do NOT)

- Reinterpret, downgrade, substitute, or scope-narrow a source or instruction the user named explicitly, without surfacing it as a scope change for sign-off (STOP-AND-SURFACE).
- Assume a backend exists in production.
- Hardcode game-balance values, asset paths, level-difficulty thresholds, magic strings. They live in `config/`.
- Store absolute / backslash paths in any persisted artifact.
- Build custom HTTP / retry / parsing / validation / physics / rendering / particle systems when a mature OSS library exists. Justify any custom build against the OSS alternative.
- Swallow exceptions or silently coerce invalid input - fail fast at the boundary.
- Mock in tests by default.
- Run a renderer / physics step / animation on the main thread when it can be offloaded to a Web Worker.
- Use `setTimeout` / `setInterval` for game-loop timing. Use `requestAnimationFrame`.
- Ship a layout-triggering CSS animation when `transform` + `opacity` will do.
- Style canvas internals with Tailwind. Tailwind is for the chrome (HUD, menu, modal); the canvas is the renderer's job.
- Commit raw source assets (`.obj`, 4K PNG, uncompressed WAV) into the served bundle. Run them through `tools/` first (`gltf-pipeline` for mesh, `basisu` / KTX2 for texture, ogg/opus for audio).
- Ship an asset without naming its license in the asset manifest.
- Add a runtime telemetry / analytics / error-tracking SDK.
- Add a monetisation pattern (ads, IAP, timers, lives-with-IAP, pay-to-skip, streak-savers).
- Ship a feature that depends on a runtime backend, account, or push notification.
- Add a framework / library / build tool without naming the bytes it adds and the beneficiary feature.
- Pick the renderer / physics engine in isolation. Carmack (Engine & Runtime) picks both together, with the dimensionality, body-count budget, and determinism requirement named in writing.
- Mint a new save-format / level-data field without bumping the version and writing the read-side migration in the same commit.
- Lower the perf target to fit a feature. The target is the player's phone, not the feature - if the feature can only run at 20fps on the target device, the feature is removed or simplified.
- Let `TODO/`, chat logs, `AGENTS.md`, or `/memories/` become the source of truth for architecture.
- Pre-create empty modules "for later".
- Skip the docs update.

## 11. Schema Versioning

The persisted surfaces yen-neram cares about:

- **Save format** (`localStorage` / `IndexedDB` JSON) - owned by the game; consumed by the next version of the game. Older saves must continue to load (one or two versions back) or be migrated on read.
- **Level data** (per-level JSON shipped in the bundle).
- **Asset manifest** (the index of in-bundle assets + their licenses).

Each gets a typed schema before logic is written (Holy Law #3). Each carries a `version` field. Bump rules:

- **Minor** (additive, backwards-compatible).
- **Major** (removed field, type change, semantic shift) - write the read-side migration that the new version of the game runs on older payloads. Same commit.

A player whose save from yesterday no longer loads today is a contract break and a release blocker.

## 12. UI Verification (Browser Smoke)

Any runtime change MUST be verified by the agent using integrated browser tools, not deferred to the human.

Minimum loop:

1. Confirm dev server up; start if not.
2. Navigate to affected route(s) plus one cross-route smoke.
3. Read page console; confirm zero new `[error]` events and zero new `404`.
4. If layout-sensitive: screenshot to confirm visual intent.
5. If perf-sensitive (render loop, physics, asset load): open DevTools Performance, throttle CPU 4x + Network "Slow 4G", record an interaction, confirm the relevant Carmack budget (worldview #9-15).
6. Only then mark done.

Does not apply to pure tooling / docs / schema-only changes.

## 13. Test Coverage Policy

Four tiers - **Unit / Contract / Integration / End-to-end**. Change without an appropriate-tier test in the same commit is a Definition-of-Done failure. Mock carve-outs: (a) `fetch` in loader unit tests, (b) DuckDB-style WASM modules in unit tests, (c) explicit user request.

Per tier:

- **Unit** - pure functions (math, score, level validation, save-data serialization round-trip).
- **Contract** - the schemas (save format, level data, asset manifest) vs the readers and the writers.
- **Integration** - game logic + renderer + physics engine working together at a level boundary, with real fixtures.
- **End-to-end** - Playwright (or equivalent) drives the actual game in a real browser. Cover at minimum: first-load to playable, one level start-to-win, save-and-reload preserves progress.

No pytest / vitest / playwright test fetches the network at runtime - use local fixtures.

## 14. Agent Roster

Five persona advisors live under `.github/agents/`, each at a distinct altitude:

| Agent                               | File               | Altitude                                                              |
| ----------------------------------- | ------------------ | --------------------------------------------------------------------- |
| Player                              | `player.agent.md`  | mental model of the median casual-game player                         |
| Jony (UI/UX)                        | `jony.agent.md`    | game chrome (HUD, menu, modal, settings)                              |
| Palm (Casual Design)                | `palm.agent.md`    | game verb / level shape / progression curve                           |
| Fowler (Architecture & Engineering) | `fowler.agent.md`  | architecture + contracts + commits + tests                            |
| Carmack (Engine & Runtime)          | `carmack.agent.md` | renderer + physics + asset pipeline + frame budget + bundle + offline |

Rule: adding a new agent requires justifying a distinct altitude not already covered. Two agents at the same altitude collapse into one (see Fowler's 4-head construction).
