/**
 * Raw shapes returned by CORE v3. Research metadata is sparse and inconsistent, so every field
 * is optional and typed loosely. Nothing outside `normalize.ts` should read these directly.
 */
export interface CoreWork {
  id?: number | string | null;
  title?: unknown;
  abstract?: unknown;
  authors?: unknown;
  yearPublished?: unknown;
  publishedDate?: unknown;
  doi?: unknown;
  downloadUrl?: unknown;
  publisher?: unknown;
  journals?: unknown;
  documentType?: unknown;
  citationCount?: unknown;
  links?: unknown;
}

export interface CoreSearchResponse {
  totalHits?: number;
  limit?: number;
  offset?: number;
  results?: CoreWork[];
}

export interface CoreAggregateResponse {
  totalHits?: number;
  aggregations?: { yearPublished?: Record<string, unknown> };
}

/** A paper, cleaned up and safe to render. */
export interface Paper {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  abstract: string | null;
  publisher: string | null;
  documentType: string | null;
  doi: string | null;
  citationCount: number | null;
  /** Only http(s) URLs ever end up here. */
  links: PaperLink[];
  coreUrl: string;
}

export interface PaperLink {
  kind: 'pdf' | 'doi' | 'source';
  label: string;
  url: string;
}

export interface SearchPage {
  query: string;
  totalHits: number;
  limit: number;
  offset: number;
  papers: Paper[];
}

export interface YearCount {
  year: number;
  count: number;
}

export interface YearSummary {
  query: string;
  /** Sorted oldest first. */
  years: YearCount[];
  /** Matches CORE counted in year buckets. */
  dated: number;
  /** Matches CORE reported in total, when it reports it. */
  totalHits: number | null;
}
