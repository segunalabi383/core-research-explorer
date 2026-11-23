import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createAppServer,
  createRateLimiter,
  validateSearchParams,
  validateYearsParams,
} from './core-proxy.mjs';

const params = (s) => new URLSearchParams(s);

/** A fake CORE that records every call it receives. */
function fakeCore(respond = () => ({ status: 200, body: { totalHits: 1, results: [] } })) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    const { status, body, headers = {}, contentType = 'application/json' } = respond(String(url), init);
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': contentType, ...headers },
    });
  };
  return { calls, fetchImpl };
}

async function startServer(options) {
  const server = createAppServer(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { base: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
}

describe('validateSearchParams', () => {
  it('accepts a boolean query with defaults', () => {
    assert.deepEqual(validateSearchParams(params('q=(drone AND (package OR delivery))')), {
      params: { q: '(drone AND (package OR delivery))', limit: 10, offset: 0 },
    });
  });

  it('rejects empty, long and control-character queries', () => {
    assert.match(validateSearchParams(params('q=%20')).error, /required/);
    assert.match(validateSearchParams(params(`q=${'a'.repeat(501)}`)).error, /500/);
    assert.match(validateSearchParams(params('q=a%00b')).error, /invalid characters/);
  });

  it('enforces 1–100 papers and the 10,000 result window', () => {
    assert.ok(validateSearchParams(params('q=a&limit=100')).params);
    assert.match(validateSearchParams(params('q=a&limit=0')).error, /1 to 100/);
    assert.match(validateSearchParams(params('q=a&limit=101')).error, /1 to 100/);
    assert.match(validateSearchParams(params('q=a&limit=2.5')).error, /1 to 100/);
    assert.ok(validateSearchParams(params('q=a&limit=100&offset=9900')).params);
    assert.match(validateSearchParams(params('q=a&limit=100&offset=9901')).error, /10,000/);
    assert.match(validateSearchParams(params('q=a&offset=-1')).error, /10,000/);
  });

  it('validates the years request', () => {
    assert.deepEqual(validateYearsParams(params('q=drone')), { params: { q: 'drone' } });
    assert.ok(validateYearsParams(params('')).error);
  });
});

describe('createRateLimiter', () => {
  it('allows up to max per window, then resets', () => {
    let t = 0;
    const limit = createRateLimiter({ max: 2, windowMs: 1000, now: () => t });
    assert.equal(limit('a').allowed, true);
    assert.equal(limit('a').allowed, true);
    const third = limit('a');
    assert.equal(third.allowed, false);
    assert.equal(third.retryAfterSeconds, 1);
    assert.equal(limit('b').allowed, true, 'other clients are unaffected');
    t = 1000;
    assert.equal(limit('a').allowed, true);
  });
});

describe('API server', () => {
  it('forwards a search with the key as a server-side bearer token', async () => {
    const core = fakeCore();
    const app = await startServer({ apiKey: ' secret-key ', fetchImpl: core.fetchImpl });
    try {
      const res = await fetch(`${app.base}/api/search?q=${encodeURIComponent('drone AND uav')}&limit=20&offset=40`);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { totalHits: 1, results: [] });
      const upstream = new URL(core.calls[0].url);
      assert.equal(upstream.pathname, '/v3/search/works/');
      assert.equal(upstream.searchParams.get('q'), 'drone AND uav');
      assert.equal(upstream.searchParams.get('limit'), '20');
      assert.equal(upstream.searchParams.get('offset'), '40');
      assert.equal(core.calls[0].init.headers.authorization, 'Bearer secret-key');
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    } finally {
      await app.close();
    }
  });

  it('works without a key and never sends an empty Authorization header', async () => {
    const core = fakeCore();
    const app = await startServer({ fetchImpl: core.fetchImpl });
    try {
      await fetch(`${app.base}/api/search?q=drone`);
      assert.equal(core.calls[0].init.headers.authorization, undefined);
      const health = await (await fetch(`${app.base}/api/health`)).json();
      assert.deepEqual(health, { status: 'ok', keyConfigured: false });
    } finally {
      await app.close();
    }
  });

  it('asks CORE for year counts across the whole query', async () => {
    const core = fakeCore(() => ({ status: 200, body: { aggregations: { yearPublished: { 2020: 3 } } } }));
    const app = await startServer({ fetchImpl: core.fetchImpl });
    try {
      const res = await fetch(`${app.base}/api/years?q=drone`);
      assert.equal(res.status, 200);
      assert.equal(core.calls[0].url, 'https://api.core.ac.uk/v3/search/works/aggregate');
      assert.equal(core.calls[0].init.method, 'POST');
      assert.deepEqual(JSON.parse(core.calls[0].init.body), { q: 'drone', aggregations: ['yearPublished'] });
    } finally {
      await app.close();
    }
  });

  it('answers repeated searches from the cache', async () => {
    const core = fakeCore();
    const app = await startServer({ fetchImpl: core.fetchImpl });
    try {
      const first = await fetch(`${app.base}/api/search?q=drone`);
      const second = await fetch(`${app.base}/api/search?q=drone`);
      assert.equal(first.headers.get('x-proxy-cache'), 'MISS');
      assert.equal(second.headers.get('x-proxy-cache'), 'HIT');
      assert.equal(core.calls.length, 1);
    } finally {
      await app.close();
    }
  });

  it('rejects invalid input without calling CORE', async () => {
    const core = fakeCore();
    const app = await startServer({ fetchImpl: core.fetchImpl });
    try {
      const res = await fetch(`${app.base}/api/search?q=drone&limit=500`);
      assert.equal(res.status, 400);
      assert.equal((await res.json()).code, 'INVALID_PARAMS');
      assert.equal((await fetch(`${app.base}/api/search`, { method: 'POST' })).status, 405);
      assert.equal((await fetch(`${app.base}/api/nope`)).status, 404);
      assert.equal(core.calls.length, 0);
    } finally {
      await app.close();
    }
  });

  it('passes on CORE rate limits with their reset time, and does not cache them', async () => {
    const core = fakeCore(() => ({
      status: 429,
      body: { message: 'Too many requests' },
      headers: { 'x-ratelimit-retry-after': '2026-11-23T10:00:00+0000' },
    }));
    const app = await startServer({ fetchImpl: core.fetchImpl });
    try {
      const res = await fetch(`${app.base}/api/search?q=drone`);
      assert.equal(res.status, 429);
      assert.equal(res.headers.get('x-ratelimit-retry-after'), '2026-11-23T10:00:00+0000');
      await fetch(`${app.base}/api/search?q=drone`);
      assert.equal(core.calls.length, 2);
    } finally {
      await app.close();
    }
  });

  it('turns network failures and timeouts into clear 502/504 errors', async () => {
    const down = await startServer({
      fetchImpl: async () => {
        throw new TypeError('fetch failed');
      },
    });
    const slow = await startServer({
      timeoutMs: 20,
      fetchImpl: (_url, init) =>
        new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))),
    });
    try {
      const a = await fetch(`${down.base}/api/search?q=drone`);
      assert.equal(a.status, 502);
      assert.equal((await a.json()).code, 'UPSTREAM_UNREACHABLE');
      const b = await fetch(`${slow.base}/api/search?q=drone`);
      assert.equal(b.status, 504);
      assert.equal((await b.json()).code, 'UPSTREAM_TIMEOUT');
    } finally {
      await down.close();
      await slow.close();
    }
  });

  it('never passes an HTML error page through as JSON', async () => {
    const core = fakeCore(() => ({ status: 500, body: '<html>oops</html>', contentType: 'text/html' }));
    const app = await startServer({ fetchImpl: core.fetchImpl });
    try {
      const res = await fetch(`${app.base}/api/search?q=drone`);
      assert.equal(res.status, 500);
      assert.deepEqual(await res.json(), { error: 'CORE returned an error (500).' });
    } finally {
      await app.close();
    }
  });

  it('rate-limits a single client', async () => {
    const core = fakeCore();
    const app = await startServer({ fetchImpl: core.fetchImpl, rateLimit: { max: 2, windowMs: 60_000 } });
    try {
      await fetch(`${app.base}/api/search?q=a`);
      await fetch(`${app.base}/api/search?q=b`);
      const third = await fetch(`${app.base}/api/search?q=c`);
      assert.equal(third.status, 429);
      assert.equal((await third.json()).code, 'LOCAL_RATE_LIMIT');
      assert.ok(Number(third.headers.get('retry-after')) > 0);
    } finally {
      await app.close();
    }
  });
});

describe('static hosting', () => {
  let dir;
  let app;
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'explorer-'));
    await mkdir(join(dir, 'browser'));
    await writeFile(join(dir, 'browser', 'index.html'), '<app-root></app-root>');
    await writeFile(join(dir, 'browser', 'main-ABC.js'), 'console.log(1)');
    await writeFile(join(dir, 'secret.txt'), 'top secret');
    app = await startServer({ staticDir: join(dir, 'browser'), fetchImpl: fakeCore().fetchImpl });
  });
  after(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('serves hashed assets with long caching and the shell without', async () => {
    const js = await fetch(`${app.base}/main-ABC.js`);
    assert.equal(js.status, 200);
    assert.match(js.headers.get('cache-control'), /immutable/);
    const shell = await fetch(`${app.base}/`);
    assert.equal(shell.headers.get('cache-control'), 'no-cache');
  });

  it('falls back to the app shell for deep links', async () => {
    const res = await fetch(`${app.base}/search?q=drone`);
    assert.equal(await res.text(), '<app-root></app-root>');
  });

  it('does not serve files outside the build folder', async () => {
    const res = await fetch(`${app.base}/..%2Fsecret.txt`);
    assert.equal(await res.text(), '<app-root></app-root>');
  });
});
