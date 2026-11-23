/**
 * Splits text into plain and matching pieces, so the template can wrap matches in <mark>
 * through normal text interpolation. No HTML is ever built from paper data, which keeps
 * highlighting safe from script injection.
 */
export interface Segment {
  text: string;
  match: boolean;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlightSegments(text: string, terms: readonly string[]): Segment[] {
  const usable = [...new Set(terms.map((t) => t.trim()).filter((t) => t.length >= 2))].sort(
    (a, b) => b.length - a.length,
  );
  if (!text || usable.length === 0) return text ? [{ text, match: false }] : [];

  // Whole words (or phrases) only, so "car" does not light up inside "carbon".
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${usable.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  const segments: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) segments.push({ text: text.slice(last, start), match: false });
    segments.push({ text: match[0], match: true });
    last = start + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), match: false });
  return segments;
}
