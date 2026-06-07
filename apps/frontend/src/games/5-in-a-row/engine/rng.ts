// Seeded PRNG. Mulberry32 (32-bit, well-known, good distribution for casual game).

export type Rng = {
  next(): number;
  nextInt(maxExclusive: number): number;
  pick<T>(items: readonly T[]): T;
  getCursor(): number;
};

export function createRng(seed: number): Rng {
  // Mulberry32 standard recurrence; state is the 32-bit cursor.
  let state = seed | 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const nextInt = (maxExclusive: number): number => {
    if (!Number.isFinite(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError(
        `rng.nextInt: maxExclusive must be a positive finite number, got ${String(maxExclusive)}`,
      );
    }
    return Math.floor(next() * maxExclusive);
  };

  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) {
      throw new RangeError("rng.pick: cannot pick from empty array");
    }
    const idx = nextInt(items.length);
    // idx is in [0, items.length) by construction; narrow T | undefined to T.
    return items[idx] as T;
  };

  const getCursor = (): number => state;

  return { next, nextInt, pick, getCursor };
}

// FNV-1a 32-bit: small, dependency-free hash used to derive a daily-mode seed.
function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function dailySeed(slug: string, date: Date): number {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return fnv1a32(`${slug}-${String(yyyy)}-${mm}-${dd}`);
}
