import { CoreAggregateResponse, CoreSearchResponse, CoreWork, Paper, PaperLink, SearchPage, YearSummary } from './models';

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

/**
 * Turns CORE's text (which may contain HTML tags, JATS markup and escaped entities)
 * into clean plain text. The result is always rendered as text, never as HTML.
 */
export function plainText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let text = value;
  // Entities first, because some abstracts arrive double-escaped (&lt;p&gt;).
  for (let i = 0; i < 2 && /&[#a-z0-9]+;/i.test(text); i++) text = decodeEntities(text);
  text = text
    .replace(/<\s*(br|\/p|\/div|\/li|\/h\d)\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isInteger(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** Returns the URL only if it is plain http(s) with no embedded credentials. */
export function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** A plausible publication year, or null. */
export function validYear(value: unknown, currentYear = new Date().getFullYear()): number | null {
  const year = typeof value === 'string' && /^\d{4}$/.test(value.trim()) ? Number(value) : value;
  return typeof year === 'number' && Number.isInteger(year) && year >= 1000 && year <= currentYear + 1
    ? year
    : null;
}

function cleanDoi(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const doi = value.trim().replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/i, '');
  return /^10\.\d{4,9}\/\S+$/.test(doi) ? doi : null;
}

function authorNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names = value
    .map((a) => plainText(typeof a === 'string' ? a : (a as { name?: unknown } | null)?.name))
    .filter((n): n is string => !!n);
  return [...new Set(names)];
}

function firstJournalTitle(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (const journal of value) {
    const title = plainText((journal as { title?: unknown } | null)?.title);
    if (title) return title;
  }
  return null;
}

function buildLinks(work: CoreWork, doi: string | null): PaperLink[] {
  const links: PaperLink[] = [];
  const seen = new Set<string>();
  const add = (kind: PaperLink['kind'], label: string, url: string | null) => {
    if (url && !seen.has(url)) {
      seen.add(url);
      links.push({ kind, label, url });
    }
  };
  add('pdf', 'PDF', safeUrl(work.downloadUrl));
  if (doi) add('doi', 'DOI', `https://doi.org/${encodeURI(doi)}`);
  if (Array.isArray(work.links)) {
    for (const link of work.links as { type?: unknown; url?: unknown }[]) {
      // CORE's "display" link points back to core.ac.uk, which we already show.
      if (link?.type === 'reader' || link?.type === 'download') add('pdf', 'PDF', safeUrl(link.url));
    }
  }
  return links;
}

export function toPaper(work: CoreWork): Paper | null {
  const rawId = work.id;
  const id = typeof rawId === 'number' || (typeof rawId === 'string' && rawId.trim()) ? String(rawId).trim() : null;
  if (!id) return null;
  const doi = cleanDoi(work.doi);
  const citations = work.citationCount;
  return {
    id,
    title: plainText(work.title) ?? 'Untitled paper',
    authors: authorNames(work.authors),
    year: validYear(work.yearPublished) ?? validYear(String(work.publishedDate ?? '').slice(0, 4)),
    abstract: plainText(work.abstract),
    publisher: plainText(work.publisher) ?? firstJournalTitle(work.journals),
    documentType: plainText(work.documentType),
    doi,
    citationCount: typeof citations === 'number' && Number.isInteger(citations) && citations >= 0 ? citations : null,
    links: buildLinks(work, doi),
    coreUrl: `https://core.ac.uk/works/${encodeURIComponent(id)}`,
  };
}

export function toSearchPage(query: string, raw: CoreSearchResponse, limit: number, offset: number): SearchPage {
  const results = Array.isArray(raw?.results) ? raw.results : [];
  const seen = new Set<string>();
  const papers: Paper[] = [];
  for (const work of results) {
    const paper = work && typeof work === 'object' ? toPaper(work) : null;
    if (paper && !seen.has(paper.id)) {
      seen.add(paper.id);
      papers.push(paper);
    }
  }
  const totalHits = typeof raw?.totalHits === 'number' && raw.totalHits >= 0 ? raw.totalHits : papers.length;
  return { query, totalHits, limit, offset, papers };
}

export function toYearSummary(query: string, raw: CoreAggregateResponse): YearSummary {
  const buckets = raw?.aggregations?.yearPublished ?? {};
  const counts = new Map<number, number>();
  for (const [key, value] of Object.entries(buckets)) {
    const year = validYear(key);
    if (year !== null && typeof value === 'number' && Number.isInteger(value) && value > 0) {
      counts.set(year, (counts.get(year) ?? 0) + value);
    }
  }
  const years = [...counts].map(([year, count]) => ({ year, count })).sort((a, b) => a.year - b.year);
  const totalHits = typeof raw?.totalHits === 'number' && raw.totalHits >= 0 ? raw.totalHits : null;
  return { query, years, dated: years.reduce((sum, y) => sum + y.count, 0), totalHits };
}
