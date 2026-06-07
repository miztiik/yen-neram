export type Route =
  | { readonly kind: "home" }
  | { readonly kind: "play"; readonly slug: string; readonly queryParams: URLSearchParams }
  | { readonly kind: "not-found"; readonly path: string };

export type RouteListener = (route: Route) => void;

export type Router = {
  current(): Route;
  go(route: Route): void;
  back(): void;
  subscribe(listener: RouteListener): () => void;
  start(): void;
  stop(): void;
};

const SLUG_PATTERN = /^[a-z0-9-]+$/;
const PLAY_PREFIX = "/play/";

function normaliseBase(basePath: string): string {
  // Ensure leading and trailing slash so prefix-stripping is unambiguous.
  let b = basePath;
  if (!b.startsWith("/")) b = "/" + b;
  if (!b.endsWith("/")) b = b + "/";
  return b;
}

function stripBase(pathname: string, basePath: string): string {
  const b = normaliseBase(basePath);
  if (b === "/") return pathname;
  if (pathname === b.slice(0, -1) || pathname === b) return "/";
  if (pathname.startsWith(b)) return "/" + pathname.slice(b.length);
  return pathname;
}

function joinBase(path: string, basePath: string): string {
  const b = normaliseBase(basePath);
  if (b === "/") return path;
  if (path === "/") return b;
  return b + path.replace(/^\//, "");
}

export function parseRoute(pathname: string, search: string, basePath: string = "/"): Route {
  const path = stripBase(pathname, basePath);
  if (path === "/" || path === "") {
    return { kind: "home" };
  }

  if (path.startsWith(PLAY_PREFIX)) {
    const remainder = path.slice(PLAY_PREFIX.length);
    const trimmed = remainder.endsWith("/") ? remainder.slice(0, -1) : remainder;
    if (trimmed.length === 0 || trimmed.includes("/") || !SLUG_PATTERN.test(trimmed)) {
      return { kind: "not-found", path };
    }
    return {
      kind: "play",
      slug: trimmed,
      queryParams: new URLSearchParams(search),
    };
  }

  return { kind: "not-found", path };
}

export function routeToPath(route: Route, basePath: string = "/"): string {
  if (route.kind === "home") {
    return joinBase("/", basePath);
  }
  if (route.kind === "play") {
    const base = `/play/${route.slug}/`;
    const withQuery = route.queryParams.size > 0 ? `${base}?${route.queryParams.toString()}` : base;
    return joinBase(withQuery, basePath);
  }
  return joinBase(route.path, basePath);
}

export function createRouter(): Router {
  // Vite-injected base path; defaults to "/" for local dev/preview, set to
  // "/<repo>/" for project-page deploys via the GH_PAGES_BASE env (per ADR-0010).
  const basePath = import.meta.env.BASE_URL;
  let current: Route = parseRoute(window.location.pathname, window.location.search, basePath);
  const listeners = new Set<RouteListener>();
  let popstateHandler: (() => void) | null = null;

  const notify = (): void => {
    for (const listener of listeners) {
      listener(current);
    }
  };

  return {
    current() {
      return current;
    },
    go(route) {
      current = route;
      window.history.pushState({}, "", routeToPath(route, basePath));
      notify();
    },
    back() {
      window.history.back();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      if (popstateHandler !== null) {
        return;
      }
      popstateHandler = () => {
        current = parseRoute(window.location.pathname, window.location.search, basePath);
        notify();
      };
      window.addEventListener("popstate", popstateHandler);
    },
    stop() {
      if (popstateHandler === null) {
        return;
      }
      window.removeEventListener("popstate", popstateHandler);
      popstateHandler = null;
    },
  };
}
