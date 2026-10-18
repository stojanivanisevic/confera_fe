// M1-QA-02, the cross-repo smoke test: the web application of this repository in front of
// a real confera_be.
//
// The API is started by the documented commands of confera_be and by nothing else (its
// README, section 9: stack:up, db:provision, db:migrate, seed:e2e, build, start), and named
// by CONFERA_E2E_API_ORIGIN (README of this repository, "Against the real API"). The file
// belongs to the project "real-api", which exists only in such a run; every other spec then
// runs against the real API as well.
//
// What is asked here is what the stub cannot answer: the trace id and the security headers
// of the API, its one error format, the readiness of its database, and the version of the
// contract this build was made with. Every GET route of the vendored OpenAPI files is asked
// for; since 0.2.0 the admin routes want a session, and the pages of the links answer an
// unknown token with 404 `link_invalid`. The admin home is behind sign-in: the browser test
// signs in as the admin of `seed:e2e` (e2e/support/admin.ts).
import { readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { join } from 'node:path';

import { ADMIN_ORIGIN, HARNESS_ORIGIN, PUBLIC_ORIGIN, REAL_API_ORIGIN, WEB_PORT } from './env';
import { ADMIN, signIn } from './support/admin';
import { expect, test } from './support/fixtures';
import { watchPage } from './support/page-problems';

const API = REAL_API_ORIGIN ?? '';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** The headers confera_be sets on every answer (its ADR-28), written out: a forward that drops one must fail here. */
const API_HEADERS: Readonly<Record<string, string>> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'x-frame-options': 'DENY',
  'cross-origin-resource-policy': 'same-origin',
};

interface OpenApiDocument {
  readonly info: { readonly version: string };
  readonly paths: Record<string, Record<string, unknown>>;
}
const contract = (file: string) => JSON.parse(readFileSync(join(process.cwd(), 'packages', 'api-client', 'openapi', file), 'utf8')) as OpenApiDocument;
const ADMIN_CONTRACT = contract('openapi.json');
const PUBLIC_CONTRACT = contract('openapi.public.json');
const getOperations = (document: OpenApiDocument) =>
  Object.entries(document.paths)
    .filter(([, item]) => 'get' in item)
    .map(([path]) => path.replace(/\{[^}]+\}/g, '00000000-0000-4000-8000-000000000000'));

interface Answer {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  text: string;
  json: () => unknown;
}

/** One plain HTTP request to a port of this machine, with the Host header exactly as given. */
function ask(port: number, path: string, host: string, options: { method?: string; headers?: Record<string, string> } = {}): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, method: options.method ?? 'GET', headers: { ...options.headers, Host: host } }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (text += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text, json: () => JSON.parse(text) as unknown }));
    });
    req.on('error', reject);
    req.end();
  });
}

const apiPort = () => Number(new URL(API).port);
/** Straight to the API, past the web application. */
const direct = (path: string, host: string, options?: Parameters<typeof ask>[3]) => ask(apiPort(), path, host, options);
/** Through the web application, as a browser on that host would ask. */
const throughWeb = (path: string, host: string, options?: Parameters<typeof ask>[3]) => ask(WEB_PORT, path, host, options);

const ADMIN_HOST = new URL(ADMIN_ORIGIN).host;
const PUBLIC_HOST = new URL(PUBLIC_ORIGIN).host;

const expectApiHeaders = (answer: Answer, what: string) => {
  for (const [name, value] of Object.entries(API_HEADERS)) expect(answer.headers[name], `${what}: ${name}`).toBe(value);
};
const expectNotFoundProblem = (answer: Answer, what: string) => {
  expect(answer.status, what).toBe(404);
  expect(String(answer.headers['content-type']), what).toMatch(/^application\/problem\+json/);
  expect(answer.json(), what).toEqual({ code: 'not_found', title: 'Not Found', status: 404, traceId: expect.stringMatching(UUID) });
  expect(answer.headers['x-trace-id'], `${what}: the trace id of the header is the one of the body`).toBe((answer.json() as { traceId: string }).traceId);
};

