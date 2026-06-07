import { describe, expect, it } from "vitest";
import { createRng, dailySeed } from "@/games/5-in-a-row/engine/index.js";

describe("createRng", () => {
  it("is deterministic: two RNGs with the same seed produce identical first 10 outputs", () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 10; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it("nextInt(10) yields integers in [0, 10)", () => {
    const rng = createRng(42);
    for (let i = 0; i < 200; i++) {
      const v = rng.nextInt(10);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10);
    }
  });

  it("nextInt(10) covers every bucket 0..9 in 1000 calls", () => {
    const rng = createRng(42);
    const buckets = new Map<number, number>();
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextInt(10);
      buckets.set(v, (buckets.get(v) ?? 0) + 1);
    }
    for (let k = 0; k < 10; k++) {
      expect(buckets.get(k) ?? 0).toBeGreaterThan(0);
    }
  });

  it("nextInt(1) always returns 0", () => {
    const rng = createRng(42);
    for (let i = 0; i < 50; i++) {
      expect(rng.nextInt(1)).toBe(0);
    }
  });

  it("nextInt(0) throws RangeError", () => {
    const rng = createRng(42);
    expect(() => rng.nextInt(0)).toThrow(RangeError);
  });

  it("pick([]) throws RangeError", () => {
    const rng = createRng(42);
    expect(() => rng.pick<string>([])).toThrow(RangeError);
  });

  it("pick returns one of the supplied items and shows distributional variety", () => {
    const rng = createRng(42);
    const items = ["a", "b", "c"] as const;
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const v = rng.pick(items);
      expect(items).toContain(v);
      seen.add(v);
    }
    // Sanity check, not a strict distribution test.
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });

  it("getCursor returns a number that advances after one next() call", () => {
    const rng = createRng(42);
    const c0 = rng.getCursor();
    expect(typeof c0).toBe("number");
    rng.next();
    expect(rng.getCursor()).not.toBe(c0);
  });
});

describe("dailySeed", () => {
  it("is deterministic across repeat calls with the same date", () => {
    const date = new Date("2026-06-07T12:00:00Z");
    expect(dailySeed("5-in-a-row", date)).toBe(dailySeed("5-in-a-row", date));
  });

  it("yields a different seed for adjacent days", () => {
    const d1 = new Date("2026-06-07");
    const d2 = new Date("2026-06-08");
    expect(dailySeed("5-in-a-row", d1)).not.toBe(dailySeed("5-in-a-row", d2));
  });

  it("yields a different seed for different game slugs on the same date", () => {
    const date = new Date("2026-06-07T12:00:00Z");
    expect(dailySeed("game-A", date)).not.toBe(dailySeed("game-B", date));
  });
});
