import { SaveV1Schema, type SaveV1 } from "@/shared/schemas/5-in-a-row.save.schema.js";
import { readJson, writeJson, saveKeyForGame } from "@/shared/save/index.js";

const SLUG = "5-in-a-row";
const KEY = saveKeyForGame(SLUG);

export function readSave(): SaveV1 | null {
  return readJson(KEY, SaveV1Schema);
}

export function writeSave(save: SaveV1): void {
  SaveV1Schema.parse(save);
  writeJson(KEY, save);
}

export function makeFreshSave(mode: "infinite" | "max-points"): SaveV1 {
  return {
    schema_version: 1,
    mode,
    in_progress: null,
    high_scores: {
      infinite: [],
      max_points: [],
    },
  };
}
