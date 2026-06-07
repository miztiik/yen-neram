import { test, expect, type Request } from "@playwright/test";

// Base-path safety: catches the 2026-06-07 regression where shell + theme
// loaders fetched absolute paths like `/games.json` and ignored Vite's
// `base`. On GitHub Pages (base `/yen-neram/`) the calls 404'd and the
// portal silently rendered with no tiles.
//
// This test attaches a request listener BEFORE goto(), navigates to the
// portal, and asserts: (1) the games.json request URL is prefixed by the
// SPA's base, (2) no asset/games request 404s.
//
// On the local Playwright config, base is `/` (Vite preview default), so
// the prefix check is a no-op there but the 404 assertion is the real
// teeth: any builder that produces a wrong path will surface a 404 here.

test.describe("base-path safety: no hard-coded absolute paths", () => {
  test("portal load produces zero 4xx/5xx requests for app-served assets", async ({ page }) => {
    const failures: { url: string; status: number }[] = [];
    page.on("response", (response) => {
      const url = response.url();
      // Only audit same-origin assets that the SPA itself fetches; ignore
      // browser-injected favicon attempts at the bare root and any cross-
      // origin requests.
      if (!url.startsWith("http://127.0.0.1") && !url.startsWith("http://localhost")) return;
      const status = response.status();
      if (status >= 400) {
        failures.push({ url, status });
      }
    });

    await page.goto("/");

    // Wait for the portal to actually render its tiles (proves games.json
    // resolved successfully). The "5 in a Row" button only exists if the
    // shipped game in the manifest was discovered.
    await expect(page.getByRole("button", { name: "5 in a Row" })).toBeVisible({
      timeout: 5_000,
    });

    expect(
      failures,
      `unexpected 4xx/5xx responses: ${failures.map((f) => `${String(f.status)} ${f.url}`).join("\n")}`,
    ).toEqual([]);
  });

  test("games.json fetch URL is prefixed with the document base", async ({ page }) => {
    const gamesRequests: string[] = [];
    page.on("request", (request: Request) => {
      if (request.url().endsWith("/games.json")) {
        gamesRequests.push(request.url());
      }
    });

    await page.goto("/");
    await expect(page.getByRole("button", { name: "5 in a Row" })).toBeVisible({
      timeout: 5_000,
    });

    expect(gamesRequests.length).toBeGreaterThan(0);

    // The browser-resolved URL must include the same base prefix as the
    // shell's index.html. We read import.meta.env.BASE_URL via the live
    // page so the test stays correct on both `/` (dev/preview) and any
    // custom base a project-page deploy uses (`/yen-neram/`).
    const baseFromDocument = await page.evaluate(() => {
      // Vite injects <base href="..."> indirectly via index.html, and
      // exposes the same value at runtime to client modules. Reflect it
      // by reading the resolved URL of an inline-tagged asset path that
      // we know the page just produced.
      return new URL("./", document.baseURI).pathname;
    });

    for (const url of gamesRequests) {
      const path = new URL(url).pathname;
      expect(
        path.startsWith(baseFromDocument),
        `games.json fetched from ${path}; expected to start with ${baseFromDocument}`,
      ).toBe(true);
    }
  });
});
