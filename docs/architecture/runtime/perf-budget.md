# Frame budget and perf gates

**Last Updated**: 2026-06-29

Operational profile of how Yen-Neram stays inside CLAUDE.md Holy Law 2
(target: mid-tier Android, Snapdragon 6-series, ~2022 vintage, 4 GB RAM,
patchy 4G).

## The numbers

| Surface                                     | Budget                   | Cap               |
| ------------------------------------------- | ------------------------ | ----------------- |
| Shell JS gzipped                            | <= 25 KB                 | 50 KB (Holy Law)  |
| First-playable-frame gzipped                | <= 50 KB                 | 150 KB (v1)       |
| Time to interactive on Slow-4G              | <= 3 s                   | (player patience) |
| Input-to-photon                             | <= 50 ms                 | (Holy Law)        |
| Game logic per frame                        | 0 ms (no per-frame loop) | 4 ms              |
| Worst-case animation frame main-thread cost | < 5 ms                   | 16.7 ms (60 fps)  |

## How we verify

1. `pnpm -F frontend size` (the size-limit gate added in v2 wave 2).
   Fails CI if any of the three bundle caps regresses.

2. `pnpm -F frontend test:e2e -- --grep "perf under"` (this perf suite).
   CDP throttling: 4x CPU + Slow 4G (400 Kbps, 400 ms latency).
   Asserts board paints < 5 s, click-to-selection < 500 ms.

3. Manual smoke (per CLAUDE.md sec 12):
   - Open DevTools -> Performance.
   - Throttle Network = Slow 4G, CPU = 4x slowdown.
   - Record one move.
   - Confirm: long-task count = 0, JS heap stable, layout count small.

## Why these numbers

The inline SVG + CSS keyframe renderer keeps main-thread cost near
zero. Animations run on the compositor thread; state changes are
discrete events; the board sleeps between inputs. The perf budget
exists to catch a regression that would betray the renderer pick (e.g.
someone adds a requestAnimationFrame loop, or the shell starts shipping
a framework).

Per-game code splitting protects the shell budget. The portal, router,
shared save reader, and app preferences are always loaded; each game is
dynamically imported when entered. A new game should not add its full
payload to the first-playable frame for 5-in-a-Row.

## When the numbers change

A new game (game #2, game #3) ADDS to first-playable-frame budget if it
ships in the always-loaded shell - but every game is code-split, so the
shell stays roughly stable. The total v1 cap of 150 KB counts only the
FIRST game's chunk; new games are NOT additive at first-playable-frame.

If a feature genuinely needs more, the v2 cap is reviewed (not the v1
Holy Law 50 KB shell cap, which is permanent).

## See also

- [../../concepts/5-in-a-row-board-and-input.md](../../concepts/5-in-a-row-board-and-input.md)
- [../../concepts/multi-game-shell.md](../../concepts/multi-game-shell.md)
- [../../reference/toolchain.md](../../reference/toolchain.md)
- [../../../CLAUDE.md](../../../CLAUDE.md) Holy Law #2, sec 9, sec 12.
