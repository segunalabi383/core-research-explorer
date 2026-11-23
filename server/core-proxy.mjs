/**
 * The API server that sits between the browser and CORE.
 *
 * Why it exists:
 * - The CORE API key stays on the server. It never reaches the browser bundle.
 * - Every parameter is checked before CORE is called, so bad input costs no quota.
 * - Identical requests within a few minutes are answered from a small cache, and
 *   identical requests that arrive together share one upstream call.
 * - Each visitor gets a fair share of the quota (a simple per-IP rate limit).
 * - In production it also serves the built Angular app from one origin.
 *
 * It has no dependencies beyond Node itself.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

export const CORE_BASE_URL = 'https://api.core.ac.uk/v3';
export const MAX_LIMIT = 100;
/** CORE's simple search pages no further than the first 10,000 results. */
export const MAX_WINDOW = 10_000;
export const MAX_QUERY_LENGTH = 500;

const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX_ENTRIES = 200;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const FORWARDED_HEADERS = [
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-retry-after',
  'retry-after',
];
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
};
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

/** Checks the query string of a search request. Returns either params or an error message. */
export function validateSearchParams(searchParams) {
  const q = checkQuery(searchParams.get('q'));
  if (q.error) return { error: q.error };

  const limit = parseInteger(searchParams.get('limit'), 10);
  if (limit === null || limit < 1 || limit > MAX_LIMIT) {
    return { error: `"limit" must be a whole number from 1 to ${MAX_LIMIT}.` };
  }
  const offset = parseInteger(searchParams.get('offset'), 0);
  if (offset === null || offset < 0 || offset + limit > MAX_WINDOW) {
    return { error: `CORE can only page through the first ${MAX_WINDOW.toLocaleString('en')} results.` };
  }
  return { params: { q: q.value, limit, offset } };
}

/** Checks the query string of a year-aggregation request. */
export function validateYearsParams(searchParams) {
  const q = checkQuery(searchParams.get('q'));
  return q.error ? { error: q.error } : { params: { q: q.value } };
}

function checkQuery(raw) {
  const value = (raw ?? '').trim();
  if (!value) return { error: 'A search query is required.' };
  if (value.length > MAX_QUERY_LENGTH) {
    return { error: `Keep the query to ${MAX_QUERY_LENGTH} characters or fewer.` };
  }
  if (CONTROL_CHARS.test(value)) return { error: 'The query contains invalid characters.' };
  return { value };
}

function parseInteger(raw, fallback) {
  if (raw === null || raw === '') return fallback;
  if (!/^\d{1,6}$/.test(raw)) return null;
  return Number(raw);
}

/** A tiny fixed-window rate limiter, per client IP. */
export function createRateLimiter({ max, windowMs, now = Date.now }) {
  const hits = new Map();
  return (key) => {
    const t = now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= t) {
      entry = { count: 0, resetAt: t + windowMs };
      hits.set(key, entry);
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
      }
    }
    entry.count += 1;
    return { allowed: entry.count <= max, retryAfterSeconds: Math.ceil((entry.resetAt - t) / 1000) };
  };
}

/**
 * Builds the request handler. Everything it talks to is injectable so tests never hit the network.
 */
