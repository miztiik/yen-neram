import { test, expect } from "@playwright/test";

test.describe("game smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      // Skip the launch mode picker so these smoke tests land on the board
      // immediately. The one-shot replay flag is what Play Again / Restart
      // set before a same-mode reload; full-flow.spec.ts covers the picker.
      sessionStorage.setItem("yn:game:5-in-a-row:replay-mode", "infinite");
    });
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

    // Filter to cells with a FULL motif (yn-motif class), not preview pips
    // (yn-preview-motif class). Previews are tiny hints; clicking them does
    // not select anything.
    const motifCell = page.locator("[data-r][data-c]:has(image.yn-motif)").first();
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

  test("back to home is reachable from the Menu drawer", async ({ page }) => {
    // 2026-06-08: the standalone "Back" bottom-bar button is gone (per
    // ADR-0019); navigation back to the portal now lives under the
    // Menu drawer's Navigate section so the bottom bar is Undo + Menu
    // only. This test pins the new path -- open menu -> Navigate ->
    // Back to home -> portal renders.
    await page.goto("/play/5-in-a-row/");

    const menuBtn = page.getByRole("button", { name: "Open menu" });
    await expect(menuBtn).toBeVisible({ timeout: 5_000 });
    await menuBtn.click();

    const drawer = page.getByRole("dialog", { name: "Menu" });
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    const backToHome = drawer.getByRole("button", { name: "Back to home" });
    await backToHome.click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Yen-Neram" })).toBeVisible();
  });

  test("tap-with-finger-jitter still registers as a tap", async ({ page }) => {
    // Regression: a real finger tap on a phone routinely wiggles 10-20px
    // between pointerdown and pointerup (thumb contact area, micro-
    // movement as the finger lands). The previous design tripped
    // MOVE_THRESHOLD_PX (8px) on any such wiggle and silently dropped
    // the tap, so quick "select source / tap target" sequences on touch
    // devices did nothing -- the target click felt unregistered.
    //
    // The invariant after the fix: a tap is `pointerdown` + `pointerup`
    // landing on the SAME cell, regardless of pixel jitter in between.
    // The move-threshold is now only used to cancel the long-press
    // preview timer (a moving finger isn't a hold).
    await page.goto("/play/5-in-a-row/");

    const board = page.locator("svg.yn-board-svg");
    await expect(board).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("[data-r][data-c]")).toHaveCount(81);

    const outcome = await page.evaluate(async () => {
      function pe(type: string, x: number, y: number): PointerEvent {
        return new PointerEvent(type, {
          pointerType: "touch",
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          pointerId: 1,
          isPrimary: true,
        });
      }
      function tapWithJitter(x: number, y: number, jitterPx: number): void {
        const el = document.elementFromPoint(x, y);
        if (el === null) return;
        el.dispatchEvent(pe("pointerdown", x, y));
        if (jitterPx > 0) {
          const mid = document.elementFromPoint(x + jitterPx, y + jitterPx) ?? el;
          mid.dispatchEvent(pe("pointermove", x + jitterPx, y + jitterPx));
        }
        el.dispatchEvent(pe("pointerup", x, y));
      }
      function isEmptyAt(r: number, c: number): boolean {
        const g = document.querySelector(`[data-r="${String(r)}"][data-c="${String(c)}"]`);
        return g !== null && (g.getAttribute("aria-label") ?? "").startsWith("Empty");
      }
      // Pick a filled cell that has at least one empty 4-neighbour --
      // adjacent empty cells are always reachable so the move attempt
      // can't be rejected as unreachable.
      const filledCells = Array.from(document.querySelectorAll("[data-r]")).filter((g) =>
        (g.getAttribute("aria-label") ?? "").startsWith("Piece"),
      );
      let filled: Element | null = null;
      let empty: Element | null = null;
      for (const g of filledCells) {
        const r = Number(g.getAttribute("data-r"));
        const c = Number(g.getAttribute("data-c"));
        for (const [dr, dc] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ] as const) {
          if (isEmptyAt(r + dr, c + dc)) {
            filled = g;
            empty = document.querySelector(
              `[data-r="${String(r + dr)}"][data-c="${String(c + dc)}"]`,
            );
            break;
          }
        }
        if (filled !== null) break;
      }
      if (filled === null || empty === null) return { error: "no reachable pair" };

      const fr = filled.getBoundingClientRect();
      const er = empty.getBoundingClientRect();
      const fx = fr.x + fr.width / 2;
      const fy = fr.y + fr.height / 2;
      const ex = er.x + er.width / 2;
      const ey = er.y + er.height / 2;

      // Clean source tap (selects the piece).
      tapWithJitter(fx, fy, 0);
      await new Promise<void>((r) => setTimeout(r, 80));
      const selectedAfterSrc = document.querySelectorAll(".yn-cell-selected").length;

      // Target tap with 12px finger jitter (above MOVE_THRESHOLD_PX=8).
      tapWithJitter(ex, ey, 12);
      await new Promise<void>((r) => setTimeout(r, 900));

      return {
        selectedAfterSrc,
        srcAriaAfter: filled.getAttribute("aria-label"),
        dstAriaAfter: empty.getAttribute("aria-label"),
      };
    });

    expect(outcome.selectedAfterSrc, "source tap selects the piece").toBe(1);
    expect(
      outcome.srcAriaAfter,
      "after a jittery target tap, the source cell must be empty (piece moved out)",
    ).toMatch(/^Empty cell/);
    expect(
      outcome.dstAriaAfter,
      "after a jittery target tap, the destination cell must hold the piece",
    ).toMatch(/^Piece type /);
  });

  test("a tap made during the move animation is buffered and replayed (not dropped)", async ({
    page,
  }) => {
    // Regression (ADR-0029): a scoring move locks input for up to ~1.8s
    // (slide + land + clear + reward wave). On touch the player's NEXT move
    // -- two taps, select-source then tap-destination -- was silently
    // dropped by the `if (isAnimating) return;` gate, the reported "second
    // touch not registering" bug. We now buffer the taps and replay them on
    // settle. This proves a tap fired DURING the animation is honoured once
    // it ends instead of vanishing.
    await page.goto("/play/5-in-a-row/");
    const board = page.locator("svg.yn-board-svg");
    await expect(board).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("[data-r][data-c]")).toHaveCount(81);

    const outcome = await page.evaluate(async () => {
      const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
      function tap(r: number, c: number): boolean {
        const g = document.querySelector(`[data-r="${String(r)}"][data-c="${String(c)}"]`);
        if (g === null) return false;
        const b = g.getBoundingClientRect();
        const o: PointerEventInit = {
          pointerType: "touch",
          bubbles: true,
          cancelable: true,
          clientX: b.x + b.width / 2,
          clientY: b.y + b.height / 2,
          pointerId: 1,
          isPrimary: true,
        };
        g.dispatchEvent(new PointerEvent("pointerdown", o));
        g.dispatchEvent(new PointerEvent("pointerup", o));
        return true;
      }
      const isEmptyAt = (r: number, c: number): boolean => {
        const g = document.querySelector(`[data-r="${String(r)}"][data-c="${String(c)}"]`);
        return g !== null && (g.getAttribute("aria-label") ?? "").startsWith("Empty");
      };
      const selectedAt = (r: number, c: number): boolean =>
        document
          .querySelector(`[data-r="${String(r)}"][data-c="${String(c)}"]`)
          ?.classList.contains("yn-cell-selected") ?? false;

      const filledCells = Array.from(document.querySelectorAll("[data-r]")).filter((g) =>
        (g.getAttribute("aria-label") ?? "").startsWith("Piece"),
      );
      // src = a filled cell with an empty orthogonal neighbour (a reachable
      // move); second = a DIFFERENT filled cell to tap mid-animation.
      let src: { r: number; c: number } | null = null;
      let dst: { r: number; c: number } | null = null;
      for (const g of filledCells) {
        const r = Number(g.getAttribute("data-r"));
        const c = Number(g.getAttribute("data-c"));
        for (const [dr, dc] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ] as const) {
          if (isEmptyAt(r + dr, c + dc)) {
            src = { r, c };
            dst = { r: r + dr, c: c + dc };
            break;
          }
        }
        if (src !== null) break;
      }
      const secondEl = filledCells.find((g) => {
        const r = Number(g.getAttribute("data-r"));
        const c = Number(g.getAttribute("data-c"));
        return !(src !== null && r === src.r && c === src.c);
      });
      const blank = {
        error: "no usable cells",
        sourceSelected: false,
        tappedSecond: false,
        secondSelectedMidAnim: false,
        secondSelectedAfterSettle: false,
      };
      if (src === null || dst === null || secondEl === undefined) return blank;
      const second = {
        r: Number(secondEl.getAttribute("data-r")),
        c: Number(secondEl.getAttribute("data-c")),
      };

      tap(src.r, src.c); // select the source
      await sleep(60);
      const sourceSelected = selectedAt(src.r, src.c);
      tap(dst.r, dst.c); // start the move -> input locks
      await sleep(150); // mid-animation
      const tappedSecond = tap(second.r, second.c); // dropped pre-fix
      await sleep(80);
      const secondSelectedMidAnim = selectedAt(second.r, second.c);
      await sleep(1300); // settle + microtask replay
      const secondSelectedAfterSettle = selectedAt(second.r, second.c);
      return {
        error: null as string | null,
        sourceSelected,
        tappedSecond,
        secondSelectedMidAnim,
        secondSelectedAfterSettle,
      };
    });

    expect(outcome.error, "found a usable source/second cell pair").toBeNull();
    expect(outcome.sourceSelected, "source tap selects the piece").toBe(true);
    expect(outcome.tappedSecond, "second tap dispatched during the animation").toBe(true);
    // Input is still locked while the move animates, so the buffered tap is
    // NOT applied yet.
    expect(outcome.secondSelectedMidAnim, "second tap is buffered, not applied mid-animation").toBe(
      false,
    );
    // Once the animation settles, the buffered tap replays and selects.
    expect(
      outcome.secondSelectedAfterSettle,
      "buffered tap replays on settle instead of being dropped",
    ).toBe(true);
  });
});
