import { describe, expect, it } from "vitest";

import { avoidMonochromePreview } from "@/games/5-in-a-row/ui/turn-loop.js";
import type { PreviewItem } from "@/games/5-in-a-row/types.js";

// Anti-clump nudge (ADR-0037): kills the "three identical useless colours dumped
// at once" feel-bad without an extra RNG draw (daily-safe) and without touching
// a 2-of-3 preview (a pair is shruggable; a clean sweep stings).

const mk = (kinds: number[]): PreviewItem[] => kinds.map((k, i) => ({ row: 0, col: i, kind: k }));
const kinds = (p: readonly PreviewItem[]): number[] => p.map((x) => x.kind);

describe("avoidMonochromePreview", () => {
  it("nudges the last item when the whole preview is one colour", () => {
    expect(kinds(avoidMonochromePreview(mk([3, 3, 3]), 6))).toEqual([3, 3, 4]);
  });

  it("wraps the nudge at the top colour", () => {
    expect(kinds(avoidMonochromePreview(mk([6, 6, 6]), 6))).toEqual([6, 6, 1]);
  });

  it("leaves a 2-of-3 preview alone", () => {
    expect(kinds(avoidMonochromePreview(mk([3, 3, 5]), 6))).toEqual([3, 3, 5]);
  });

  it("leaves a varied preview alone", () => {
    expect(kinds(avoidMonochromePreview(mk([1, 2, 3]), 6))).toEqual([1, 2, 3]);
  });

  it("no-op with a single-colour space (numRunGroups 1)", () => {
    expect(kinds(avoidMonochromePreview(mk([1, 1, 1]), 1))).toEqual([1, 1, 1]);
  });

  it("no-op on a single-item or empty preview", () => {
    expect(kinds(avoidMonochromePreview(mk([3]), 6))).toEqual([3]);
    expect(kinds(avoidMonochromePreview(mk([]), 6))).toEqual([]);
  });

  it("does not mutate its input", () => {
    const input = mk([2, 2, 2]);
    avoidMonochromePreview(input, 6);
    expect(kinds(input)).toEqual([2, 2, 2]);
  });
});
