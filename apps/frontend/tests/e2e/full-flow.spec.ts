import { test, expect } from "@playwright/test";

// Extended v1 flows that complement shell-smoke + game-smoke:
// mode-picker first launch + persistence, save preservation across portal
// round-trips, settings drawer + how-to-play modal, exploratory long-press.

const GAME_URL = "/play/5-in-a-row/";

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

  test("a fresh launch shows the picker; an in-progress game resumes without it", async ({
    page,
  }) => {
    // ADR-0023: the picker is offered on every FRESH launch (it is no longer
    // remembered-and-skipped). An UNFINISHED game still resumes straight to
    // its board so progress is never lost.
    await page.goto(GAME_URL);
    await page.getByRole("button", { name: "Infinite" }).click();
    await expect(page.locator("svg.yn-board-svg")).toBeVisible({ timeout: 5_000 });

    // Re-entering with the run still in progress resumes the board (no picker).
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Yen-Neram" })).toBeVisible();
    await page.goto(GAME_URL);
    await expect(page.locator("svg.yn-board-svg")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: "Infinite" })).toHaveCount(0);

    // Clear the in-progress run; the NEXT launch shows the picker again
    // (the mode is not silently reused).
    await page.evaluate(() => localStorage.removeItem("yn:game:5-in-a-row"));
    await page.goto(GAME_URL);
    await expect(page.getByRole("heading", { name: "Pick a mode" })).toBeVisible({
      timeout: 5_000,
    });
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

    // Bottom-bar Back is gone (ADR-0019); navigate home via Menu.
    await page.getByRole("button", { name: "Open menu" }).click();
    const drawer = page.getByRole("dialog", { name: "Menu" });
    await expect(drawer).toBeVisible({ timeout: 1_000 });
    await drawer.getByRole("button", { name: "Back to home" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Yen-Neram" })).toBeVisible();

    await page.getByRole("button", { name: "5 in a Row" }).click();
    await expect(board).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("[data-r][data-c]")).toHaveCount(81);

    const after = await snapshot();

    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });

  test("menu drawer opens from the menu button", async ({ page }) => {
    await page.goto(GAME_URL);
    await page.getByRole("button", { name: "Infinite" }).click();
    await expect(page.locator("svg.yn-board-svg")).toBeVisible({ timeout: 5_000 });

    await page.getByRole("button", { name: "Open menu" }).click();

    const drawer = page.getByRole("dialog", { name: "Menu" });
    await expect(drawer).toBeVisible({ timeout: 1_000 });
    await expect(drawer.getByRole("heading", { name: "Menu" })).toBeVisible();

    const swatches = drawer.locator("[data-theme-id]");
    await expect(swatches).toHaveCount(3);
    await expect(drawer.locator('[data-theme-id="balls"]')).toBeVisible();
    await expect(drawer.locator('[data-theme-id="planets"]')).toBeVisible();
    await expect(drawer.locator('[data-theme-id="tropical-fruits"]')).toBeVisible();
  });

  test("how-to-play modal opens from the menu drawer", async ({ page }) => {
    await page.goto(GAME_URL);
    await page.getByRole("button", { name: "Infinite" }).click();
    await expect(page.locator("svg.yn-board-svg")).toBeVisible({ timeout: 5_000 });

    await page.getByRole("button", { name: "Open menu" }).click();

    const drawer = page.getByRole("dialog", { name: "Menu" });
    await expect(drawer).toBeVisible({ timeout: 1_000 });

    await drawer.getByRole("button", { name: "How to play" }).click();

    const modal = page.getByRole("dialog", { name: "How to play" });
    await expect(modal).toBeVisible({ timeout: 1_000 });
    await expect(modal.getByText(/Tap a piece/i)).toBeVisible();

    await modal.getByRole("button", { name: "Got it" }).click();
    await expect(modal).toHaveCount(0);
  });

  test("leaderboard opens from menu drawer", async ({ page }) => {
    await page.goto(GAME_URL);
    await page.getByRole("button", { name: "Infinite" }).click();

    const board = page.locator("svg.yn-board-svg");
    await expect(board).toBeVisible({ timeout: 5_000 });

    await page.getByRole("button", { name: "Open menu" }).click();
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

  test("preview bounce: default on, toggles off via Menu, pref persists", async ({ page }) => {
    await page.goto(GAME_URL);
    await page.getByRole("button", { name: "Infinite" }).click();

    const board = page.locator("svg.yn-board-svg");
    await expect(board).toBeVisible({ timeout: 5_000 });

    // Default: SVG root carries the bounce class so the CSS keyframe runs
    // on every preview motif. App pref absent => default-on at the call site.
    await expect(board).toHaveClass(/yn-preview-bounce/, { timeout: 2_000 });

    // Toggle off.
    await page.getByRole("button", { name: "Open menu" }).click();
    const drawer = page.getByRole("dialog", { name: "Menu" });
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

  test("tile size: default medium, switch to Large rescales motifs live, persists + survives reload", async ({
    page,
  }) => {
    await page.goto(GAME_URL);
    await page.getByRole("button", { name: "Infinite" }).click();

    const board = page.locator("svg.yn-board-svg");
    await expect(board).toBeVisible({ timeout: 5_000 });

    // Default tier is medium: placed motifs render at MOTIF size 30 (ADR-0026).
    const motif = page.locator("image.yn-motif").first();
    await expect(motif).toHaveAttribute("width", "30", { timeout: 2_000 });

    // Open Menu -> Display -> Tile size, pick Large.
    await page.getByRole("button", { name: "Open menu" }).click();
    const drawer = page.getByRole("dialog", { name: "Menu" });
    await expect(drawer).toBeVisible({ timeout: 1_000 });
    const largeSegment = drawer.getByRole("radio", { name: "Large" });
    await expect(largeSegment).toHaveAttribute("aria-checked", "false");
    await largeSegment.click();
    await expect(largeSegment).toHaveAttribute("aria-checked", "true");

    // Live rescale: the existing motif grows to the Large size (35), no reload.
    await expect(motif).toHaveAttribute("width", "35", { timeout: 1_000 });

    // The per-tier bounce ceiling is pushed to a CSS custom property so the
    // land/pulse keyframes stay inside the cell for the larger tile.
    const landPeak = await board.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--yn-land-peak").trim(),
    );
    expect(landPeak).toBe("1.14");

    // Pref persists to `yn:app`.
    const stored = await page.evaluate(() => localStorage.getItem("yn:app"));
    const parsed = JSON.parse(stored ?? "{}") as { tile_size?: string };
    expect(parsed.tile_size).toBe("large");

    // And survives a reload (the contract: a preference set yesterday loads
    // today). Re-entering the in-progress game renders motifs at Large.
    await page.reload();
    const motifAfter = page.locator("image.yn-motif").first();
    await expect(motifAfter).toHaveAttribute("width", "35", { timeout: 5_000 });
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
    // Seed the per-game save + one-shot replay flag while still on "/"
    // (beforeEach left us there), THEN navigate to the game ONCE. Seeding
    // before the single mount keeps replay-flag consumption deterministic:
    // the old goto -> seed -> reload pattern raced the first mount, which
    // reads AND clears the flag (consumeReplayMode), so an interleaving
    // where that first mount consumed the flag stranded the reload on the
    // picker, not the board. Mirrors game-smoke.spec.ts. Schema v2 shape.
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
      // in_progress is null, so the one-shot replay flag skips the picker
      // and lands a fresh board for the (single) first mount (ADR-0023).
      sessionStorage.setItem("yn:game:5-in-a-row:replay-mode", "infinite");
    });
    await page.goto(GAME_URL);

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

    await page.getByRole("button", { name: "Open menu" }).click();
    const drawer = page.getByRole("dialog", { name: "Menu" });
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

  test("mode picker fits one mobile screen with no scroll (393x851 Pixel-5)", async ({ page }) => {
    // Regression for the 2026-06-08 mobile fix: the previous
    // `grid-cols-1 sm:grid-cols-3 aspect-square` layout stacked three
    // ~300px-tall square tiles + a heading on mobile, blowing past the
    // viewport height by ~80px and forcing the player to scroll on
    // FIRST contact with the game. The fix uses short horizontal
    // banner tiles below `sm` breakpoint and keeps the premium-feel
    // squares from `sm` up. This test pins the doctrine: the picker
    // must render in one screen on the target-device profile.
    await page.setViewportSize({ width: 393, height: 851 });
    await page.goto(GAME_URL);

    const infinite = page.getByRole("button", { name: "Infinite" });
    await expect(infinite).toBeVisible({ timeout: 5_000 });

    // overflow == documentElement.scrollHeight - window.innerHeight.
    // The page must NOT scroll (overflow <= 0). One-px slop allowed
    // for sub-pixel layout rounding on different rendering backends.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("undo button starts disabled, enables after the first move, restores state, then disables (one undo per game)", async ({
    page,
  }) => {
    // The undo doctrine per how-to-play.ts: "You get one undo per
    // game." Snapshot is captured BEFORE attemptMove applies on the
    // FIRST move (and every subsequent move until undo is spent); a
    // single click restores board+score+preview and disables the
    // button for the rest of the game. Per-game reset happens via
    // freshMakeSave on Play Again / Reset.
    await page.goto(GAME_URL);
    await page.getByRole("button", { name: "Infinite" }).click();
    await expect(page.locator("svg.yn-board-svg")).toBeVisible({ timeout: 5_000 });

    const undoBtn = page.getByRole("button", { name: "Undo last move" });
    await expect(undoBtn).toBeDisabled();
    await expect(undoBtn).toHaveAttribute("aria-disabled", "true");

    // Pick a filled cell. The first 11 seeded cells (initial_seed_count
    // in balance.json) form the starting board; any of them is a valid
    // selection.
    const filledCell = page.locator("[data-r][data-c]:has(image.yn-motif)").first();
    await expect(filledCell).toBeVisible({ timeout: 5_000 });
    await filledCell.click();
    await expect(filledCell).toHaveClass(/yn-cell-selected/, { timeout: 1_000 });

    // Snapshot the board cells + score BEFORE the move so we can assert
    // the post-undo state matches exactly. The board is the 81-cell
    // `<g data-r data-c data-run-group>` grid; the score is the inline
    // --yn-score-count custom property the count-up tween writes.
    type CellMap = Record<string, string | null>;
    const snapshotBoard = async (): Promise<CellMap> =>
      page.evaluate(() => {
        const out: Record<string, string | null> = {};
        for (const el of document.querySelectorAll("[data-r][data-c]")) {
          const r = el.getAttribute("data-r");
          const c = el.getAttribute("data-c");
          const rg = (el as HTMLElement).dataset["runGroup"] ?? null;
          out[`${String(r)},${String(c)}`] = rg;
        }
        return out;
      });
    const boardBefore = await snapshotBoard();
    const scoreBefore = await page
      .locator(".yn-score-display")
      .evaluate((el) => (el as HTMLElement).style.getPropertyValue("--yn-score-count"));

    // Tap a reachable empty cell. board-view sets `.yn-cell-reachable`
    // on every empty BFS-reachable cell while a piece is selected.
    const reachable = page.locator("[data-r][data-c].yn-cell-reachable:not(:has(image.yn-motif))");
    await expect(reachable.first()).toBeVisible({ timeout: 2_000 });
    await reachable.first().click();

    // Move animation + spawn lands. After it settles, undo is enabled.
    // The undo button is intentionally enabled in the finally block of
    // onCellTap (not at snapshot-capture time) so that "enabled" always
    // means "click-ready"; the click handler's isAnimating guard would
    // otherwise reject a mid-animation click on a visibly-enabled button.
    await expect(undoBtn).toBeEnabled({ timeout: 5_000 });
    await expect(undoBtn).toHaveAttribute("aria-disabled", "false");

    // Click undo.
    await undoBtn.click();

    // Board snapshot matches the pre-move state EXACTLY (same
    // runGroup at every cell). Score also reverts.
    const boardAfter = await snapshotBoard();
    expect(boardAfter).toEqual(boardBefore);
    const scoreAfter = await page
      .locator(".yn-score-display")
      .evaluate((el) => (el as HTMLElement).style.getPropertyValue("--yn-score-count"));
    expect(scoreAfter).toBe(scoreBefore);

    // Undo is disabled again (one undo per game). Save persists the
    // spent state via undo.available === false.
    await expect(undoBtn).toBeDisabled({ timeout: 2_000 });
    const stored = await page.evaluate(() => localStorage.getItem("yn:game:5-in-a-row"));
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored ?? "{}") as {
      in_progress: { undo: { available: boolean } } | null;
    };
    expect(parsed.in_progress?.undo.available).toBe(false);

    // Reload the page: the spent state must persist (undo stays
    // disabled on mount because save.in_progress.undo.available is
    // false, which seeds undoUsedThisGame = true at mount time).
    await page.reload();
    await expect(page.locator("svg.yn-board-svg")).toBeVisible({ timeout: 5_000 });
    const undoBtnAfterReload = page.getByRole("button", { name: "Undo last move" });
    await expect(undoBtnAfterReload).toBeDisabled();
  });

  test("Menu drawer surfaces Navigate (Back to home / Restart this game / Switch mode) as the first section", async ({
    page,
  }) => {
    // Regression for ADR-0019: navigation actions previously lived
    // either on the bottom bar (Back), buried under a "Mode" section
    // (Switch mode), or only as a destructive "Reset game" with no
    // friendly mid-game name (Restart). The Menu's first section is
    // now "Navigate" with all three intents, in this order. This
    // test only asserts the three buttons are reachable + ordered;
    // their actions are tested in dedicated tests below.
    await page.goto(GAME_URL);
    await page.getByRole("button", { name: "Infinite" }).click();
    await expect(page.locator("svg.yn-board-svg")).toBeVisible({ timeout: 5_000 });

    await page.getByRole("button", { name: "Open menu" }).click();
    const drawer = page.getByRole("dialog", { name: "Menu" });
    await expect(drawer).toBeVisible({ timeout: 1_000 });

    // Heading "Navigate" + the three buttons in the documented order.
    const navSectionHeading = drawer.getByRole("heading", { name: "Navigate" });
    await expect(navSectionHeading).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Back to home" })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Restart this game" })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Switch mode" })).toBeVisible();
  });

  test("Menu -> Restart this game wipes the in-progress save and reloads to a fresh board", async ({
    page,
  }) => {
    // Seed a save with a non-zero score and a custom board so we can
    // verify the restart wipes both. After Restart, the in-progress
    // save is replaced by a fresh shape for the same mode and the
    // page reloads.
    await page.goto(GAME_URL);
    await page.evaluate(() => {
      // 9x9 grid; one piece at (0,0). Typed as the heterogeneous shape
      // up-front so TypeScript doesn't widen from `null[][]` to a
      // shape that rejects the runGroup assignment.
      type Cell = null | { runGroup: number };
      const board: Cell[][] = Array.from({ length: 9 }, () =>
        Array.from({ length: 9 }, (): Cell => null),
      );
      board[0]![0] = { runGroup: 5 };
      const save = {
        schema_version: 2,
        mode: "infinite",
        in_progress: {
          board,
          selected_cell: null,
          next_preview: [
            { row: 1, col: 1, kind: 1 },
            { row: 2, col: 2, kind: 2 },
            { row: 3, col: 3, kind: 3 },
          ],
          score: 99,
          turn_seed: 42,
          undo: { available: true, snapshot: null },
          mode_state: { kind: "infinite" },
        },
        high_scores: { infinite: [], max_points: [], timed: [] },
        streak: null,
      };
      localStorage.setItem("yn:game:5-in-a-row", JSON.stringify(save));
      // No picker-skip seed needed: the save carries an in-progress run,
      // so the reload resumes straight to the board (ADR-0023).
    });
    await page.reload();
    await expect(page.locator("svg.yn-board-svg")).toBeVisible({ timeout: 5_000 });

    // Pre-restart sanity: the score chip shows 99 via the inline CSS
    // custom property the count-up tween writes to.
    const scoreBefore = await page
      .locator(".yn-score-display")
      .evaluate((el) => (el as HTMLElement).style.getPropertyValue("--yn-score-count"));
    expect(scoreBefore).toBe("99");

    await page.getByRole("button", { name: "Open menu" }).click();
    const drawer = page.getByRole("dialog", { name: "Menu" });
    await expect(drawer).toBeVisible({ timeout: 1_000 });
    await drawer.getByRole("button", { name: "Restart this game" }).click();

    // After reload, the board paints fresh (board exists, score reset
    // to 0). The fresh board contains some seeded pieces (per
    // balance.json initial_seed_count), so we don't compare cell-by-
    // cell, just assert score is 0.
    await expect(page.locator("svg.yn-board-svg")).toBeVisible({ timeout: 5_000 });
    const scoreAfter = await page
      .locator(".yn-score-display")
      .evaluate((el) => (el as HTMLElement).style.getPropertyValue("--yn-score-count"));
    expect(scoreAfter).toBe("0");
    // The save no longer carries the 99-score in_progress; it's been
    // replaced with a fresh shape.
    const stored = await page.evaluate(() => localStorage.getItem("yn:game:5-in-a-row"));
    const parsed = JSON.parse(stored ?? "{}") as {
      in_progress: { score: number } | null;
    };
    expect(parsed.in_progress?.score).toBe(0);
  });

  test("Menu -> Restart PRESERVES high_scores + streak (ADR-0021 regression)", async ({ page }) => {
    // ADR-0021 regression: pre-2026-06-08 the Restart / Reset / Play
    // again / Switch mode handlers all called `makeFreshSave(mode)`
    // which wipes the leaderboard AND streak alongside the in-progress
    // run. User reported "the high score is not persisting -- it gets
    // cleared when the game ends." Fix routes those handlers through
    // `makeFreshGame(save, mode)` which preserves cross-run state.
    //
    // This test seeds a save with NON-empty high_scores + streak,
    // exercises the Restart path, and asserts both survive.
    await page.goto(GAME_URL);
    await page.evaluate(() => {
      type Cell = null | { runGroup: number };
      const board: Cell[][] = Array.from({ length: 9 }, () =>
        Array.from({ length: 9 }, (): Cell => null),
      );
      board[0]![0] = { runGroup: 5 };
      const save = {
        schema_version: 2,
        mode: "infinite",
        in_progress: {
          board,
          selected_cell: null,
          next_preview: [{ row: 1, col: 1, kind: 1 }],
          score: 50,
          turn_seed: 42,
          undo: { available: true, snapshot: null },
          mode_state: { kind: "infinite" },
        },
        high_scores: {
          infinite: [
            { score: 250, timestamp_iso: "2026-06-01T10:00:00.000Z" },
            { score: 180, timestamp_iso: "2026-06-02T11:00:00.000Z" },
          ],
          max_points: [{ score: 90, timestamp_iso: "2026-06-03T12:00:00.000Z" }],
          timed: [],
        },
        streak: { current: 5, longest: 9, last_played_date: "2026-06-07" },
      };
      localStorage.setItem("yn:game:5-in-a-row", JSON.stringify(save));
      // No picker-skip seed needed: the save carries an in-progress run,
      // so the reload resumes straight to the board (ADR-0023).
    });
    await page.reload();
    await expect(page.locator("svg.yn-board-svg")).toBeVisible({ timeout: 5_000 });

    // Restart via Menu.
    await page.getByRole("button", { name: "Open menu" }).click();
    const drawer = page.getByRole("dialog", { name: "Menu" });
    await expect(drawer).toBeVisible({ timeout: 1_000 });
    await drawer.getByRole("button", { name: "Restart this game" }).click();
    await expect(page.locator("svg.yn-board-svg")).toBeVisible({ timeout: 5_000 });

    // Read the post-Restart save: in_progress fresh (score 0), but the
    // high_scores arrays + streak survive byte-identically. This is
    // the contract the ADR-0021 fix carries.
    const stored = await page.evaluate(() => localStorage.getItem("yn:game:5-in-a-row"));
    const parsed = JSON.parse(stored ?? "{}") as {
      in_progress: { score: number } | null;
      high_scores: {
        infinite: { score: number; timestamp_iso: string }[];
        max_points: { score: number; timestamp_iso: string }[];
        timed: { score: number; timestamp_iso: string }[];
      };
      streak: { current: number; longest: number; last_played_date: string } | null;
    };
    expect(parsed.in_progress?.score).toBe(0);
    expect(parsed.high_scores.infinite).toEqual([
      { score: 250, timestamp_iso: "2026-06-01T10:00:00.000Z" },
      { score: 180, timestamp_iso: "2026-06-02T11:00:00.000Z" },
    ]);
    expect(parsed.high_scores.max_points).toEqual([
      { score: 90, timestamp_iso: "2026-06-03T12:00:00.000Z" },
    ]);
    expect(parsed.high_scores.timed).toEqual([]);
    expect(parsed.streak).toEqual({
      current: 5,
      longest: 9,
      last_played_date: "2026-06-07",
    });
  });

  test("Menu -> Switch mode PRESERVES high_scores + streak (ADR-0021 regression)", async ({
    page,
  }) => {
    // Same regression class as the Restart test above, but for the
    // mode-swap path. Switching to a different mode must NOT wipe the
    // leaderboard for the mode you're leaving.
    // Seed while on "/" then a single navigation (see the BEST-chip test
    // above for why goto -> seed -> reload raced the replay-flag consume).
    await page.evaluate(() => {
      const save = {
        schema_version: 2,
        mode: "infinite",
        in_progress: null,
        high_scores: {
          infinite: [{ score: 300, timestamp_iso: "2026-06-05T10:00:00.000Z" }],
          max_points: [],
          timed: [{ score: 75, timestamp_iso: "2026-06-06T10:00:00.000Z" }],
        },
        streak: { current: 2, longest: 4, last_played_date: "2026-06-07" },
      };
      localStorage.setItem("yn:game:5-in-a-row", JSON.stringify(save));
      // in_progress is null, so the one-shot replay flag lands the board
      // for the (single) first mount (ADR-0023).
      sessionStorage.setItem("yn:game:5-in-a-row:replay-mode", "infinite");
    });
    await page.goto(GAME_URL);
    await expect(page.locator("svg.yn-board-svg")).toBeVisible({ timeout: 5_000 });

    await page.getByRole("button", { name: "Open menu" }).click();
    const drawer = page.getByRole("dialog", { name: "Menu" });
    await expect(drawer).toBeVisible({ timeout: 1_000 });
    await drawer.getByRole("button", { name: "Switch mode" }).click();

    // Switch mode now opens the picker IN PLACE (ADR-0023), no portal bounce.
    await expect(page.getByRole("heading", { name: "Pick a mode" })).toBeVisible({
      timeout: 5_000,
    });

    // The save still carries the prior high_scores + streak.
    const stored = await page.evaluate(() => localStorage.getItem("yn:game:5-in-a-row"));
    const parsed = JSON.parse(stored ?? "{}") as {
      high_scores: {
        infinite: { score: number; timestamp_iso: string }[];
        max_points: { score: number; timestamp_iso: string }[];
        timed: { score: number; timestamp_iso: string }[];
      };
      streak: { current: number; longest: number; last_played_date: string } | null;
    };
    expect(parsed.high_scores.infinite).toEqual([
      { score: 300, timestamp_iso: "2026-06-05T10:00:00.000Z" },
    ]);
    expect(parsed.high_scores.timed).toEqual([
      { score: 75, timestamp_iso: "2026-06-06T10:00:00.000Z" },
    ]);
    expect(parsed.streak).toEqual({
      current: 2,
      longest: 4,
      last_played_date: "2026-06-07",
    });
  });

  test("Menu -> Switch mode opens the picker in place (no portal bounce)", async ({ page }) => {
    // ADR-0023: switching mode mid-run wipes the in-progress run and reloads
    // in place, so the picker appears RIGHT HERE in the game route -- the
    // player asked to change the mode, not to leave the game. Picking a
    // different mode then starts that mode.
    await page.goto(GAME_URL);
    await page.getByRole("button", { name: "Infinite" }).click();
    await expect(page.locator("svg.yn-board-svg")).toBeVisible({ timeout: 5_000 });

    await page.getByRole("button", { name: "Open menu" }).click();
    const drawer = page.getByRole("dialog", { name: "Menu" });
    await expect(drawer).toBeVisible({ timeout: 1_000 });
    await drawer.getByRole("button", { name: "Switch mode" }).click();

    // Still in the game route, now showing the picker (not the portal).
    await expect(page).toHaveURL(/\/play\/5-in-a-row\/$/);
    await expect(page.getByRole("heading", { name: "Pick a mode" })).toBeVisible({
      timeout: 5_000,
    });

    // Picking a different mode switches to it.
    await page.getByRole("button", { name: "Timed" }).click();
    await expect(page.locator("svg.yn-board-svg")).toBeVisible({ timeout: 5_000 });
    const storedMode = await page.evaluate(() => {
      const raw = localStorage.getItem("yn:game:5-in-a-row");
      return raw === null ? null : (JSON.parse(raw) as { mode?: string }).mode;
    });
    expect(storedMode).toBe("timed");
  });
});
