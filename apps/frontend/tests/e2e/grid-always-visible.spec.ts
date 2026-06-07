import { test, expect } from "@playwright/test";

// Exercises the "grid is always visible" contract (revised 2026-06-07,
// superseded the earlier grid-on-selection design). The 9x9 structure is
// always painted so the player can read cell boundaries regardless of
// whether a piece is picked up. Two asserts per scenario:
//   1) Computed stroke on cell rects is a non-transparent color
//   2) Computed stroke-width is >= 1 CSS px so the line actually paints
//      (sub-1px strokes rasterise as invisible on most viewports -- see
//      the historical bug behind this guard in board-view.css).
//
// We seed last-mode=infinite so the picker is skipped, then exercise both
// the default state and the post-tap state to prove neither toggles the
// grid off.

const GAME_URL = "/play/5-in-a-row/";
const LAST_MODE_KEY = "yn:game:5-in-a-row:last-mode";

type CellPaint = {
  stroke: string;
  strokeWidth: string;
};

async function probeCellPaint(page: import("@playwright/test").Page): Promise<CellPaint> {
  return page.evaluate((): CellPaint => {
    const svg = document.querySelector("svg.yn-board-svg");
    if (svg === null) {
      throw new Error("no SVG board on page");
    }
    const rect = svg.querySelector("rect.yn-cell-bg");
    if (rect === null) {
      throw new Error("no cell rect inside SVG");
    }
    const cs = getComputedStyle(rect);
    return {
      stroke: cs.stroke,
      strokeWidth: cs.strokeWidth,
    };
  });
}

function expectGridPainted(paint: CellPaint): void {
  // A non-transparent stroke is anything other than `rgba(0, 0, 0, 0)`,
  // which is what CSSOM returns for `stroke: transparent` or unset stroke.
  expect(paint.stroke).not.toBe("rgba(0, 0, 0, 0)");
  // Chromium parses unitless CSS stroke-width as CSS px; require >= 1 so
  // the line actually rasterises (sub-pixel strokes were the historical
  // ghost-grid bug). 1px is the contract baseline for `.yn-cell-bg`.
  expect(Number.parseFloat(paint.strokeWidth)).toBeGreaterThanOrEqual(1);
}

test.describe("grid-always-visible contract", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate((key) => {
      localStorage.clear();
      localStorage.setItem(key, "infinite");
    }, LAST_MODE_KEY);
  });

  test("default state: grid is painted on every cell with a non-transparent stroke", async ({
    page,
  }) => {
    await page.goto(GAME_URL);
    await expect(page.locator("svg.yn-board-svg")).toBeVisible({ timeout: 5_000 });

    const paint = await probeCellPaint(page);
    expectGridPainted(paint);
  });

  test("after selecting a piece: grid remains painted (selection does not toggle grid off)", async ({
    page,
  }) => {
    await page.goto(GAME_URL);
    await expect(page.locator("svg.yn-board-svg")).toBeVisible({ timeout: 5_000 });

    const motifCell = page.locator("[data-r][data-c]:has(image.yn-motif)").first();
    await expect(motifCell).toBeVisible({ timeout: 5_000 });
    await motifCell.click();
    await expect(motifCell).toHaveClass(/yn-cell-selected/, { timeout: 1_000 });

    const paint = await probeCellPaint(page);
    expectGridPainted(paint);
  });

  test("after Escape deselect: grid remains painted", async ({ page }) => {
    await page.goto(GAME_URL);
    await expect(page.locator("svg.yn-board-svg")).toBeVisible({ timeout: 5_000 });

    const motifCell = page.locator("[data-r][data-c]:has(image.yn-motif)").first();
    await motifCell.click();
    await expect(motifCell).toHaveClass(/yn-cell-selected/, { timeout: 1_000 });
    await page.keyboard.press("Escape");
    await expect(page.locator(".yn-cell-selected")).toHaveCount(0, { timeout: 1_000 });

    const paint = await probeCellPaint(page);
    expectGridPainted(paint);
  });
});
