// Starts the web application for the browser tests.
//   node e2e/servers/web.mjs start   builds the test build (--dev-pages) and serves it
//   node e2e/servers/web.mjs dev     runs `next dev` (React's development build)
// The environment (stage, origins, port) comes from the caller (playwright.config.ts).
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const next = join(root, 'scripts', 'next.mjs');
const mode = process.argv[2];

if (mode === 'start') {
  if (process.env.E2E_SKIP_BUILD !== '1') {
    const build = spawnSync(process.execPath, [next, 'build', '--dev-pages'], { cwd: root, stdio: 'inherit' });
    if (build.status !== 0) process.exit(build.status ?? 1);
  }
}

const args = mode === 'dev' ? [next, 'dev'] : [next, 'start', '--dev-pages'];
const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit' });
const stop = () => child.kill();
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
child.on('exit', (code) => process.exit(code ?? 0));
