import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  GameManifestArraySchema,
  GameManifestEntrySchema,
} from "@/shared/schemas/game-manifest.schema.js";

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(here, "../../public/games.json");
const rawManifest = readFileSync(manifestPath, "utf-8");
const parsedManifest: unknown = JSON.parse(rawManifest);

describe("public/games.json contract", () => {
  it("validates against GameManifestArraySchema", () => {
    const result = GameManifestArraySchema.safeParse(parsedManifest);
    expect(result.success).toBe(true);
  });

  it("has at least one shipped entry", () => {
    const entries = GameManifestArraySchema.parse(parsedManifest);
    const shipped = entries.filter((entry) => entry.status === "shipped");
    expect(shipped.length).toBeGreaterThanOrEqual(1);
  });

  it("every shipped entry has an entry_route", () => {
    const entries = GameManifestArraySchema.parse(parsedManifest);
    for (const entry of entries) {
      if (entry.status === "shipped") {
        expect(entry.entry_route).toBeDefined();
        expect(typeof entry.entry_route).toBe("string");
      }
    }
  });

  it("every slug matches /^[a-z0-9-]+$/", () => {
    const entries = GameManifestArraySchema.parse(parsedManifest);
    const slugPattern = /^[a-z0-9-]+$/;
    for (const entry of entries) {
      expect(entry.slug).toMatch(slugPattern);
    }
  });

  it("slugs are unique across the array", () => {
    const entries = GameManifestArraySchema.parse(parsedManifest);
    const slugs = entries.map((entry) => entry.slug);
    const uniqueSlugs = new Set(slugs);
    expect(uniqueSlugs.size).toBe(slugs.length);
  });

  it("every tile_silhouette path starts with /assets/portal-tiles/", () => {
    const entries = GameManifestArraySchema.parse(parsedManifest);
    for (const entry of entries) {
      if (entry.tile_silhouette !== undefined) {
        expect(entry.tile_silhouette.startsWith("/assets/portal-tiles/")).toBe(true);
      }
    }
  });

  it("tagline, when present, is a non-empty string (portal hero descriptor)", () => {
    const entries = GameManifestArraySchema.parse(parsedManifest);
    for (const entry of entries) {
      if (entry.tagline !== undefined) {
        expect(typeof entry.tagline).toBe("string");
        expect(entry.tagline.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("GameManifestEntrySchema schema-only failures", () => {
  it("rejects wrong status string", () => {
    const result = GameManifestEntrySchema.safeParse({
      slug: "ok-slug",
      title: "OK",
      status: "in-progress",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing slug", () => {
    const result = GameManifestEntrySchema.safeParse({
      title: "No Slug",
      status: "shipped",
    });
    expect(result.success).toBe(false);
  });

  it("rejects slug with uppercase letters", () => {
    const result = GameManifestEntrySchema.safeParse({
      slug: "Bad-Slug",
      title: "Bad",
      status: "shipped",
    });
    expect(result.success).toBe(false);
  });

  it("accepts an optional tagline", () => {
    const result = GameManifestEntrySchema.safeParse({
      slug: "ok-slug",
      title: "OK",
      status: "shipped",
      entry_route: "/play/ok-slug/",
      tagline: "Line them up.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty tagline", () => {
    const result = GameManifestEntrySchema.safeParse({
      slug: "ok-slug",
      title: "OK",
      status: "shipped",
      tagline: "",
    });
    expect(result.success).toBe(false);
  });
});
