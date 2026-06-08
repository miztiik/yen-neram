import { test, expect } from "@playwright/test";

// Extended v1 flows that complement shell-smoke + game-smoke:
// mode-picker first launch + persistence, save preservation across portal
// round-trips, settings drawer + how-to-play modal, exploratory long-press.

const GAME_URL = "/play/5-in-a-row/";
const LAST_MODE_KEY = "yn:game:5-in-a-row:last-mode";

type CellSnapshot = {
  r: string | null;
  c: string | null;
  runGroup: string | null;
  hasMotif: boolean;
};

test.describe("full v1 flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
  });

  test("mode picker appears on first launch", async ({ page }) => {
    await page.goto(GAME_URL);

    const infinite = page.getByRole("button", { name: "Infinite" });
    const maxPoints = page.getByRole("button", { name: "Max Points" });

    await expect(infinite).toBeVisible({ timeout: 5_000 });
    await expect(maxPoints).toBeVisible();

    await expect(infinite).toContainText(/play until the board fills/i);
    await expect(maxPoints).toContainText(/today's seed/i);
  });

  test("mode picker persists the chosen mode for subsequent launches", async ({ page }) => {
    await page.goto(GAME_URL);

    await page.getByRole("button", { name: "Infinite" }).click();

    await expect(page.locator("svg.yn-board-svg")).toBeVisible({ timeout: 5_000 });

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Yen-Neram" })).toBeVisible();

    await page.goto(GAME_URL);
    await expect(page.locator("svg.yn-board-svg")).toBeVisible({ timeout: 5_000 });

    await expect(page.getByRole("button", { name: "Infinite" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Max Points" })).toHaveCount(0);

    const lastMode = await page.evaluate((key) => localStorage.getItem(key), LAST_MODE_KEY);
    expect(lastMode).toBe("infinite");
  });

  test("home -> game -> back -> home -> game preserves the in-progress save", async ({ page }) => {
    await page.goto(GAME_URL);
    await page.getByRole("button", { name: "Infinite" }).click();

    const board = page.locator("svg.yn-board-svg");
    await expect(board).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("[data-r][data-c]")).toHaveCount(81);

    const snapshot = async (): Promise<CellSnapshot[]> =>
      page.evaluate(() => {
        const cells = document.querySelectorAll("[data-r][data-c]");
        return Array.from(cells).map((c) => ({
          r: c.getAttribute("data-r"),
          c: c.getAttribute("data-c"),
          runGroup: (c as HTMLElement).dataset["runGroup"] ?? null,
          hasMotif: c.querySelector("image, use") !== null,
        }));
      });

    const before = await snapshot();

    await page.getByRole("button", { name: /^Back to home$/ }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Yen-Neram" })).toBeVisible();

    await page.getByRole("button", { name: "5 in a Row" }).click();
    await expect(board).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("[data-r][data-c]")).toHaveCount(81);

    const after = await snapshot();

    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });

  test("settings drawer opens from the pause button", async ({ page }) => {
    await page.goto(GAME_URL);
    await page.getByRole("button", { name: "Infinite" }).click();
    await expect(page.locator("svg.yn-board-svg")).toBeVisible({ timeout: 5_000 });

    await page.getByRole("button", { name: "Pause" }).click();

    const drawer = page.getByRole("dialog", { name: "Settings" });
    await expect(drawer).toBeVisible({ timeout: 1_000 });
    await expect(drawer.getByRole("heading", { name: "Settings" })).toBeVisible();

    const swatches = drawer.locator("[data-theme-id]");
    await expect(swatches).toHaveCount(2);
    await expect(drawer.locator('[data-theme-id="origami"]')).toBeVisible();
    await expect(drawer.locator('[data-theme-id="tropical-fruits"]')).toBeVisible();
  });

  test("how-to-play modal opens from the settings drawer", async ({ page }) => {
    await page.goto(GAME_URL);
    await page.getByRole("button", { name: "Infinite" }).click();
    await expect(page.locator("svg.yn-board-svg")).toBeVisible({ timeout: 5_000 });

    await page.getByRole("button", { name: "Pause" }).click();

    const drawer = page.getByRole("dialog", { name: "Settings" });
    await expect(drawer).toBeVisible({ timeout: 1_000 });

    await drawer.getByRole("button", { name: "How to play" }).click();

    const modal = page.getByRole("dialog", { name: "How to play" });
    await expect(modal).toBeVisible({ timeout: 1_000 });
    await expect(modal.getByText(/Tap a piece/i)).toBeVisible();

    await modal.getByRole("button", { name: "Got it" }).click();
    await expect(modal).toHaveCount(0);
  });

  test("leaderboard opens from settings drawer", async ({ page }) => {
    await page.goto(GAME_URL);
    await page.getByRole("button", { name: "Infinite" }).click();

    const board = page.locator("svg.yn-board-svg");
    await expect(board).toBeVisible({ timeout: 5_000 });

    await page.getByRole("button", { name: "Pause" }).click();
    // Exact-match regex avoids substring-matching the "Clear high scores"
    // destructive button in the same drawer.
    await page.getByRole("button", { name: /^High Scores$/ }).click();

    // The leaderboard modal renders an <h2>High Scores</h2> heading
    // (distinct from the same-text button that opened it) plus an empty
    // state message ("No scores yet. Play a game!") for the initial mode.
    await expect(page.getByRole("heading", { level: 2, name: "High Scores" })).toBeVisible({
      timeout: 2_000,
    });
    await expect(page.getByText(/No scores yet/i)).toBeVisible({ timeout: 2_000 });
  });

  test("preview bounce: default on, toggles off via Settings, pref persists", async ({ page }) => {
    await page.goto(GAME_URL);
    await page.getByRole("button", { name: "Infinite" }).click();

    const board = page.locator("svg.yn-board-svg");
    await expect(board).toBeVisible({ timeout: 5_000 });

    // Default: SVG root carries the bounce class so the CSS keyframe runs
    // on every preview motif. App pref absent => default-on at the call site.
    await expect(board).toHaveClass(/yn-preview-bounce/, { timeout: 2_000 });

    // Toggle off.
    await page.getByRole("button", { name: "Pause" }).click();
    const drawer = page.getByRole("dialog", { name: "Settings" });
    await expect(drawer).toBeVisible({ timeout: 1_000 });
    // Locate the row by its span label (makeToggle puts the label in a
    // <span>; the toggle button sits next to it inside a shared <div> row).
    const bounceRow = drawer.locator("div", {
      has: page.getByText("Preview bounce", { exact: true }),
    });
    const bounceToggle = bounceRow.getByRole("switch");
    await expect(bounceToggle).toHaveAttribute("aria-checked", "true");
    await bounceToggle.click();
    await expect(bounceToggle).toHaveAttribute("aria-checked", "false");

    // Class is removed live (no reload needed).
    await expect(board).not.toHaveClass(/yn-preview-bounce/, { timeout: 1_000 });

    // Pref persists to `yn:app`.
    const stored = await page.evaluate(() => localStorage.getItem("yn:app"));
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored ?? "{}") as { preview_bounce_enabled?: boolean };
    expect(parsed.preview_bounce_enabled).toBe(false);
  });

  test("long-pressing an empty cell does not crash the game", async ({ page }) => {
    await page.goto(GAME_URL);
    await page.getByRole("button", { name: "Infinite" }).click();

    const board = page.locator("svg.yn-board-svg");
    await expect(board).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("[data-r][data-c]")).toHaveCount(81);

    const filledCell = page.locator("[data-r][data-c]:has(image.yn-motif)").first();
    await expect(filledCell).toBeVisible({ timeout: 5_000 });
    await filledCell.click();
    await expect(filledCell).toHaveClass(/yn-cell-selected/, { timeout: 1_000 });

    // Empty cell = no full motif AND no preview pip.
    const emptyCell = page
      .locator("[data-r][data-c]:not(:has(image.yn-motif)):not(:has(image.yn-preview-motif))")
      .first();
    await expect(emptyCell).toBeVisible({ timeout: 5_000 });

    await emptyCell.hover({ force: true });
    await page.mouse.down();
    // Long-press threshold in board-view.ts is 500ms; 600ms clears it.
    await page.waitForTimeout(600);
    await page.mouse.up();

    await expect(page).toHaveURL(/.*\/play\/5-in-a-row\/$/);
    await expect(board).toBeVisible();
    await expect(page.locator("[data-r][data-c]")).toHaveCount(81);
  });

  test("BEST chip is hidden on a fresh save with no stored high score", async ({ page }) => {
    // Fresh localStorage (beforeEach cleared it); fresh save has
    // high_scores.infinite === [] so allTimeBestAtMount === 0 and
    // state.score === 0, which puts the chip in the hidden state per
    // renderBestChip's visibility guard.
    await page.goto(GAME_URL);
    await page.getByRole("button", { name: "Infinite" }).click();
    await expect(page.locator("svg.yn-board-svg")).toBeVisible({ timeout: 5_000 });

    const bestChip = page.locator(".yn-best-chip");
    await expect(bestChip).toHaveClass(/hidden/);
  });

  test("BEST chip shows the all-time top score for the current mode on mount", async ({ page }) => {
    // Seed the per-game save with a stored high score and the mode
    // picker skip key. Schema v2 shape (see 5-in-a-row.save.schema.ts).
    await page.goto(GAME_URL);
    await page.evaluate(() => {
      const save = {
        schema_version: 2,
        mode: "infinite",
        in_progress: null,
        high_scores: {
          infinite: [{ score: 123, timestamp_iso: new Date().toISOString() }],
          max_points: [],
          timed: [],
        },
        streak: null,
      };
      localStorage.setItem("yn:game:5-in-a-row", JSON.stringify(save));
      localStorage.setItem("yn:game:5-in-a-row:last-mode", "infinite");
    });
    await page.reload();

    await expect(page.locator("svg.yn-board-svg")).toBeVisible({ timeout: 5_000 });

    // Chip is visible (NOT hidden) and shows the stored all-time best.
    // The displayed integer lives in a CSS @property + counter() pseudo
    // (.yn-best-display::after content: counter(yn-best)), so it does
    // NOT surface in Playwright's text queries. Check the inline custom
    // property directly + the aria-label (which the game host keeps in
    // sync as the screen-reader-readable mirror of the displayed value).
    const bestChip = page.locator(".yn-best-chip");
    await expect(bestChip).not.toHaveClass(/hidden/, { timeout: 2_000 });
    await expect(bestChip).toHaveAttribute("aria-label", "Best 123");
    const renderedCount = await page
      .locator(".yn-best-display")
      .evaluate((el) => (el as HTMLElement).style.getPropertyValue("--yn-best-count"));
    expect(renderedCount).toBe("123");
    // Label reads "Best" (not yet crossed since state.score === 0 < 123).
    await expect(bestChip).toContainText(/Best/i);
    await expect(bestChip).not.toHaveClass(/yn-best-chip--crossed/);
  });

  test("how-to-play modal explains legal and illegal moves", async ({ page }) => {
    await page.goto(GAME_URL);
    await page.getByRole("button", { name: "Infinite" }).click();
    await expect(page.locator("svg.yn-board-svg")).toBeVisible({ timeout: 5_000 });

    await page.getByRole("button", { name: "Pause" }).click();
    const drawer = page.getByRole("dialog", { name: "Settings" });
    await expect(drawer).toBeVisible({ timeout: 1_000 });
    await drawer.getByRole("button", { name: "How to play" }).click();

    const modal = page.getByRole("dialog", { name: "How to play" });
    await expect(modal).toBeVisible({ timeout: 1_000 });
    // New section heading added 2026-06-08: explains the movement rule
    // (connected empty cells, no diagonals, no jumping) plus the visual
    // feedback for an unreachable destination (red flash + blocker pulse).
    await expect(modal.getByRole("heading", { name: "Legal and illegal moves" })).toBeVisible();
    await expect(modal.getByText(/no diagonals, no jumping/i)).toBeVisible();
    await expect(modal.getByText(/flashes red/i)).toBeVisible();
  });
});
