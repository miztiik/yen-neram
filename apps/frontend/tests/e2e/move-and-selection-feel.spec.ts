import { test, expect } from "@playwright/test";

// Regression guards for move-settle + one-shot selection. Two
// player-reported mid-tier-Android bugs:
//   1. The selected-piece shrink/grow "vibrated" -- a perpetual breathing
//      pulse (reintroduced by ADR-0026) re-rasterised the two drop-shadow
//      filters every frame on a weak GPU. The fix replaces it with a one-shot
//      pop (yn-select-in) that pops once and holds.
//   2. The piece sliding to its target "stuttered" -- a full 81-cell setBoard
//      sat in the seam between the slide and the land-bounce, and the moved
//      piece popped in from scale 0.3 like a spawned piece. The fix hands the
//      piece node off to the destination (no mid-seam rebuild) and settles it
//      with a gentle 1 -> 1.08 -> 1 overshoot.
test.describe("move + selection feel", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      // Skip the launch mode picker so these smoke tests land on the board.
      sessionStorage.setItem("yn:game:5-in-a-row:replay-mode", "infinite");
    });
  });

  test("selected piece pops ONCE and holds -- no perpetual breathing pulse", async ({ page }) => {
    await page.goto("/play/5-in-a-row/");
    const board = page.locator("svg.yn-board-svg");
    await expect(board).toBeVisible({ timeout: 5_000 });

    const motifCell = page.locator("[data-r][data-c]:has(image.yn-motif)").first();
    await expect(motifCell).toBeVisible({ timeout: 5_000 });
    await motifCell.click();
    await expect(motifCell).toHaveClass(/yn-cell-selected/, { timeout: 1_000 });

    // The selected motif must animate with the one-shot select-in pop, NOT the
    // old infinite yn-pulse breathing. An `infinite` iteration-count here is the
    // exact regression (constant motion that reads as "vibrating" on Android).
    const anim = await motifCell.locator("image.yn-motif").evaluate((el) => {
      const cs = getComputedStyle(el);
      return { name: cs.animationName, iterations: cs.animationIterationCount };
    });
    expect(anim.name, "selected motif must use the one-shot select-in keyframe").toBe(
      "yn-select-in",
    );
    expect(
      anim.iterations,
      "selected motif must NOT loop forever (the Android 'vibration' regression)",
    ).not.toBe("infinite");
    expect(anim.iterations).toBe("1");
  });

  test("an adjacent move lands the piece at the destination and empties the source", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/play/5-in-a-row/");
    const board = page.locator("svg.yn-board-svg");
    await expect(board).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("[data-r][data-c]")).toHaveCount(81);

    // Drive a real touch move: a filled cell with an empty orthogonal neighbour
    // (guaranteed reachable in one step), tap source then tap the neighbour.
    const move = await page.evaluate(async () => {
      const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
      const cellAt = (r: number, c: number): Element | null =>
        document.querySelector(`[data-r="${String(r)}"][data-c="${String(c)}"]`);
      const isEmptyAt = (r: number, c: number): boolean => {
        const g = cellAt(r, c);
        return g !== null && (g.getAttribute("aria-label") ?? "").startsWith("Empty");
      };
      function tap(r: number, c: number): void {
        const g = cellAt(r, c);
        if (g === null) return;
        const b = g.getBoundingClientRect();
        const o: PointerEventInit = {
          pointerType: "touch",
          bubbles: true,
          cancelable: true,
          clientX: b.x + b.width / 2,
          clientY: b.y + b.height / 2,
          pointerId: 1,
          isPrimary: true,
        };
        g.dispatchEvent(new PointerEvent("pointerdown", o));
        g.dispatchEvent(new PointerEvent("pointerup", o));
      }

      const filled = Array.from(document.querySelectorAll("[data-r]")).filter((g) =>
        (g.getAttribute("aria-label") ?? "").startsWith("Piece"),
      );
      let src: { r: number; c: number } | null = null;
      let dst: { r: number; c: number } | null = null;
      for (const g of filled) {
        const r = Number(g.getAttribute("data-r"));
        const c = Number(g.getAttribute("data-c"));
        for (const [dr, dc] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ] as const) {
          if (isEmptyAt(r + dr, c + dc)) {
            src = { r, c };
            dst = { r: r + dr, c: c + dc };
            break;
          }
        }
        if (src !== null) break;
      }
      if (src === null || dst === null) return { ok: false as const };

      tap(src.r, src.c);
      await sleep(60);
      tap(dst.r, dst.c);
      // Wait out the slide (150ms) + settle (180ms) + the input buffer window.
      await sleep(1_200);

      const srcAria = cellAt(src.r, src.c)?.getAttribute("aria-label") ?? "";
      const dstAria = cellAt(dst.r, dst.c)?.getAttribute("aria-label") ?? "";
      return { ok: true as const, srcAria, dstAria };
    });

    expect(move.ok, "could not find a reachable one-step move on the seeded board").toBe(true);
    if (move.ok) {
      expect(move.srcAria, "the source cell must be empty after the piece moved out").toMatch(
        /^Empty cell/,
      );
      expect(move.dstAria, "the destination cell must hold the moved piece").toMatch(
        /^Piece type /,
      );
    }
    expect(errors, `no console errors during a move, saw: ${errors.join(" | ")}`).toEqual([]);
  });
});
