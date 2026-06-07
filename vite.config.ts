import { defineConfig, type PluginOption } from "vite";
import { fileURLToPath, URL } from "node:url";

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

export default defineConfig({
  // Root-relative base so deep-route SPA loads (e.g. /play/5-in-a-row/)
  // resolve asset URLs from the deploy root, not the current path. For a
  // GitHub Pages project deploy at /<repo>/, the deploy workflow overrides
  // this via the GH_PAGES_BASE env var (see ADR-0010); for local dev +
  // preview + e2e the site sits at /.
  base: REPO_BASE,
  plugins: [spaFallback()],
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
});
