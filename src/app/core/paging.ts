import { MAX_RESULTS } from './url-state';

/** Number of pages the person can reach, capped by CORE's 10,000-result window. */
export function pageCount(totalHits: number, limit: number): number {
  if (totalHits <= 0 || limit <= 0) return 0;
  return Math.ceil(Math.min(totalHits, MAX_RESULTS) / limit);
}

/** Page numbers to show, with null for a gap: 1 … 4 5 6 … 20. */
export function pageItems(current: number, total: number, around = 1): (number | null)[] {
  if (total <= 0) return [];
  const pages = new Set<number>([1, total]);
  for (let p = current - around; p <= current + around; p++) if (p >= 1 && p <= total) pages.add(p);
  const sorted = [...pages].sort((a, b) => a - b);
  const items: (number | null)[] = [];
  sorted.forEach((page, i) => {
    const previous = sorted[i - 1];
    if (previous !== undefined && page - previous === 2) items.push(previous + 1);
    else if (previous !== undefined && page - previous > 2) items.push(null);
    items.push(page);
  });
  return items;
}
