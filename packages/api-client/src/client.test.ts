// M1-FE-05: one typed call to /api/v1/meta, against the generated types.
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { ApiError, compatibility, CONTRACT_VERSION, createAdminClient, createPublicClient, getMeta, type AdminPaths, type Meta, type Problem, type PublicPaths } from './index';

const json = (body: unknown, status = 200, type = 'application/json') => new Response(JSON.stringify(body), { status, headers: { 'content-type': type } });

describe('the typed call to /api/v1/meta', () => {
  it('asks the right address, without a cache, and returns what the contract says', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(json({ name: 'confera-api', version: '0.1.0' })));
    const meta = await getMeta(createAdminClient({ baseUrl: 'http://localhost:3000', fetch }));

    expect(meta).toEqual({ name: 'confera-api', version: '0.1.0' });
    const request = fetch.mock.calls[0]![0] as Request;
    expect(request.url).toBe('http://localhost:3000/api/v1/meta');
    expect(request.method).toBe('GET');
    expect(request.cache).toBe('no-store');
    expect(request.credentials).toBe('same-origin');
  });

  it('is typed by the generated types', () => {
    expectTypeOf<Meta>().toEqualTypeOf<{ name: string; version: string }>();
    expectTypeOf(getMeta).returns.resolves.toEqualTypeOf<Meta>();
    expectTypeOf<AdminPaths>().toHaveProperty('/api/v1/meta');
    expectTypeOf<Problem>().toHaveProperty('code').toBeString();
    expectTypeOf<Problem>().toHaveProperty('traceId').toBeString();
    // A path the contract does not have is a type error.
    const client = createAdminClient({ baseUrl: 'http://localhost:3000', fetch: () => Promise.resolve(json({})) });
    // @ts-expect-error -- not a path of the contract
    void client.GET('/api/v1/no-such-path');
  });

  it('turns an error of the API into an ApiError with code and trace id', async () => {
    const fetch = () => Promise.resolve(json({ code: 'not_found', traceId: 't-42', status: 404, title: 'Not Found' }, 404, 'application/problem+json'));
    const error = await getMeta(createAdminClient({ baseUrl: 'http://localhost:3000', fetch })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, code: 'not_found', traceId: 't-42' });
  });

  it('survives an error that is not in the error format', async () => {
    const fetch = () => Promise.resolve(new Response('Bad gateway', { status: 502, headers: { 'content-type': 'text/plain' } }));
    const error = await getMeta(createAdminClient({ baseUrl: 'http://localhost:3000', fetch })).catch((e: unknown) => e);
    expect(error).toMatchObject({ name: 'ApiError', status: 502, code: 'unknown', traceId: null });
  });

  it('the public client sends no cookie', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(json({})));
    const client = createPublicClient({ baseUrl: 'http://127.0.0.1:3000', fetch });
    expectTypeOf(client).not.toBeAny();
    // The public contract: where a browser reports what the content security policy blocked (0.2.0), and the
    // public forms (0.3.0): the form, its site list, a token, an upload and the submit.
    expectTypeOf<keyof PublicPaths>().toEqualTypeOf<
      '/public/v1/csp-reports' | '/public/v1/forms/{slug}' | '/public/v1/forms/{slug}/frame-sites' | '/public/v1/forms/{slug}/tokens' | '/public/v1/forms/{slug}/uploads' | '/public/v1/forms/{slug}/submissions'
    >();
    await (client as unknown as { GET: (path: string) => Promise<unknown> }).GET('/public/v1/anything');
    expect((fetch.mock.calls[0]![0] as Request).credentials).toBe('omit');
  });
});

describe('the major-version check (ADR-19)', () => {
  it('the contract version of this build is a version', () => {
    expect(CONTRACT_VERSION).toMatch(/^\d+\.\d+\.\d+/);
    expect(compatibility(CONTRACT_VERSION)).toBe('compatible');
  });

  it.each([
    ['0.1.0', '0.1.0', 'compatible'],
    ['0.9.3', '0.1.0', 'compatible'],
    ['1.0.0', '0.9.0', 'major-mismatch'],
    ['2.4.1', '1.0.0', 'major-mismatch'],
    ['1.2.3-rc.1', '1.0.0', 'compatible'],
    ['v1', '1.0.0', 'unreadable'],
    ['', '1.0.0', 'unreadable'],
    [undefined, '1.0.0', 'unreadable'],
    [{ major: 1 }, '1.0.0', 'unreadable'],
  ] as const)('API %j with contract %s is %s', (api, contract, expected) => {
    expect(compatibility(api, contract)).toBe(expected);
  });
});
