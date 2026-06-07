import { describe, expect, it } from "vitest";
import { formatTimestamp, insertScore } from "@/games/5-in-a-row/ui/leaderboard.js";
import { computeIsNewBest } from "@/games/5-in-a-row/ui/game-over-modal.js";

const FULL_TEN = [
  { score: 100, timestamp_iso: "2025-01-01T00:00:00.000Z" },
  { score: 90, timestamp_iso: "2025-01-02T00:00:00.000Z" },
  { score: 80, timestamp_iso: "2025-01-03T00:00:00.000Z" },
  { score: 70, timestamp_iso: "2025-01-04T00:00:00.000Z" },
  { score: 60, timestamp_iso: "2025-01-05T00:00:00.000Z" },
  { score: 50, timestamp_iso: "2025-01-06T00:00:00.000Z" },
  { score: 40, timestamp_iso: "2025-01-07T00:00:00.000Z" },
  { score: 30, timestamp_iso: "2025-01-08T00:00:00.000Z" },
  { score: 20, timestamp_iso: "2025-01-09T00:00:00.000Z" },
  { score: 15, timestamp_iso: "2025-01-10T00:00:00.000Z" },
];

function isSortedDesc(entries: ReadonlyArray<{ score: number; timestamp_iso: string }>): boolean {
  for (let i = 0; i < entries.length - 1; i++) {
    const a = entries[i];
    const b = entries[i + 1];
    if (a === undefined || b === undefined) return false;
    if (a.score < b.score) return false;
  }
  return true;
}

