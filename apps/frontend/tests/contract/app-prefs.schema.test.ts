import { describe, expect, it } from "vitest";
import { AppPrefsSchema } from "@/games/5-in-a-row/ui/settings-drawer.js";

// Contract: the `yn:app` preference blob's tile_size field (ADR-0026).
// tile_size is additive + optional, so the persisted contract must (a)
// accept the three valid values, (b) reject anything else, and (c) still
// parse a blob written before the field shipped (back-compat / no migration).
describe("AppPrefs schema (yn:app) - tile_size contract (ADR-0026)", () => {
  it("accepts and round-trips a valid tile_size", () => {
    const parsed = AppPrefsSchema.parse({ schema_version: 1, tile_size: "large" });
    expect(parsed.tile_size).toBe("large");
  });

  it("accepts all three tile sizes", () => {
    for (const v of ["small", "medium", "large"] as const) {
      expect(AppPrefsSchema.parse({ schema_version: 1, tile_size: v }).tile_size).toBe(v);
    }
  });

  it("rejects an unknown tile_size value", () => {
    expect(AppPrefsSchema.safeParse({ schema_version: 1, tile_size: "huge" }).success).toBe(false);
  });

  it("back-compat: a pref blob written before tile_size shipped still parses; field is undefined", () => {
    const r = AppPrefsSchema.safeParse({
      schema_version: 1,
      reduce_motion: true,
      preview_bounce_enabled: false,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.tile_size).toBeUndefined();
  });

  it("stays strict: an unknown top-level key is still rejected", () => {
    expect(AppPrefsSchema.safeParse({ schema_version: 1, bogus_field: 1 }).success).toBe(false);
  });
});

// Contract: the `yn:app` blob's clear_style field (ADR-0030). Same additive +
// optional shape as tile_size -- accept the three valid values, reject
// anything else, and still parse a blob written before the field shipped.
describe("AppPrefs schema (yn:app) - clear_style contract (ADR-0030)", () => {
  it("accepts and round-trips a valid clear_style", () => {
    const parsed = AppPrefsSchema.parse({ schema_version: 1, clear_style: "from-coin" });
    expect(parsed.clear_style).toBe("from-coin");
  });

  it("accepts all three clear styles", () => {
    for (const v of ["shockwave", "from-coin", "flash"] as const) {
      expect(AppPrefsSchema.parse({ schema_version: 1, clear_style: v }).clear_style).toBe(v);
    }
  });

  it("rejects an unknown clear_style value", () => {
    expect(AppPrefsSchema.safeParse({ schema_version: 1, clear_style: "sparkle" }).success).toBe(
      false,
    );
  });

  it("back-compat: a pref blob written before clear_style shipped still parses; field is undefined", () => {
    const r = AppPrefsSchema.safeParse({ schema_version: 1, tile_size: "large" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.clear_style).toBeUndefined();
  });
});
