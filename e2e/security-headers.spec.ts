// M1-FE-07: security headers by kind of page, the framing default, the host
// separation enforced in the application, and "nothing with a nonce is cached".
//   ST-12  each kind of route returns its header set; /embed/* is the only one
//          with a site list; two loads of the hosted form return different nonces
//   ST-66  (routing part) sign-in and /api/v1/meta asked under the public host
//          name are not found
// These are plain HTTP requests against the running test build: no browser is
// between the test and the server.
import { request as httpRequest } from 'node:http';

import type { APIResponse } from '@playwright/test';

import { ADMIN_ORIGIN, API_STUB_ORIGIN, HARNESS_ORIGIN, PUBLIC_ORIGIN, WEB_PORT } from './env';
import { expect, test } from './support/fixtures';

interface Route {
  origin: string;
  path: string;
  status: number;
  kind: 'admin' | 'auth' | 'hosted-form' | 'frame' | 'secure-link' | 'dev' | 'error';
  /** The site list this response must carry. Only one route has one. */
  sites?: string;
}
const ROUTES: Route[] = [
  { origin: ADMIN_ORIGIN, path: '/', status: 200, kind: 'admin' },
  { origin: ADMIN_ORIGIN, path: '/sign-in', status: 200, kind: 'auth' },
  { origin: PUBLIC_ORIGIN, path: '/f/spike-abstract', status: 200, kind: 'hosted-form' },
  { origin: PUBLIC_ORIGIN, path: '/embed/spike-abstract', status: 200, kind: 'frame', sites: HARNESS_ORIGIN },
  { origin: PUBLIC_ORIGIN, path: '/embed/spike-unlisted', status: 200, kind: 'frame' }, // a form with an empty list
  { origin: PUBLIC_ORIGIN, path: '/embed/no-such-form', status: 404, kind: 'frame' }, // an error page under /embed
  { origin: PUBLIC_ORIGIN, path: '/f/no-such-form', status: 404, kind: 'hosted-form' },
  { origin: PUBLIC_ORIGIN, path: '/s/some-token', status: 404, kind: 'secure-link' }, // the pages arrive with 0.5.0
  { origin: PUBLIC_ORIGIN, path: '/pay/some-token', status: 404, kind: 'secure-link' }, // 0.7.0
  { origin: PUBLIC_ORIGIN, path: '/dev/gallery', status: 200, kind: 'dev' },
  { origin: ADMIN_ORIGIN, path: '/dev/gallery', status: 200, kind: 'dev' },
  { origin: PUBLIC_ORIGIN, path: '/no-such-page', status: 404, kind: 'error' },
  { origin: ADMIN_ORIGIN, path: '/no-such-page', status: 404, kind: 'error' },
];
const label = (r: Route) => `${r.origin === ADMIN_ORIGIN ? 'admin' : 'public'} ${r.path} (${r.kind})`;

const nonceOf = (response: APIResponse) => /script-src 'self' 'nonce-([A-Za-z0-9+/=]+)'/.exec(response.headers()['content-security-policy-report-only'] ?? '')?.[1];
const scriptTags = (html: string) => [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);

/** A request with a Host header of our choosing, straight to the server. */
function getWithHost(path: string, host: string): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
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

