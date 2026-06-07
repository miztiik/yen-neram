import {
  SaveSchema,
  SaveV1SchemaLegacy,
  SaveV2Schema,
  type Save,
  type SaveV1,
} from "@/shared/schemas/5-in-a-row.save.schema.js";
import { readKeyRaw, saveKeyForGame, writeJson } from "@/shared/save/index.js";
import type { GameMode } from "./types.js";

const SLUG = "5-in-a-row";
const KEY = saveKeyForGame(SLUG);

// V1 -> V2 migration: additive only. Pre-existing fields carry over
// verbatim; new fields take the empty / null defaults that match a fresh
// game-history-free V2 save. Per CLAUDE.md sec 11, this is shipped in the
// same commit as the schema bump.
export function migrateV1ToV2(v1: SaveV1): Save {
  return {
    schema_version: 2,
    mode: v1.mode,
    in_progress: v1.in_progress,
    high_scores: {
      infinite: v1.high_scores.infinite,
      max_points: v1.high_scores.max_points,
      timed: [],
    },
    streak: null,
  };
}

// Read order: V2 first; on failure, attempt the V1 -> V2 migration if and
// only if the raw payload self-declares schema_version === 1. Anything
// else (unknown shape, parse error, missing key) -> null, just like v1.
export function readSave(): Save | null {
  const raw = readKeyRaw(KEY);
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const asV2 = SaveV2Schema.safeParse(parsed);
  if (asV2.success) return asV2.data;
  const versionField =
    typeof parsed === "object" && parsed !== null
      ? (parsed as { schema_version?: unknown }).schema_version
      : undefined;
  if (versionField === 1) {
    const asV1 = SaveV1SchemaLegacy.safeParse(parsed);
    if (asV1.success) return migrateV1ToV2(asV1.data);
  }
  return null;
}

export function writeSave(save: Save): void {
  SaveSchema.parse(save);
  writeJson(KEY, save);
}

export function makeFreshSave(mode: GameMode): Save {
  return {
    schema_version: 2,
    mode,
    in_progress: null,
    high_scores: {
      infinite: [],
      max_points: [],
      timed: [],
    },
    streak: null,
  };
}
