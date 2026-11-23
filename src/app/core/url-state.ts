/**
 * The search lives in the address bar, so results can be shared, bookmarked, reloaded
 * and walked through with Back and Forward.
 */
export interface SearchState {
  q: string;
  limit: number;
  page: number;
  /** Optional filter to one publication year (from clicking the chart). */
  year: number | null;
}

export const LIMIT_PRESETS = [10, 25, 50, 100] as const;
export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 100;
/** CORE's simple search only pages through the first 10,000 results. */
export const MAX_RESULTS = 10_000;

export const EMPTY_STATE: SearchState = { q: '', limit: DEFAULT_LIMIT, page: 1, year: null };

function wholeNumber(raw: string | null, min: number, max: number): number | null {
  if (!raw || !/^\d{1,6}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
}

export function clampLimit(value: number): number {
  return Number.isFinite(value) ? Math.min(MAX_LIMIT, Math.max(1, Math.trunc(value))) : DEFAULT_LIMIT;
}

export function maxPage(limit: number): number {
  return Math.max(1, Math.floor(MAX_RESULTS / limit));
}

export function parseState(search: string): SearchState {
  const params = new URLSearchParams(search);
  const q = (params.get('q') ?? '').trim().slice(0, 500);
  const limit = wholeNumber(params.get('limit'), 1, MAX_LIMIT) ?? DEFAULT_LIMIT;
  const page = Math.min(wholeNumber(params.get('page'), 1, 100_000) ?? 1, maxPage(limit));
  const year = wholeNumber(params.get('year'), 1000, 2999);
  return { q, limit, page, year: q ? year : null };
}

/** Builds "?q=…" with defaults left out, so shared links stay short. */
export function buildSearch(state: SearchState): string {
  if (!state.q) return '';
  const params = new URLSearchParams({ q: state.q });
  if (state.limit !== DEFAULT_LIMIT) params.set('limit', String(state.limit));
  if (state.page > 1) params.set('page', String(state.page));
  if (state.year !== null) params.set('year', String(state.year));
  return `?${params}`;
}