test.describe('ST-12: each kind of route returns its header set', () => {
  for (const route of ROUTES) {
    test(label(route), async ({ request }) => {
      const response = await request.get(`${route.origin}${route.path}`);
      const headers = response.headers();
      expect(response.status()).toBe(route.status);
      expect(headers['content-type']).toContain('text/html');

      // Framing: 'none' with the legacy header, except the one frame page with a list.
      const nonce = nonceOf(response);
      expect(nonce, 'the response has a script nonce').toBeTruthy();
      expect(headers['content-security-policy']).toBe(`frame-ancestors ${route.sites ?? "'none'"}; script-src-attr 'nonce-${nonce}'`);
      if (route.sites) expect(headers['x-frame-options']).toBeUndefined();
      else expect(headers['x-frame-options']).toBe('DENY');

      // Never stored: the response carries a nonce.
      expect(headers['cache-control']).toContain('no-store');
      expect(headers['cache-control']).not.toMatch(/public|s-maxage|immutable/);

      // The baseline, report-only in 0.1.0.
      const policy = headers['content-security-policy-report-only']!.split('; ');
      for (const directive of ["default-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'self'", "connect-src 'self'", "font-src 'self'"]) {
        expect(policy).toContain(directive);
      }
      expect(policy.find((d) => d.startsWith('script-src '))).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['referrer-policy']).toBe('no-referrer');
      expect(headers['permissions-policy']).toContain('camera=()');
      if (route.kind === 'secure-link') expect(headers['x-robots-tag']).toBe('noindex, nofollow');
      else expect(headers['x-robots-tag']).toBeUndefined();

      // ADR-20: no version header. ADR-08: no CORS grant. ADR-02: no cookie from the web application.
      expect(headers['x-powered-by']).toBeUndefined();
      expect(Object.keys(headers).filter((h) => h.startsWith('access-control-'))).toEqual([]);
      expect(headers['set-cookie']).toBeUndefined();

      // The framework's own scripts carry this response's nonce: every one of them.
      const tags = scriptTags(await response.text());
      expect(tags.length).toBeGreaterThan(3);
      for (const tag of tags) expect(tag, 'a script without this response\'s nonce').toContain(`nonce="${nonce}"`);
    });
  }

  test('/embed/* is the only route that can carry a site list', async ({ request }) => {
    const withList: string[] = [];
    for (const route of ROUTES) {
      const policy = (await request.get(`${route.origin}${route.path}`)).headers()['content-security-policy'] ?? '';
      if (!policy.startsWith("frame-ancestors 'none';")) withList.push(`${route.path}: ${policy.split(';')[0]}`);
    }
    expect(withList).toEqual([`/embed/spike-abstract: frame-ancestors ${HARNESS_ORIGIN}`]);
  });

  test('two loads of the hosted form return different nonces, and none is stored', async ({ request }) => {
    const nonces = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const response = await request.get(`${PUBLIC_ORIGIN}/f/spike-abstract`);
      expect(response.headers()['cache-control']).toContain('no-store');
      expect(response.headers()['etag']).toBeUndefined();
      nonces.add(nonceOf(response)!);
    }
    expect(nonces.size).toBe(5);
  });

  test('a policy header sent by a client does not choose the nonce', async ({ request }) => {
    const response = await request.get(`${PUBLIC_ORIGIN}/f/spike-abstract`, {
      headers: { 'Content-Security-Policy': "script-src 'nonce-chosenByTheClient0000'", 'Content-Security-Policy-Report-Only': "script-src 'nonce-chosenByTheClient0000'", 'x-nonce': 'chosenByTheClient0000' },
    });
    const html = await response.text();
    expect(html).not.toContain('chosenByTheClient');
    expect(nonceOf(response)).not.toBe('chosenByTheClient0000');
    for (const tag of scriptTags(html)) expect(tag).toContain(`nonce="${nonceOf(response)}"`);
  });

  test('only static files are cacheable', async ({ request }) => {
    const html = await (await request.get(`${PUBLIC_ORIGIN}/f/spike-abstract`)).text();
    const asset = /\/_next\/static\/[^"]+\.(?:js|css)/.exec(html)![0];
    const response = await request.get(`${PUBLIC_ORIGIN}${asset}`);
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toMatch(/immutable/);
    expect(response.headers()['content-type']).not.toContain('text/html');
    const icon = await request.get(`${PUBLIC_ORIGIN}/icon.png`);
    expect(icon.status()).toBe(200);
    expect(icon.headers()['x-content-type-options']).toBe('nosniff');
  });
});

