# ADR-0032: One signature line-clear that escalates by length (retire the picker)

**Last Updated**: 2026-06-28
**Status**: Accepted
**Born in**: Council pass (Palm / Carmack / Jony, 2026-06-28) on the question "remove the player's choice of clear animation? give each clear length its own animation? auto-rotate or stick to one (Candy Crush)?"
**Affects**: `apps/frontend/src/games/5-in-a-row/{index.ts,balance.json}`, `.../ui/{board-view.ts,settings-drawer.ts}`, `apps/frontend/tests/{unit/5-in-a-row/clear-timing.test.ts,e2e/full-flow.spec.ts}`
**Amends**: ADR-0030 (retires the *selectable* clear styles + the "Line clear" picker; keeps its distance-from-origin timing and its two-tier game-over ceremony), ADR-0028 (length now escalates ring COUNT, not only ring SIZE)

## Context

ADR-0030 shipped (same day) a player-facing "Line clear" picker with three
styles (`shockwave` / `from-coin` / `flash`). The council was reconvened to
judge three follow-up proposals. It converged unanimously:

- **The clear is the game's logo, not its wardrobe.** A reskinnable reward is
  not a signature: three players end up with three different memories of "what a
  clear looks like", so there is no shared screenshot identity and no muscle
  memory. Casual players never open settings, so the "choice" is mostly
  theoretical. Remove it. (Palm, Jony.)
- **Length should change the clear, but as ESCALATION of ONE effect, never as
  N different effects.** Five unrelated looks (5=ripple, 7=spin, 9=fireworks)
  is clutter and actively mis-teaches: the player cannot read "bigger = better"
  if each length is merely *other*. Escalate one effect along monotonic, coupled
  axes so the eye reads *more*, not *new*. (Palm, Jony.)
- **Auto-rotate is a hard NO.** It destroys recognizability (the reward never
  looks the same twice) and breaks the escalation read; and if keyed off
  `state.rng` it would fork the daily seed. Every casual game with a strong
  identity fixes its clear forever. (All three.)
- **Carmack save-trap.** `AppPrefsSchema` is `.strict()`; a returning player has
  `clear_style` persisted. Deleting the key from the schema makes `.strict()`
  reject the blob -> `readJson` returns null -> every OTHER pref (theme,
  reduce-motion, tile size) is silently wiped. The key MUST stay tolerated.
- **Carmack 60fps rule.** Any new clear motion animates `transform`/`opacity`
  only (compositor) and caps per-cell node count; never `filter`/`box-shadow`.
- **Reduce-motion is a comfort control, not a style.** It must survive: `flash`
  stops being a player-facing value and becomes the reduce-motion *render*.

## Decision

### 1. One signature: `ClearStyle = "shockwave" | "flash"`

The player no longer picks a style. `resolveClearStyle()` returns
`reduceMotion ? "flash" : "shockwave"` - the centroid shockwave is the single
signature for all normal play; `flash` is purely the reduce-motion render (CSS
then clamps it to ~1ms). The `from-coin` value, its `originKey` plumbing
(`planClearTiming` loses its `originKey` parameter, `ClearFlashOptions` loses
`originKey`), `resolveClearStyle(hasCoin)`, `cellKeyOf`, and
`balance.json clear.from_coin_step_ms` are all deleted.

### 2. Length escalates intensity, not identity

A longer line drops a heavier stone:

- **Ring size** - the existing `clear.splash_scale_by_length` (5:1.0 -> 9:2.0,
  ADR-0028). Unchanged.
- **Ring COUNT** (new) - `clear.splash_ring_count_by_length` (5-6:1, 7:2,
  8-9:3). `showClearFlash` emits `ringCount - 1` extra concentric rings at the
  cleared-line centroid, staggered by `clear.splash_ring_step_ms` (80ms),
  bigger peak + bolder stroke per ring, reusing the existing `.yn-splash`
  keyframe (transform + opacity only). They are fire-and-forget: they do NOT
  extend the input gate (the per-cell promises bind it); only the splash
  cleanup timer waits for them. Duration stays FLAT - a 9 hits harder, never
  longer.

### 3. Schema safety (no migration owed)

`clear_style?` stays on `AppPrefsSchema` as a VESTIGIAL, ignored field with a
FROZEN back-compat enum `["shockwave","from-coin","flash"]` (decoupled from the
renderer's now-2-value `ClearStyle`) so a returning player's persisted value
still parses. No `schema_version` bump; a future bump + read-side migrator may
drop the key. `balance.json` is bundle config, so no save migration applies.

### 4. Rejected

- A difficulty-style per-length *distinct effect* set (noise; mis-teaches).
- Auto-rotate per run/day (brand erosion; seed-fork risk).
- Deriving the animation from `state.rng` (a cosmetic must never consume a
  draw the board generation depends on).

## Consequences

- Net code DELETION: the picker control, `SettingsState.clearStyle`,
  `SettingsActions.onClearStyleChange`, the `from-coin` branch + origin
  plumbing, and one balance knob all go.
- Tests: the `clear-timing` unit suite drops its two `from-coin` cases and moves
  to the 4-arg `planClearTiming`; the "line clear style" e2e (drove the retired
  picker) is removed. Full suite green (322 unit/contract).
- `reduce_motion` preserved end to end (host branch + CSS `@media` backstop).
- The bigger clears (8/9) now read as a visibly heavier event without any new
  keyframe or any added input latency.

## See also

- [ADR-0030](0030-selectable-clear-styles-and-game-over-ceremony.md) - the picker this retires; its distance-from-origin timing + game-over ceremony stay.
- [ADR-0028](0028-per-motif-clear-burst-color.md) - per-motif burst colour + size-by-length (now joined by count-by-length).
- [ADR-0017](0017-reward-loop-stacked-wave.md) - the LENGTH/INTERSECT/CASCADE reward wave the clear escalation complements.
- [ADR-0009](0009-daily-seed-client-derived.md) - why a cosmetic must not touch the seeded RNG.