describe("insertScore", () => {
  it("inserts into an empty list -> length 1", () => {
    const result = insertScore([], 42, "2025-06-07T12:00:00.000Z", 10);
    expect(result.length).toBe(1);
    expect(result[0]).toEqual({ score: 42, timestamp_iso: "2025-06-07T12:00:00.000Z" });
  });

  it("inserts 50 into [100, 30] with maxLength=10 -> [100, 50, 30]", () => {
    const input = [
      { score: 100, timestamp_iso: "2025-01-01T00:00:00.000Z" },
      { score: 30, timestamp_iso: "2025-01-02T00:00:00.000Z" },
    ];
    const result = insertScore(input, 50, "2025-01-03T00:00:00.000Z", 10);
    expect(result.length).toBe(3);
    expect(result.map((e) => e.score)).toEqual([100, 50, 30]);
  });

  it("dropping the new score: insert 10 into a full top-10 of [100..15] -> 10 is dropped", () => {
    const result = insertScore(FULL_TEN, 10, "2025-02-01T00:00:00.000Z", 10);
    expect(result.length).toBe(10);
    expect(result.map((e) => e.score)).toEqual([100, 90, 80, 70, 60, 50, 40, 30, 20, 15]);
    // The new (score=10) entry is not present.
    const containsNew = result.some((e) => e.timestamp_iso === "2025-02-01T00:00:00.000Z");
    expect(containsNew).toBe(false);
  });

  it("inserting 25 into the same full top-10 -> 15 is dropped, 25 lands at position 9", () => {
    const result = insertScore(FULL_TEN, 25, "2025-02-02T00:00:00.000Z", 10);
    expect(result.length).toBe(10);
    expect(result.map((e) => e.score)).toEqual([100, 90, 80, 70, 60, 50, 40, 30, 25, 20]);
    // Index 8 (1-based position 9) is the newly inserted entry.
    expect(result[8]).toEqual({ score: 25, timestamp_iso: "2025-02-02T00:00:00.000Z" });
    // 15 is gone.
    const containsFifteen = result.some((e) => e.score === 15);
    expect(containsFifteen).toBe(false);
  });

  it("equal scores: insert 50 into [100, 50, 30] -> sorted desc and new entry present", () => {
    const input = [
      { score: 100, timestamp_iso: "2025-01-01T00:00:00.000Z" },
      { score: 50, timestamp_iso: "2025-01-02T00:00:00.000Z" },
      { score: 30, timestamp_iso: "2025-01-03T00:00:00.000Z" },
    ];
    const newTs = "2025-06-07T12:00:00.000Z";
    const result = insertScore(input, 50, newTs, 10);
    expect(result.length).toBe(4);
    expect(isSortedDesc(result)).toBe(true);
    const containsNew = result.some((e) => e.timestamp_iso === newTs && e.score === 50);
    expect(containsNew).toBe(true);
  });

  it("does not mutate the input array", () => {
    const input = [
      { score: 100, timestamp_iso: "2025-01-01T00:00:00.000Z" },
      { score: 30, timestamp_iso: "2025-01-02T00:00:00.000Z" },
    ];
    const before = JSON.stringify(input);
    insertScore(input, 50, "2025-01-03T00:00:00.000Z", 10);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("result is always sorted score-descending (adjacent-pair invariant)", () => {
    const result = insertScore(FULL_TEN, 75, "2025-02-03T00:00:00.000Z", 10);
    expect(isSortedDesc(result)).toBe(true);
  });

  it("maxLength=0 -> always returns an empty array", () => {
    const fromEmpty = insertScore([], 42, "2025-06-07T12:00:00.000Z", 0);
    expect(fromEmpty.length).toBe(0);
    const fromFull = insertScore(FULL_TEN, 999, "2025-06-07T12:00:00.000Z", 0);
    expect(fromFull.length).toBe(0);
  });
});

describe("formatTimestamp", () => {
  it("invalid ISO string returns the fallback dash", () => {
    expect(formatTimestamp("not-a-date")).toBe("-");
  });

  it("empty string returns the fallback dash", () => {
    expect(formatTimestamp("")).toBe("-");
  });

  it("same-calendar-year timestamp omits the year", () => {
    const nowIso = new Date().toISOString();
    const result = formatTimestamp(nowIso);
    const currentYear = String(new Date().getFullYear());
    expect(result).not.toContain(currentYear);
  });

  it("different-year timestamp includes the year", () => {
    const result = formatTimestamp("2020-03-15T12:00:00.000Z");
    expect(result).toContain("2020");
  });

  it("current-year January 1 noon contains 'Jan' and '1'", () => {
    const currentYear = new Date().getFullYear();
    // Construct in local time to avoid timezone-rollover ambiguity at year boundary.
    const localJan1 = new Date(currentYear, 0, 1, 12, 0, 0, 0);
    const result = formatTimestamp(localJan1.toISOString());
    expect(result).toContain("Jan");
    expect(result).toContain("1");
  });
});

describe("computeIsNewBest", () => {
  it("empty list -> true (first score ever is vacuously a new best)", () => {
    expect(computeIsNewBest(0, [])).toBe(true);
    expect(computeIsNewBest(42, [])).toBe(true);
  });

  it("score strictly greater than every entry -> true", () => {
    expect(computeIsNewBest(100, [{ score: 50 }, { score: 99 }])).toBe(true);
  });

  it("score equal to an existing entry -> false (tie does not beat)", () => {
    expect(computeIsNewBest(100, [{ score: 100 }, { score: 50 }])).toBe(false);
  });

  it("score below at least one existing entry -> false", () => {
    expect(computeIsNewBest(40, [{ score: 50 }])).toBe(false);
    expect(computeIsNewBest(99, [{ score: 50 }, { score: 100 }])).toBe(false);
  });

  it("reads only the score field (extra entry fields are ignored)", () => {
    const entries = [
      { score: 30, timestamp_iso: "2025-01-01T00:00:00.000Z" },
      { score: 60, timestamp_iso: "2025-01-02T00:00:00.000Z" },
    ];
    expect(computeIsNewBest(70, entries)).toBe(true);
    expect(computeIsNewBest(60, entries)).toBe(false);
  });
});
