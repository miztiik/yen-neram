# ADR-0018: Undo, mobile mode-picker fit, Jony score chip, multiplier-vibrant +delta, Palm game-over ceremony

**Last Updated**: 2026-06-08
**Status**: Accepted
**Born in**: Player-feedback polish round, 2026-06-08

## Context

Five player-facing complaints landed in one feedback batch on the
2026-06-08 v2 build:

1. **Undo is not working.** The Undo button on the bottom bar of the
   5-in-a-row HUD was always permanently `disabled`. The
   `UndoSnapshotSchema` field on the save was defined but never written
   to. The how-to-play modal explicitly tells the player "You get one
   undo per game" -- a doctrine with zero implementation behind it.
2. **Mobile mode picker overflows the screen.** The picker rendered as
   `grid-cols-1` (stacked) with `aspect-square` tiles, so on a 393x681
   Pixel-5 viewport the three tiles + heading totalled 762px -- 81px
   of mandatory scroll on FIRST contact with the game. Casual players
   don't scroll on a "Pick a mode" screen; they bail.
3. **No celebration on game end.** The modal opened with a flat
   "Game over" title, a small `New best!` pip iff applicable, and a
   leaderboard. The 50th run with no new best looked identical to a
   first run scoring 0; the rare new-best moment had no theatre.
4. **The score number is "boring brown".** The chip used
   `--yn-ink #7c2d12` (orange-900, deep terracotta) at `font-bold`
   (700). On the cream pill `bg-yn-tile #fff7ed` the digits read as
   muddy newsprint rather than as the hero of the HUD.
5. **The +delta badge is only visible on multiplier scenarios.** The
   bonus wave fired for move-triggered clears (correct) but NOT for
   spawn-cascade scoring clears (a bug since ADR-0017). The +delta
   on a tier-1 plain 5-clear also looked identical to the +delta on a
   rare cascade-3 multiplier moment, with no visual escalation.

All five are surface-level UX failures. They fix in one bundled
polish commit because each is small in isolation and they share the
same files (`apps/frontend/src/games/5-in-a-row/index.ts`,
`ui/board-view.css`, `ui/game-over-modal.ts`, `ui/mode-picker.ts`,
`ui/bonus-wave.ts`).

## Decision

### 1. Undo: in-memory single-use snapshot, persistence of the spent boolean

- **State** (closure-scoped in the game host):
  - `let undoSnap: UndoSnap | null = null;` -- the snapshot that the
    button restores from. Shape:
    `{ board, score, nextPreview, selected, rngCursor, modeState }`.
  - `let undoUsedThisGame: boolean;` -- seeded at mount from
    `save.in_progress.undo.available === false`, so a reload of a game
    whose undo was spent stays disabled.
- **Capture point**: BEFORE `state = outcome.postMoveState` on a
  successful move outcome (after `attemptMove` returns `"moved"`,
  before any await chain that mutates state). The snapshot captures
  `state.rng.getCursor()` so the player's second-attempt move sees the
  same spawn the first attempt would have -- otherwise undo would
  function as a re-roll.
- **Enable point**: the `finally` block of `onCellTap`, AFTER the
  move's animation chain settles. `isAnimating` is the click-handler
  guard; enabling earlier would show a click-ready button that the
  guard then rejects.
- **Click handler**: restores state (replacing the RNG instance via
  `createRng(snap.rngCursor)`), sets `undoUsedThisGame = true`,
  `undoSnap = null`, disables the button, re-runs `render()` +
  `animateScoreTo(state.score, false)` (no celebration glow on undo)
  + `renderBestChip(state.score, false)`. If the undo drops the
  live score back to or below `allTimeBestAtMount`, also revert
  `crossedAllTimeBest` so the BEST chip stops claiming a record the
  player no longer holds.
- **Persistence**: `persist()` writes `undo.available: !undoUsedThisGame`
  to `save.in_progress.undo` on every move. The `snapshot` field stays
  `null` -- the snapshot is in-memory only this PR.

**Deferred to a follow-up**: reload-survival of an UNCONSUMED undo.
Would require extending `UndoSnapshotSchema` with `rng_cursor`,
`selected_cell`, and `mode_state` per CLAUDE.md sec 11 (schema bump
+ read-side migration in the same commit). Not worth the schema churn
for an edge case where the player paused, closed the tab, and came
back specifically to undo their last move. The dominant flow is
undo-immediately-after-mistake, fully covered by the in-memory design.

