// Shared helpers for the repository scripts. Node only, no shell, so the
// same commands run on Windows, macOS and Linux (ADR-01).
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const webDir = join(root, 'apps', 'web');

/** Absolute path of a package's CLI entry, resolved from a workspace directory. */
export function resolveBin(pkg, binName = pkg, fromDir = root) {
  const require = createRequire(join(fromDir, 'package.json'));
  const pkgJsonPath = require.resolve(`${pkg}/package.json`);
  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  const bin = typeof pkgJson.bin === 'string' ? pkgJson.bin : pkgJson.bin?.[binName];
  if (!bin) throw new Error(`Package ${pkg} has no binary named ${binName}`);
  return join(dirname(pkgJsonPath), bin);
}

/** Runs `node <script> ...args` and returns the exit status. Output goes to the terminal. */
export function runNode(script, args = [], options = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: options.stdio ?? 'inherit',
    encoding: options.stdio === 'pipe' ? 'utf8' : undefined,
  });
  if (result.error) throw result.error;
  return options.stdio === 'pipe' ? result : (result.status ?? 1);
}

/** Runs a package binary with Node. */
export function runBin(pkg, binName, args = [], options = {}) {
  return runNode(resolveBin(pkg, binName, options.resolveFrom ?? root), args, options);
}

/**
 * Runs pnpm itself (needed for `pnpm audit`). Inside a pnpm script the path of
 * the running pnpm is in npm_execpath; outside one we go through corepack,
 * which is how this repository runs pnpm (README, "Prerequisites").
 */
export function runPnpm(args, options = {}) {
  const execPath = process.env.npm_execpath;
  if (execPath && /pnpm/.test(execPath) && existsSync(execPath)) {
    return runNode(execPath, args, options);
  }
  const require = createRequire(import.meta.url);
  let corepackCli;
  try {
    corepackCli = require.resolve('corepack/dist/corepack.js', { paths: [dirname(process.execPath), join(dirname(process.execPath), 'node_modules')] });
  } catch {
    corepackCli = join(dirname(process.execPath), 'node_modules', 'corepack', 'dist', 'corepack.js');
  }
  return runNode(corepackCli, ['pnpm', ...args], options);
}

/** Loads the repository's .env (if present) without overriding the real environment. */
export function loadRootEnv() {
  const file = join(root, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

export function heading(text) {
  process.stdout.write(`\n── ${text} ${'─'.repeat(Math.max(3, 66 - text.length))}\n`);
}

export function fail(message) {
  process.stderr.write(`\n✗ ${message}\n`);
  process.exit(1);
}
