# ADR-0039: Revert the anti-clump preview nudge (spawn concentration is a feature)

**Last Updated**: 2026-06-28
**Status**: Accepted (supersedes [ADR-0037](0037-anti-clump-preview-nudge.md))
**Born in**: An experienced player reported "the game seems to have gotten more difficult now with the new algo" + a unanimous Palm / Carmack / Player council
**Affects**: `apps/frontend/src/games/5-in-a-row/{balance.json,balance.schema.ts,ui/turn-loop.ts}`, `apps/frontend/tests/contract/balance.schema.test.ts`, deletes `apps/frontend/tests/unit/5-in-a-row/preview-anticlump.test.ts`

## Context

ADR-0037 added `spawn_avoid_triple`: when all three "Next" preview tiles came up
one colour, the last was nudged to a different colour, to cure the "three
identical useless colours dumped at once" feel-bad. After it (and the rest of
the 8-improvement set) shipped, an experienced player reported the game felt
_harder_.

An audit of the cumulative `balance.json` diff settled it: the **core difficulty
knobs never changed** (`spawn_per_turn=3`, `num_run_groups=6`,
`min_line_length=5`, `initial_seed_count=5`, `length_multipliers`). The only two
gameplay-affecting edits were `opening_cluster_size=3` (ADR-0035, _easier_
opening) and `spawn_avoid_triple=true` (ADR-0037) -- plus the shuffle lifeline
(ADR-0038, _easier_). So `spawn_avoid_triple` is the **only** change that leaned
harder, and the council found it leans harder _against skill_:

- The preview carries `kind` **and** the landing `row`/`col` (`PreviewItem`), so
  a same-colour triple is not a blind scatter -- it is three _known_ cells of
  one colour handed to the player in advance. For a Color-Lines builder
  concentrating on one colour, that is a **windfall**, not clutter.
- The nudge converts `[X,X,X]` into `[X,X,Y]`: it **removes** a tile of the
  colour the player is building **and adds** an off-colour blocker -- a double
  hit that raises board colour-diversity and lowers a skilled player's clear
  rate while board-fill stays fixed at 3/turn.
- It also **contradicts** ADR-0035: the opening cluster teaches "same colour
  together = good, build on it," then the preview nudge says "same colour
  together = bad, I will protect you from it." The opening cluster is the
  stronger idea; the nudge yields.

## Decision

Revert ADR-0037 entirely. Delete `spawn_avoid_triple` (knob, schema field,
`avoidMonochromePreview`, the `rollPreview` param + gated call, both call-site
args, and the `preview-anticlump` unit test). The spawn is i.i.d. again.

- **Standing principle (record it):** _spawn concentration is a feature for
  skilled players; the verb rewards lining up one colour, and the opening
  cluster teaches it, so the game must NOT "protect" players from same-colour
  spawns._ A future "fairness" nudge that fights the verb should not be re-added.
- **Keep what is net-easier:** `opening_cluster_size` (ADR-0035) and the shuffle
  lifeline (ADR-0038) stay -- they are mastery-respecting and serve the player.
- **Do NOT ease the core:** the player said "feels harder," not "too hard." A
  veteran's "reaching 500 is very hard" is a skill ceiling to preserve, not a
  request for relief. No `num_run_groups` / `spawn_per_turn` / `min_line_length`
  change, and no difficulty ramp (still rejected). If, after this revert, runs
  still die at a dead-board wall, the only sanctioned lever is widening the
  existing lifeline (`shuffle.fullness`), shipped separately and measured first.

## Consequences

- Removes the one player-negative change; the daily again hands out the
  occasional same-colour triple a skilled builder can exploit.
- **Golden-master-safe and cursor-identical.** The nudge made zero RNG draws and
  the daily golden-master fixture already ran with the flag off
  (`spawn_avoid_triple ?? false`), so deleting the post-pass does not move the
  pinned starting board or first preview, and a mid-game reload resumes the exact
  same stream (ADR-0034). No save-format break -- `balance.json` is bundled
  config, not persisted user data, so no `schema_version` bump is owed.
- Net code: -1 knob, -1 schema field, -1 function (~17 lines), -7 unit tests, -1
  contract assertion. The `pickRunGroup` / `rollPreview` seam (ADR-0034) is
  retained as the single home for any future, _measured_, correct-directioned
  distribution change.

## See also

- [0037-anti-clump-preview-nudge.md](0037-anti-clump-preview-nudge.md) - the decision this reverts.
- [0035-opening-cluster-fast-first-clear.md](0035-opening-cluster-fast-first-clear.md) - the "same colour together = good" lesson this realigns with.
- [0038-stuck-valve-shuffle.md](0038-stuck-valve-shuffle.md) - the real, mastery-respecting answer to a stuck/dead board.
- [0034-persist-rng-cursor-and-pin-daily-board.md](0034-persist-rng-cursor-and-pin-daily-board.md) - the `pickRunGroup` seam retained for any future spawn-distribution work, and the golden master this revert keeps green.
