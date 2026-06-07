# ADR-0004: Renderer is inline SVG + CSS keyframes, zero rAF in v1

**Last Updated**: 2026-06-07
**Status**: Accepted
**Born in**: PR 1 (`chore/scaffolding-and-adrs`)

## Context

5-in-a-row is a grid-state puzzle on a 9x9 board (max 81 cells, typical 30-50 motifs). No physics, no continuous simulation, no 3D. Animations are bounded: motif pulse, BFS path trace, land-bounce, clear-flash, score-popup. The target device is a mid-tier Android (CLAUDE.md Holy Law #2) on Slow-4G.

## Decision

Inline SVG for the board and motifs; CSS keyframes/transitions for all animations; zero `requestAnimationFrame` calls in v1 game code. The motif catalogue is rendered as a `<symbol>` sprite per theme; each cell uses `<use href="#motif-rgN">`. Hit-testing uses native DOM events. Tailwind styles the shell chrome only (CLAUDE.md section 4); board SVG has its own scoped CSS.

## Rejected alternatives

- **Plain DOM divs + CSS**: works for cells, but the BFS path trace needs an overlay layer with manual cell-coordinate math; SVG gives one coordinate space for free.
- **Canvas 2D**: constant main-thread redraw for animations the compositor would do for free; manual hit-testing; manual DPR handling.
- **Pixi.js**: ~80 KB gzipped for sprite batching that 50 motifs don't need; rejected for not earning its bytes.
- **Three.js**: 3D engine for a 2D grid; ~150 KB gzipped; rejected.

## Consequences

Compositor-driven animations cost ~0 ms main-thread per frame. Game logic per frame is also 0 ms (no per-frame logic; state mutations are discrete event responses). Worst-case frame on the target device profile fits in <5 ms main-thread (CLAUDE.md section 9 frame-budget gate). Bundle stays light: 0 KB renderer dependency. Adding visual effects later (gloss, drop-shadow, gradient) uses SVG natives (`<linearGradient>`, `<radialGradient>`, `<feGaussianBlur>`, `<feDropShadow>`) - no library needed.

## Reversal cost

Medium. Swapping to Canvas 2D would touch the board view, hit-testing, and the animation orchestration (~300 lines). Swapping to Pixi/Three/WebGL would be Expensive - fundamentally different scene-graph model and asset pipeline.

## See also

- [CLAUDE.md](../../../CLAUDE.md) Holy Law #2 (target device), section 4 (Tailwind for chrome only), section 10 (anti-patterns: pick renderer + physics together)
- [../runtime/frame-budget.md](../runtime/frame-budget.md) (born in PR 4)
