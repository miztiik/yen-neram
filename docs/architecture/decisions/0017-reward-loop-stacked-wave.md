# ADR-0017: Reward-loop is a "stacked wave" with named bonus pills

**Last Updated**: 2026-06-08
**Status**: Accepted (amended 2026-06-08)
**Born in**: v2 wave 4 (`feat/v2`)
**Affects**: `apps/frontend/src/games/5-in-a-row/`

## Context

V1 shipped a score chip and a clear-cell pink-splash, but the score side
of the reward loop was dead:

- The chip was a small orange pill: `text-[10px]` "SCORE" label above a
  16px bold number, accent-filled with white text. On every clear the
  number JUMPED from old to new value via `textContent =
  String(state.score)`. No count-up, no glow, no theatre.
- The pure scoring engine grades clears by line length (5-1x, 6-1.5x,
  7-2x, 8-3x, 9-5x), intersection of 2+ lines (1.5x), and cascade depth
  (+2x per step). A length-7 intersection cascade-2 = 105 points. The
  player got ZERO signal that any of this happened -- the chip just
  ticked up.
- `balance.json` had `score_popup_ms: 250` declared but wired to nothing.

User feedback (2026-06-07): "the score is too small ... can you come up
with a better animation fonts and theme for the score to reward clearing.
also like candy crush /fruit ninja - when use does 1.5x /whatever can we
some recognition, like a bottom to top animation wave? give me few
suggestions on how the user sees it, also the counter for score
increments instead of jumping?"

## Decision

