# ADR-0013: Basic ARIA + keyboard nav are IN; framework-level a11y tooling stays OUT

**Last Updated**: 2026-06-07
**Status**: Accepted
**Born in**: v2 production polish pass

## Context

[CLAUDE.md](../../../CLAUDE.md) sec 0a Non-Goals originally descoped
accessibility entirely: "no a11y deps, assertions, agent doctrine, or
`aria-*` enforcement. Re-scope by editing this entry." That blanket
descope conflated two very different costs:

1. **Design-level a11y**: real semantic HTML, labelled buttons,
   landmarks, visible focus rings, keyboard reachability. These are
   ~5-10 ARIA attributes + one keyboard handler + one focus-visible
   CSS rule. They cost zero bytes at runtime and no dev-loop time.
2. **Framework-level a11y tooling**: axe-core / jest-axe / Pa11y /
   lighthouse-ci as CI gates, contrast-ratio auditing, WCAG-conformance
   assertions. These are real dependencies, real CI minutes, and a
   pipeline that needs maintenance.

The v2 production-polish scope picked an "a11y pass". The user choice
re-scopes the cheap half (design-level) and leaves the expensive half
(framework tooling) descoped.

## Decision

Basic ARIA + keyboard nav are IN scope:

- Real semantic HTML (`<main>`, `<h1>`/`<h2>`, real `<button>`s).
- ARIA attributes only where semantics need clarification:
  `role="application"` on the game canvas region;
  `role="grid"`/`role="gridcell"` on the SVG board;
  `aria-label` on tile buttons whose icon-only state would be opaque;
  `aria-disabled` mirroring `disabled` for screen readers that don't
  announce the latter;
  `aria-live="polite"` on score + next-preview so screen readers
  announce mid-game state changes.
- Keyboard reachability of every interactive surface. The SVG board is
  the one place this is non-trivial: `tabindex="0"` + arrow-key
  navigation + Space/Enter as a cell tap + Escape to release focus.
- Visible `:focus-visible` ring (does NOT show on mouse interaction).
- A `.sr-only` utility for visually-hidden screen-reader-only text.

Framework-level a11y tooling stays OUT:

- No axe-core, jest-axe, vitest-axe, Pa11y, lighthouse-ci, or any
  other a11y-audit dependency.
- No tests that assert WCAG conformance.
- No CI workflow that gates merges on contrast ratios or audit scores.
- No NVDA / VoiceOver manual-test gate.

[CLAUDE.md](../../../CLAUDE.md) sec 0a is amended in the same commit:
the original blanket-descope bullet is struck through and re-stated as
the split above (basic IN, framework OUT).

## Rejected alternatives

- **Full WCAG-conformance audit pass**: adds a tooling pipeline that
  doesn't earn its bytes for a hobby game with two interactive surfaces
  (the portal grid and one game).
- **NVDA / VoiceOver manual-test gate before every release**: same
  reason - manual a11y QA on a one-developer hobby project would
  dominate release cost.
- **No a11y at all (the original blanket descope)**: leaves keyboard
  users and screen-reader users with no path through the game. The
  design-level a11y bullets above cost essentially nothing and unlock
  both audiences.

## Consequences

- A keyboard user can play 5-in-a-Row without a mouse: Tab to the
  board, arrow keys to position, Space/Enter to select and move,
  Escape to release focus, Tab to reach Back/Pause.
- A screen reader announces the app name + tile names on the portal,
  the game canvas as an "application", per-cell state on the board,
  and live updates to score + next-preview.
- Bundle impact is below the noise floor (a handful of attributes +
  one CSS utility + one keyboard handler).
- The base contract is met. Tooling-level guarantees (specific WCAG
  levels, contrast ratios) are NOT promised. A future re-scope could
  add framework tooling; that's a separate ADR.

## Reversal cost

Cheap forward (strip the ARIA attributes, remove the keyboard handler,
delete the `.sr-only` and `:focus-visible` rules). Hard backward in
practice - it would be a deliberate user-experience regression and the
re-scoped CLAUDE.md bullet would need to be reverted.

## See also

- [../../../CLAUDE.md](../../../CLAUDE.md) sec 0a Non-Goals (amended).
- [0004-renderer-pick-svg.md](0004-renderer-pick-svg.md) - SVG was
  picked partly because it stays in the accessibility tree
  (canvas-rendered games have to fabricate one).
- [0006-bundle-budget-and-codesplit.md](0006-bundle-budget-and-codesplit.md)
  - the cost ceiling that frames the framework-tooling rejection.
