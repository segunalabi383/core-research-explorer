/**
 * Runs the API server's request handler as Vercel Functions (see the files in api/).
 *
 * Vercel serves the built Angular app as static files and never starts server/index.mjs,
 * so each /api route needs its own function. They all share the handler in core-proxy.mjs.
 * Set CORE_API_KEY (and optionally CORE_API_URL, CORE_TIMEOUT_MS) in the Vercel project settings.
 */
import { createHandler } from './core-proxy.mjs';

/**
 * Every request reaches a function through Vercel's proxy, so the socket address is Vercel's,
 * not the visitor's. Vercel sets x-real-ip to the visitor's address and overwrites any value
 * the client sent, so it is safe to trust here (and only here).
 */
export function vercelClientIp(req) {
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp) return realIp;
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress;
}

/** `overrides` lets tests swap in a fake CORE (fetchImpl) or a tighter rate limit. */
export function createVercelHandler({ env = process.env, ...overrides } = {}) {
  return createHandler({
    apiKey: env.CORE_API_KEY ?? '',
    coreBaseUrl: env.CORE_API_URL || undefined,
    timeoutMs: Number(env.CORE_TIMEOUT_MS || 15_000),
    clientIp: vercelClientIp,
    log: (message) => console.error(`[api] ${message}`),
    ...overrides,
  });
}
