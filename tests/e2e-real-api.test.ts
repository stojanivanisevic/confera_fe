// The switch of the cross-repo smoke test (M1-QA-02): CONFERA_E2E_API_ORIGIN (e2e/env.ts) and
// the question that is asked before any browser test runs (e2e/support/real-api.ts).
//
// The browser tests send odd and hostile requests. The switch must take an API on this
// machine and nothing else, and a run against an API that is not there must stop with one
// message that says what to do.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { API_STUB_ORIGIN, realApiOrigin } from '../e2e/env';
import { askRealApi, assertRealApiReady } from '../e2e/support/real-api';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

const answering = (status: number, body: string) => vi.fn((_address: string | URL | Request, _options?: RequestInit) => Promise.resolve(new Response(body, { status })));

describe('CONFERA_E2E_API_ORIGIN', () => {
  it.each([undefined, '', '   '])('unset or empty (%j): the run uses the stub', (value) => {
    expect(realApiOrigin(value)).toBeNull();
  });

  it.each(['http://127.0.0.1:3001', 'http://localhost:3001', 'http://127.0.0.1:13001'])('%s is taken', (value) => {
    expect(realApiOrigin(value)).toBe(value);
  });

  it.each([
    ['a server', 'https://api.confera.example.org'],
    ['a server over http', 'http://api.confera.example.org:3001'],
    ['another address of the network', 'http://192.168.1.20:3001'],
    ['every address of this machine', 'http://0.0.0.0:3001'],
    ['a name that starts like this machine', 'http://127.0.0.1.example.org:3001'],
    ['a name that ends like this machine', 'http://evil-localhost:3001'],
    ['this machine as the user part of a server', 'http://127.0.0.1:3001@api.example.org'],
    ['https on this machine', 'https://127.0.0.1:3001'],
    ['no port', 'http://127.0.0.1'],
    ['a path', 'http://127.0.0.1:3001/api/v1'],
    ['a trailing slash', 'http://127.0.0.1:3001/'],
    ['a query', 'http://127.0.0.1:3001?x=1'],
    ['a user and a password', 'http://user:invented-password@127.0.0.1:3001'],
    ['upper-case letters', 'HTTP://LOCALHOST:3001'],
    ['no scheme', '127.0.0.1:3001'],
    ['not an address', 'the real one'],
    ['the stub itself', API_STUB_ORIGIN],
  ])('%s (%s) is refused, and the message says how to write it', (_what, value) => {
    expect(() => realApiOrigin(value)).toThrow(/CONFERA_E2E_API_ORIGIN is ".*http:\/\/127\.0\.0\.1:3001/s);
  });

  it('the web application under test forwards to the API this switch chose, and the configurations read no other variable for it', () => {
    const env = readFileSync(resolve(root, 'e2e', 'env.ts'), 'utf8');
    expect(env).toContain('export const REAL_API_ORIGIN = realApiOrigin(process.env.CONFERA_E2E_API_ORIGIN);');
    expect(env).toContain('export const API_ORIGIN = REAL_API_ORIGIN ?? API_STUB_ORIGIN;');
    expect(env).toContain('CONFERA_API_ORIGIN: API_ORIGIN,');
    // A real-API run never takes over a web application that is already running: it was started with another API address.
    const config = readFileSync(resolve(root, 'playwright.config.ts'), 'utf8');
    expect(config).toContain('const reuseWeb = reuse && REAL_API_ORIGIN === null;');
    expect(config.match(/reuseExistingServer: reuseWeb,/g)).toHaveLength(2);
    // The smoke spec belongs to its own project, which exists only in such a run.
    expect(config).toContain('...(REAL_API_ORIGIN === null');
    expect(config.match(/REAL_API_SPEC\]/g), 'the three engines leave the smoke spec alone').toHaveLength(3);
  });
});

describe('the question before the first browser test', () => {
  it('a run against the stub asks nothing', async () => {
    const fetcher = answering(200, '{"status":"ok"}');
    await expect(assertRealApiReady(null, fetcher)).resolves.toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('a real API that is ready lets the run start; it was asked for /health/ready and nothing else', async () => {
    const fetcher = answering(200, '{"status":"ok"}');
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await expect(assertRealApiReady('http://127.0.0.1:3001', fetcher)).resolves.toBeUndefined();
      expect(log).toHaveBeenCalledWith(expect.stringContaining('real API at http://127.0.0.1:3001'));
    } finally {
      log.mockRestore();
    }
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe('http://127.0.0.1:3001/health/ready');
  });

  it.each([
    ['the database does not answer', 503, '{"status":"unavailable"}'],
    ['something else listens there', 200, '<html>hello</html>'],
    ['the stub of the browser tests', 404, '{"type":"about:blank","status":404,"code":"not_found"}'],
    ['an answer that only looks ready', 200, '{"status":"starting"}'],
    ['ready with the wrong status', 500, '{"status":"ok"}'],
  ])('%s: the run stops and says how to start the API', async (_what, status, body) => {
    await expect(assertRealApiReady('http://127.0.0.1:3001', answering(status, body))).rejects.toThrow(/not a confera_be whose database answers.*stack:up, db:provision, db:migrate, seed:e2e, build, start/s);
  });

  it('nothing listens there: the run stops, names the address and says how to start the API', async () => {
    const refused = vi.fn((_address: string | URL | Request, _options?: RequestInit) => Promise.reject<Response>(new TypeError('fetch failed', { cause: new Error('connect ECONNREFUSED 127.0.0.1:3001') })));
    await expect(assertRealApiReady('http://127.0.0.1:3001', refused)).rejects.toThrow(/nothing answers at http:\/\/127\.0\.0\.1:3001\/health\/ready \(fetch failed: connect ECONNREFUSED.*stack:up/s);
    expect(await askRealApi('http://127.0.0.1:3001', refused)).toEqual({ failure: 'fetch failed: connect ECONNREFUSED 127.0.0.1:3001' });
  });

  it('global setup asks it before it makes the profile of the canary browser', () => {
    const text = readFileSync(resolve(root, 'e2e', 'global-setup.ts'), 'utf8');
    const refused = text.indexOf('refuseIfGuardTripped();');
    const asked = text.indexOf('await assertRealApiReady();');
    const canary = text.indexOf('const profile = createIsolatedChromiumProfile();');
    expect(refused).toBeGreaterThan(-1);
    expect(asked).toBeGreaterThan(refused); // the "switched off" marker is still the first thing that is looked at
    expect(canary).toBeGreaterThan(asked);
  });
});