### 2. Mobile mode picker: horizontal banner tiles below `sm`

- Below the Tailwind `sm` breakpoint (640px), each mode tile is a
  short horizontal banner (~96px tall: `py-5` + content). Three tiles
  + heading + page padding now total ~440px, comfortably inside the
  393x681 Pixel-5 viewport.
- From `sm` upwards, the existing `aspect-square` premium-feel tile
  layout is preserved. The `grid-cols-1 sm:grid-cols-3` row/column
  switch is unchanged.
- Root has `overflow-y-auto` as a defence-in-depth so a future tile
  growth never silently breaks the mobile fit.
- Pinned by `tests/e2e/full-flow.spec.ts > "mode picker fits one
  mobile screen with no scroll (393x851 Pixel-5)"`.

### 3. Jony score chip: espresso digits + 900 weight + -0.025em tracking

- New palette token: `--yn-ink-deep: #1a0a04` in
  `apps/frontend/src/styles/index.css`. Warm-near-black espresso;
  belongs to the warm-vibrant palette family while asserting darkness
  enough to be the HUD hero.
- Applied SOLELY to `.yn-score-display` (via `board-view.css`). The
  rest of the chrome -- BEST chip, body copy, button text -- keeps
  the existing `--yn-ink #7c2d12` terracotta.
- `.yn-score-display` also gets `font-weight: 900` and
  `letter-spacing: -0.025em`. The Tailwind class on the chip itself
  bumps `text-4xl sm:text-5xl` -> `text-5xl sm:text-6xl` (40px ->
  60px on desktop) and drops `font-bold tracking-tight` (those are
  now driven by the CSS for tighter control).
- The `.yn-score-celebrating` glow keyframe (`@keyframes yn-score-pop`)
  now returns to `--yn-ink-deep` at the 0% and 100% frames so the
  celebration animation lands back on the new resting colour.
- **NOT shipped**: the custom Archivo ExtraBold subset Jony's
  prescription named. Self-host adds a ~4KB WOFF2 binary blob to the
  repo + a `@font-face` declaration. The system-font + 900 + tight-
  tracking rest of the prescription delivers ~90% of the visual lift
  without a binary commit. If a future round demands the typographic
  identity Jony described, the WOFF2 follows in a separate PR with
  explicit user sign-off on the font binary.

### 4. Multiplier-vibrant +delta variant + +delta fires for spawn-cascade

- New CSS class `.yn-bonus-pill--delta-mult` in `board-view.css`:
  `font-size: 26px` (vs 20px baseline), `font-weight: 900`, gradient
  background `linear-gradient(135deg, #fb923c 0%, var(--yn-accent) 100%)`,
  `border-width: 2px` cream rim, `box-shadow: 0 0 0 3px rgba(...)` for
  a soft accent-bleed halo.
- Applied by `bonus-wave.play(..., { vibrantDelta: true })` when the
  pill stack carries at least one NAMED pill (LENGTH / INTERSECT /
  CASCADE). Plain tier-1 +5 stays on the calmer `.yn-bonus-pill--delta`
  baseline so the badge style ITSELF encodes "small win" vs "big win".
- The +delta now fires for **every** scoring clear, including
  spawn-cascade clears (`outcome.clears.length > 0 && outcome.spawnedAt.length > 0`).
  The previous gating `if (outcome.clears.length > 0 && outcome.spawnedAt.length === 0)`
  silently suppressed the +delta for spawn-cascade scoring -- the
  rarest, most exciting scoring beat had zero visual feedback. The
  refactored flow in `onCellTap` is now: flash cleared cells (with
  ordering chosen to respect whether the cells were ever visibly
  occupied), mutate state, land-bounce spawns, flash cascade-cleared
  cells if any, then play the wave + score animation.

### 5. Palm game-over ceremony: progress-framed copy + CSS-only burst on PB

- `buildHeaderCopy(context)` is exported pure from
  `ui/game-over-modal.ts` and returns `{ title, subtitle }`.
- **Loss copy**: `"Nice run."` + `"<deficit> points to your best."`
  or `"Tied your best."` or just `null` subtitle on a first-ever run.
- **Personal-best copy**: `"New best!"` + `"+<delta> over your last."`
  or `"Your first run on the board."` on the first ever run.
- **Score scale-in (every modal mount)**: `.yn-game-over-score` class
  carries a 350ms `scale(0.7) -> scale(1)` + `opacity 0 -> 1`
  keyframe. Transform + opacity only; compositor-only.