export function createHandler({
  apiKey = '',
  coreBaseUrl = CORE_BASE_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15_000,
  staticDir = null,
  rateLimit = { max: 60, windowMs: 60_000 },
  /** Who the rate limit counts against. Behind a trusted proxy, pass a function that reads its header. */
  clientIp = (req) => req.socket?.remoteAddress,
  now = Date.now,
  log = () => {},
} = {}) {
  const key = apiKey.trim();
  const cache = new Map();
  const inFlight = new Map();
  const limiter = createRateLimiter({ ...rateLimit, now });
  const root = staticDir ? resolve(staticDir) : null;

  async function callCore(cacheKey, url, init) {
    const hit = cache.get(cacheKey);
    if (hit && hit.expiresAt > now()) return { ...hit.response, cache: 'HIT' };
    if (inFlight.has(cacheKey)) return inFlight.get(cacheKey);

    const promise = (async () => {
      const headers = { accept: 'application/json', ...(init.headers ?? {}) };
      if (key) headers.authorization = `Bearer ${key}`;
      let upstream;
      try {
        upstream = await fetchImpl(url, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
      } catch (error) {
        const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
        log(`CORE request failed: ${error?.message ?? error}`);
        return {
          status: timedOut ? 504 : 502,
          body: JSON.stringify({
            error: timedOut ? 'CORE took too long to respond.' : 'Could not reach CORE.',
            code: timedOut ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNREACHABLE',
          }),
          headers: {},
          cache: 'MISS',
        };
      }
      const body = await upstream.text();
      const headers2 = {};
      for (const name of FORWARDED_HEADERS) {
        const value = upstream.headers.get(name);
        if (value) headers2[name] = value;
      }
      const isJson = (upstream.headers.get('content-type') ?? '').includes('json');
      const response = {
        status: upstream.status,
        // CORE sometimes answers errors in HTML; never pass that through as if it were JSON.
        body: isJson ? body : JSON.stringify({ error: `CORE returned an error (${upstream.status}).` }),
        headers: headers2,
        cache: 'MISS',
      };
      if (upstream.ok && isJson) {
        if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value);
        cache.set(cacheKey, { response, expiresAt: now() + CACHE_TTL_MS });
      }
      return response;
    })();

    inFlight.set(cacheKey, promise);
    try {
      return await promise;
    } finally {
      inFlight.delete(cacheKey);
    }
  }

  function sendJson(res, status, payload, extra = {}) {
    res.writeHead(status, {
      ...SECURITY_HEADERS,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extra,
    });
    res.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
  }

  async function handleApi(req, res, url) {
    if (req.method !== 'GET') {
      return sendJson(res, 405, { error: 'Method not allowed.' }, { allow: 'GET' });
    }
    if (url.pathname === '/api/health') {
      return sendJson(res, 200, { status: 'ok', keyConfigured: Boolean(key) });
    }

    const client = clientIp(req) || 'unknown';
    const gate = limiter(client);
    if (!gate.allowed) {
      return sendJson(
        res,
        429,
        { error: 'Too many searches from this browser. Please wait a moment.', code: 'LOCAL_RATE_LIMIT' },
        { 'retry-after': String(gate.retryAfterSeconds) },
      );
    }

    let result;
    if (url.pathname === '/api/search') {
      const checked = validateSearchParams(url.searchParams);
      if (checked.error) return sendJson(res, 400, { error: checked.error, code: 'INVALID_PARAMS' });
      const { q, limit, offset } = checked.params;
      const upstream = new URL(`${coreBaseUrl}/search/works/`);
      upstream.searchParams.set('q', q);
      upstream.searchParams.set('limit', String(limit));
      if (offset > 0) upstream.searchParams.set('offset', String(offset));
      result = await callCore(`GET ${upstream}`, upstream, { method: 'GET' });
    } else if (url.pathname === '/api/years') {
      const checked = validateYearsParams(url.searchParams);
      if (checked.error) return sendJson(res, 400, { error: checked.error, code: 'INVALID_PARAMS' });
      const body = JSON.stringify({ q: checked.params.q, aggregations: ['yearPublished'] });
      result = await callCore(`POST aggregate ${body}`, `${coreBaseUrl}/search/works/aggregate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
    } else {
      return sendJson(res, 404, { error: 'Not found.' });
    }

    return sendJson(res, result.status, result.body, {
      ...result.headers,
      'x-proxy-cache': result.cache,
      ...(result.status === 200 ? { 'cache-control': 'private, max-age=60' } : {}),
    });
  }

  async function serveStatic(req, res, url) {
    if (!root || (req.method !== 'GET' && req.method !== 'HEAD')) {
      res.writeHead(404, SECURITY_HEADERS);
      return res.end('Not found');
    }
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400, SECURITY_HEADERS);
      return res.end('Bad request');
    }
    const candidate = resolve(join(root, normalize(pathname)));
    const insideRoot = candidate === root || candidate.startsWith(root + sep);
    let file = join(root, 'index.html');
    if (insideRoot) {
      try {
        if ((await stat(candidate)).isFile()) file = candidate;
      } catch {
        /* unknown path: fall back to the app shell so deep links work */
      }
    }
    try {
      const data = await readFile(file);
      const isShell = file.endsWith('index.html');
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'content-type': MIME[extname(file)] ?? 'application/octet-stream',
        // Built files have content hashes in their names, so they never change.
        'cache-control': isShell ? 'no-cache' : 'public, max-age=31536000, immutable',
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      res.writeHead(404, SECURITY_HEADERS);
      res.end('Not found. Run "npm run build" first.');
    }
  }

  return async function handler(req, res) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
      return await serveStatic(req, res, url);
    } catch (error) {
      log(`Unexpected error: ${error?.stack ?? error}`);
      if (!res.headersSent) sendJson(res, 500, { error: 'Something went wrong on the server.' });
      else res.end();
    }
  };
}

export function createAppServer(options) {
  return createServer(createHandler(options));
}
