// ST-66 (routing part), against odd Host headers: the web application answers a route only
// when the Host header IS the host of its surface. A header that merely contains that host,
// or that is not a host at all (a user part, a path, a query, a fragment, a percent-encoded
// letter), is neither surface and gets "not found". The same cases found a defect in
// confera_be (its hosts.spec.ts); here they pass, and stay.
// Plain HTTP requests to the running test build: no browser is between the test and the server.
import { request as httpRequest } from 'node:http';

import { WEB_PORT } from './env';
import { expect, test } from './support/fixtures';

const ADMIN_HOST = `localhost:${WEB_PORT}`;
const PUBLIC_HOST = `127.0.0.1:${WEB_PORT}`;

function get(path: string, host: string): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port: WEB_PORT, path, method: 'GET', headers: { Host: host } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

const ADMIN_PATHS = ['/', '/sign-in', '/api/v1/meta'];
const PUBLIC_PATHS = ['/f/spike-abstract', '/embed/spike-abstract'];

test.describe('ST-66: odd Host headers', () => {
  test('the control: each surface answers under its own host, in any case of the letters', async () => {
    for (const path of ADMIN_PATHS) expect((await get(path, ADMIN_HOST)).status, `${path} under ${ADMIN_HOST}`).toBe(200);
    for (const path of PUBLIC_PATHS) expect((await get(path, PUBLIC_HOST)).status, `${path} under ${PUBLIC_HOST}`).toBe(200);
    expect((await get('/sign-in', ADMIN_HOST.toUpperCase())).status).toBe(200);
  });

  for (const [name, admin, visitor] of [
    ['a user part before the host', `evil.example@${ADMIN_HOST}`, `evil.example@${PUBLIC_HOST}`],
    ['a user and a password before the host', `user:pw@${ADMIN_HOST}`, `user:pw@${PUBLIC_HOST}`],
    ['the host as the user part of another host', `${ADMIN_HOST}@evil.example`, `${PUBLIC_HOST}@evil.example`],
    ['a path after the host', `${ADMIN_HOST}/evil.example`, `${PUBLIC_HOST}/evil.example`],
    ['a query after the host', `${ADMIN_HOST}?evil.example`, `${PUBLIC_HOST}?evil.example`],
    ['a fragment after the host', `${ADMIN_HOST}#evil.example`, `${PUBLIC_HOST}#evil.example`],
    ['a backslash after the host', `${ADMIN_HOST}\\evil.example`, `${PUBLIC_HOST}\\evil.example`],
    ['a percent-encoded letter', ADMIN_HOST.replace('l', '%6c'), PUBLIC_HOST.replace('1', '%31')],
    ['a trailing dot', `localhost.:${WEB_PORT}`, `127.0.0.1.:${WEB_PORT}`],
    ['the host without its port', 'localhost', '127.0.0.1'],
    ['the host with another port', `localhost:${WEB_PORT + 1}`, `127.0.0.1:${WEB_PORT + 1}`],
    ['two hosts', `${ADMIN_HOST}, evil.example`, `${PUBLIC_HOST}, evil.example`],
    ['a name that starts with the host', `${ADMIN_HOST}.evil.example`, `${PUBLIC_HOST}.evil.example`],
    ['a name that ends with the host', `evil-${ADMIN_HOST}`, `evil-${PUBLIC_HOST}`],
    ['a space inside', `local host:${WEB_PORT}`, `127.0.0 .1:${WEB_PORT}`],
    ['another spelling of the loopback address', `127.1:${WEB_PORT}`, `2130706433:${WEB_PORT}`],
    ['the IPv6 loopback', `[::1]:${WEB_PORT}`, `[::ffff:127.0.0.1]:${WEB_PORT}`],
  ] as const) {
    test(`${name}: nothing of either surface is answered`, async () => {
      for (const host of [admin, visitor]) {
        for (const path of [...ADMIN_PATHS, ...PUBLIC_PATHS, '/dev/gallery']) {
          const response = await get(path, host);
          expect(response.status, `${path} under "${host}"`).toBe(404);
          expect(response.body, `${path} under "${host}"`).not.toMatch(/data-confera-form|Sign-in arrives|confera-api/);
          expect(response.headers['set-cookie']).toBeUndefined();
          // No frame permission is ever given under a host that is not the public one.
          if (String(response.headers['content-type']).includes('text/html')) expect(response.headers['content-security-policy']).toMatch(/^frame-ancestors 'none';/);
        }
      }
    });
  }

  test('headers a client can add do not move a request to the other surface', async () => {
    const claim = (path: string, host: string, claimed: string) =>
      new Promise<number>((resolve, reject) => {
        const req = httpRequest(
          {
            host: '127.0.0.1',
            port: WEB_PORT,
            path,
            headers: { Host: host, 'X-Forwarded-Host': claimed, 'X-Forwarded-Server': claimed, 'X-Host': claimed, 'X-Original-Host': claimed, Forwarded: `host=${claimed}`, Origin: `http://${claimed}`, Referer: `http://${claimed}/` },
          },
          (res) => {
            res.resume();
            res.on('end', () => resolve(res.statusCode ?? 0));
          },
        );
        req.on('error', reject);
        req.end();
      });
    for (const path of ADMIN_PATHS) expect(await claim(path, PUBLIC_HOST, ADMIN_HOST), `${path} under the public host, claiming the admin host`).toBe(404);
    for (const path of PUBLIC_PATHS) expect(await claim(path, ADMIN_HOST, PUBLIC_HOST), `${path} under the admin host, claiming the public host`).toBe(404);
    expect(await claim('/sign-in', 'evil.example', ADMIN_HOST)).toBe(404);
  });
});
