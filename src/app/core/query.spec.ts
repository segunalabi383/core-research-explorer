import { checkQuery, coreQueryAdjustment, narrowToYear, toCoreQuery } from './query';

describe('checkQuery', () => {
  it.each([
    'drone',
    '(drone AND (package OR delivery))',
    '"climate change" AND adaptation',
    'crispr NOT review',
    'NOT review',
    'drone delivery',
    'title:"machine learning"',
    'authors:(smith OR jones)',
    'drone AND yearPublished>2020',
    'drone (package OR delivery)',
    'deliver*',
  ])('accepts %s', (query) => {
    expect(checkQuery(query).error).toBeNull();
  });

  it.each([
    ['', /Type something/],
    ['(drone AND delivery', /never closed/],
    ['((a OR b)', /never closed/],
    ['drone) AND x', /without a matching/],
    ['"last mile delivery', /quotation mark/],
    ['AND drone', /can't start with AND/],
    ['drone AND', /ends with "AND"/],
    ['drone NOT', /ends with "NOT"/],
    ['drone AND OR uav', /needs a word on both sides/],
    ['drone NOT AND uav', /NOT can't be followed by AND/],
    ['()', /empty pair of brackets/],
    ['(drone AND)', /right before "\)"/],
    ['a'.repeat(501), /500 characters/],
  ])('rejects %s', (query, message) => {
    expect(checkQuery(query).error).toMatch(message);
  });

  it('hints when an operator is written in lowercase, without blocking', () => {
    const result = checkQuery('drone and delivery');
    expect(result.error).toBeNull();
    expect(result.hint).toContain('AND');
  });

  it('collects highlight terms, skipping excluded words, fields and comparisons', () => {
    expect(checkQuery('(drone AND (package OR delivery))').terms).toEqual(['drone', 'package', 'delivery']);
    expect(checkQuery('"Climate Change" NOT review').terms).toEqual(['climate change']);
    expect(checkQuery('drone NOT (military OR weapon) AND uav').terms).toEqual(['drone', 'uav']);
    expect(checkQuery('title:robots AND yearPublished>2020').terms).toEqual(['robots']);
    expect(checkQuery('deliver* -spam').terms).toEqual(['deliver']);
  });
});

// Every expectation below matches a query checked against the live CORE API (November 2026).
describe('toCoreQuery', () => {
  it("removes brackets around the whole query, so CORE doesn't drop the OR group", () => {
    // (drone AND (package OR delivery)) → 71,213 papers; without outer brackets → 4,729.
    expect(toCoreQuery('(drone AND (package OR delivery))')).toBe('drone AND (package OR delivery)');
    expect(toCoreQuery('  ((drone OR uav))  ')).toBe('drone OR uav');
  });
  it('puts a lone phrase in brackets, because CORE fails on it otherwise', () => {
    expect(toCoreQuery('"climate change"')).toBe('("climate change")');
    expect(toCoreQuery('("climate change")')).toBe('("climate change")');
  });
  it('leaves queries CORE already reads correctly alone', () => {
    for (const q of ['drone', 'drone AND (package OR delivery)', '"climate change" AND adaptation', '(a OR b) AND (c OR d)', 'title:"machine learning"', 'authors:(smith OR jones)']) {
      expect(toCoreQuery(q)).toBe(q);
    }
  });
});

describe('coreQueryAdjustment', () => {
  it('explains each change, and stays quiet when nothing changes', () => {
    expect(coreQueryAdjustment('(drone AND (package OR delivery))')?.reason).toMatch(/ignores an OR group/);
    expect(coreQueryAdjustment('(drone AND uav)')?.reason).toMatch(/change nothing/);
    expect(coreQueryAdjustment('"climate change"')?.reason).toMatch(/lone quoted phrase/);
    expect(coreQueryAdjustment('drone AND uav')).toBeNull();
  });
});

describe('narrowToYear', () => {
  it('adds the year at the top level without nesting an OR group', () => {
    // drone AND (package OR delivery) AND yearPublished:2021 → 464 papers.
    expect(narrowToYear('(drone AND (package OR delivery))', 2021)).toBe('drone AND (package OR delivery) AND yearPublished:2021');
    expect(narrowToYear('"climate change"', 2021)).toBe('("climate change") AND yearPublished:2021');
  });
  it('brackets a top-level OR, which CORE reads correctly', () => {
    // (drone OR uav) AND yearPublished:2021 → 14,905 papers.
    expect(narrowToYear('drone OR uav', 2021)).toBe('(drone OR uav) AND yearPublished:2021');
  });
  it('refuses when bracketing would nest another OR group', () => {
    expect(narrowToYear('drone OR (package OR delivery)', 2021)).toBeNull();
  });
});

describe('nested OR warning', () => {
  it('warns when an OR group sits inside other brackets, even after unwrapping', () => {
    expect(checkQuery('(drone AND (package OR delivery)) AND uav').hint).toMatch(/ignores an OR group/);
    expect(checkQuery('(drone AND (package OR delivery))').hint).toBeNull();
    expect(checkQuery('drone AND (package OR delivery)').hint).toBeNull();
  });
});
