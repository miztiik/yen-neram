import { describe, expect, it } from "vitest";
import { parseRoute, routeToPath } from "@/shell/router/index.js";

describe("parseRoute", () => {
  it("returns home for /", () => {
    const route = parseRoute("/", "");
    expect(route).toEqual({ kind: "home" });
  });

  it("returns play for /play/<slug>/ with empty query", () => {
    const route = parseRoute("/play/5-in-a-row/", "");
    expect(route.kind).toBe("play");
    if (route.kind === "play") {
      expect(route.slug).toBe("5-in-a-row");
      expect(route.queryParams).toBeInstanceOf(URLSearchParams);
      expect(Array.from(route.queryParams.entries())).toHaveLength(0);
    }
  });

  it("returns play with parsed queryParams for /play/<slug>/?mode=...&theme=...", () => {
    const route = parseRoute("/play/5-in-a-row/", "?mode=infinite&theme=tropical-fruits");
    expect(route.kind).toBe("play");
    if (route.kind === "play") {
      expect(route.slug).toBe("5-in-a-row");
      expect(route.queryParams.get("mode")).toBe("infinite");
      expect(route.queryParams.get("theme")).toBe("tropical-fruits");
    }
  });

  it("returns not-found for /play/ (no slug)", () => {
    const route = parseRoute("/play/", "");
    expect(route.kind).toBe("not-found");
    if (route.kind === "not-found") {
      expect(route.path).toBe("/play/");
    }
  });

  it("returns not-found for /play/Bad_Slug/ (uppercase and underscore)", () => {
    const route = parseRoute("/play/Bad_Slug/", "");
    expect(route.kind).toBe("not-found");
  });

  it("returns not-found for unknown path", () => {
    const route = parseRoute("/random/", "");
    expect(route.kind).toBe("not-found");
    if (route.kind === "not-found") {
      expect(route.path).toBe("/random/");
    }
  });
});

describe("routeToPath", () => {
  it("emits / for home", () => {
    expect(routeToPath({ kind: "home" })).toBe("/");
  });

  it("emits /play/<slug>/ for play with empty queryParams", () => {
    expect(
      routeToPath({
        kind: "play",
        slug: "5-in-a-row",
        queryParams: new URLSearchParams(),
      }),
    ).toBe("/play/5-in-a-row/");
  });

  it("emits /play/<slug>/?mode=infinite for play with one param", () => {
    expect(
      routeToPath({
        kind: "play",
        slug: "5-in-a-row",
        queryParams: new URLSearchParams("mode=infinite"),
      }),
    ).toBe("/play/5-in-a-row/?mode=infinite");
  });
});
