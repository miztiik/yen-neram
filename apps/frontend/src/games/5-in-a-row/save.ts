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

// Restart-this-game / Play-again / Reset-game / Switch-mode helper.
// PRESERVES cross-run state (high_scores + streak) while wiping
// in_progress and optionally switching the mode for the next run.
//
// ADR-0021 regression: pre-2026-06-08 the in-game "Play again",
// "Restart this game", "Reset game", and "Switch mode" handlers all
// called `writeSave(makeFreshSave(mode))` directly -- which wipes
// `high_scores` AND `streak` along with the in-progress run. Every
// game-end therefore destroyed the leaderboard and streak history.
// The fix routes mid-session restarts through this helper instead so
// only the in-progress run is reset; the records that the player
// earned across previous runs carry forward intact.
//
// `makeFreshSave` is kept for the FIRST EVER mount where there is no
// prior save to preserve from -- it produces a zeroed Save shape
// from scratch.
export function makeFreshGame(prev: Save, mode: GameMode): Save {
  return {
    schema_version: 2,
    mode,
    in_progress: null,
    high_scores: prev.high_scores,
    streak: prev.streak,
  };
}
