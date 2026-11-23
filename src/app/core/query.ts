/**
 * Checks a CORE boolean query before it is sent, so typos cost no API quota and the person
 * gets a precise message instead of a generic 400.
 *
 * CORE remains the authority on syntax: this only rejects queries that are certainly broken
 * (unbalanced brackets or quotes, dangling operators). Anything else is passed through.
 */
export interface QueryCheck {
  /** A mistake that would make CORE reject or misread the query. Blocks the search. */
  error: string | null;
  /** A likely slip in an otherwise valid query. Never blocks. */
  hint: string | null;
  /** Words and phrases to highlight in results (never the excluded ones). */
  terms: string[];
}

type Kind = 'open' | 'close' | 'and' | 'or' | 'not' | 'field' | 'term';
interface Token {
  kind: Kind;
  text: string;
  /** Character offsets into the query. */
  start: number;
  end: number;
}

export const MAX_QUERY_LENGTH = 500;
const OPERATORS: Record<string, Kind> = { AND: 'and', OR: 'or', NOT: 'not' };

function tokenize(query: string): { tokens: Token[]; unclosedQuote: boolean } {
  const tokens: Token[] = [];
  let i = 0;
  while (i < query.length) {
    const ch = query[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (ch === '(' || ch === ')') {
      tokens.push({ kind: ch === '(' ? 'open' : 'close', text: ch, start: i, end: i + 1 });
      i++;
    } else if (ch === '"') {
      const end = query.indexOf('"', i + 1);
      if (end === -1) return { tokens, unclosedQuote: true };
      tokens.push({ kind: 'term', text: query.slice(i, end + 1), start: i, end: end + 1 });
      i = end + 1;
    } else {
      let end = i;
      while (end < query.length && !/[\s()"]/.test(query[end])) end++;
      // A field prefix such as title: or authors: may be followed by a phrase or a group.
      if (query[end - 1] === ':' && end < query.length && /["(]/.test(query[end])) {
        tokens.push({ kind: 'field', text: query.slice(i, end), start: i, end });
      } else {
        const word = query.slice(i, end);
        tokens.push({ kind: OPERATORS[word] ?? 'term', text: word, start: i, end });
      }
      i = end;
    }
  }
  return { tokens, unclosedQuote: false };
}

function describe(token: Token | undefined): string {
  return token ? `"${token.text}"` : 'the end';
}

export function checkQuery(raw: string): QueryCheck {
  const query = raw.trim();
  const ok = (hint: string | null, terms: string[]): QueryCheck => ({ error: null, hint, terms });
  const fail = (error: string): QueryCheck => ({ error, hint: null, terms: [] });

  if (!query) return fail('Type something to search for.');
  if (query.length > MAX_QUERY_LENGTH) return fail(`Keep the query to ${MAX_QUERY_LENGTH} characters or fewer.`);

  const { tokens, unclosedQuote } = tokenize(query);
  if (unclosedQuote) return fail('A quotation mark is never closed. Add the closing " to finish the phrase.');

  let depth = 0;
  let expectOperand = true;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const next = tokens[i + 1];
    switch (token.kind) {
      case 'open':
        if (next?.kind === 'close') return fail('There is an empty pair of brackets "()". Put words inside or remove them.');
        depth++;
        expectOperand = true;
        break;
      case 'close':
        if (depth === 0) return fail('There is a closing bracket ")" without a matching "(".');
        if (expectOperand) return fail(`An operator comes right before ")". Add a word after it or remove it.`);
        depth--;
        break;
      case 'and':
      case 'or':
        if (expectOperand) {
          return fail(
            i === 0
              ? `The query can't start with ${token.text}. Put a word before it.`
              : `${token.text} needs a word on both sides, but follows ${describe(tokens[i - 1])}.`,
          );
        }
        expectOperand = true;
        break;
      case 'not':
        if (next?.kind === 'and' || next?.kind === 'or') return fail(`NOT can't be followed by ${next.text}.`);
        expectOperand = true;
        break;
      case 'field':
        expectOperand = true;
        break;
      case 'term':
        expectOperand = false;
        break;
    }
  }
  if (expectOperand) {
    const last = tokens[tokens.length - 1];
    return fail(`The query ends with ${describe(last)}. Add a word after it or remove it.`);
  }
  if (depth > 0) return fail(`${depth === 1 ? 'A bracket "(" is' : `${depth} brackets are`} never closed. Add ")".`);

  const lowercase = tokens.find((t) => t.kind === 'term' && /^(and|or|not)$/i.test(t.text) && !OPERATORS[t.text]);
  const hint = hasIgnoredOrGroup(unwrap(parse(query)))
    ? 'CORE ignores an OR group inside other brackets, so it will not narrow the results. Move it out of the outer brackets if you can.'
    : lowercase
      ? `"${lowercase.text}" is searched as a word. Write ${lowercase.text.toUpperCase()} in capitals to use it as an operator.`
      : null;
  return ok(hint, highlightTerms(tokens));
}

/** Collects the words worth highlighting, skipping anything excluded with NOT and field names. */
function highlightTerms(tokens: Token[]): string[] {
  const terms = new Set<string>();
  let excludeDepth = -1;
  let depth = 0;
  let excludeNext = false;
  for (const token of tokens) {
    if (token.kind === 'open') {
      depth++;
      if (excludeNext) {
        excludeDepth = depth;
        excludeNext = false;
      }
      continue;
    }
    if (token.kind === 'close') {
      if (depth === excludeDepth) excludeDepth = -1;
      depth--;
      continue;
    }
    if (token.kind === 'not') {
      excludeNext = true;
      continue;
    }
    if (token.kind !== 'term') continue;
    const excluded = excludeNext || excludeDepth !== -1 || token.text.startsWith('-');
    excludeNext = false;
    if (excluded) continue;
    let text = token.text;
    // field:value → value; skip numeric comparisons like yearPublished>2020.
    if (/[<>=]/.test(text)) continue;
    text = text.includes(':') && !text.startsWith('"') ? text.slice(text.indexOf(':') + 1) : text;
    text = text.replace(/^"|"$/g, '').replace(/[*?]+$/g, '').replace(/^\+/, '').trim();
    if (/^(and|or|not)$/i.test(text)) continue;
    if (text.length >= 2) terms.add(text.toLowerCase());
  }
  return [...terms];
}

/*
 * ---------------------------------------------------------------------------------------------
 * Preparing queries for CORE
 *
 * CORE's search engine has two quirks, both checked against the live API (November 2026):
 *
 * 1. An OR group inside other brackets is silently ignored:
 *      drone                                → 71,213 papers
 *      drone AND (package OR delivery)      →  4,729 papers  (correct)
 *      (drone AND (package OR delivery))    → 71,213 papers  (the OR group was dropped)
 *    The brief's own example has this shape. Brackets around the whole query change nothing,
 *    so they are removed before sending; deeper cases get a warning instead.
 * 2. A query that is only a quoted phrase fails ("climate change" → error), while the same
 *    phrase in brackets works ("(\"climate change\")" → 959,699 papers).
 *
 * Found by Kpono Akpabio's submission, verified independently. The address bar and search box
 * always keep the query as the person wrote it.
 * ---------------------------------------------------------------------------------------------
 */

type Node =
  | { kind: 'leaf'; start: number; end: number }
  | { kind: 'group'; field: boolean; child: Node; start: number; end: number }
  | { kind: 'not'; child: Node; start: number; end: number }
  | { kind: 'and' | 'or'; children: Node[]; start: number; end: number };

/** Builds a tree from a query that has already passed checkQuery. */
function parse(query: string): Node | null {
  const { tokens, unclosedQuote } = tokenize(query);
  if (unclosedQuote || tokens.length === 0) return null;
  let i = 0;

  const group = (field: Token | null): Node => {
    const open = tokens[i++];
    const child = parseOr();
    const close = tokens[i++];
    return { kind: 'group', field: field !== null, child, start: (field ?? open).start, end: close.end };
  };
  const primary = (): Node => {
    const token = tokens[i];
    if (token.kind === 'field') {
      i++;
      if (tokens[i].kind === 'open') return group(token);
      return { kind: 'leaf', start: token.start, end: tokens[i++].end };
    }
    if (token.kind === 'open') return group(null);
    i++;
    return { kind: 'leaf', start: token.start, end: token.end };
  };
  const unary = (): Node => {
    if (tokens[i].kind !== 'not') return primary();
    const start = tokens[i++].start;
    const child = unary();
    return { kind: 'not', child, start, end: child.end };
  };
  const parseAnd = (): Node => {
    const children = [unary()];
    while (i < tokens.length && tokens[i].kind !== 'or' && tokens[i].kind !== 'close') {
      if (tokens[i].kind === 'and') i++;
      children.push(unary()); // "a b" and "a NOT b" both mean AND.
    }
    return children.length === 1
      ? children[0]
      : { kind: 'and', children, start: children[0].start, end: children[children.length - 1].end };
  };
  const parseOr = (): Node => {
    const children = [parseAnd()];
    while (i < tokens.length && tokens[i].kind === 'or') {
      i++;
      children.push(parseAnd());
    }
    return children.length === 1
      ? children[0]
      : { kind: 'or', children, start: children[0].start, end: children[children.length - 1].end };
  };

  try {
    return parseOr();
  } catch {
    return null; // Never reached for checked queries; CORE gets the query unchanged instead.
  }
}

/** Removes brackets that enclose the whole query, which change nothing. */
function unwrap(node: Node | null): Node | null {
  while (node?.kind === 'group' && !node.field) node = node.child;
  return node;
}

/** True when an OR group sits inside other brackets, which CORE ignores. */
function hasIgnoredOrGroup(node: Node | null, insideGroup = false): boolean {
  switch (node?.kind) {
    case 'group':
      return !node.field && hasIgnoredOrGroup(node.child, true);
    case 'not':
      return hasIgnoredOrGroup(node.child, insideGroup);
    case 'and':
    case 'or':
      return node.children.some((child) =>
        insideGroup && child.kind === 'group' && !child.field && child.child.kind === 'or'
          ? true
          : hasIgnoredOrGroup(child, insideGroup),
      );
    default:
      return false;
  }
}

/** The query in the form CORE reads correctly. Means exactly what the person wrote. */
export function toCoreQuery(raw: string): string {
  const query = raw.trim();
  if (checkQuery(query).error) return query;
  const node = unwrap(parse(query));
  if (!node) return query;
  const inner = query.slice(node.start, node.end);
  return node.kind === 'leaf' && inner.startsWith('"') ? `(${inner})` : inner;
}

export interface QueryAdjustment {
  sent: string;
  reason: string;
}

/** What is sent to CORE and why, when it differs from what was typed. */
export function coreQueryAdjustment(raw: string): QueryAdjustment | null {
  const query = raw.trim();
  const sent = toCoreQuery(query);
  if (sent === query) return null;
  const reason = sent.startsWith('("')
    ? 'A phrase on its own was put in brackets, because CORE fails on a lone quoted phrase.'
    : hasIgnoredOrGroup(parse(query))
      ? 'The outer brackets were removed, because CORE ignores an OR group inside other brackets and would have matched far more papers.'
      : 'The outer brackets were removed. They change nothing, and CORE handles the query more reliably without them.';
  return { sent, reason };
}

/**
 * The query restricted to one publication year, or null when that can't be done without CORE
 * ignoring part of it. The year clause is added at the top level so no OR group gets nested.
 */
export function narrowToYear(raw: string, year: number): string | null {
  const core = toCoreQuery(raw);
  const node = unwrap(parse(core));
  if (!node) return null;
  const clause = `yearPublished:${year}`;
  if (node.kind !== 'or') return `${core} AND ${clause}`;
  // A top-level OR must be bracketed before adding AND; refuse if that would nest another OR group.
  const wrapped = `(${core})`;
  return hasIgnoredOrGroup(parse(wrapped)) ? null : `${wrapped} AND ${clause}`;
}
