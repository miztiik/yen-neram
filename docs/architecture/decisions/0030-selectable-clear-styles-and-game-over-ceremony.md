# ADR-0030: Selectable line-clear styles (distance-from-origin) + two-tier game-over ceremony

**Last Updated**: 2026-06-28
**Status**: Accepted
**Born in**: Player feedback - "vertical clears animate one cell at a time but horizontal clears all at once; I want a few animation options (a centre ripple; one that starts from the placed coin); and a celebration when the game ends, even without a new best" (council pass: Jony / Palm / Player)
**Affects**: `apps/frontend/src/games/5-in-a-row/{index.ts,balance.json}`, `.../ui/{board-view.ts,board-view.css,settings-drawer.ts,game-over-modal.ts}`
**Amends**: ADR-0028 (clear ceremony - gains a player-chosen style), ADR-0018 (game-over ceremony - gains a non-PB tier)

## Context

### Clear animation

The clear burst delayed each cell by `stepMs * iterationIndex` - the index of
the cell in a `Map` built in scan order. A single line used `stepMs = 0` (all
cells together); cascades rippled. Because the ordering came from iteration
index, the motion was **orientation-dependent** and read inconsistently
(vertical vs horizontal). And there was exactly one clear look.

Jony: kill the inconsistency at the root - delay each cell by its **Chebyshev
(chessboard) distance from the style's origin**, never the iteration index, so a
row and a column of equal length ripple identically. Then ship a small set of
named styles. Palm: a casual game is fine with one great default, but a 3-cap
cosmetic, never-gated, off-the-main-loop choice is acceptable.

### Game-over ceremony

A new personal best showed a 6-dot burst; a non-PB run showed only the
score-scale-in + honest copy. The player wanted a positive beat on every
game-end. Player: but NOT a "fake party" on a non-PB run - "a confetti blast
feels hollow and I stop trusting your celebrations." Palm: two tiers, same
visual language, distinct by size/brightness; both dismissible in <1s.

## Decision

### 1. `planClearTiming` - distance-from-origin (pure, tested)

`planClearTiming(cellKeys, style, originKey, stepMs, basePeak)` maps each cleared
cell to `{ delayMs, peak }`:

- `delayMs = stepMs * chebyshev(cell, origin)` - orientation-free.
- origin: `flash` -> none (all together); `from-coin` -> the placed piece
  (`originKey`); else (and the from-coin fallback) -> the rounded centroid of the
  cleared cells (a virtual point; Chebyshev distance needs no real cell).
- `shockwave` scales each cell's splash peak DOWN with distance (centre biggest,
  rim smallest); other styles keep a uniform peak.

`showClearFlash` consumes the plan; the CSS keyframes already read per-cell
`animation-delay` + `--yn-splash-peak`, so no CSS change was needed for the
styles themselves.

### 2. Three styles, default `shockwave`

`ClearStyle = "shockwave" | "from-coin" | "flash"`:

- **shockwave** (default, labelled "Ripple") - centre-out, dissipating peak.
- **from-coin** ("From coin") - ripples from the piece just placed; a
  spawn-cascade clear has no placed piece, so the host falls back to shockwave.
- **flash** ("Flash") - every cell on the same frame; also the forced choice
  under reduce-motion.

Per-distance steps live in `balance.json clear.{shockwave_step_ms:45,
from_coin_step_ms:55}` (retiring `cascade_step_ms`). Player pref `clear_style?`
on `AppPrefsSchema` - additive + optional like `tile_size`, so no
`schema_version` bump / migration. Selectable via a "Line clear" segmented
control in Menu -> Display.

### 3. Two-tier game-over ceremony

- **non-PB**: one soft warm bloom behind the score (a positive punctuation),
  plus the existing honest copy ("Nice run." + "X to your best"). Deliberately
  NOT a burst (Player).
- **new PB**: a brighter expanding ring + 10 radial dots (was 6) - unmistakably
  louder, same visual language. Dot colours are set inline (a 5-stop cycle) so
  the count is not tied to fragile `:nth-child` rules.

All motion is compositor-only (transform/opacity); reduce-motion defangs the
bloom, ring, and dots.

## Consequences

- A row and a column of equal length now ripple identically (the reported bug).
- The player owns the clear look (3 cosmetic options) and gets a celebratory
  beat on every game-end, scaled to the achievement.
- `cascade_step_ms` retired; cascades ripple via the same distance model.
- JS 43.35 KB / 50, CSS 9.08 KB / 10, FPF 53.11 KB / 150 - all within budget.

## Alternatives rejected

- **One default, no selector** (Palm's first instinct): the player explicitly
  asked for options; capped at 3, cosmetic-only.
- **Confetti on every game-end** (Player veto): hollow on a non-PB run.
- **Keep the iteration-index stagger**: the root cause of the inconsistency.

## Tests

- `tests/unit/5-in-a-row/clear-timing.test.ts` - `planClearTiming`: a horizontal
  and a vertical line of equal length share the same delay multiset; shockwave
  peak dissipates outward; flash is simultaneous + uniform; from-coin radiates
  from the coin.
- `tests/contract/app-prefs.schema.test.ts` - `clear_style` accept / reject /
  back-compat.
- `tests/e2e/full-flow.spec.ts` - "Line clear" control: default Ripple, switch
  to Flash, persists + survives reload.

## See also

- [0028-per-motif-clear-burst-color.md](0028-per-motif-clear-burst-color.md) -
  the burst colour + ring form this builds on.
- [0029-input-buffer-during-animation-lock.md](0029-input-buffer-during-animation-lock.md) - shipped in the same pass.
