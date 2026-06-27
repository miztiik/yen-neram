import { defineConfig } from "vitest/config";
import type { PluginOption } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { copyFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

// Mimics GitHub Pages SPA fallback during `vite preview` and `vite dev`:
// when a requested path has no file extension and is not a known asset,
// rewrite the URL to "/" so index.html boots and the SPA router re-parses.
// In production on GitHub Pages, the equivalent happens via 404.html being a
// byte-identical copy of index.html (per ADR-0001).
function spaFallback(): PluginOption {
  const rewrite = (req: {
    url?: string | undefined;
    headers?: { accept?: string | undefined };
  }): void => {
    const url = req.url;
    if (url === undefined) return;
    const pathOnly = url.split("?")[0] ?? "";
    // Pass through anything that looks like a static asset (has a file extension).
    if (/\.[a-z0-9]+$/i.test(pathOnly)) return;
    // Pass through Vite's internal module requests and HMR pings (start with @vite, @fs, @id, /node_modules).
    if (/^\/(@vite|@fs|@id|node_modules|src\/|@react-refresh)/.test(pathOnly)) return;
    // Only rewrite navigation requests (browser asks for HTML). Module / fetch requests
    // accept text/javascript or */* without text/html in the leading position.
    const accept = req.headers?.accept ?? "";
    if (!accept.includes("text/html")) return;
    req.url = "/";
  };
  return {
    name: "yn-spa-fallback",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        rewrite(req);
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        rewrite(req);
        next();
      });
    },
  };
}

// Set GH_PAGES_BASE=/<repo>/ for project-page deploys; default "/" for user/org page or local dev.
const REPO_BASE = process.env["GH_PAGES_BASE"] ?? "/";

// Production-only: stamp dist/404.html as a byte-identical copy of the BUILT
// dist/index.html (which has hashed-asset script + CSS tags + the right base
// prefix). This makes GitHub Pages serve the SPA shell on any deep-link 404,
// which is the only navigation-fallback mechanism GH Pages supports. Per ADR-0001.
function spa404Stamp(): PluginOption {
  return {
    name: "yn-spa-404-stamp",
    apply: "build",
    closeBundle() {
      const outDir = pathResolve(fileURLToPath(new URL("./dist", import.meta.url)));
      copyFileSync(pathResolve(outDir, "index.html"), pathResolve(outDir, "404.html"));
    },
  };
}

export default defineConfig({
  // Root-relative base so deep-route SPA loads (e.g. /play/5-in-a-row/)
  // resolve asset URLs from the deploy root, not the current path. For a
  // GitHub Pages project deploy at /<repo>/, the deploy workflow overrides
  // this via the GH_PAGES_BASE env var (see ADR-0010); for local dev +
  // preview + e2e the site sits at /.
  base: REPO_BASE,
  plugins: [
    spaFallback(),
    spa404Stamp(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      devOptions: {
        enabled: false,
      },
      workbox: {
        globPatterns: ["**/*.{html,js,css,svg,webmanifest,json}"],
        // Theme motif art is loaded ON-DEMAND per selected theme (theme-loader
        // fetches only the chosen theme's images at runtime), so precaching
        // EVERY theme's images bloats the SW install and contends with the
        // throttled perf budget over Slow-4G as themes are added (ADR-0015
        // amendment, 2026-06-27). Exclude theme motif images from the precache;
        // each theme's manifest.json + the themes index.json stay precached for
        // offline theme discovery, and a motif is browser-cached on first use.
        globIgnores: ["**/sw.js", "**/workbox-*.js", "**/*.map", "**/assets/themes/*/*.{svg,png}"],
        runtimeCaching: [],
        // Base-aware (ADR-0022): on the /yen-neram/ project deploy the
        // precached shell is keyed `${REPO_BASE}index.html`, so the offline
        // navigation fallback must point at the same base-scoped URL -- a
        // literal "/index.html" misses the precache off-base. The denylist
        // keeps asset + extensioned requests OUT of the SPA fallback.
        navigateFallback: `${REPO_BASE}index.html`,
        navigateFallbackDenylist: [new RegExp(`^${REPO_BASE}assets/`), /\.\w+$/],
      },
      manifest: false,
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    target: "es2022",
    outDir: "dist",
    sourcemap: false,
    minify: "esbuild",
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: "node",
    include: [
      "tests/unit/**/*.test.ts",
      "tests/contract/**/*.test.ts",
      "tests/integration/**/*.test.ts",
    ],
    exclude: ["tests/e2e/**", "node_modules", "dist"],
    globals: false,
    reporters: ["default"],
    coverage: {
      enabled: false,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts", "src/main.ts", "src/styles/**"],
    },
  },
});
