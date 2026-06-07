import { test, expect } from "@playwright/test";

// Per CLAUDE.md sec 12 + sec 2 + ADR-0004: validate the game stays smooth
// under the target-device profile (4x CPU throttle + Slow 4G network).
// Throttling is applied via Chrome DevTools Protocol; the only project
// configured in playwright.config.ts is Chromium, so CDP is available.
// If a non-Chromium project is added later, context.newCDPSession will
// throw with a clear error - that is the intended loud failure.

test.describe("perf under mid-tier-Android throttling", () => {
  test.beforeEach(async ({ page, context }) => {
    // Seed localStorage so the mode picker does not block the board.
    // This initial navigation is setup-only; throttling is applied after.
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("yn:game:5-in-a-row:last-mode", "infinite");
    });

    // Apply CDP throttling (Chromium-only).
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await cdp.send("Network.enable");
    // Slow 4G: 400 Kbps down/up, 400 ms RTT (Chrome DevTools preset).
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 400,
      downloadThroughput: (400 * 1024) / 8,
      uploadThroughput: (400 * 1024) / 8,
    });
  });

  test("first-paint of the board under throttling is under 5 s", async ({ page }) => {
    const startedAt = Date.now();
    await page.goto("/play/5-in-a-row/");

    const board = page.locator("svg.yn-board-svg");
    // Generous Playwright wait so the assertion below is the failure surface
    // when the budget is breached, with a clear perf-flavoured message.
    await expect(board).toBeVisible({ timeout: 15_000 });

    const elapsedMs = Date.now() - startedAt;
    test.info().annotations.push({
      type: "perf",
      description: `first-paint elapsed: ${elapsedMs} ms (cap: 5000 ms)`,
    });

    // Cap is generous - throttled startup over Slow-4G; v1 + v2 measured ~3 s
    // on the wire. CLAUDE.md sec 2 target device is the contract.
    expect(
      elapsedMs,
      `first-paint under throttling took ${elapsedMs} ms; cap is 5000 ms`,
    ).toBeLessThan(5_000);
  });

  test("tap-to-select responds in under 500 ms under throttling", async ({ page }) => {
    await page.goto("/play/5-in-a-row/");

    const board = page.locator("svg.yn-board-svg");
    await expect(board).toBeVisible({ timeout: 15_000 });

    // Full motif only (yn-motif), not preview pips (yn-preview-motif).
    const motifCell = page.locator("[data-r][data-c]:has(image.yn-motif)").first();
    await expect(motifCell).toBeVisible({ timeout: 5_000 });

    const startedAt = Date.now();
    await motifCell.click();
    await expect(motifCell).toHaveClass(/yn-cell-selected/, { timeout: 2_000 });
    const elapsedMs = Date.now() - startedAt;

    test.info().annotations.push({
      type: "perf",
      description: `tap-to-select elapsed: ${elapsedMs} ms (cap: 500 ms)`,
    });

    // CLAUDE.md Holy Law #2 says input-to-photon < 50 ms; 500 ms is the
    // slack for a throttled CI runner doing 4x CPU throttle + Slow 4G.
    expect(
      elapsedMs,
      `tap-to-select under throttling took ${elapsedMs} ms; cap is 500 ms`,
    ).toBeLessThan(500);
  });

  test("zero console errors under throttling", async ({ page }) => {
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

    const board = page.locator("svg.yn-board-svg");
    await expect(board).toBeVisible({ timeout: 15_000 });

    const motifCell = page.locator("[data-r][data-c]:has(image.yn-motif)").first();
    await expect(motifCell).toBeVisible({ timeout: 5_000 });
    await motifCell.click();
    await expect(motifCell).toHaveClass(/yn-cell-selected/, { timeout: 2_000 });

    page.off("console", onConsole);
    page.off("pageerror", onPageError);

    expect(
      errors.length,
      `throttled load + click produced ${errors.length} console error(s); first: ${errors[0] ?? "(none)"}`,
    ).toBe(0);
  });

  test("a single move does not trigger excessive layout thrashing", async ({ page, context }) => {
    await page.goto("/play/5-in-a-row/");

    const board = page.locator("svg.yn-board-svg");
    await expect(board).toBeVisible({ timeout: 15_000 });

    const motifCell = page.locator("[data-r][data-c]:has(image.yn-motif)").first();
    await expect(motifCell).toBeVisible({ timeout: 5_000 });

    // Fresh CDP session purely for Performance metrics; the throttling
    // applied in beforeEach is sticky on the page across CDP sessions.
    const perfCdp = await context.newCDPSession(page);
    await perfCdp.send("Performance.enable");

    type CDPMetric = { name: string; value: number };
    type CDPMetrics = { metrics: CDPMetric[] };
    const findMetric = (m: CDPMetrics, name: string): number =>
      m.metrics.find((x) => x.name === name)?.value ?? 0;

    const before = (await perfCdp.send("Performance.getMetrics")) as CDPMetrics;
    await motifCell.click();
    await expect(motifCell).toHaveClass(/yn-cell-selected/, { timeout: 2_000 });
    const after = (await perfCdp.send("Performance.getMetrics")) as CDPMetrics;

    const layoutDelta = findMetric(after, "LayoutCount") - findMetric(before, "LayoutCount");
    const recalcDelta =
      findMetric(after, "RecalcStyleCount") - findMetric(before, "RecalcStyleCount");

    test.info().annotations.push({
      type: "perf",
      description: `layout delta: ${layoutDelta}; recalc-style delta: ${recalcDelta} (each cap: 50)`,
    });

    // Loose bound - just catch runaway re-render bugs that would betray
    // ADR-0004's "zero rAF, compositor-driven animations" pick.
    expect(
      layoutDelta,
      `LayoutCount delta = ${layoutDelta}; bound is < 50 to catch runaway re-render bugs`,
    ).toBeLessThan(50);
    expect(
      recalcDelta,
      `RecalcStyleCount delta = ${recalcDelta}; bound is < 50 to catch runaway re-render bugs`,
    ).toBeLessThan(50);
  });
});
