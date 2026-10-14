// Where `pnpm dev` and `pnpm start` listen (scripts/listen-host.mjs, ADR-24): on loopback on
// every stage but prod, and a start is refused that would listen anywhere else. The same rule as
// confera_be's LISTEN_HOST. tests/dev-server-binding.edge.test.ts proves it on a running server.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// @ts-expect-error -- plain Node script without type declarations
import { isLoopbackAddress, listenHost, LOOPBACK_ONLY } from '../scripts/listen-host.mjs';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
type Listen = { host: string } | { problem: string };
const listen = listenHost as (env: Record<string, string | undefined>) => Listen;

describe('the address the web application listens on', () => {
  describe.each(['local', 'dev', 'test'])('STAGE=%s: the developer machine only', (stage) => {
    it('listens on 127.0.0.1 unless told otherwise', () => {
      expect(listen({ STAGE: stage })).toEqual({ host: '127.0.0.1' });
      expect(listen({ STAGE: stage, LISTEN_HOST: '' })).toEqual({ host: '127.0.0.1' });
    });

    it.each([
      ['every IPv4 address', '0.0.0.0'],
      ['every IPv6 address', '::'],
      ['an address of the local network', '192.168.1.20'],
      ['a private address of a server', '10.0.0.5'],
      ['a public host name', 'confera.example.org'],
      ['a .test name, which may resolve to any interface', 'confera.test'],
    ])('refuses LISTEN_HOST set to %s', (_what, value) => {
      expect(listen({ STAGE: stage, LISTEN_HOST: value })).toEqual({ problem: `LISTEN_HOST ${LOOPBACK_ONLY as string}` });
    });

    it.each(['127.0.0.1', '127.0.0.2', '::1', '[::1]', 'localhost'])('accepts the loopback address %s', (value) => {
      expect('host' in listen({ STAGE: stage, LISTEN_HOST: value })).toBe(true);
    });
  });

  it('without a stage, as on the developer machine', () => {
    expect(listen({})).toEqual({ host: '127.0.0.1' });
    expect('problem' in listen({ LISTEN_HOST: '0.0.0.0' })).toBe(true);
  });

  it('leaves prod alone: inside its container it listens on every address', () => {
    expect(listen({ STAGE: 'prod' })).toEqual({ host: '0.0.0.0' });
    expect(listen({ STAGE: 'prod', LISTEN_HOST: '0.0.0.0' })).toEqual({ host: '0.0.0.0' });
  });

  it('refuses what is no address', () => {
    expect(listen({ STAGE: 'prod', LISTEN_HOST: '0.0.0.0 --inspect' })).toEqual({ problem: 'LISTEN_HOST must be an IP address or a host name without spaces' });
  });

  it('knows a loopback address when it sees one', () => {
    const loopback = isLoopbackAddress as (host: string) => boolean;
    expect(['127.0.0.1', '127.255.255.254', 'LOCALHOST', '::1'].map(loopback)).toEqual([true, true, true, true]);
    expect(['128.0.0.1', '127.0.0.256', '0.0.0.0', 'localhost.example.org', '::'].map(loopback)).toEqual([false, false, false, false, false]);
  });
});

describe('scripts/next.mjs, the only way Next is started', () => {
  const next = join(root, 'scripts', 'next.mjs');
  const start = (env: Record<string, string>, ...args: string[]) =>
    spawnSync(process.execPath, [next, 'dev', ...args], { cwd: root, encoding: 'utf8', timeout: 60_000, env: { ...process.env, ...env } });

  it('stops before Next starts when LISTEN_HOST is not a loopback address outside prod', () => {
    const run = start({ STAGE: 'local', LISTEN_HOST: '0.0.0.0' });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(LOOPBACK_ONLY as string);
  });

  it('takes no address from the command line', () => {
    const run = start({ STAGE: 'local' }, '--hostname', '0.0.0.0');
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('Set the address to listen on with LISTEN_HOST');
  });

  it('the framework hands the proxy the URL as the router has it, or the rewrite to the not-found page breaks once Next is given an address', () => {
    expect(readFileSync(join(root, 'apps', 'web', 'next.config.ts'), 'utf8')).toMatch(/^  skipProxyUrlNormalize: true,$/m);
  });

  it('gives Next the address for dev and start', () => {
    const text = readFileSync(next, 'utf8');
    expect(text).toMatch(/if \(\['dev', 'start'\]\.includes\(command\)\) \{[\s\S]*?args\.push\('--hostname', listen\.host\);/);
  });
});
