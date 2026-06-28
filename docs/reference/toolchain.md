# Toolchain

**Last Updated**: 2026-06-29

This is the exact development stack for Yen-Neram. Package manifests and lockfiles remain the executable source of truth; this page explains the intended shape.

## Stack

- Vite builds the static frontend bundle.
- TypeScript is strict and is checked with `tsc --noEmit`.
- The UI is vanilla DOM plus inline SVG for the game board; no component framework is currently in the runtime stack.
- pnpm is the package manager and workspace runner.
- Vitest covers unit and contract tests.
- Playwright covers browser and e2e flows.
- Zod validates runtime schemas for persisted and static JSON contracts.
- ESLint and Prettier own code style.

## Commands

Run from the repository root unless a command says otherwise.

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
pnpm format:check
```

Use `pnpm -F frontend <script>` for frontend-only commands.

## Rejected Stack Shapes

- Plain esbuild without Vite would require reimplementing HTML transforms, asset hashing, and code-splitting plumbing.
- Svelte or Solid do not currently earn their runtime bytes for a small portal and a mutating SVG board.
- Plain JavaScript would weaken the typed-contract rule for saved data and manifests.
- npm or yarn are not the current workspace contract.

## See also

- [../concepts/multi-game-shell.md](../concepts/multi-game-shell.md) - shell and game loading contract.
- [../architecture/runtime/perf-budget.md](../architecture/runtime/perf-budget.md) - bundle and frame budgets.
- [../how-to/ship-a-pr.md](../how-to/ship-a-pr.md) - PR lifecycle.
