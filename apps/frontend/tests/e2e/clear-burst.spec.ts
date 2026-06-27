import { test, expect } from "@playwright/test";

// ADR-0028: the clear-burst (juice-splash) must paint in the cleared motif's
// OWN colour, not a hardcoded pink. This is the regression that would have
// caught the original bug (a theme-blind `SPLASH_FILL` constant): we seed a
// board that is one legal move from a 5-in-a-row of run-group 1, perform the
// move, and assert the splash ring that fires carries motif 1's colour
// (#f43f5e watermelon in tropical-fruits) and is a stroked ring (fill: none).

const GAME_URL = "/play/5-in-a-row/";

test.describe("clear-burst per-motif colour (ADR-0028)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
  });

  test("a cleared line bursts in the motif's own colour as an expanding ring", async ({ page }) => {
    await page.goto(GAME_URL);
    await page.evaluate(() => {
      // Pin the theme so the expected colour is deterministic regardless of
      // the default; tropical-fruits motif 1 (watermelon) is #f43f5e.
      localStorage.setItem("yn:app", JSON.stringify({ selected_theme: "tropical-fruits" }));

      type Cell = null | { runGroup: number };
      const board: Cell[][] = Array.from({ length: 9 }, () =>
        Array.from({ length: 9 }, (): Cell => null),
      );
      // Four run-group-1 pieces at (0,1)..(0,4) and a mover at (1,0). Sliding
      // the mover up to (0,0) completes (0,0)..(0,4) -> a 5-clear of motif 1.
      board[0]![1] = { runGroup: 1 };
      board[0]![2] = { runGroup: 1 };
      board[0]![3] = { runGroup: 1 };
      board[0]![4] = { runGroup: 1 };
      board[1]![0] = { runGroup: 1 };
      const save = {
        schema_version: 2,
        mode: "infinite",
        in_progress: {
          board,
          selected_cell: null,
          next_preview: [
            { row: 5, col: 5, kind: 2 },
            { row: 6, col: 6, kind: 3 },
            { row: 7, col: 7, kind: 4 },
          ],
          score: 0,
          turn_seed: 42,
          undo: { available: true, snapshot: null },
          mode_state: { kind: "infinite" },
        },
        high_scores: { infinite: [], max_points: [], timed: [] },
        streak: null,
      };
      localStorage.setItem("yn:game:5-in-a-row", JSON.stringify(save));
    });
    await page.reload();
    await expect(page.locator("svg.yn-board-svg")).toBeVisible({ timeout: 5_000 });

    // Select the mover at (1,0), then move it to the empty (0,0): completes the
    // row and triggers the clear.
    await page.locator('[data-r="1"][data-c="0"]').click();
    await page.locator('[data-r="0"][data-c="0"]').click();

    // The splash is transient (~550ms after a ~530ms pre-clear/slide lead-in),
    // so capture its colour + fill atomically while it exists in the DOM.
    const handle = await page.waitForFunction(
      () => {
        const el = document.querySelector(".yn-splash");
        if (el === null) return null;
        return {
          splash: (el as SVGElement).style.getPropertyValue("--yn-splash").trim(),
          fill: getComputedStyle(el).fill,
        };
      },
      undefined,
      { timeout: 6_000 },
    );
    const result = (await handle.jsonValue()) as { splash: string; fill: string };

    // Themed, not the old hardcoded pink.
    expect(result.splash).toBe("#f43f5e");
    expect(result.splash).not.toContain("244, 114, 182");
    // Ring, not a filled disc.
    expect(result.fill).toBe("none");
  });
});
