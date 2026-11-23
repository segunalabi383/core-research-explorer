import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createVercelHandler, vercelClientIp } from './vercel.mjs';

async function startVercel(options) {
  const server = createServer(createVercelHandler(options));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { base: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
}

const fakeFetch = (calls) => async (url, init) => {
  calls.push({ url: String(url), init });
  return new Response(JSON.stringify({ totalHits: 0, results: [] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

describe('vercelClientIp', () => {
  it('prefers x-real-ip, then the first x-forwarded-for address, then the socket', () => {
    const socket = { remoteAddress: '10.0.0.1' };
    assert.equal(vercelClientIp({ headers: { 'x-real-ip': '203.0.113.7' }, socket }), '203.0.113.7');
    assert.equal(vercelClientIp({ headers: { 'x-forwarded-for': '198.51.100.2, 10.0.0.9' }, socket }), '198.51.100.2');
    assert.equal(vercelClientIp({ headers: {}, socket }), '10.0.0.1');
  });
});

describe('Vercel functions', () => {
  it('each api/ file exports a request handler', async () => {
    for (const name of ['search', 'years', 'health']) {
      const mod = await import(`../api/${name}.js`);
      assert.equal(typeof mod.default, 'function', `api/${name}.js`);
    }
  });

  it('reads the key from the environment and answers searches with JSON', async () => {
    const calls = [];
    const app = await startVercel({ env: { CORE_API_KEY: 'k' }, fetchImpl: fakeFetch(calls) });
    try {
      const res = await fetch(`${app.base}/api/search?q=drone`);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type'), /json/);
      assert.equal(calls[0].init.headers.authorization, 'Bearer k');
      assert.deepEqual(await (await fetch(`${app.base}/api/health`)).json(), { status: 'ok', keyConfigured: true });
    } finally {
      await app.close();
    }
  });

  it('rate-limits each visitor separately, not everyone behind the proxy together', async () => {
    const app = await startVercel({ env: {}, fetchImpl: fakeFetch([]), rateLimit: { max: 1, windowMs: 60_000 } });
    const search = (ip) => fetch(`${app.base}/api/search?q=drone`, { headers: { 'x-real-ip': ip } });
    try {
      assert.equal((await search('203.0.113.1')).status, 200);
      assert.equal((await search('203.0.113.1')).status, 429);
      assert.equal((await search('203.0.113.2')).status, 200);
    } finally {
      await app.close();
    }
  });
});