test.describe('ST-66 (routing part): the host separation is enforced in the application', () => {
  for (const path of ['/sign-in', '/', '/api/v1/meta', '/api/v1/auth/sign-in']) {
    test(`${path} asked under the public host name is not found`, async ({ request }) => {
      const response = await request.get(`${PUBLIC_ORIGIN}${path}`);
      expect(response.status()).toBe(404);
      expect(response.headers()['set-cookie']).toBeUndefined();
      const body = await response.text();
      expect(body).not.toMatch(/Sign in|Foundations/); // nothing of the admin surface is shown
      expect(response.headers()['cache-control']).toContain('no-store');
    });
  }

  for (const path of ['/f/spike-abstract', '/embed/spike-abstract', '/s/some-token', '/pay/some-token', '/public/v1/forms/spike-abstract']) {
    test(`${path} asked under the admin host name is not found`, async ({ request }) => {
      const response = await request.get(`${ADMIN_ORIGIN}${path}`);
      expect(response.status()).toBe(404);
      expect(await response.text()).not.toContain('data-confera-form');
      // No frame permission is ever given on the admin host.
      if (response.headers()['content-type']?.includes('text/html')) expect(response.headers()['content-security-policy']).toMatch(/^frame-ancestors 'none';/);
    });
  }

  test('the same paths are answered on their own host', async ({ request }) => {
    expect((await request.get(`${ADMIN_ORIGIN}/sign-in`)).status()).toBe(200);
    expect((await request.get(`${PUBLIC_ORIGIN}/f/spike-abstract`)).status()).toBe(200);
    // Forwarded to the API (here a stub that reads the surface from the Host header, as confera_be does).
    // It answers only because the forward kept the Host header of this request ("localhost:3000").
    const meta = await request.get(`${ADMIN_ORIGIN}/api/v1/meta`);
    expect(meta.status()).toBe(200);
    expect(meta.headers()['content-type']).toContain('application/json');
    expect(await meta.json()).toMatchObject({ name: 'confera-api', version: expect.stringMatching(/^[0-9]+[.][0-9]+[.][0-9]+/) });
  });

  test('the forward keeps the Host header: the control', async ({ request }) => {
    // Asked directly, the API (stub) refuses /api/v1 under its own address and under the public host name ...
    expect((await request.get(`${API_STUB_ORIGIN}/api/v1/meta`)).status()).toBe(404);
    expect((await request.get(`${API_STUB_ORIGIN}/api/v1/meta`, { headers: { 'X-Forwarded-Host': 'localhost' } })).status()).toBe(404);
    // ... so the 200 above can only come from a forward that passed "localhost" on as the Host.
    const wrongHost = await getWithHost('/api/v1/meta', `127.0.0.1:${WEB_PORT}`);
    expect(wrongHost.status).toBe(404);
    // A client cannot talk its way onto the admin surface with a forwarding header either.
    const claimed = await request.get(`${PUBLIC_ORIGIN}/api/v1/meta`, { headers: { 'X-Forwarded-Host': `localhost:${WEB_PORT}`, Forwarded: 'host=localhost' } });
    expect(claimed.status()).toBe(404);
  });

  test('an API path on the wrong host is answered as an API would: not found, as a problem document', async ({ request }) => {
    const response = await request.get(`${PUBLIC_ORIGIN}/api/v1/meta`);
    expect(response.headers()['content-type']).toContain('application/problem+json');
    expect(await response.json()).toMatchObject({ status: 404, code: 'not_found' });
  });

  // The last one is the public host itself, to show that the same requests are answered under the right name.
  for (const host of ['evil.example.test', `127.0.0.1.evil.example.test:${WEB_PORT}`, '127.0.0.1', `127.0.0.1:${WEB_PORT + 1}`, `127.0.0.2:${WEB_PORT}`, `127.0.0.1:${WEB_PORT}`]) {
    test(`a request with the Host header "${host}"`, async () => {
      const known = host === `127.0.0.1:${WEB_PORT}`;
      for (const path of ['/', '/sign-in', '/f/spike-abstract', '/embed/spike-abstract', '/dev/gallery', '/api/v1/meta']) {
        const response = await getWithHost(path, host);
        const expected = known && ['/f/spike-abstract', '/embed/spike-abstract', '/dev/gallery'].includes(path) ? 200 : 404;
        expect(response.status, `${path} under ${host}`).toBe(expected);
      }
    });
  }

  test('"not found" looks the same whether the path is unknown or belongs to the other host', async ({ request }) => {
    const strip = (html: string) => html.replace(/nonce="[^"]*"/g, '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
    const unknown = await request.get(`${PUBLIC_ORIGIN}/no-such-page`);
    const otherHost = await request.get(`${PUBLIC_ORIGIN}/sign-in`);
    expect(strip(await otherHost.text())).toBe(strip(await unknown.text()));
    expect(await unknown.text()).toContain('Page not found');
  });
});
