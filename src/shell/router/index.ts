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

export function parseRoute(pathname: string, search: string): Route {
  if (pathname === "/" || pathname === "") {
    return { kind: "home" };
  }

  if (pathname.startsWith(PLAY_PREFIX)) {
    const remainder = pathname.slice(PLAY_PREFIX.length);
    const trimmed = remainder.endsWith("/") ? remainder.slice(0, -1) : remainder;
    if (trimmed.length === 0 || trimmed.includes("/") || !SLUG_PATTERN.test(trimmed)) {
      return { kind: "not-found", path: pathname };
    }
    return {
      kind: "play",
      slug: trimmed,
      queryParams: new URLSearchParams(search),
    };
  }

  return { kind: "not-found", path: pathname };
}

export function routeToPath(route: Route): string {
  if (route.kind === "home") {
    return "/";
  }
  if (route.kind === "play") {
    const base = `/play/${route.slug}/`;
    return route.queryParams.size > 0 ? `${base}?${route.queryParams.toString()}` : base;
  }
  return route.path;
}

export function createRouter(): Router {
  let current: Route = parseRoute(window.location.pathname, window.location.search);
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
      window.history.pushState({}, "", routeToPath(route));
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
        current = parseRoute(window.location.pathname, window.location.search);
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
