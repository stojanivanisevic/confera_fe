// The forward to the API keeps the browser's Host header (the API reads the
// surface from it and ignores X-Forwarded-Host), passes method, path, query,
// body and headers on, and keeps cookies off the public surface.
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { forwardToApi } from './forward';

interface Seen {
  method: string;
  url: string;
  headers: IncomingMessage['headers'];
  body: string;
}
let api: Server;
let apiOrigin: string;
const seen: Seen[] = [];

beforeAll(async () => {
  api = createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => (body += chunk));
    req.on('end', () => {
      seen.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
      // Like the real API: the admin API answers only under the admin host name.
      const host = (req.headers.host ?? '').replace(/:\d+$/, '');
      if (req.url?.startsWith('/api/v1/') && host !== 'localhost') {
        res.writeHead(404, { 'content-type': 'application/problem+json' }).end('{"status":404,"code":"not_found"}');
        return;
      }
      if (req.url === '/api/v1/empty') {
        res.writeHead(204).end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': ['a=1; Path=/', 'b=2; Path=/'], connection: 'close', 'x-trace-id': 't-1' });
      res.end(JSON.stringify({ name: 'confera-api', version: '0.1.0' }));
    });
  });
  await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve));
  apiOrigin = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => api.close(() => resolve())));

const forward = (overrides: Partial<Parameters<typeof forwardToApi>[0]> = {}) =>
  forwardToApi({ apiOrigin, pathAndQuery: '/api/v1/meta', method: 'GET', headers: new Headers({ host: 'localhost:3000' }), body: null, surface: 'admin', ...overrides });
const last = () => seen[seen.length - 1]!;

describe('forwarding to the API', () => {
  it("keeps the browser's Host header, so the API sees the surface that was asked", async () => {
    const response = await forward();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: 'confera-api', version: '0.1.0' });
    expect(last().headers.host).toBe('localhost:3000');
  });

  it('a call under the other host name reaches the API as such, and the API refuses it', async () => {
    const response = await forward({ headers: new Headers({ host: '127.0.0.1:3000' }) });
    expect(last().headers.host).toBe('127.0.0.1:3000');
    expect(response.status).toBe(404);
  });

  it('does not pass on headers that claim another host or address', async () => {
    await forward({ headers: new Headers({ host: 'localhost:3000', 'x-forwarded-host': 'localhost', 'x-forwarded-for': '203.0.113.9', forwarded: 'host=localhost', 'x-real-ip': '203.0.113.9' }) });
    for (const name of ['x-forwarded-host', 'x-forwarded-for', 'forwarded', 'x-real-ip']) expect(last().headers[name]).toBeUndefined();
  });

  it('passes method, path, query, body and ordinary headers on', async () => {
    const body = new Blob(['{"title":"Šta đaci čitaju"}']).stream();
    await forward({ pathAndQuery: '/api/v1/things?page=2&q=%C5%A1', method: 'POST', body, headers: new Headers({ host: 'localhost:3000', 'content-type': 'application/json', 'x-csrf-token': 'invented-csrf', cookie: 'session=1' }) });
    expect(last()).toMatchObject({ method: 'POST', url: '/api/v1/things?page=2&q=%C5%A1', body: '{"title":"Šta đaci čitaju"}' });
    expect(last().headers).toMatchObject({ 'content-type': 'application/json', 'x-csrf-token': 'invented-csrf', cookie: 'session=1' });
  });

  it('the admin surface gets the cookies of the API; connection headers are not passed back', async () => {
    const response = await forward();
    expect(response.headers.getSetCookie()).toEqual(['a=1; Path=/', 'b=2; Path=/']);
    expect(response.headers.get('connection')).toBeNull();
    expect(response.headers.get('x-trace-id')).toBe('t-1');
  });

  it('the public surface sends no cookie to the API and sets none', async () => {
    const response = await forward({ pathAndQuery: '/public/v1/forms/x', surface: 'public', headers: new Headers({ host: '127.0.0.1:3000', cookie: 'session=1' }) });
    expect(last().headers.cookie).toBeUndefined();
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it('an answer without a body stays without one', async () => {
    const response = await forward({ pathAndQuery: '/api/v1/empty' });
    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
  });

  it('never leaves the origin of the API', async () => {
    const before = seen.length;
    for (const pathAndQuery of ['//evil.example.test/api/v1/meta', 'http://evil.example.test/api/v1/meta']) {
      expect((await forward({ pathAndQuery })).status).toBe(404);
    }
    expect(seen.length).toBe(before);
  });

  it('answers 502 as a problem document when the API is not there', async () => {
    const response = await forward({ apiOrigin: 'http://127.0.0.1:9' });
    expect(response.status).toBe(502);
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    expect(await response.json()).toMatchObject({ status: 502, code: 'api_unreachable' });
  });
});
