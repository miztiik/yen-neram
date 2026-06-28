import { test, expect } from "@playwright/test";

// Board depth contract (ADR-0031, "Lifted Chips" + whole-board slab). The board
// must read as a raised panel, not a flat plane. Three guards:
//   1) The board wrapper (.yn-board-slab) casts a real box-shadow and is rounded
//      -> the whole 9x9 board floats above the page as one tray.
//   2) Every placed motif (image.yn-motif) carries a drop-shadow filter -> pieces
//      lift off the board. Preview ghosts (.yn-preview-motif) deliberately do not.
//   3) The SVG board is clipped to a rounded shape via clip-path. The SVG is a
//      composited layer (its children are filtered), so it escapes the wrapper's
//      border-radius + overflow:hidden clip; only clipping the SVG itself stops
//      its SQUARE corner poking past the rounded tray (the reported artifact).
//      Removing the clip-path reintroduces the sharp-corner bug.
//
// We seed the one-shot replay flag so the picker is skipped and the board loads
// in infinite mode with seeded pieces (so image.yn-motif exists).

const GAME_URL = "/play/5-in-a-row/";
const REPLAY_KEY = "yn:game:5-in-a-row:replay-mode";

test.describe("board depth contract (ADR-0031)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate((key) => {
      localStorage.clear();
      sessionStorage.setItem(key, "infinite");
    }, REPLAY_KEY);
    await page.goto(GAME_URL);
    await expect(page.locator("svg.yn-board-svg")).toBeVisible({ timeout: 5_000 });
  });

  test("whole-board slab: the wrapper casts an elevation shadow and is rounded", async ({
    page,
  }) => {
    const paint = await page.evaluate(() => {
      const wrap = document.querySelector(".yn-board-slab");
      if (wrap === null) return { boxShadow: "no-wrap", borderRadius: "0px" };
      const cs = getComputedStyle(wrap);
      return { boxShadow: cs.boxShadow, borderRadius: cs.borderRadius };
    });
    // A non-"none" box-shadow means the slab elevation is present.
    expect(paint.boxShadow).not.toBe("no-wrap");
    expect(paint.boxShadow).not.toBe("none");
    // Rounded tray (matches --yn-board-radius).
    expect(Number.parseFloat(paint.borderRadius)).toBeGreaterThan(0);
  });

  test("lifted pieces: every placed motif carries a drop-shadow filter", async ({ page }) => {
    await expect(page.locator("image.yn-motif").first()).toBeVisible({ timeout: 5_000 });
    const allShadowed = await page.evaluate(() => {
      const motifs = Array.from(document.querySelectorAll("image.yn-motif"));
      return (
        motifs.length > 0 && motifs.every((m) => getComputedStyle(m).filter.includes("drop-shadow"))
      );
    });
    expect(allShadowed).toBe(true);
  });

  test("preview ghosts are NOT shadowed (placed-vs-upcoming distinction)", async ({ page }) => {
    // Preview motifs may or may not be present on a given board; only assert
    // when at least one exists. When present, none should carry a drop-shadow.
    const previewShadowState = await page.evaluate(() => {
      const previews = Array.from(document.querySelectorAll("image.yn-preview-motif"));
      if (previews.length === 0) return "none-present";
      return previews.some((p) => getComputedStyle(p).filter.includes("drop-shadow"))
        ? "some-shadowed"
        : "all-flat";
    });
    expect(previewShadowState).not.toBe("some-shadowed");
  });

  test("corner artifact fix: the SVG board is clipped to a rounded shape", async ({ page }) => {
    const clipPath = await page.evaluate(() => {
      const svg = document.querySelector("svg.yn-board-svg");
      return svg === null ? "no-svg" : getComputedStyle(svg).clipPath;
    });
    expect(clipPath).not.toBe("no-svg");
    expect(clipPath).not.toBe("none");
    // inset(... round <radius>) -- the rounding is what stops the square poke.
    expect(clipPath).toContain("round");
  });
});
