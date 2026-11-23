import { DestroyRef, Injectable, computed, effect, inject, linkedSignal, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { ApiService } from './api.service';
import { describeError } from './errors';
import { HistoryService } from './history.service';
import { SearchPage } from './models';
import { pageCount } from './paging';
import { checkQuery, coreQueryAdjustment, narrowToYear, toCoreQuery } from './query';
import { SearchState, buildSearch, clampLimit, maxPage, parseState } from './url-state';

/** A page of results plus the search that produced it, so labels never mix the two up. */
export interface ShownPage extends SearchPage {
  baseQuery: string;
  year: number | null;
  page: number;
}

/** Reads the address bar, ignoring a query that would fail the same checks as a typed one. */
function stateFromLocation(): SearchState {
  const state = parseState(globalThis.location?.search ?? '');
  return state.q && checkQuery(state.q).error ? { ...state, q: '', year: null, page: 1 } : state;
}

/**
 * All search state lives here, as signals. The address bar mirrors it; Back and Forward drive it.
 * Requests are resources: changing the search cancels any request still in flight, so a slow
 * old answer can never replace a newer one.
 */
@Injectable({ providedIn: 'root' })
export class SearchStore {
  private readonly api = inject(ApiService);
  private readonly history = inject(HistoryService);

  readonly state = signal<SearchState>(stateFromLocation());
  readonly query = computed(() => this.state().q);
  readonly limit = computed(() => this.state().limit);
  readonly page = computed(() => this.state().page);
  readonly year = computed(() => this.state().year);
  readonly hasQuery = computed(() => this.query() !== '');
  /** Words to highlight in titles and abstracts. */
  readonly terms = computed(() => checkQuery(this.query()).terms);
  /** What is sent to CORE and why, when it differs from what was typed (see query.ts). */
  readonly adjustment = computed(() => (this.query() ? coreQueryAdjustment(this.query()) : null));
  /** False for the rare query that CORE would misread once a year is added. */
  readonly canFilterByYear = computed(() => !this.query() || narrowToYear(this.query(), 2000) !== null);

  readonly results = rxResource({
    params: () => {
      const { q, limit, page } = this.state();
      if (!q) return undefined;
      const narrowed = this.year() === null ? null : narrowToYear(q, this.year()!);
      const year = narrowed === null ? null : this.year();
      return { q, sent: narrowed ?? toCoreQuery(q), limit, page, year, offset: (page - 1) * limit };
    },
    stream: ({ params }) =>
      this.api.search(params.sent, params.limit, params.offset).pipe(
        map((found): ShownPage => ({ ...found, baseQuery: params.q, year: params.year, page: params.page })),
      ),
  });

  /** Year counts depend on the query alone, so paging, page size and the year filter never refetch them. */
  readonly years = rxResource({
    params: () => (this.query() ? toCoreQuery(this.query()) : undefined),
    stream: ({ params }) => this.api.yearCounts(params),
  });

  /** Keeps the previous page on screen while the next one loads, so the layout never jumps. */
  readonly shown = linkedSignal<ShownPage | undefined, ShownPage | undefined>({
    source: () => (this.results.hasValue() ? this.results.value() : undefined),
    computation: (next, previous) => (this.hasQuery() ? (next ?? previous?.value) : undefined),
  });

  /** Total matches for the query without the year filter, for the chart's coverage note. */
  readonly totalForQuery = linkedSignal<string, number | null>({
    source: () => this.query(),
    computation: () => null,
  });

  readonly loading = computed(() => this.results.isLoading());
  readonly errorMessage = computed(() => (this.results.error() ? describeError(this.results.error()) : null));
  readonly yearsError = computed(() => (this.years.error() ? describeError(this.years.error()) : null));
  readonly pages = computed(() => {
    const shown = this.shown();
    return shown ? pageCount(shown.totalHits, shown.limit) : 0;
  });

  constructor() {
    effect(() => {
      if (!this.results.hasValue()) return;
      const page = this.results.value();
      untracked(() => {
        if (page.year === null) this.totalForQuery.set(page.totalHits);
        this.history.remember(page.baseQuery);
      });
    });

    // The address bar mirrors the search. A new query, page or year is a new history entry;
    // changing only the page size refines where you already are, so it replaces the entry.
    effect(() => {
      const state = this.state();
      const next = buildSearch(state);
      if (next === globalThis.location.search) return;
      const current = parseState(globalThis.location.search);
      const refineOnly = current.q === state.q && current.limit !== state.limit;
      globalThis.history[refineOnly ? 'replaceState' : 'pushState'](null, '', globalThis.location.pathname + next);
    });

    const follow = () => this.state.set(stateFromLocation());
    globalThis.addEventListener('popstate', follow);
    inject(DestroyRef).onDestroy(() => globalThis.removeEventListener('popstate', follow));
  }

  /** Runs a search. Searching the same thing again refreshes it. */
  search(raw: string): void {
    const q = raw.trim();
    if (!q || checkQuery(q).error) return;
    if (q === this.query()) {
      this.results.reload();
      this.years.reload();
      return;
    }
    this.state.update((s) => ({ ...s, q, page: 1, year: null }));
  }

  /** A new page size keeps you near the paper you were looking at, rather than jumping to page 1. */
  setLimit(value: number): void {
    const limit = clampLimit(value);
    this.state.update((s) => {
      const firstShown = (s.page - 1) * s.limit;
      return { ...s, limit, page: Math.min(Math.floor(firstShown / limit) + 1, maxPage(limit)) };
    });
  }

  goToPage(page: number): void {
    const last = Math.max(1, this.pages());
    this.state.update((s) => ({ ...s, page: Math.min(Math.max(1, Math.trunc(page)), last) }));
  }

  setYear(year: number | null): void {
    if (year !== null && !this.canFilterByYear()) return;
    this.state.update((s) => ({ ...s, year: s.year === year ? null : year, page: 1 }));
  }

  retry(): void {
    this.results.reload();
  }

  retryYears(): void {
    this.years.reload();
  }

  reset(): void {
    this.state.update((s) => ({ ...s, q: '', page: 1, year: null }));
  }
}
