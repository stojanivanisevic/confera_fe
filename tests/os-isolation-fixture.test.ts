// The `browser` fixture of the browser tests (e2e/support/fixtures.ts) and the
// "switched off" marker of the account guard (e2e/support/os-isolation.ts).
//
// Global setup reads the marker once, before the first worker. A run that is
// already under way goes on starting browsers: a new worker after every failed
// test. So the fixture reads the marker too, every time, before it starts one.
//
// No browser is started here. The fixture is given engines that only write
// down what they are asked to do.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startBrowser, type BrowserStart } from '../e2e/support/fixtures';
import { CHROMIUM_LOCAL_STATE, guardMarkerPath, refuseIfGuardTripped } from '../e2e/support/os-isolation';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

type Engine = BrowserStart['browserName'];
const ENGINES: readonly Engine[] = ['chromium', 'firefox', 'webkit'];

interface Asked {
  engine: Engine;
  /** The method of the engine that was called, whatever its name. */
  method: string;
  args: unknown[];
}

/**
 * Engines that start nothing. Whatever method is called on one of them is written down and
 * answered with one object that can stand for a browser and for a context on a profile.
 */
function recordingEngines() {
  const asked: Asked[] = [];
  const closed = vi.fn(() => Promise.resolve());
  const started = { browser: () => started, newContext: () => Promise.resolve({}), close: closed };
  const engine = (name: Engine) =>
    new Proxy(
      {},
      {
        get:
          (_target, method) =>
          (...args: unknown[]) => {
            asked.push({ engine: name, method: String(method), args });
            return Promise.resolve(started);
          },
      },
    );
  const playwright = Object.fromEntries(ENGINES.map((name) => [name, engine(name)])) as unknown as BrowserStart['playwright'];
  return { asked, closed, playwright };
}

const start = (playwright: BrowserStart['playwright'], browserName: Engine, use: () => Promise<void> = () => Promise.resolve()) =>
  startBrowser({ playwright, browserName, channel: browserName === 'chromium' ? 'chromium' : undefined, headless: true, launchOptions: {} }, use);

describe('the `browser` fixture and the "switched off" marker', () => {
  const saved = { ...process.env };
  let scratch: string;
  const profiles = () => readdirSync(scratch).filter((name) => name.startsWith('confera-e2e-chromium-'));
  const trip = () => writeFileSync(guardMarkerPath(), '2026-10-13T08:00:00.000Z  after a Chromium worker finished: bad-password count 0 -> 1\n');

  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), 'confera-os-fixture-test-'));
    // The fixture makes its profiles in the temporary folder: for the length of a test that is the scratch folder.
    process.env.TEMP = scratch;
    process.env.TMP = scratch;
    process.env.TMPDIR = scratch;
    process.env.CONFERA_E2E_OS_GUARD_MARKER = join(scratch, 'tripped');
    // No baseline: the count of the real account is never read from a unit test.
    delete process.env.CONFERA_E2E_BAD_PASSWORD_BASELINE;
  });
  afterEach(() => {
    process.env = { ...saved };
    rmSync(scratch, { recursive: true, force: true });
  });

  it.each(ENGINES)('once the marker exists, a worker starts no %s: it refuses before anything else', async (browserName) => {
    trip();
    const { asked, playwright } = recordingEngines();
    const use = vi.fn(() => Promise.resolve());

    await expect(start(playwright, browserName, use)).rejects.toThrow(/switched off on this machine/);

    expect(asked).toEqual([]); // no engine was asked for anything
    expect(use).not.toHaveBeenCalled(); // no test got a browser
    expect(profiles()).toEqual([]); // not even a profile was made
    expect(existsSync(guardMarkerPath())).toBe(true); // and the marker is left for a person to delete
  });

  it('the refusal is the one a new run gets, and it names what was seen', async () => {
    trip();
    const fromTheFixture = await start(recordingEngines().playwright, 'chromium').then(
      () => null,
      (error: unknown) => (error as Error).message,
    );
    let fromGlobalSetup: string | null = null;
    try {
      refuseIfGuardTripped();
    } catch (error) {
      fromGlobalSetup = (error as Error).message;
    }
    expect(fromTheFixture).not.toBeNull();
    expect(fromTheFixture).toBe(fromGlobalSetup);
    expect(fromTheFixture).toContain('bad-password count 0 -> 1');
  });

  it('a run already under way: the worker that asks after the guard tripped gets no browser', async () => {
    const { asked, playwright } = recordingEngines();

    await start(playwright, 'chromium'); // the first worker, before anything happened
    expect(asked).toHaveLength(1);

    trip(); // another worker saw the count rise

    for (const browserName of ENGINES) {
      await expect(start(playwright, browserName)).rejects.toThrow(/switched off on this machine/);
    }
    expect(asked).toHaveLength(1);
    expect(profiles()).toEqual([]);
  });

  it('a marker that appears while a worker has its browser does not keep that browser open', async () => {
    const { closed, playwright } = recordingEngines();
    await start(playwright, 'chromium', () => {
      trip();
      return Promise.resolve();
    });
    expect(closed).toHaveBeenCalledTimes(1);
    expect(profiles()).toEqual([]);
  });

  it('without the marker Chromium starts as before: on an isolated profile, which is removed afterwards', async () => {
    const { asked, closed, playwright } = recordingEngines();
    let localStateWhileRunning: unknown;

    await start(playwright, 'chromium', () => {
      const [profile] = profiles();
      localStateWhileRunning = JSON.parse(readFileSync(join(scratch, profile!, 'Local State'), 'utf8'));
      return Promise.resolve();
    });

    expect(asked).toHaveLength(1);
    const [{ engine, method, args }] = asked as [Asked];
    expect(engine).toBe('chromium');
    expect(method).toMatch(/PersistentContext$/); // the only call that takes a profile directory
    expect(args[0]).toMatch(/confera-e2e-chromium-/);
    expect(args[1]).toEqual({ channel: 'chromium', headless: true });
    expect(localStateWhileRunning).toEqual(CHROMIUM_LOCAL_STATE);
    expect(closed).toHaveBeenCalledTimes(1);
    expect(profiles()).toEqual([]);
  });

  it.each(['firefox', 'webkit'] as const)('without the marker %s starts as the runner starts it', async (browserName) => {
    const { asked, closed, playwright } = recordingEngines();
    const use = vi.fn(() => Promise.resolve());
    await start(playwright, browserName, use);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ engine: browserName, args: [] });
    expect(use).toHaveBeenCalledTimes(1);
    expect(closed).toHaveBeenCalledTimes(1);
    expect(profiles()).toEqual([]);
  });

  it('this is the function every spec gets its browser from, and the marker is the first thing it looks at', () => {
    const text = readFileSync(join(root, 'e2e', 'support', 'fixtures.ts'), 'utf8');
    expect(text).toMatch(/\bbrowser: \[startBrowser, \{ scope: 'worker', timeout: 0 \}\],/);
    const body = text.slice(text.indexOf('export async function startBrowser('), text.indexOf('export const test = base.extend'));
    const firstStatement = body.slice(body.indexOf('{\n', body.indexOf('Promise<void> {')) + 1).replace(/^\s*\/\/.*$/gm, '').trim();
    expect(firstStatement.startsWith('refuseIfGuardTripped();')).toBe(true);
    // The marker is read by the function that global setup uses; nothing here has a softer copy of it.
    expect(text.match(/refuseIfGuardTripped/g)).toHaveLength(2); // the import and the call
  });
});
