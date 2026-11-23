import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { CoreAggregateResponse, CoreSearchResponse, SearchPage, YearSummary } from './models';
import { toSearchPage, toYearSummary } from './normalize';

/**
 * Talks to our own server (server/core-proxy.mjs), never to CORE directly, so the API key
 * stays on the server and the browser has no CORS or quota concerns of its own.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  search(query: string, limit: number, offset = 0): Observable<SearchPage> {
    let params = new HttpParams().set('q', query).set('limit', limit);
    if (offset > 0) params = params.set('offset', offset);
    return this.http
      .get<CoreSearchResponse>('/api/search', { params })
      .pipe(map((raw) => toSearchPage(query, raw, limit, offset)));
  }

  /** Papers per publication year across every match, counted by CORE (not just one page). */
  yearCounts(query: string): Observable<YearSummary> {
    return this.http
      .get<CoreAggregateResponse>('/api/years', { params: new HttpParams().set('q', query) })
      .pipe(map((raw) => toYearSummary(query, raw)));
  }
}
