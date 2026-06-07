import "@/styles/index.css";
import { mountShell } from "@/shell/index.js";

const container = document.getElementById("app");
if (!container) {
  throw new Error("yn: #app container missing from index.html");
}
mountShell(container);

// PWA service worker registration (per ADR-0015 - autoUpdate via vite-plugin-pwa).
// Wrapped in dynamic import + try/catch so dev / no-SW environments degrade silently.
if (import.meta.env.PROD) {
  void (async () => {
    try {
      const { Workbox } = await import("workbox-window");
      const wb = new Workbox("/sw.js");
      wb.addEventListener("waiting", () => {
        void wb.messageSkipWaiting();
      });
      await wb.register();
    } catch {
      // SW registration failure is not fatal - app still works online.
    }
  })();
}
