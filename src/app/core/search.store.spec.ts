import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ApiService } from './api.service';
import { SearchStore } from './search.store';

const settle = () => TestBed.inject(ApplicationRef).tick();
/** Resources deliver values asynchronously; wait for them, then let effects run. */
const settleAsync = async () => {
  await TestBed.inject(ApplicationRef).whenStable();
  settle();
};

describe('ApiService', () => {
  it('calls our server, not CORE, and normalises the answer', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    let total = 0;
    TestBed.inject(ApiService)
      .search('drone AND uav', 25, 50)
      .subscribe((page) => (total = page.totalHits));
    const req = http.expectOne((r) => r.url === '/api/search');
    expect(req.request.params.get('q')).toBe('drone AND uav');
    expect(req.request.params.get('limit')).toBe('25');
    expect(req.request.params.get('offset')).toBe('50');
    req.flush({ totalHits: 7, results: [] });
    expect(total).toBe(7);
    http.verify();
  });
});

describe('SearchStore', () => {
  let http: HttpTestingController;

  function create(url = '/') {
    history.replaceState(null, '', url);
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    const store = TestBed.inject(SearchStore);
    settle();
    return store;
  }

  afterEach(() => {
    localStorage.clear();
    history.replaceState(null, '', '/');
  });

  it('stays idle until there is a query', () => {
    const store = create();
    expect(store.hasQuery()).toBe(false);
    http.expectNone('/api/search');
  });

  it('restores a search from the address bar and loads results and year counts', async () => {
    const store = create('/?q=drone&limit=25&page=2');
    expect(store.state()).toEqual({ q: 'drone', limit: 25, page: 2, year: null });
    const search = http.expectOne((r) => r.url === '/api/search');
    expect(search.request.params.get('offset')).toBe('25');
    http.expectOne((r) => r.url === '/api/years').flush({ aggregations: { yearPublished: { '2020': 2 } } });
    search.flush({ totalHits: 60, results: [{ id: 1, title: 'A' }] });
    await settleAsync();
    expect(store.shown()?.papers.length).toBe(1);
    expect(store.pages()).toBe(3);
    expect(store.totalForQuery()).toBe(60);
  });

  it('ignores an invalid query in the address bar', () => {
    const store = create('/?q=(broken');
    expect(store.query()).toBe('');
  });

  it('writes the search to the address bar and remembers it', async () => {
    const store = create();
    store.search('drone AND uav');
    settle();
    expect(location.search).toBe('?q=drone+AND+uav');
    http.expectOne((r) => r.url === '/api/years').flush({});
    http.expectOne((r) => r.url === '/api/search').flush({ totalHits: 0, results: [] });
    await settleAsync();
    expect(JSON.parse(localStorage.getItem('cre.recentSearches.v1')!)).toEqual(['drone AND uav']);
  });

  it('cancels a slow request when a newer search starts', () => {
    const store = create();
    store.search('first');
    settle();
    const first = http.expectOne((r) => r.url === '/api/search' && r.params.get('q') === 'first');
    store.search('second');
    settle();
    expect(first.cancelled).toBe(true);
    http.expectOne((r) => r.url === '/api/search' && r.params.get('q') === 'second');
  });

  it('filters by year through the query, without refetching year counts', () => {
    const store = create('/?q=drone');
    http.expectOne((r) => r.url === '/api/years').flush({});
    http.expectOne((r) => r.url === '/api/search').flush({ totalHits: 100, results: [] });
    settle();
    store.setYear(2021);
    settle();
    const filtered = http.expectOne((r) => r.url === '/api/search');
    expect(filtered.request.params.get('q')).toBe('drone AND yearPublished:2021');
    http.expectNone((r) => r.url === '/api/years');
    expect(location.search).toBe('?q=drone&year=2021');
  });

  it('keeps your place when the page size changes', () => {
    const store = create('/?q=drone&page=3');
    store.setLimit(25);
    expect(store.state()).toMatchObject({ limit: 25, page: 1 });
    store.setLimit(10);
    store.goToPage(1);
    expect(store.page()).toBe(1);
  });

  it("sends the brief's example in the form CORE reads correctly, but keeps it as typed in the URL", () => {
    const store = create('/?q=' + encodeURIComponent('(drone AND (package OR delivery))'));
    const search = http.expectOne((r) => r.url === '/api/search');
    const years = http.expectOne((r) => r.url === '/api/years');
    expect(search.request.params.get('q')).toBe('drone AND (package OR delivery)');
    expect(years.request.params.get('q')).toBe('drone AND (package OR delivery)');
    expect(store.query()).toBe('(drone AND (package OR delivery))');
    expect(store.adjustment()?.reason).toMatch(/ignores an OR group/);
  });

  it('turns the year filter off when CORE would misread the narrowed query', () => {
    const store = create('/?q=' + encodeURIComponent('drone OR (package OR delivery)'));
    expect(store.canFilterByYear()).toBe(false);
    store.setYear(2021);
    expect(store.year()).toBeNull();
  });

  it('rejects a query the checker would reject', () => {
    const store = create();
    store.search('drone AND');
    expect(store.query()).toBe('');
  });
});
