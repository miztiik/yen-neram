import { test, expect } from "@playwright/test";

// Exercises keyboard navigation on the 5-in-a-row board (extracted into
// ui/keyboard-nav.ts). The board SVG is focusable (tabindex); arrow keys move
// a single `.yn-cell-focused` indicator, Space/Enter dispatch a tap on the
// focused cell, and Escape clears the indicator. This is the a11y keyboard
// path the pointer-tap e2e does not cover.
//
// The replay flag is seeded so the mode picker is skipped (same pattern as the
// other game-board specs).

const GAME_URL = "/play/5-in-a-row/";
const REPLAY_KEY = "yn:game:5-in-a-row:replay-mode";

test.describe("5-in-a-row keyboard navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate((key) => {
      localStorage.clear();
      sessionStorage.setItem(key, "infinite");
    }, REPLAY_KEY);
  });

  test("arrow keys move a single focus indicator to the expected cell", async ({ page }) => {
    await page.goto(GAME_URL);
    const svg = page.locator("svg.yn-board-svg");
    await expect(svg).toBeVisible({ timeout: 5_000 });

    await svg.focus();
    // The first arrow press seeds focus at {0,0} and then applies the move, so
    // one ArrowDown + one ArrowRight lands on row 1, column 1.
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowRight");

    await expect(page.locator(".yn-cell-focused")).toHaveCount(1, { timeout: 1_000 });
    await expect(page.locator('[data-r="1"][data-c="1"]')).toHaveClass(/yn-cell-focused/, {
      timeout: 1_000,
    });
  });

  test("Escape clears the focus indicator", async ({ page }) => {
    await page.goto(GAME_URL);
    const svg = page.locator("svg.yn-board-svg");
    await expect(svg).toBeVisible({ timeout: 5_000 });

    await svg.focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator(".yn-cell-focused")).toHaveCount(1, { timeout: 1_000 });

    await page.keyboard.press("Escape");
    await expect(page.locator(".yn-cell-focused")).toHaveCount(0, { timeout: 1_000 });
  });

  test("Enter on a focused occupied cell selects it (keyboard tap dispatch)", async ({ page }) => {
    await page.goto(GAME_URL);
    const svg = page.locator("svg.yn-board-svg");
    await expect(svg).toBeVisible({ timeout: 5_000 });

    // Land focus on an occupied cell by walking arrows to its coordinate.
    const occupied = page.locator("[data-r][data-c]:has(image.yn-motif)").first();
    await expect(occupied).toBeVisible({ timeout: 5_000 });
    const r = Number(await occupied.getAttribute("data-r"));
    const c = Number(await occupied.getAttribute("data-c"));

    await svg.focus();
    // First arrow seeds focus at {0,0} then moves, so r downs + c rights from
    // the origin land exactly on {r,c}.
    for (let i = 0; i < r; i++) await page.keyboard.press("ArrowDown");
    for (let i = 0; i < c; i++) await page.keyboard.press("ArrowRight");
    // If the piece sits at the origin, one clamped keypress still seeds focus.
    if (r === 0 && c === 0) await page.keyboard.press("ArrowUp");

    const focused = page.locator(`[data-r="${String(r)}"][data-c="${String(c)}"]`);
    await expect(focused).toHaveClass(/yn-cell-focused/, { timeout: 1_000 });

    await page.keyboard.press("Enter");
    await expect(focused).toHaveClass(/yn-cell-selected/, { timeout: 1_000 });
  });
});
