import "@/styles/index.css";
import { mountShell } from "@/shell/index.js";

const container = document.getElementById("app");
if (!container) {
  throw new Error("yn: #app container missing from index.html");
}
mountShell(container);

// The PWA service worker (ADR-0015, autoUpdate) is registered by the script
// vite-plugin-pwa auto-injects into index.html (`injectRegister: "auto"`),
// which targets the correct base-scoped `${BASE_URL}sw.js`. A hand-rolled
// `new Workbox("/sw.js")` here previously duplicated that AND hardcoded the
// root path, so it 404'd on the `/yen-neram/` project deploy -- removed in
// favour of the single injected registration path (ADR-0022).
