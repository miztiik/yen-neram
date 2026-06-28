# UI Contract

**Last Updated**: 2026-06-29

Yen-Neram keeps basic semantic UI and keyboard navigation in scope without adding framework-level accessibility tooling.

## In Scope

- Real semantic landmarks and headings for app surfaces.
- Real buttons for interactive controls.
- Visible focus rings for keyboard navigation.
- Keyboard reachability for every interactive surface.
- Clear labels for icon-only controls.
- `aria-*` attributes only where native semantics need clarification.
- Screen-reader-friendly names for buttons and important changing state.

For the SVG board, keyboard navigation is part of the board contract: focus the board, move between cells, select or move with Enter/Space, and release focus with Escape.

## Out Of Scope

- axe-core, jest-axe, Pa11y, Lighthouse CI, or other accessibility audit dependencies.
- Automated WCAG/contrast conformance gates.
- Mandatory manual NVDA or VoiceOver release gates.

The line is design-level semantics yes, framework/audit tooling no.

## See also

- [../concepts/5-in-a-row-board-and-input.md](../concepts/5-in-a-row-board-and-input.md) - board input contract.
- [../../CLAUDE.md](../../CLAUDE.md) - project non-goals and holy laws.
