/**
 * Starts the API server. In production (NODE_ENV=production) it also serves the built app,
 * so the whole product runs as one process on one port.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppServer } from './core-proxy.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, '..');

/** Reads KEY=value lines from .env without adding a dependency. Real env vars win. */
function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
}

loadEnvFile(join(projectRoot, '.env'));

const production = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || 3000);
const apiKey = process.env.CORE_API_KEY ?? '';
const staticDir = production ? join(projectRoot, 'dist/core-research-explorer/browser') : null;

const server = createAppServer({
  apiKey,
  coreBaseUrl: process.env.CORE_API_URL || undefined,
  timeoutMs: Number(process.env.CORE_TIMEOUT_MS || 15_000),
  staticDir,
  log: (message) => console.error(`[server] ${message}`),
});

server.listen(port, () => {
  console.log(`[server] Listening on http://localhost:${port}${production ? '' : ' (API only)'}`);
  if (!apiKey) {
    console.log('[server] No CORE_API_KEY set: using CORE anonymously, with a much lower rate limit.');
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
