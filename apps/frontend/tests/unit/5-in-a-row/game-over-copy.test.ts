import { describe, expect, it } from "vitest";
import { buildHeaderCopy, type GameOverContext } from "@/games/5-in-a-row/ui/game-over-modal.js";

// Palm pass 2026-06-08 doctrine (CLAUDE.md sec 14 advisor):
// - Loss copy frames the run as progress, not failure. The distance to
//   the player's stored best is the hook: a near-miss is more
//   motivating than "Game over".
// - PB copy quantifies the win against the previous best so the
//   player FEELS the climb, not just the badge. The 50th PB of a hot
//   streak still earns the same line; the cost is one int subtract.
// - First-ever recorded run gets bespoke copy on both branches because
//   there's no comparison anchor (no top1, or top1 IS this game).

// Minimal context builder: tests only feed the fields buildHeaderCopy
// reads (mode, score, isNewPersonalBest, topThree). The rest of the
// GameOverContext is filled with empty defaults to keep tests focused
// on the copy-rule under test.
function makeContext(partial: {
  readonly score: number;
  readonly isNewPersonalBest: boolean;
  readonly topThree: GameOverContext["topThree"];
}): GameOverContext {
  return {
    mode: "infinite",
    score: partial.score,
    isNewPersonalBest: partial.isNewPersonalBest,
    topThree: partial.topThree,
    modeMeta: { kind: "infinite" },
    streak: null,
  };
}

describe("buildHeaderCopy (game-over modal title + subtitle)", () => {
  describe("loss path (not a new personal best)", () => {
    it("subtitle quantifies the deficit to top-1", () => {
      const ctx = makeContext({
        score: 80,
        isNewPersonalBest: false,
        topThree: [
          { score: 100, timestamp_iso: "2026-06-01T00:00:00.000Z", isThisGame: false },
          { score: 80, timestamp_iso: "2026-06-08T00:00:00.000Z", isThisGame: true },
        ],
      });
      const { title, subtitle } = buildHeaderCopy(ctx);
      expect(title).toBe("Nice run.");
      expect(subtitle).toBe("20 points to your best.");
    });

    it("tied your best: subtitle acknowledges the tie", () => {
      // The just-recorded score equals the existing top-1 -- the
      // computeIsNewBest helper would mark this as NOT a new best
      // (ties are not strictly greater), so we land in this branch.
      const ctx = makeContext({
        score: 100,
        isNewPersonalBest: false,
        topThree: [
          { score: 100, timestamp_iso: "2026-06-01T00:00:00.000Z", isThisGame: false },
          { score: 100, timestamp_iso: "2026-06-08T00:00:00.000Z", isThisGame: true },
        ],
      });
      const { title, subtitle } = buildHeaderCopy(ctx);
      expect(title).toBe("Nice run.");
      expect(subtitle).toBe("Tied your best.");
    });

    it("no top-1 yet AND not a new best (e.g. scored 0): subtitle is null", () => {
      // Edge case: the player scored 0 (no recorded entry) on the
      // first ever run. computeIsNewBest with an empty `otherScores`
      // is vacuously TRUE, but the rendered leaderboard might have
      // no entries either. Defensive: skip the deficit line.
      const ctx = makeContext({
        score: 0,
        isNewPersonalBest: false,
        topThree: [],
      });
      const { title, subtitle } = buildHeaderCopy(ctx);
      expect(title).toBe("Nice run.");
      expect(subtitle).toBeNull();
    });
  });

  describe("personal-best path", () => {
    it("subtitle quantifies the gain over the previous top-1", () => {
      // This game is now top-1 (just inserted at position 0). Previous
      // top-1 is topThree[1].
      const ctx = makeContext({
        score: 150,
        isNewPersonalBest: true,
        topThree: [
          { score: 150, timestamp_iso: "2026-06-08T00:00:00.000Z", isThisGame: true },
          { score: 100, timestamp_iso: "2026-06-01T00:00:00.000Z", isThisGame: false },
        ],
      });
      const { title, subtitle } = buildHeaderCopy(ctx);
      expect(title).toBe("New best!");
      expect(subtitle).toBe("+50 over your last.");
    });

    it("first ever recorded run: bespoke 'first run' subtitle", () => {
      // Player's first ever game. topThree[0] IS this game; topThree[1]
      // is undefined. No previous best to compare against.
      const ctx = makeContext({
        score: 42,
        isNewPersonalBest: true,
        topThree: [{ score: 42, timestamp_iso: "2026-06-08T00:00:00.000Z", isThisGame: true }],
      });
      const { title, subtitle } = buildHeaderCopy(ctx);
      expect(title).toBe("New best!");
      expect(subtitle).toBe("Your first run on the board.");
    });

    it("PB delta == 0 (defensive): clean celebration line, not '+0'", () => {
      // Defensive branch: isNewPersonalBest implies score > all others,
      // so delta > 0 is the contract. But if a caller ever passes a
      // tie as a PB (shouldn't), we don't want to show "+0 over your
      // last." -- that reads as broken.
      const ctx = makeContext({
        score: 100,
        isNewPersonalBest: true,
        topThree: [
          { score: 100, timestamp_iso: "2026-06-08T00:00:00.000Z", isThisGame: true },
          { score: 100, timestamp_iso: "2026-06-01T00:00:00.000Z", isThisGame: false },
        ],
      });
      const { title, subtitle } = buildHeaderCopy(ctx);
      expect(title).toBe("New best!");
      expect(subtitle).toBe("Top of the board.");
    });
  });
});
