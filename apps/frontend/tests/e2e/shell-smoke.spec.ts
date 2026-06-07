import { test, expect } from "@playwright/test";

test.describe("shell smoke", () => {
  test.beforeEach(async ({ page }) => {
    // Pre-seed last-mode so any test that enters the game lands on the board
    // (skipping the first-launch mode picker, which is covered by full-flow).
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("yn:game:5-in-a-row:last-mode", "infinite");
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

    // The game UI signal: the board SVG paints + a Back button is reachable.
    await expect(page.locator("svg.yn-board-svg")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: /^Back to home$/ })).toBeVisible();
  });

  test("back from the game restores the portal", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "5 in a Row" }).click();

    const backButton = page.getByRole("button", { name: /^Back to home$/ });
    await expect(backButton).toBeVisible({ timeout: 5_000 });

    await backButton.click();

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
