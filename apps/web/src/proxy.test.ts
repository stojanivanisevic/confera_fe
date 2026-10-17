// The proxy and the methods (SEC-M1-01), and the form's POST path (UX-M1-03).
// A page answers GET and HEAD only, and nothing that names a server action reaches the framework;
// the API prefixes keep every method; a form posted without its scripts gets 204, so the browser
// stays on the page. The running server is asked the same in e2e/security-headers.spec.ts.
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// The API's answer for a slug (0.3.0: the forms come from the API): one form exists, every other is missing.
vi.mock('@/server/public-forms', () => ({
  lookUpForm: async (slug: string) => (slug === 'spike-abstract' ? { kind: 'form', form: { slug, frameSites: ['http://localhost:4000'] } } : { kind: 'missing' }),
}));

let proxy: (request: NextRequest) => Promise<Response>;

beforeAll(async () => {
  // The settings of a test build, as the configuration module reads them.
  vi.stubEnv('STAGE', 'test');
  vi.stubEnv('CONFERA_PUBLIC_ORIGIN', 'http://127.0.0.1:3000');
  vi.stubEnv('CONFERA_ADMIN_ORIGIN', 'http://localhost:3000');
  vi.stubEnv('CONFERA_API_ORIGIN', 'http://127.0.0.1:3101');
  vi.stubEnv('CONFERA_DEV_PAGES', '1');
  ({ proxy } = await import('./proxy'));
});
afterAll(() => {
  vi.unstubAllEnvs();
});

const ADMIN = 'localhost:3000';
const PUBLIC = '127.0.0.1:3000';
const ask = (method: string, path: string, host: string, headers: Record<string, string> = {}) =>
  proxy(new NextRequest(`http://${host}${path}`, { method, headers: { host, ...headers }, body: method === 'GET' || method === 'HEAD' ? undefined : 'title=x' }));

const PAGES: Array<[string, string, string]> = [
  ['/', ADMIN, 'admin'],
  ['/sign-in', ADMIN, 'auth'],
  ['/f/spike-abstract', PUBLIC, 'hosted-form'],
  ['/embed/spike-abstract', PUBLIC, 'frame'],
  ['/dev/gallery', PUBLIC, 'dev'],
  ['/no-such-page', PUBLIC, 'error'],
  ['/sign-in', PUBLIC, 'error'], // a page of the other surface is "not found"
];

describe('a page answers GET and HEAD only (SEC-M1-01)', () => {
  it.each(PAGES)('%s under %s (%s): GET and HEAD pass to the page', async (path, host) => {
    for (const method of ['GET', 'HEAD']) {
      const response = await ask(method, path, host);
      expect(response.status, method).not.toBe(405);
    }
  });

  it.each(PAGES)('%s under %s (%s): every other method gets 405 with the header set of its kind', async (path, host) => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      const response = await ask(method, path, host);
      expect(response.status, method).toBe(405);
      expect(response.headers.get('allow')).toBe('GET, HEAD');
      // The header set of the page's kind: framing first; the admin pages enforce the whole baseline (0.2.0).
      expect(response.headers.get('content-security-policy')).toMatch(/^frame-ancestors 'none'; /);
      expect(response.headers.get('content-security-policy')).toMatch(/script-src-attr 'nonce-/);
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('cache-control')).toContain('no-store');
      expect(response.headers.get('x-middleware-next')).toBeNull(); // the framework never sees it
      expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    }
  });

  it.each(PAGES)('%s under %s (%s): a request that names a server action gets 405, also with GET', async (path, host) => {
    for (const method of ['POST', 'GET']) {
      const response = await ask(method, path, host, { 'Next-Action': '7f3a2c' });
      expect(response.status, method).toBe(405);
    }
  });

  it('the file at the root answers GET and HEAD only', async () => {
    expect((await ask('POST', '/icon.png', PUBLIC)).status).toBe(405);
    expect((await ask('GET', '/icon.png', PUBLIC)).status).not.toBe(405);
  });
});

describe("the form's POST path, for a Send pressed before the scripts arrived (UX-M1-03)", () => {
  it('a POST gets 204: the browser stays on the page, with what was typed', async () => {
    const response = await ask('POST', '/f/spike-abstract/send', PUBLIC, { 'Content-Type': 'application/x-www-form-urlencoded' });
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('location')).toBeNull();
  });

  it('a form that does not exist: 404', async () => {
    expect((await ask('POST', '/f/no-such-form/send', PUBLIC)).status).toBe(404);
  });

  it('every other method, and a server action, gets 405', async () => {
    for (const method of ['GET', 'HEAD', 'PUT', 'DELETE']) {
      const response = await ask(method, '/f/spike-abstract/send', PUBLIC);
      expect(response.status, method).toBe(405);
      expect(response.headers.get('allow')).toBe('POST');
    }
    expect((await ask('POST', '/f/spike-abstract/send', PUBLIC, { 'Next-Action': '7f3a2c' })).status).toBe(405);
  });

  it('is on the public surface only', async () => {
    expect((await ask('POST', '/f/spike-abstract/send', ADMIN)).status).toBe(405); // "not found" on the admin host, which is a page
  });
});

describe('the API prefixes keep every method', () => {
  it('a POST to /api/v1 under the admin host is forwarded, not refused', async () => {
    const response = await ask('POST', '/api/v1/auth/sign-in', ADMIN, { 'Content-Type': 'application/json' });
    expect(response.status).not.toBe(405);
  });
});
