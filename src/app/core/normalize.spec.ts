import { plainText, safeUrl, toPaper, toSearchPage, toYearSummary, validYear } from './normalize';

describe('plainText', () => {
  it('strips tags and decodes entities, including double-escaped markup', () => {
    expect(plainText('<jats:p>Drones &amp; parcels</jats:p>')).toBe('Drones & parcels');
    expect(plainText('&lt;p&gt;Last&#8211;mile &quot;delivery&quot;&lt;/p&gt;')).toBe('Last–mile "delivery"');
    expect(plainText('line<br/>break')).toBe('line break');
  });
  it('turns a script tag into harmless text', () => {
    expect(plainText('<script>alert(1)</script>Title')).toBe('alert(1)Title');
  });
  it('returns null for empty or non-string values', () => {
    expect(plainText('   ')).toBeNull();
    expect(plainText(42)).toBeNull();
  });
});

describe('safeUrl', () => {
  it('keeps http(s) and drops everything else', () => {
    expect(safeUrl('https://core.ac.uk/download/1.pdf')).toBe('https://core.ac.uk/download/1.pdf');
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html,hi')).toBeNull();
    expect(safeUrl('https://user:pass@evil.example')).toBeNull();
    expect(safeUrl('not a url')).toBeNull();
  });
});

describe('validYear', () => {
  it('accepts plausible years only', () => {
    expect(validYear(2020, 2026)).toBe(2020);
    expect(validYear('1999', 2026)).toBe(1999);
    expect(validYear(2028, 2026)).toBeNull();
    expect(validYear(0)).toBeNull();
    expect(validYear(null)).toBeNull();
  });
});

describe('toPaper', () => {
  it('maps a CORE work into a clean paper', () => {
    const paper = toPaper({
      id: 123,
      title: 'Aero <i>Drone</i>',
      authors: [{ name: 'Rodriguez, Matthew' }, { name: 'Rodriguez, Matthew' }, { name: '' }, 'Joyce, Andrew'],
      yearPublished: 2019,
      abstract: 'An abstract.',
      doi: 'https://doi.org/10.1234/ABC.5',
      downloadUrl: 'https://core.ac.uk/download/123.pdf',
      journals: [{ title: 'Drone Journal' }],
      documentType: 'research',
      citationCount: 4,
      links: [{ type: 'download', url: 'https://core.ac.uk/download/123.pdf' }, { type: 'display', url: 'https://core.ac.uk/works/123' }],
    });
    expect(paper).toEqual({
      id: '123',
      title: 'Aero Drone',
      authors: ['Rodriguez, Matthew', 'Joyce, Andrew'],
      year: 2019,
      abstract: 'An abstract.',
      publisher: 'Drone Journal',
      documentType: 'research',
      doi: '10.1234/ABC.5',
      citationCount: 4,
      links: [
        { kind: 'pdf', label: 'PDF', url: 'https://core.ac.uk/download/123.pdf' },
        { kind: 'doi', label: 'DOI', url: 'https://doi.org/10.1234/ABC.5' },
      ],
      coreUrl: 'https://core.ac.uk/works/123',
    });
  });

  it('copes with a nearly empty record', () => {
    const paper = toPaper({ id: '9', downloadUrl: 'javascript:alert(1)', publishedDate: '2015-03-01T00:00:00' });
    expect(paper?.title).toBe('Untitled paper');
    expect(paper?.authors).toEqual([]);
    expect(paper?.links).toEqual([]);
    expect(paper?.year).toBe(2015);
  });

  it('skips records without an id', () => {
    expect(toPaper({ title: 'x' })).toBeNull();
  });
});

describe('toSearchPage', () => {
  it('drops broken and duplicate records but keeps the total', () => {
    const page = toSearchPage('q', { totalHits: 71213, results: [{ id: 1 }, { id: 1 }, {}, { id: 2 }] }, 10, 20);
    expect(page.papers.map((p) => p.id)).toEqual(['1', '2']);
    expect(page.totalHits).toBe(71213);
    expect(page.offset).toBe(20);
  });
  it('survives a malformed response', () => {
    expect(toSearchPage('q', {} as never, 10, 0).papers).toEqual([]);
  });
});

describe('toYearSummary', () => {
  it('sorts years, drops invalid buckets and sums the dated papers', () => {
    const summary = toYearSummary('q', {
      totalHits: 100,
      aggregations: { yearPublished: { '2021': 5, '2019': 3, '0': 9, abc: 1, '2020': 'x' } },
    });
    expect(summary.years).toEqual([
      { year: 2019, count: 3 },
      { year: 2021, count: 5 },
    ]);
    expect(summary.dated).toBe(8);
    expect(summary.totalHits).toBe(100);
  });
});
