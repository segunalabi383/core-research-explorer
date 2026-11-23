/**
 * `npm start`: runs the API server and the Angular dev server together.
 * The Angular dev server forwards /api/* to the API server (see proxy.conf.json).
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ngBin = join(root, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');

const children = [
  spawn(process.execPath, [join(root, 'server', 'index.mjs')], { cwd: root, stdio: 'inherit' }),
  spawn(process.execPath, [ngBin, 'serve', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' }),
];

let stopping = false;
function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exit(code);
}

for (const child of children) child.on('exit', (code) => stopAll(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stopAll(0));
