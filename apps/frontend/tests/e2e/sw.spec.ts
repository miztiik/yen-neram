import { test, expect } from "@playwright/test";

test.describe("service worker", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
  });

  test("registers a service worker on the home page", async ({ page }) => {
    await page.goto("/");
    // Wait for any registration to complete (autoUpdate path).
    await page.waitForLoadState("networkidle");

    // navigator.serviceWorker.controller is null on first load; check
    // ready instead which resolves once a SW is registered.
    const hasSW = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return false;
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        return reg !== undefined;
      } catch {
        return false;
      }
    });

    expect(hasSW, "service worker should be registered in PROD build").toBe(true);
  });

  test("sw.js is served from the deploy root", async ({ page }) => {
    const response = await page.request.get("/sw.js");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toMatch(/javascript/);
  });
});
