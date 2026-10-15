// M2-FE-01: the CSRF plumbing of a signed-in browser (ADR-03). Every changing request carries
// the session's value in the X-CSRF-Token header once it is known; a reading request never
// does; a refetch the person did not ask for says so with X-Confera-Background.
import { describe, expect, it, vi } from 'vitest';

import { BACKGROUND_HEADER, createSessionClient, CSRF_HEADER, hasFreshPassword } from './session';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const requestsOf = (fetch: ReturnType<typeof vi.fn>) => fetch.mock.calls.map(([request]) => request as Request);

describe('the session clients', () => {
  it('a changing request carries the CSRF header once the value is known; a reading request never', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(json({})));
    const clients = createSessionClient({ baseUrl: 'http://localhost:3000', fetch });
    await clients.client.DELETE('/api/v1/session');
    clients.setCsrf('invented-csrf');
    await clients.client.DELETE('/api/v1/session');
    await clients.client.GET('/api/v1/session');
    const [before, after, reading] = requestsOf(fetch);
    expect(before!.headers.get(CSRF_HEADER)).toBeNull();
    expect(after!.headers.get(CSRF_HEADER)).toBe('invented-csrf');
    expect(reading!.headers.get(CSRF_HEADER)).toBeNull();
    for (const request of [before!, after!, reading!]) {
      expect(request.credentials).toBe('same-origin');
      expect(request.cache).toBe('no-store');
      expect(request.headers.get(BACKGROUND_HEADER)).toBeNull();
    }
  });

  it('the background client marks its requests, and shares the CSRF value', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(json({})));
    const clients = createSessionClient({ baseUrl: 'http://localhost:3000', fetch });
    clients.setCsrf('invented-csrf');
    await clients.background.GET('/api/v1/session');
    await clients.background.DELETE('/api/v1/session');
    const [reading, changing] = requestsOf(fetch);
    expect(reading!.headers.get(BACKGROUND_HEADER)).toBe('1');
    expect(changing!.headers.get(BACKGROUND_HEADER)).toBe('1');
    expect(changing!.headers.get(CSRF_HEADER)).toBe('invented-csrf');
    clients.setCsrf(null);
    expect(clients.csrf()).toBeNull();
  });
});

describe('the password asked again', () => {
  const at = Date.parse('2026-10-15T10:00:00Z');
  it('is fresh until half a minute before the API stops accepting it', () => {
    expect(hasFreshPassword({ confirmationValidUntil: '2026-10-15T10:04:00Z' }, at)).toBe(true);
    expect(hasFreshPassword({ confirmationValidUntil: '2026-10-15T10:00:20Z' }, at)).toBe(false);
    expect(hasFreshPassword({ confirmationValidUntil: '2026-10-15T09:59:00Z' }, at)).toBe(false);
    expect(hasFreshPassword({ confirmationValidUntil: null }, at)).toBe(false);
    expect(hasFreshPassword(null, at)).toBe(false);
    expect(hasFreshPassword({ confirmationValidUntil: 'not a moment' }, at)).toBe(false);
  });
});