- **PB-only 6-dot burst**: 6 absolute spans behind the score, each
  with `--yn-burst-angle` at 60deg intervals, animated via
  `@keyframes yn-game-over-burst` over 900ms (translate radially to
  80px + scale to 0.6 + opacity to 0). Colours rotate cream / coral
  / accent / amber via `:nth-child` rules.
- `prefers-reduced-motion: reduce` defangs both: scale-in becomes
  `animation: none`, burst dots set `display: none`. The copy carries
  the celebration without motion (the doctrine: "the player decides
  when to be celebrated").

## Trade-offs

- **In-memory undo means a player can't undo across a reload.** The
  schema field stays in place for a future PR to extend with the
  RNG cursor + selected_cell + mode_state, at which point a
  read-side migration ships in the same commit per CLAUDE.md sec 11.
- **Mobile mode picker drops the premium aspect-square look below
  sm.** Two-line copy on the smaller banner tiles is the trade for
  a one-screen fit. The premium tile returns at `sm` and up where
  vertical real estate isn't the constraint.
- **The vibrant `--delta-mult` adds ~80B of CSS** for one new rule
  block. Bundle is 6.65 KB gz vs 10 KB cap -- well within budget.
- **The Palm burst adds ~6 absolute spans per PB modal**. They're
  short-lived (cleaned up when the modal closes via `overlay.remove()`)
  and `pointer-events: none` so they never interfere with the
  underlying buttons.
- **Jony's full prescription (self-hosted Archivo ExtraBold subset)
  is partially deferred.** System-font + 900 + tight tracking is
  shipped; the typographic identity from a custom font is a separate
  decision the user has to sign off on (binary blob in repo).

## Rejected alternatives

- **Schema bump for undo this PR**: would expand the surface area
  unnecessarily. The dominant undo flow (immediate-undo-of-last-move)
  works perfectly in-memory; the reload edge case is rare and
  cheaply deferred.
- **Audio celebration on game over**: out of scope (audio is a
  separate decision; ADR pending if/when audio lands).
- **Confetti library (canvas-confetti et al.)**: 8KB+ gz for a
  feature CSS keyframes can do in <300B. Carmack-budget rejection.
- **Re-arm undo every move (multi-undo)**: contradicts the
  how-to-play doctrine ("one undo per game"). Multi-undo would let
  the player roll back the entire game; the one-undo rule is a
  design constraint, not a bug to fix.
- **Always-vibrant +delta**: lose the tier-1 vs multiplier
  distinction. The badge style is now part of the scoring vocabulary.

## See also

- [docs/architecture/decisions/0017-reward-loop-stacked-wave.md](0017-reward-loop-stacked-wave.md)
  -- the original reward loop ADR; amended by sec 4 above.
- [apps/frontend/src/games/5-in-a-row/index.ts](../../../apps/frontend/src/games/5-in-a-row/index.ts)
  -- the game host (score chip, undo wiring, +delta gating).
- [apps/frontend/src/games/5-in-a-row/ui/board-view.css](../../../apps/frontend/src/games/5-in-a-row/ui/board-view.css)
  -- the score-display CSS, the multiplier-vibrant delta variant, the
  Palm game-over ceremony keyframes.
- [apps/frontend/src/games/5-in-a-row/ui/game-over-modal.ts](../../../apps/frontend/src/games/5-in-a-row/ui/game-over-modal.ts)
  -- the Palm copy + burst markup.
- [apps/frontend/src/games/5-in-a-row/ui/mode-picker.ts](../../../apps/frontend/src/games/5-in-a-row/ui/mode-picker.ts)
  -- the mobile-banner / sm-square layout split.
- [apps/frontend/src/games/5-in-a-row/ui/bonus-wave.ts](../../../apps/frontend/src/games/5-in-a-row/ui/bonus-wave.ts)
  -- the `WavePlayOptions.vibrantDelta` plumbing.
- [apps/frontend/tests/unit/5-in-a-row/game-over-copy.test.ts](../../../apps/frontend/tests/unit/5-in-a-row/game-over-copy.test.ts)
  -- unit coverage of `buildHeaderCopy`.
- [apps/frontend/tests/e2e/full-flow.spec.ts](../../../apps/frontend/tests/e2e/full-flow.spec.ts)
  -- e2e coverage of undo + mobile mode-picker fit.
