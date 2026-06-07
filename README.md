# Yen-Neram

Static-bundle multi-game shell on GitHub Pages. First game: 5-in-a-row.

**Status**: Pre-alpha. v1 in progress per [TODO/2026-06-07-v1-shell-and-5-in-a-row.md](TODO/2026-06-07-v1-shell-and-5-in-a-row.md).

## Quickstart

```bash
pnpm install
pnpm dev
pnpm test
pnpm build
```

## Architecture

- Engineering contract: [CLAUDE.md](CLAUDE.md)
- Architecture decisions: [docs/architecture/decisions/](docs/architecture/decisions/)
- Concepts: [docs/concepts/](docs/concepts/)

## Bundle budgets

Enforced in CI via `size-limit` (see [apps/frontend/.size-limit.json](apps/frontend/.size-limit.json)).

- Shell cap: 50 KB gzipped (per [CLAUDE.md](CLAUDE.md) section 1, Holy Law 2).
- First-playable-frame cap: 150 KB gzipped (v1 cap).
- Check locally: `pnpm -F frontend size`
- Debug a regression: `pnpm -F frontend size:why`

## License

No `LICENSE` file. Per [ADR-0016](docs/architecture/decisions/0016-license-removed.md) the codebase is all-rights-reserved by default. Theme assets retain per-manifest licenses.

## See also

- [CLAUDE.md](CLAUDE.md) - the engineering contract (Holy Laws + Non-Goals).
- [docs/how-to/ship-a-pr.md](docs/how-to/ship-a-pr.md) - the PR lifecycle every change follows.
- [docs/how-to/distill-a-plan.md](docs/how-to/distill-a-plan.md) - what happens to lessons after a PR merges.
