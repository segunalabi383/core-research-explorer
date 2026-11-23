/**
 * localStorage can be missing, full, or throw (private browsing, blocked cookies).
 * These helpers never throw: the app simply forgets things instead of breaking.
 */
export function readJson<T>(key: string, isValid: (value: unknown) => value is T, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return fallback;
    const value: unknown = JSON.parse(raw);
    return isValid(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable or full: keep working without persistence */
  }
}
