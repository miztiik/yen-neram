import { test, expect } from "@playwright/test";

test.describe("game smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
  });

  test("navigate to game, board paints with motifs", async ({ page }) => {
    await page.goto("/play/5-in-a-row/");

    const board = page.locator("svg.yn-board-svg");
    await expect(board).toBeVisible({ timeout: 5_000 });

    const cells = page.locator("[data-r][data-c]");
    await expect(cells).toHaveCount(81);

    const motifCells = page.locator("[data-r][data-c]:has(image), [data-r][data-c]:has(use)");
    const motifCount = await motifCells.count();
    expect(
      motifCount,
      `expected at least 5 pre-seeded motifs on first paint, saw ${motifCount}`,
    ).toBeGreaterThanOrEqual(5);
  });

  test("tap a motif, it becomes selected", async ({ page }) => {
    await page.goto("/play/5-in-a-row/");

    const board = page.locator("svg.yn-board-svg");
    await expect(board).toBeVisible({ timeout: 5_000 });

    const motifCell = page
      .locator("[data-r][data-c]:has(image), [data-r][data-c]:has(use)")
      .first();
    await expect(motifCell).toBeVisible({ timeout: 5_000 });

    await motifCell.click();

    await expect(motifCell).toHaveClass(/yn-cell-selected/, { timeout: 1_000 });
  });

  test("zero console errors on game load", async ({ page }) => {
    const errors: string[] = [];

    const onConsole = (msg: import("@playwright/test").ConsoleMessage) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    };
    const onPageError = (err: Error) => {
      errors.push(err.message);
    };

    page.on("console", onConsole);
    page.on("pageerror", onPageError);

    await page.goto("/play/5-in-a-row/");
    await page.waitForLoadState("networkidle");

    page.off("console", onConsole);
    page.off("pageerror", onPageError);

    expect(
      errors.length,
      `game load produced ${errors.length} console error(s); first: ${errors[0] ?? "(none)"}`,
    ).toBe(0);
  });

  test("save round-trip preserves the board", async ({ page }) => {
    await page.goto("/play/5-in-a-row/");

    const board = page.locator("svg.yn-board-svg");
    await expect(board).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("[data-r][data-c]")).toHaveCount(81);

    const before = await page.evaluate(() => {
      const cells = document.querySelectorAll("[data-r][data-c]");
      return Array.from(cells).map((c) => ({
        r: c.getAttribute("data-r"),
        c: c.getAttribute("data-c"),
        runGroup: (c as HTMLElement).dataset["runGroup"] ?? null,
      }));
    });

    await page.reload();

    await expect(board).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("[data-r][data-c]")).toHaveCount(81);

    const after = await page.evaluate(() => {
      const cells = document.querySelectorAll("[data-r][data-c]");
      return Array.from(cells).map((c) => ({
        r: c.getAttribute("data-r"),
        c: c.getAttribute("data-c"),
        runGroup: (c as HTMLElement).dataset["runGroup"] ?? null,
      }));
    });

    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });

  test("back button returns to home", async ({ page }) => {
    await page.goto("/play/5-in-a-row/");

    const backButton = page.getByRole("button", { name: /^Back$/ });
    await expect(backButton).toBeVisible({ timeout: 5_000 });

    await backButton.click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Yen-Neram" })).toBeVisible();
  });
});
