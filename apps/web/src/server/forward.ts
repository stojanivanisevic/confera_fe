/**
 * Forwards /api/v1 and /public/v1 to the API (ADR-20: the web application
 * only renders and forwards). In production the proxy in front routes these
 * paths to the API itself; this is what answers them when a request reaches
 * the web application, which is always the case on a developer machine.
 *
 * The API decides the surface by the `Host` header of the request and ignores
 * `X-Forwarded-Host` (confera_be README, "Two surfaces, two host names"). So
 * the forward MUST keep the browser's `Host` header. The framework's own
 * rewrite replaces it with the API's address, which would turn every admin
 * call into "not found"; that is why the forward is done here, with Node's
 * HTTP client.
 */
import { request as httpRequest, type IncomingHttpHeaders, type OutgoingHttpHeaders } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';

/** Headers that belong to one connection and are never passed on (RFC 9110, 7.6.1). */
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'proxy-connection', 'te', 'trailer', 'transfer-encoding', 'upgrade']);
/** Headers a client must not be able to make the API believe; the API ignores them anyway. */
const NEVER_FORWARDED = new Set(['x-forwarded-host', 'x-forwarded-for', 'x-forwarded-proto', 'x-forwarded-port', 'forwarded', 'x-real-ip']);

export interface ForwardOptions {
  /** Origin of the API, from configuration. */
  readonly apiOrigin: string;
  /** Path and query of the request, unchanged. */
  readonly pathAndQuery: string;
  readonly method: string;
  readonly headers: Headers;
  readonly body: ReadableStream<Uint8Array> | null;
  /** The public surface never reads a cookie and never sets one (ADR-02). */
  readonly surface: 'admin' | 'public';
  readonly timeoutMs?: number;
}

function problem(status: number, code: string, title: string): Response {
  return new Response(JSON.stringify({ type: 'about:blank', title, status, code }), {
    status,
    headers: { 'Content-Type': 'application/problem+json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

function requestHeaders(options: ForwardOptions): OutgoingHttpHeaders {
  const out: OutgoingHttpHeaders = {};
  options.headers.forEach((value, name) => {
    const key = name.toLowerCase();
    if (HOP_BY_HOP.has(key) || NEVER_FORWARDED.has(key)) return;
    if (options.surface === 'public' && key === 'cookie') return;
    out[key] = value;
  });
  // The Host header of the browser, unchanged: it is what the API reads the surface from.
  const host = options.headers.get('host');
  if (host) out.host = host;
  return out;
}

function responseHeaders(incoming: IncomingHttpHeaders, surface: ForwardOptions['surface']): Headers {
  const out = new Headers();
  for (const [name, value] of Object.entries(incoming)) {
    if (value === undefined || HOP_BY_HOP.has(name)) continue;
    if (surface === 'public' && name === 'set-cookie') continue;
    for (const single of Array.isArray(value) ? value : [value]) out.append(name, single);
  }
  return out;
}

/** Sends the request to the API and returns its answer, body streamed. */
export function forwardToApi(options: ForwardOptions): Promise<Response> {
  return new Promise((resolve) => {
    let target: URL;
    try {
      target = new URL(options.pathAndQuery, options.apiOrigin);
    } catch {
      resolve(problem(404, 'not_found', 'Not Found'));
      return;
    }
    // The path must stay on the API's own origin whatever the request said.
    if (target.origin !== new URL(options.apiOrigin).origin) {
      resolve(problem(404, 'not_found', 'Not Found'));
      return;
    }

    const send = target.protocol === 'https:' ? httpsRequest : httpRequest;
    const upstream = send(
      target,
      { method: options.method, headers: requestHeaders(options), timeout: options.timeoutMs ?? 30_000, setHost: false },
      (answer) => {
        const status = answer.statusCode ?? 502;
        const empty = options.method === 'HEAD' || status === 204 || status === 304;
        resolve(new Response(empty ? null : (Readable.toWeb(answer) as ReadableStream<Uint8Array>), { status, headers: responseHeaders(answer.headers, options.surface) }));
      },
    );
    upstream.on('timeout', () => upstream.destroy(new Error('timeout')));
    upstream.on('error', () => resolve(problem(502, 'api_unreachable', 'The API did not answer')));

    if (options.body && options.method !== 'GET' && options.method !== 'HEAD') {
      Readable.fromWeb(options.body as Parameters<typeof Readable.fromWeb>[0]).pipe(upstream);
    } else {
      upstream.end();
    }
  });
}
