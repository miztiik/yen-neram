export const SAVE_KEY_APP = "yn:app";

export function saveKeyForGame(slug: string): string {
  if (slug.length === 0 || slug.includes(":")) {
    throw new RangeError(
      `saveKeyForGame: slug must be non-empty and must not contain ':' (got ${JSON.stringify(slug)})`,
    );
  }
  return `yn:game:${slug}`;
}

export function readKeyRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeKeyRaw(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // no-op: localStorage unavailable (private mode, SSR, quota exceeded)
  }
}

export function deleteKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // no-op: localStorage unavailable
  }
}

export function readJson<T>(key: string, schema: { parse(input: unknown): T }): T | null {
  const raw = readKeyRaw(key);
  if (raw === null) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  try {
    return schema.parse(parsed);
  } catch {
    return null;
  }
}

export function writeJson<T>(key: string, value: T): void {
  const str = JSON.stringify(value);
  writeKeyRaw(key, str);
}
