import { test, expect } from "@playwright/test";

// Exercises the "default no grid; grid appears on selection" contract added
// 2026-06-07 (Jony pass, post-HUD-lift). Three asserts per scenario:
//   1) yn-has-selection class on the SVG root reflects the selection state
//   2) Computed stroke on cell rects is transparent vs warm-rgba accordingly
//   3) Computed stroke-width is 0 vs > 0 accordingly
//
// We seed last-mode=infinite so the picker is skipped, then perform real
// Chromium clicks + Escape via page.keyboard so the deselect path is
// exercised the same way a player would.

const GAME_URL = "/play/5-in-a-row/";
const LAST_MODE_KEY = "yn:game:5-in-a-row:last-mode";

type CellPaint = {
  hasSelectionClass: boolean;
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
      hasSelectionClass: svg.classList.contains("yn-has-selection"),
      stroke: cs.stroke,
      strokeWidth: cs.strokeWidth,
    };
  });
}

test.describe("grid-on-selection contract", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate((key) => {
      localStorage.clear();
      localStorage.setItem(key, "infinite");
    }, LAST_MODE_KEY);
  });

  test("default state: no grid (transparent stroke, no yn-has-selection class)", async ({
    page,
  }) => {
    await page.goto(GAME_URL);
    await expect(page.locator("svg.yn-board-svg")).toBeVisible({ timeout: 5_000 });

    const paint = await probeCellPaint(page);

    expect(paint.hasSelectionClass).toBe(false);
    // Computed `stroke: transparent` reports as `rgba(0, 0, 0, 0)` per CSSOM.
    expect(paint.stroke).toBe("rgba(0, 0, 0, 0)");
    expect(paint.strokeWidth).toBe("0px");
  });

  test("after selecting a piece: warm grid appears (rgba terracotta + width > 0)", async ({
    page,
  }) => {
    await page.goto(GAME_URL);
    await expect(page.locator("svg.yn-board-svg")).toBeVisible({ timeout: 5_000 });

    // Click the first cell that holds a real motif (yn-motif, not the
    // 40%-opacity preview pip).
    const motifCell = page.locator("[data-r][data-c]:has(image.yn-motif)").first();
    await expect(motifCell).toBeVisible({ timeout: 5_000 });
    await motifCell.click();

    // Wait for the toggle + setBoard render cycle to commit.
    await expect(page.locator("svg.yn-board-svg.yn-has-selection")).toBeVisible({
      timeout: 1_000,
    });

    const paint = await probeCellPaint(page);

    expect(paint.hasSelectionClass).toBe(true);
    // Stroke is rgba(124, 45, 18, 0.22) per board-view.css. The browser
    // reports rgba with 0-255 channels; assert via regex so a future small
    // alpha tweak doesn't break the test.
    expect(paint.stroke).toMatch(/^rgba\(124,\s*45,\s*18,\s*0\.\d+\)$/);
    // Stroke-width is 0.8 in viewBox units; browsers report the resolved
    // pixel value (varies by SVG render size). The contract here is "more
    // than zero", which is the player-visible part of the bump.
    expect(Number.parseFloat(paint.strokeWidth)).toBeGreaterThan(0);
  });

  test("Escape after select: grid disappears again", async ({ page }) => {
    await page.goto(GAME_URL);
    await expect(page.locator("svg.yn-board-svg")).toBeVisible({ timeout: 5_000 });

    const motifCell = page.locator("[data-r][data-c]:has(image.yn-motif)").first();
    await motifCell.click();
    await expect(page.locator("svg.yn-board-svg.yn-has-selection")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator("svg.yn-board-svg.yn-has-selection")).toHaveCount(0, {
      timeout: 1_000,
    });

    const paint = await probeCellPaint(page);
    expect(paint.hasSelectionClass).toBe(false);
    expect(paint.stroke).toBe("rgba(0, 0, 0, 0)");
    expect(paint.strokeWidth).toBe("0px");
  });

  test("tap-same-cell-again: grid disappears (toggle deselection)", async ({ page }) => {
    await page.goto(GAME_URL);
    await expect(page.locator("svg.yn-board-svg")).toBeVisible({ timeout: 5_000 });

    const motifCell = page.locator("[data-r][data-c]:has(image.yn-motif)").first();
    await motifCell.click();
    await expect(page.locator("svg.yn-board-svg.yn-has-selection")).toBeVisible();

    // Tap the SAME cell again -> deselect.
    await motifCell.click();
    await expect(page.locator("svg.yn-board-svg.yn-has-selection")).toHaveCount(0, {
      timeout: 1_000,
    });

    const paint = await probeCellPaint(page);
    expect(paint.hasSelectionClass).toBe(false);
    expect(paint.stroke).toBe("rgba(0, 0, 0, 0)");
    expect(paint.strokeWidth).toBe("0px");
  });
});