Three coupled changes ship together (per the user's "Both - chip
redesign + count-up + wave in one PR" answer to the scope question):

### 1. Score chip redesign (Jony altitude)

- Kill the "SCORE" label entirely. The number IS the meaning; labelling
  the only big number on the bar is 1990s.
- Cream pill (`bg-yn-tile`) with terracotta number (`text-yn-ink`), at
  `text-4xl` (~36px) portrait / `text-5xl` >= sm. The accent orange
  (`--yn-accent`) is REMOVED from the chip's resting state and reserved
  for events (count-up celebration glow, BEST chip pulse, the
  bonus-wave delta badge).
- BEST chip beside the score (`.yn-best-chip`): hidden until the player
  has scored at least once, shows session-best (in-memory only, resets
  on reload). Pulses warm-orange when a single placement beats the
  session high. Intentionally NOT persisted to the save -- all-time
  best continues to live in `save.high_scores` for the
  leaderboard / game-over modal. No daily-best, no streak, no
  notification (Palm cut these to avoid dark-pattern streak pressure).

### 2. Count-up animation (compositor-only)

- CSS `@property --yn-score-count` registered as `<integer>`. The
  `.yn-score-display` parent declares `counter-reset: yn-score
  var(--yn-score-count)` and its `::after` pseudo renders
  `content: counter(yn-score)`. JS writes the new score to the
  custom property; the browser interpolates the integer; the counter
  re-evaluates each paint tick; the `::after` text updates. Zero
  `requestAnimationFrame`, zero JS tween loop.
- Duration scales with delta:
  `clamp(min=450ms, base=450ms + delta * 12ms, max=1100ms)`. A +5 ticks
  in 450ms (almost subliminal); the rare +135 takes the full 1100ms
  cap and the player watches it climb. Equal-time-per-event would make
  a 5-clear feel as heavy as a 135-clear; proportional time IS the
  recognition.
- At 30% peak: number `transform: scale(1.08)` + colour shift
  `--yn-ink -> --yn-accent`; chip emits a peak-and-fade
  `drop-shadow` glow. No layout-triggering property.

### 3. Bonus-wave overlay ("Stacked Wave" variant, Palm + Jony synthesis)

- A vertical stack of small pills rises from the cleared-cells screen-
  centroid, ONE pill per bonus type, staggered 60ms. The stack ends in
  a final delta badge (`.yn-bonus-pill--delta`) that flies INTO the
  score chip on its exit; the count-up + chip glow fire at the moment
  it impacts. Cause and effect become one gesture.
- Vocabulary is exactly three words:
  - `LENGTH N` (only when length >= 6; the 5-floor is silent).
  - `INTERSECT xN` (when `lineCount >= 2`, where N is
    `balance.intersection_bonus`, default 1.5).
  - `CASCADE xN` (one pill per cascade step >= 1, where N is the
    step's `cascade_mult = 1 + cascadeIndex * balance.cascade_bonus`).
    A depth-3 cascade emits three escalating CASCADE pills (x3, x5,
    x7) -- the repetition IS the drumroll. Cascade pills use a
    subtle accent-tinted background so they read as the special
    case, not as filler.
- `LENGTH N` and `INTERSECT` evaluate per cascade step, so a length-7
  intersection cascade-3 emits six bonus pills + the final +delta
  badge, ~2.0s of earned theatre. A plain length-5 clear emits ZERO
  bonus pills and the wave is silently suppressed
  (`isSilentTier(breakdowns)`); the existing pink cell-splash stays
  as the entire tier-1 reward.
- The `x` glyph is always U+00D7 (multiplication sign), never ASCII
  lowercase. Typographic dignity.
- The overlay is a single fixed-position container appended to
  `document.body` once per game lifetime. Per-pill life-cycle is
  CSS-keyframe-driven; a `setTimeout` cleanup timer removes each pill
  from the DOM after its animation completes. Pointer-events disabled.

## Tier ladder (Palm)

| Tier | Triggers | Recognition |
| --- | --- | --- |
| 1 BASE | length 5, no bonuses | count-up only, **no wave** -- cell-splash IS the tier-1 reward |
| 2+    | any length >= 6, OR intersection, OR cascade depth >= 1 | wave with named pills + flying delta badge + count-up + chip glow |

Cheerleader text (`AMAZING!`, `SWEET!`, `COMBO!`), confetti,
screen-shake, colour-graded tiers, and particles on the score number
are explicitly refused. The named bonus IS the celebration.

## Constraints respected

- **CSS-only animations** (compositor-thread). One `setTimeout` cleanup
  per pill (CLAUDE.md anti-pattern bans setTimeout for *game-loop
  timing*, not bounded UI tweens; matches the splash cleanup pattern
  already in `board-view.ts`).
- **No `rAF` in game-host code.** The score count-up is `@property`
  interpolation; one-shot rAF in `board-view.ts` for style-commit
  before keyframes is preserved (existing pattern, allowed).
- **Static-bundle.** All wave timings live in
  `balance.json -> reward.*` (no hardcoding per Holy Law #6). The
  scoring engine breakdown is pure, schema-bumpless.
- **No new dependencies.** No web fonts, no animation library,
  no particle system.
- **Schema-additive.** `balance.json` `reward` block is new; the
  schema is read as typed JSON without Zod gating, additive fields
  carry no version bump risk.
- **Browser support.** `@property` + animated `counter()` works in
  Chrome 85+ (Sept 2020), Safari 16.4+ (Mar 2023), Firefox 128+
  (Jul 2024) -- all newer than the Snapdragon-6-series Android
  target.

## Files touched

- NEW `apps/frontend/src/games/5-in-a-row/ui/bonus-pills.ts` -- pure
  derivation of pill list from a chain breakdown
  (`derivePills`, `isSilentTier`).
- NEW `apps/frontend/src/games/5-in-a-row/ui/bonus-wave.ts` -- DOM
  staging glue: `createBonusWave`, `centroidOfClearedCells`,
  `elementCenter`.
- NEW `apps/frontend/tests/unit/5-in-a-row/bonus-pills.test.ts` --
  14 tests covering tier suppression, pill derivation, vocabulary,
  glyph correctness.
- MOD `apps/frontend/src/games/5-in-a-row/engine/score.ts` -- added
  `ClearBreakdown` + `breakdownClear` + `breakdownChain` pure
  helpers. Parity-tested against the existing `scoreSingleClear`.
- MOD `apps/frontend/src/games/5-in-a-row/balance.json` -- new
  `reward` block with 10 timing knobs.
- MOD `apps/frontend/src/games/5-in-a-row/ui/board-view.css` -- the
  `REWARD-LOOP THEATRE` block: @property registrations, score chip
  pop + glow keyframes, BEST chip bump, bonus-pill rise-hold-exit
  + fly-to-score keyframes.
- MOD `apps/frontend/src/games/5-in-a-row/index.ts` -- chip + BEST
  markup rewritten; `animateScoreTo` helper; `bumpSessionBestIfBeaten`
  helper; `render` split from score sync; `bonusWave` instance + wave
  invocation in `onCellTap`; unmount calls `bonusWave.destroy()`.
- MOD `apps/frontend/tests/unit/5-in-a-row/score.test.ts` -- added
  9 tests for `breakdownClear`/`breakdownChain` including parity
  with `scoreSingleClear`.

## Alternatives considered

- **Quiet Hero** (single delta pill, no bonus names): cleanest, but
  doesn't teach the three-word bonus vocab. Rejected because the
  whole point of the wave is to let the player LEARN the verbs
  (`LENGTH 7`, `INTERSECT`, `CASCADE`) so they can hunt them next
  session.
- **Bonus Ribbon** (single one-line ribbon across HUD top, e.g.
  `LENGTH 7 . INTERSECT . CASCADE x2  +105`): scoreboard-clean,
  but loses the per-cascade drumroll. A depth-3 cascade should
  feel like three escalating beats, not one dot-separated line.
- **Colour-graded tier escalation** (orange -> gold -> red):
  refused. Warm-orange is the brand; tier escalation via SIZE +
  DURATION only.
- **Cheerleader text** (`AMAZING!`): refused. The lazy mobile-game
  tax; the named bonus rendered well IS the celebration.

## 2026-06-08 amendment: BEST chip rebind + tier-1 wave always plays

User feedback (2026-06-08, after one session of real play):

> "what is the best = score? what are we trying to say? and for bonus
> clearance we are moving something like +15 to the score correct?
> why cant we do that for all clearances?"

Two coupled mistakes from the original design surfaced in the same
session and are amended here.

### Mistake 1: session-best chip is a tautology in this game

The original `bestEl` tracked an IN-MEMORY session best, bumped every
time the live score went up. In a game where the score is
monotonically increasing within a single run (no rounds, no resets,
no per-round score), `sessionBest === state.score` is an identity --
the chip can NEVER diverge from the score chip during play. It only
ever changes value AT THE MOMENT the score increases, and after that
it shows the same number as the hero. The chip is showing the player
their current score, twice.

**Fix**: the BEST chip now tracks `save.high_scores[mode][0]?.score`
read once at mount (all-time best for the current mode). It shows a
PERSISTENT target to chase across sessions -- the Candy Crush /
Angry Birds "score to beat" pattern that has been the casual-game
default for 15+ years. When the live score CROSSES the stored
all-time best during play, the chip:
- swaps its label from "Best" to "New Best",
- flips colourway from cream pill to accent-filled,
- pulses once on the cross transition,
- tracks `state.score` live for the rest of the game so the player
  watches the milestone climb.

The chip is hidden iff `allTimeBestAtMount === 0` AND not yet
crossed -- there is nothing to chase and nothing to celebrate. As
soon as a stored best exists, the chip surfaces it on every mount
of every mode that has a high score, including in the empty initial
state where the player sees "Best 0" disappear in favour of just
seeing their first run grow.

Implementation: `renderBestChip(score, justCrossed)` +
`updateBestOnScoreChange(score)` in `index.ts`, plus a CSS
`.yn-best-chip--crossed` modifier in `board-view.css`. The
`--yn-best-count` CSS @property + counter() tween is unchanged.

### Mistake 2: suppressing the +delta on tier-1 hid the cause-and-effect

The original `isSilentTier` gate suppressed the entire bonus-wave
overlay (including the flying +N delta badge) when the clear was the
tier-1 floor (length 5, no bonuses). The rationale was "the pink
cell-splash is the tier-1 reward; an extra +5 pill on every clear
would flatten tiers 2-4." That conflated TWO different roles of the
wave:
- The pink cell-splash is **celebration** (the cell exploded;
  pleasing visual).
- The flying +N pill is **feedback** (the score chip is about to
  increase by N because of this clear).

Suppressing the pill removed the feedback signal but kept the
celebration. The player saw the splash, saw the chip tick up, and
had no visual link between the two -- the chip just changed by some
amount, by some unstated mechanism. Per Jony worldview #5 ("every
player input gets a visible result on the next frame"), this is the
result-without-cause that the wave was designed to fix.

**Fix**: the wave now plays on EVERY scoring clear regardless of
tier. The named bonus pills (LENGTH N, INTERSECT, CASCADE) remain
tier-2-and-above ornaments via the existing `derivePills` gates
(length>=6, lineCount>=2, cascadeIndex>=1) -- so a tier-1 clear
shows only the +N delta pill flying into the score chip, and a
tier-3 clear shows the full stack as before. The cause-and-effect
beat is now uniform across all tiers; what changes between tiers is
the NUMBER of pills, not the presence of the wave.

`isSilentTier` is retained as a pure classifier for any future UI
surface that wants to ask "would this clear have emitted any named
bonus pills?" without re-deriving the pill array, but is no longer
used to suppress the wave. Its game-host call site in `index.ts`
becomes `const waveSuppressed = pills.length === 0;` (i.e. only
suppressed when there's NO score change at all, which only happens
on empty/invalid clears).

### Updated tier ladder

| Tier | Triggers | Recognition |
| --- | --- | --- |
| 1 BASE | length 5, no bonuses | cell-splash + flying +N badge + count-up + chip glow |
| 2+    | any length >= 6, OR intersection, OR cascade depth >= 1 | cell-splash + stack of named bonus pills + flying +N badge + count-up + chip glow |

### Side benefit: red-tint shake + blocker flash on illegal moves

Bundled into the same amendment because it is the same altitude
(HUD clarity and feedback). The existing 200ms shake on an
unreachable destination was motion-only and conveyed neither WHY
the move failed nor what to try next. The shake now also flashes
the destination cell red (`yn-cell-bg-red-flash` keyframe) and the
4-adjacent filled neighbours of the destination flash a softer red
(`yn-cell-bg-blocker-flash`, 380ms). The "pieces in your way block
movement" rule is learned visually within one or two failed taps.
New how-to-play section "Legal and illegal moves" documents the
rule in text for the player who prefers to read.

### Files touched by the amendment

- MOD `apps/frontend/src/games/5-in-a-row/index.ts` -- BEST chip
  logic (allTimeBestAtMount, crossedAllTimeBest, renderBestChip,
  updateBestOnScoreChange); blocker flash on shake sites; +delta
  always plays (waveSuppressed simplification).
- MOD `apps/frontend/src/games/5-in-a-row/ui/bonus-pills.ts` --
  docstring on isSilentTier updated to reflect its new role.
- MOD `apps/frontend/src/games/5-in-a-row/ui/board-view.ts` --
  showBlockersFlash method + BLOCKER_FLASH_MS constant.
- MOD `apps/frontend/src/games/5-in-a-row/ui/board-view.css` --
  yn-cell-bg-red-flash + yn-cell-bg-blocker-flash keyframes;
  .yn-best-chip--crossed colourway + label transitions.
- MOD `apps/frontend/src/games/5-in-a-row/ui/how-to-play.ts` --
  new "Legal and illegal moves" section; Tips section mentions the
  BEST chip target-to-chase.
- MOD `apps/frontend/src/games/5-in-a-row/ui/leaderboard.ts` --
  Jony font pass: bigger title with accent on "Scores"; podium
  rows (top 3) get heavier weight and accent rank colour.
- MOD `apps/frontend/tests/unit/5-in-a-row/bonus-pills.test.ts` --
  describe block renamed to reflect "tier-1 floor classifier"
  meaning; assertions unchanged (the function behaviour did not
  change, only its role).
- MOD `apps/frontend/tests/e2e/full-flow.spec.ts` -- three new
  e2e tests: BEST chip hidden on fresh save; BEST chip shows
  stored all-time best with correct label; how-to-play modal
  contains the "Legal and illegal moves" section.

## See also

- `docs/architecture/decisions/0003-mode-is-a-parameter-not-a-game.md`
  -- the scoring engine is mode-independent and the wave reads the
  same `LineDetectResult` chain in every mode.
- `docs/architecture/runtime/perf-budget.md` -- the wave's 6-pill
  ceiling x ~2s lifespan is well inside the frame budget on the
  target device (CSS-only, no layout).
- `.github/agents/jony.agent.md`, `.github/agents/palm.agent.md` --
  the two voices whose synthesis is the "Stacked Wave" variant.
