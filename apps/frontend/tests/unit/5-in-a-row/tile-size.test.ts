import { describe, expect, it } from "vitest";
import {
  CELL_SIZE,
  DEFAULT_TILE_SIZE,
  TILE_SIZE_TIERS,
  TILE_SIZE_VALUES,
} from "@/games/5-in-a-row/ui/board-view.js";

// ADR-0026 geometry contract. The whole point of the tiered design is the
// hard invariant from ADR-0017: the bounce must never cross the cell edge
// (or it clips the always-on grid hairline and the chrome flickers). This
// suite is the executable guard so a future tier edit cannot silently break
// it.
describe("tile-size tiers (ADR-0026 geometry contract)", () => {
  it("exposes exactly small / medium / large", () => {
    expect([...TILE_SIZE_VALUES]).toEqual(["small", "medium", "large"]);
  });

  it("defaults to medium == the historical ADR-0017 75% fill (unchanged for existing players)", () => {
    expect(DEFAULT_TILE_SIZE).toBe("medium");
    const medium = TILE_SIZE_TIERS.medium;
    expect(medium.motif).toBe(30);
    expect(medium.preview).toBe(18);
    expect(medium.landPeak).toBe(1.3);
    expect(medium.pulsePeak).toBe(1.18);
  });

  for (const tile of TILE_SIZE_VALUES) {
    const tier = TILE_SIZE_TIERS[tile];

    it(`${tile}: land bounce stays inside the cell (motif * landPeak <= CELL_SIZE)`, () => {
      expect(tier.motif * tier.landPeak).toBeLessThanOrEqual(CELL_SIZE);
    });

    it(`${tile}: selected-pulse stays inside the cell (motif * pulsePeak <= CELL_SIZE)`, () => {
      expect(tier.motif * tier.pulsePeak).toBeLessThanOrEqual(CELL_SIZE);
    });

    it(`${tile}: motif fits the cell at rest and is positive`, () => {
      expect(tier.motif).toBeGreaterThan(0);
      expect(tier.motif).toBeLessThanOrEqual(CELL_SIZE);
    });

    it(`${tile}: preview stays smaller than the placed motif (keeps "next vs placed" legible)`, () => {
      expect(tier.preview).toBeLessThan(tier.motif);
    });

    it(`${tile}: pulse peak does not exceed the land peak (pulse is the gentler beat)`, () => {
      expect(tier.pulsePeak).toBeLessThanOrEqual(tier.landPeak);
    });
  }

  it("motif size strictly increases small < medium < large", () => {
    expect(TILE_SIZE_TIERS.small.motif).toBeLessThan(TILE_SIZE_TIERS.medium.motif);
    expect(TILE_SIZE_TIERS.medium.motif).toBeLessThan(TILE_SIZE_TIERS.large.motif);
  });

  it("preview size strictly increases small < medium < large", () => {
    expect(TILE_SIZE_TIERS.small.preview).toBeLessThan(TILE_SIZE_TIERS.medium.preview);
    expect(TILE_SIZE_TIERS.medium.preview).toBeLessThan(TILE_SIZE_TIERS.large.preview);
  });

  it("larger tiles trade away bounce headroom (land peak is non-increasing as size grows)", () => {
    // The documented honest trade-off: bigger fill => gentler bounce, because
    // there is no room to grow past the cell edge.
    expect(TILE_SIZE_TIERS.large.landPeak).toBeLessThanOrEqual(TILE_SIZE_TIERS.medium.landPeak);
    expect(TILE_SIZE_TIERS.medium.landPeak).toBeLessThanOrEqual(TILE_SIZE_TIERS.small.landPeak);
  });
});
