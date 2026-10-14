// Edge case found by the edge-case hunter (M1-REV-01): where the web application
// LISTENS on a developer machine.
//
// ADR-24: "Non-production stages run only on the developer's machine"; the register's
// disposition of SEC-A-03: "non-production only on loopback". apps/web/src/config/env.ts
// enforces it on the two ORIGINS, but `pnpm dev` and `pnpm start` (scripts/next.mjs)
// start Next without a host name, and Next then listens on every address of the machine.
// The host check does not help: it compares the Host header, which the client writes.
//
// What that opens on STAGE=local, on a laptop in a café or an office network:
//  - the dev pages of a test build (gallery, spike fixtures);
//  - /api/v1 and /public/v1, which the web application forwards to the API with the
//    client's Host header unchanged (server/forward.ts). confera_be listens on 127.0.0.1
//    only (its README, section 1: "all bound to 127.0.0.1"); through the web application
//    its admin surface is one request away for anyone on the network who sends
//    `Host: localhost:3000`.
// confera_be listens on 127.0.0.1 by default outside prod (config.ts); the web
// application must not be the open door next to it.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { connect, createServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

/** An IPv4 address of this machine that is not a loopback address, if it has one. */
const lanAddress = Object.values(networkInterfaces())
  .flat()
  .find((entry) => entry !== undefined && entry.family === 'IPv4' && !entry.internal)?.address;

function freePort(): Promise<number> {
  return new Promise((done, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => (typeof address === 'object' && address ? done(address.port) : reject(new Error('no port'))));
    });
  });
}

/** 'open' when something accepts a TCP connection there, else the error code. */
function probe(host: string, port: number): Promise<string> {
  return new Promise((done) => {
    const socket = connect({ host, port });
    socket.setTimeout(3000);
    socket.on('connect', () => {
      socket.destroy();
      done('open');
    });
    socket.on('timeout', () => {
      socket.destroy();
      done('timeout');
    });
    socket.on('error', (error: NodeJS.ErrnoException) => done(error.code ?? 'error'));
  });
}

/** Stops the wrapper and the Next server it started (on Windows a child outlives its parent). */
function stopTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else process.kill(-child.pid, 'SIGTERM');
}

describe.skipIf(lanAddress === undefined)('edge case (M1-REV-01): the web application on STAGE=local listens on this machine only', () => {
  let child: ChildProcess;
  let port: number;
  let output = '';

  beforeAll(async () => {
    port = await freePort();
    // `pnpm dev`, exactly as the README starts it, with the documented local settings.
    child = spawn(process.execPath, [join(root, 'scripts', 'next.mjs'), 'dev'], {
      cwd: root,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        STAGE: 'local',
        CONFERA_PUBLIC_ORIGIN: `http://127.0.0.1:${port}`,
        CONFERA_ADMIN_ORIGIN: `http://localhost:${port}`,
        CONFERA_API_ORIGIN: 'http://127.0.0.1:3001',
        PORT: String(port),
      },
    });
    child.stdout?.setEncoding('utf8').on('data', (chunk: string) => (output += chunk));
    child.stderr?.setEncoding('utf8').on('data', (chunk: string) => (output += chunk));
    const deadline = Date.now() + 90_000;
    while ((await probe('127.0.0.1', port)) !== 'open') {
      if (child.exitCode !== null || Date.now() > deadline) throw new Error(`next dev did not start:\n${output}`);
      await new Promise((done) => setTimeout(done, 250));
    }
  }, 120_000);

  afterAll(() => {
    stopTree(child);
  });

  it('answers on the loopback address (the control)', async () => {
    expect(await probe('127.0.0.1', port)).toBe('open');
  });

  it('is not reachable on an address of the local network', async () => {
    expect({ address: 'an address of the local network', port, answer: await probe(lanAddress!, port) }).not.toMatchObject({ answer: 'open' });
  });
});