test.describe('the cross-repo smoke test: a real confera_be behind the web application (M1-QA-02)', () => {
  test('the control: this run was given a real API, and its database answers', async () => {
    expect(API, 'CONFERA_E2E_API_ORIGIN').toMatch(/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/);
    for (const path of ['/health', '/health/ready']) {
      const answer = await direct(path, `127.0.0.1:${String(apiPort())}`);
      expect(answer.status, path).toBe(200);
      expect(answer.json(), path).toEqual({ status: 'ok' });
      // The mark of confera_be: every answer carries a trace id. The stub of the browser tests has none.
      expect(String(answer.headers['x-trace-id']), `${path}: trace id`).toMatch(UUID);
    }
  });

  test('the health addresses of the API are not reachable through the web application', async () => {
    // They are for the proxy and the monitoring on the server, not for a browser (ADR-20: only /api/v1 and /public/v1 are forwarded).
    for (const host of [ADMIN_HOST, PUBLIC_HOST]) {
      for (const path of ['/health', '/health/ready']) {
        const answer = await throughWeb(path, host);
        expect(answer.status, `${path} under ${host}`).toBe(404);
        expect(answer.text, `${path} under ${host}`).not.toContain('"status":"ok"');
      }
    }
  });

  test('GET /api/v1/meta through the web application is answered by the real API, with the version of the contract of this build', async () => {
    const answer = await throughWeb('/api/v1/meta', ADMIN_HOST);
    expect(answer.status).toBe(200);
    expect(String(answer.headers['content-type'])).toMatch(/^application\/json/);
    expect(answer.json()).toEqual({ name: 'confera-api', version: ADMIN_CONTRACT.info.version, instance: null });
    expect(String(answer.headers['x-trace-id']), 'the trace id of the API reaches the browser').toMatch(UUID);
    expectApiHeaders(answer, 'the forwarded answer');
    expect(answer.headers['set-cookie']).toBeUndefined();
  });

  test('every GET route of the vendored admin contract exists in the real API, through the web application', async () => {
    const paths = getOperations(ADMIN_CONTRACT);
    expect(paths).toContain('/api/v1/meta');
    for (const path of paths) {
      const answer = await throughWeb(path, ADMIN_HOST);
      // 401 and 403 arrive with sign-in (0.2.0); the page of a link answers a token it does not know with
      // 404 `link_invalid`. What must never come back is "no such route" or an error of the server.
      const link = /^\/api\/v1\/(invitations|password-resets|email-changes)\//.test(path);
      if (link && answer.status === 404) expect((answer.json() as { code?: string }).code, `${path}: the 404 of a link`).toBe('link_invalid');
      else expect([200, 401, 403], `${path}: ${String(answer.status)} ${answer.text.slice(0, 120)}`).toContain(answer.status);
      expect(String(answer.headers['x-trace-id']), path).toMatch(UUID);
    }
  });

  test('it answers only because the forward kept the Host header: the real API reads the surface from it', async () => {
    // Asked directly under the name of the admin surface, the API answers ...
    expect((await direct('/api/v1/meta', ADMIN_HOST)).status).toBe(200);
    // ... and under its own address, under the public name, or with a forwarding header that claims the admin name, it does not.
    expectNotFoundProblem(await direct('/api/v1/meta', `127.0.0.1:${String(apiPort())}`), 'the API under its own address');
    expectNotFoundProblem(await direct('/api/v1/meta', PUBLIC_HOST), 'the API under the public name');
    expectNotFoundProblem(await direct('/api/v1/meta', PUBLIC_HOST, { headers: { 'X-Forwarded-Host': ADMIN_HOST, Forwarded: `host=${ADMIN_HOST}` } }), 'the API with a claimed host');
    // The same two questions through the web application.
    expect((await throughWeb('/api/v1/meta', ADMIN_HOST)).status).toBe(200);
    const wrong = await throughWeb('/api/v1/meta', PUBLIC_HOST, { headers: { 'X-Forwarded-Host': ADMIN_HOST, Forwarded: `host=${ADMIN_HOST}` } });
    expect(wrong.status).toBe(404);
    expect(wrong.text).not.toContain('confera-api');
  });

  test('one error format: what the real API refuses arrives in the browser as its problem document, with its trace id', async () => {
    for (const path of ['/api/v1/nothing-here', '/api/v1/meta/more', '/api/v1/canary-7f3a91/x?token=canary-7f3a91']) {
      const answer = await throughWeb(path, ADMIN_HOST);
      expectNotFoundProblem(answer, path);
      expectApiHeaders(answer, path);
      expect(answer.text, 'nothing of the address is repeated').not.toContain('canary-7f3a91');
    }
  });

  test('a method the route does not have is refused as a problem, never with an error of the server', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const answer = await throughWeb('/api/v1/meta', ADMIN_HOST, { method, headers: { Origin: ADMIN_ORIGIN, 'Content-Length': '0' } });
      expect(answer.status, method).toBeGreaterThanOrEqual(400);
      expect(answer.status, method).toBeLessThan(500);
      expect(String(answer.headers['content-type']), method).toMatch(/^application\/problem\+json/);
      expect(answer.text, method).not.toContain('confera-api');
    }
  });

  test('no other site is given access: the answer carries no CORS grant, for a request and for a preflight', async () => {
    for (const origin of [HARNESS_ORIGIN, PUBLIC_ORIGIN, 'https://evil.example.test', 'null']) {
      const plain = await throughWeb('/api/v1/meta', ADMIN_HOST, { headers: { Origin: origin } });
      const preflight = await throughWeb('/api/v1/meta', ADMIN_HOST, {
        method: 'OPTIONS',
        headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type, x-csrf-token' },
      });
      for (const [what, answer] of [
        ['a request', plain],
        ['a preflight', preflight],
      ] as const) {
        expect(
          Object.keys(answer.headers).filter((name) => name.startsWith('access-control-')),
          `${what} from ${origin}`,
        ).toEqual([]);
      }
      expect(preflight.status, `a preflight from ${origin}`).toBeGreaterThanOrEqual(400);
    }
  });

  test('the public API through the web application: asked under the public name, answered by the real API', async () => {
    // 0.1.0 has no public route yet, so the answer is "not found"; what counts is who gives it, and that no cookie is set.
    const answer = await throughWeb('/public/v1/forms/spike-abstract', PUBLIC_HOST, { headers: { Cookie: 'session=canary-7f3a91' } });
    expectNotFoundProblem(answer, 'a public path under the public name');
    expectApiHeaders(answer, 'a public path under the public name');
    expect(answer.headers['set-cookie']).toBeUndefined();
    // Under the admin name the public API is not there at all.
    expect((await throughWeb('/public/v1/forms/spike-abstract', ADMIN_HOST)).status).toBe(404);
    // Every GET route the vendored public contract describes exists (none in 0.1.0).
    for (const path of getOperations(PUBLIC_CONTRACT)) {
      const routed = await throughWeb(path, PUBLIC_HOST);
      expect(routed.status, path).toBeLessThan(500);
      expect(String(routed.headers['x-trace-id']), path).toMatch(UUID);
    }
  });

  test('twenty requests at once through the web application: each gets its own answer and its own trace id', async () => {
    const answers = await Promise.all(Array.from({ length: 20 }, (_, index) => throughWeb(index % 2 === 0 ? '/api/v1/meta' : `/api/v1/nothing-${String(index)}`, ADMIN_HOST)));
    answers.forEach((answer, index) => expect(answer.status, `request ${String(index)}`).toBe(index % 2 === 0 ? 200 : 404));
    expect(new Set(answers.map((answer) => answer.headers['x-trace-id'])).size).toBe(20);
  });

  test('in a browser: the admin home, signed in, shows the name and the version the real API gave, from one same-origin call', async ({ page }) => {
    // Signed in on another page, so that the home's one call is the only one seen.
    await signIn(page, ADMIN, '/account');
    const problems = watchPage(page);
    const seen: { status: number; traceId: string | undefined; body: unknown }[] = [];
    page.on('response', (response) => {
      if (!response.url().endsWith('/api/v1/meta')) return;
      void response.json().then((body: unknown) => seen.push({ status: response.status(), traceId: response.headers()['x-trace-id'], body }));
    });
    await page.goto(`${ADMIN_ORIGIN}/`);
    await expect(page.locator('[data-confera-connection="connected"]')).toContainText('Confera is working.');
    await page.getByText('Technical details').click();
    const row = (label: string) => page.locator('.ud-dl__row', { has: page.locator('dt', { hasText: label }) }).locator('dd');
    await expect(row('Service')).toHaveText('confera-api');
    await expect(row('Version')).toHaveText(ADMIN_CONTRACT.info.version);
    await expect.poll(() => seen.length).toBe(1);
    expect(seen[0]?.status).toBe(200);
    expect(seen[0]?.body).toEqual({ name: 'confera-api', version: ADMIN_CONTRACT.info.version });
    expect(String(seen[0]?.traceId), 'the answer on the page came from the real API').toMatch(UUID);
    // One call of the meta route, and every call to the page's own origin (ADR-02): the browser never talks to the API's address.
    expect(problems.requests.filter((url) => url.endsWith('/api/v1/meta'))).toEqual([`${ADMIN_ORIGIN}/api/v1/meta`]);
    expect(problems.requests.filter((url) => url.includes('/api/')).every((url) => url.startsWith(`${ADMIN_ORIGIN}/api/v1/`))).toBe(true);
    expect(problems.requests.filter((url) => url.startsWith(API))).toEqual([]);
    expect(problems.messages).toEqual([]);
  });
});
