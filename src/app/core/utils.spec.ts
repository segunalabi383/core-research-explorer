import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { fillGaps, layoutChart, niceMax, selectYears } from './chart-data';
import { describeError, retryTime } from './errors';
import { csvCell, exportFilename, papersToBibtex, papersToCsv } from './export';
import { highlightSegments } from './highlight';
import { Paper } from './models';
import { pageCount, pageItems } from './paging';
import { buildSearch, parseState } from './url-state';

const paper = (over: Partial<Paper> = {}): Paper => ({
  id: '1',
  title: 'Drone delivery & logistics',
  authors: ['Smith, Jane', 'Doe, John'],
  year: 2021,
  abstract: 'About drones.',
  publisher: 'Pub',
  documentType: 'research',
  doi: '10.1/x_y',
  citationCount: 3,
  links: [{ kind: 'pdf', label: 'PDF', url: 'https://core.ac.uk/download/1.pdf' }],
  coreUrl: 'https://core.ac.uk/works/1',
  ...over,
});

describe('highlightSegments', () => {
  it('marks whole words and phrases, case-insensitively', () => {
    expect(highlightSegments('Drone-based delivery by drones', ['drone', 'delivery'])).toEqual([
      { text: 'Drone', match: true },
      { text: '-based ', match: false },
      { text: 'delivery', match: true },
      { text: ' by drones', match: false },
    ]);
  });
  it('treats special characters literally and returns plain text without terms', () => {
    expect(highlightSegments('C++ (2020) and C', ['c++'])).toEqual([
      { text: 'C++', match: true },
      { text: ' (2020) and C', match: false },
    ]);
    expect(highlightSegments('carbon car', ['car'])).toEqual([
      { text: 'carbon ', match: false },
      { text: 'car', match: true },
    ]);
    expect(highlightSegments('<b>x</b>', [])).toEqual([{ text: '<b>x</b>', match: false }]);
  });
});

describe('url state', () => {
  it('round-trips a search and leaves defaults out', () => {
    const state = { q: 'drone AND uav', limit: 25, page: 3, year: 2020 };
    expect(parseState(buildSearch(state))).toEqual(state);
    expect(buildSearch({ q: 'x', limit: 10, page: 1, year: null })).toBe('?q=x');
    expect(buildSearch({ q: '', limit: 50, page: 2, year: null })).toBe('');
  });
  it('repairs nonsense values', () => {
    expect(parseState('?q=x&limit=500&page=-2&year=abc')).toEqual({ q: 'x', limit: 10, page: 1, year: null });
    expect(parseState('?q=x&limit=100&page=999').page).toBe(100);
    expect(parseState('?year=2020').year).toBeNull();
  });
});

describe('paging', () => {
  it('caps reachable pages at 10,000 results', () => {
    expect(pageCount(71213, 10)).toBe(1000);
    expect(pageCount(95, 10)).toBe(10);
    expect(pageCount(0, 10)).toBe(0);
  });
  it('lists pages with gaps', () => {
    expect(pageItems(1, 1)).toEqual([1]);
    expect(pageItems(5, 20)).toEqual([1, null, 4, 5, 6, null, 20]);
    expect(pageItems(3, 20)).toEqual([1, 2, 3, 4, null, 20]);
    expect(pageItems(1, 5)).toEqual([1, 2, null, 5]);
  });
});

describe('exports', () => {
  it('neutralises spreadsheet formulas and escapes quotes', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('@SUM(A1)')).toBe(`"'@SUM(A1)"`);
    expect(csvCell(null)).toBe('""');
  });
  it('writes a CSV with a header row', () => {
    const lines = papersToCsv([paper()]).replace('﻿', '').split('\r\n');
    expect(lines[0]).toContain('"Title"');
    expect(lines[1]).toContain('"Smith, Jane; Doe, John"');
  });
  it('writes valid BibTeX with unique keys and escaped characters', () => {
    const bib = papersToBibtex([paper(), paper({ id: '2' })]);
    expect(bib).toContain('@article{smith2021drone,');
    expect(bib).toContain('@article{smith2021drone2,');
    expect(bib).toContain('title = {Drone delivery \\& logistics}');
    expect(bib).toContain('author = {Smith, Jane and Doe, John}');
    expect(bib).toContain('doi = {10.1/x\\_y}');
  });
  it('makes safe file names', () => {
    expect(exportFilename('(drone AND "x")', 'csv', new Date('2026-11-23T10:00:00Z'))).toBe('drone-and-x-2026-11-23.csv');
  });
});

describe('chart data', () => {
  const years = [
    { year: 1950, count: 1 },
    { year: 2000, count: 4 },
    { year: 2002, count: 10 },
  ];
  it('keeps the last 30 years by default and reports older papers', () => {
    expect(selectYears(years, 'recent')).toEqual({ shown: years.slice(1), older: 1 });
    expect(selectYears(years, 'all').older).toBe(0);
  });
  it('fills missing years with zeros', () => {
    expect(fillGaps(years.slice(1)).map((y) => y.count)).toEqual([4, 0, 10]);
  });
  it('rounds the axis and scales bars to it', () => {
    expect(niceMax(7)).toBe(10);
    expect(niceMax(130)).toBe(200);
    const layout = layoutChart(fillGaps(years.slice(1)));
    const tallest = layout.bars[2];
    expect(tallest.y).toBe(layout.plot.top);
    expect(layout.bars[1].height).toBe(0);
  });
});

describe('describeError', () => {
  const error = (status: number, headers: Record<string, string> = {}, body: unknown = null) =>
    new HttpErrorResponse({ status, headers: new HttpHeaders(headers), error: body });

  it('explains common failures', () => {
    expect(describeError(error(0))).toMatch(/connection/);
    expect(describeError(error(400, {}, { error: 'Bad limit' }))).toBe('Bad limit');
    expect(describeError(error(401))).toMatch(/API key/);
    expect(describeError(error(504))).toMatch(/too long/);
    expect(describeError(error(503))).toMatch(/503/);
    expect(describeError(new Error('x'))).toMatch(/Something went wrong/);
  });
  it('says when searching resumes after a rate limit', () => {
    expect(describeError(error(429, { 'x-ratelimit-retry-after': '2026-11-20T03:09:06+0000' }))).toMatch(/resumes at/);
    expect(describeError({ cause: error(429) })).toMatch(/wait a minute/);
  });
  it('parses CORE and standard retry formats', () => {
    expect(retryTime('2026-11-20T03:09:06+0000')?.toISOString()).toBe('2026-11-20T03:09:06.000Z');
    expect(retryTime('30', 0)?.getTime()).toBe(30_000);
    expect(retryTime('garbage')).toBeNull();
  });
});
