import { test, expect } from "@playwright/test";

test.describe("shell smoke", () => {
  test.beforeEach(async ({ page }) => {
    // Pre-seed the one-shot replay flag so any test that enters the game
    // lands on the board (skipping the launch mode picker, which full-flow
    // covers). sessionStorage survives the same-tab portal -> game nav.
    await page.goto("/");
    await page.evaluate(() => {
      sessionStorage.setItem("yn:game:5-in-a-row:replay-mode", "infinite");
    });
  });
  test("home renders the portal grid with 6 tiles", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Yen-Neram" })).toBeVisible();

    const tiles = page.locator("button");
    await expect(tiles).toHaveCount(6);

    const shipped = page.getByRole("button", { name: "5 in a Row" });
    await expect(shipped).toBeVisible();
    await expect(shipped).toBeEnabled();

    const placeholders = page.getByRole("button", { name: /Coming soon/i });
    await expect(placeholders).toHaveCount(5);

    const placeholderCount = await placeholders.count();
    for (let i = 0; i < placeholderCount; i += 1) {
      await expect(placeholders.nth(i)).toBeDisabled();
    }
  });

  test("clicking the shipped tile routes to /play/5-in-a-row/ and loads the game", async ({
    page,
  }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "5 in a Row" }).click();

    await expect(page).toHaveURL(/.*\/play\/5-in-a-row\/$/);

    // The game UI signal: the board SVG paints + the Menu button is
    // reachable on the bottom bar. (Pre-2026-06-08 this asserted the
    // standalone "Back to home" button; that button is now relocated
    // under the Menu drawer per ADR-0019.)
    await expect(page.locator("svg.yn-board-svg")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
  });

  test("back from the game restores the portal (via Menu)", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "5 in a Row" }).click();

    // Bottom-bar "Back" is gone; reach it via Menu -> Back to home.
    const menuBtn = page.getByRole("button", { name: "Open menu" });
    await expect(menuBtn).toBeVisible({ timeout: 5_000 });
    await menuBtn.click();
    const drawer = page.getByRole("dialog", { name: "Menu" });
    await expect(drawer).toBeVisible({ timeout: 1_000 });
    await drawer.getByRole("button", { name: "Back to home" }).click();

    await expect(page).toHaveURL(/\/$/);

    await expect(page.getByRole("heading", { name: "Yen-Neram" })).toBeVisible();
  });

  test("deep-link to /play/5-in-a-row/ loads the game directly (SPA fallback)", async ({
    page,
  }) => {
    await page.goto("/play/5-in-a-row/");

    await expect(page.locator("svg.yn-board-svg")).toBeVisible({ timeout: 5_000 });
  });

  test("clicking a placeholder tile does nothing (URL unchanged, disabled button)", async ({
    page,
  }) => {
    await page.goto("/");

    const placeholder = page.getByRole("button", { name: /Coming soon/i }).first();
    await expect(placeholder).toHaveAttribute("disabled", "");

    await placeholder.click({ force: true }).catch(() => {
      // disabled buttons may reject the click; that's the expected behaviour
    });

    await expect(page).toHaveURL(/\/$/);
  });

  test("console has zero [error] events on home and on game load", async ({ page }) => {
    const routes = ["/", "/play/5-in-a-row/"];

    for (const route of routes) {
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

      await page.goto(route);
      await page.waitForLoadState("networkidle");

      page.off("console", onConsole);
      page.off("pageerror", onPageError);

      expect(
        errors.length,
        `route ${route} produced ${errors.length} console error(s); first: ${errors[0] ?? "(none)"}`,
      ).toBe(0);
    }
  });
});
