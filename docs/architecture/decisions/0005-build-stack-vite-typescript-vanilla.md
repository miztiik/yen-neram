# ADR-0005: Build stack - Vite + TypeScript + vanilla (no framework) + pnpm

**Last Updated**: 2026-06-07
**Status**: Accepted
**Born in**: PR 1 (`chore/scaffolding-and-adrs`)

## Context

CLAUDE.md section 3 says the first real PR picks the build tool, the language, and the component layer. The shell is a small static surface (6 tiles + a modal); the first game is 5-in-a-row whose UI is one mutating SVG. Bundle target: shell <50 KB gzipped on the target device profile (Holy Law #2).

## Decision

Vite (build tool), TypeScript with `strict: true` (language), no UI framework - vanilla DOM for the shell, inline SVG for the game. pnpm (package manager). Vitest (test runner; native Vite integration). Playwright (e2e). Zod (runtime schema validation). ESLint 9 + Prettier (linting and formatting).

## Rejected alternatives

- **Vanilla esbuild without Vite**: loses HTML transforms, asset hashing, and code-splitting plumbing; we would reimplement them.
- **Svelte for the shell**: ~3 KB runtime + per-component bytes do not earn themselves at 6 tiles; re-open at v2 if the shell genuinely grows.
- **Solid**: same verdict as Svelte - real but unearned.
- **Plain JavaScript without TypeScript**: forecloses Holy Law #3 (typed schemas before logic).
- **npm or yarn**: pnpm is faster, monorepo-friendly when game #2 lands, and the lockfile pinning is cleaner.

## Consequences

Dynamic `import()` for per-game code-splitting works out of the box. `tsc --noEmit` is the contract gate in CI. Schema files (Zod) live in `src/shared/schemas/`. Future framework migration (if Svelte ever earns its place) is bounded to the shell, not the games.

## Reversal cost

Medium. Swapping build tools touches `vite.config.ts` + every dynamic-import path. Adding a framework later is per-surface (shell-only, game-only) and bounded.

## See also

- [../../../CLAUDE.md](../../../CLAUDE.md) section 3 (Repository Topology), section 10 (anti-pattern: add a framework only with named bytes + beneficiary feature).
