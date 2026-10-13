// ADR-24, for the web application: the built application refuses to start with
// a missing, empty or misspelt stage, with a non-production stage on a public
// origin, with one host name for both surfaces, and (a test build) on prod.
// It names the variable and never repeats a value.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from './support/fixtures';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const web = join(root, 'apps', 'web');
// The framework is started directly, not through scripts/next.mjs: that wrapper would fill in missing
// variables from a local .env file, and the point here is what the application itself does.
const nextBin = join(dirname(createRequire(join(web, 'package.json')).resolve('next/package.json')), 'dist', 'bin', 'next');
const good = { STAGE: 'test', CONFERA_PUBLIC_ORIGIN: 'http://127.0.0.1:3199', CONFERA_ADMIN_ORIGIN: 'http://localhost:3199', CONFERA_API_ORIGIN: 'http://127.0.0.1:3101' };

/** Starts the test build with this environment and waits until it ends or has been up for a while. */
function start(overrides: Record<string, string | undefined>): Promise<{ exited: boolean; code: number | null; output: string }> {
  return new Promise((done) => {
    const env: Record<string, string | undefined> = { ...process.env, ...good, ...overrides, CONFERA_DEV_PAGES: '1', NEXT_TELEMETRY_DISABLED: '1' };
    for (const [key, value] of Object.entries(env)) if (value === undefined) delete env[key];
    const child = spawn(process.execPath, [nextBin, 'start', '-p', '3199'], { cwd: web, env });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    const timer = setTimeout(() => {
      child.kill();
      done({ exited: false, code: null, output });
    }, 20_000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      done({ exited: true, code, output });
    });
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('the built application refuses to start on a bad configuration', () => {
  const cases: Array<[string, Record<string, string | undefined>, RegExp]> = [
    ['STAGE is missing', { STAGE: undefined }, /STAGE is missing/],
    ['STAGE is empty', { STAGE: '' }, /STAGE is missing/],
    ['STAGE is misspelt (production)', { STAGE: 'production' }, /STAGE has an unknown value/],
    ['STAGE is misspelt (PROD)', { STAGE: 'PROD' }, /STAGE has an unknown value/],
    ['a non-production stage on a public origin', { CONFERA_PUBLIC_ORIGIN: 'https://forms.example.org' }, /CONFERA_PUBLIC_ORIGIN must be a loopback or \.test name/],
    ['one host name for both surfaces', { CONFERA_ADMIN_ORIGIN: 'http://127.0.0.1:3199' }, /two different host names/],
    ['a test build (dev pages) on prod', { STAGE: 'prod', CONFERA_PUBLIC_ORIGIN: 'https://forms.example.test', CONFERA_ADMIN_ORIGIN: 'https://admin.example.test' }, /STAGE=prod|dev pages/],
    ['an address is missing', { CONFERA_API_ORIGIN: undefined }, /CONFERA_API_ORIGIN is missing/],
  ];

  for (const [name, overrides, message] of cases) {
    test(name, async () => {
      const result = await start({ ...overrides, CANARY: 'canary-7f3a-value' });
      expect(result.exited, `the process kept running:\n${result.output}`).toBe(true);
      expect(result.code).not.toBe(0);
      expect(result.output).toMatch(message);
      // Names, never values.
      expect(result.output).not.toContain('canary-7f3a-value');
      for (const value of Object.values(overrides)) if (value && value.length > 8) expect(result.output).not.toContain(value);
    });
  }

  test('the control: with the documented settings it starts', async () => {
    const result = await start({});
    expect(result.exited, result.output).toBe(false);
    expect(result.output).toMatch(/Ready/);
    expect(result.output).not.toMatch(/configuration is invalid/);
  });
});
