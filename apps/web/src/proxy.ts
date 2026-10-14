/**
 * Runs before every request (Next 16 "proxy"). It is the one owner of
 *  - the host separation (ADR-02, SEC-A-50): admin, sign-in and /api/v1 are
 *    answered on the admin host only, public routes on the public host only,
 *    and everything else is "not found";
 *  - the security headers of every page, by kind (ADR-28, ./server/security/headers);
 *  - the forwarding of /api/v1 and /public/v1 to the API (the web application
 *    only renders and forwards, ADR-20);
 *  - the methods (SEC-M1-01): a page answers GET and HEAD only, and a request
 *    that names a server action (`Next-Action`) is refused on every page. Both get
 *    405 here, before the framework sees them; the API prefixes keep every method;
 *  - the one path a form is posted to without its scripts, /f/<form>/send
 *    (UX-M1-03): it answers 204, so the browser stays on the page with what was
 *    typed, and nothing of the form is ever put in an address.
 * It is a convenience and a second line, never authorisation: the API decides.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { getConfig, isDevelopmentRuntime } from '@/config/env';
import { forwardToApi } from '@/server/forward';
import { formExists, resolveFrameSites } from '@/server/security/frame-sites';
import { buildSecurityHeaders, createNonce, type PageKind } from '@/server/security/headers';
import { classifyRoute, surfaceOfHost } from '@/server/security/route-kinds';

/** A path no route will ever have: rewriting to it renders the application's own "not found" page. */
const NOT_FOUND_PATH = '/_confera/not-found';

function page(request: NextRequest, kind: PageKind, frameSites: readonly string[] | null, notFound: boolean): NextResponse {
  const nonce = createNonce();
  const headers = buildSecurityHeaders({ kind, nonce, frameSites, development: isDevelopmentRuntime() });

  // What the page receives. Policy headers sent by a client never reach the
  // renderer: the framework copies the response headers set below onto the
  // request and reads the nonce for its own scripts from them (see headers.ts).
  const forwarded = new Headers(request.headers);
  forwarded.delete('content-security-policy');
  forwarded.delete('content-security-policy-report-only');
  forwarded.set('x-nonce', nonce);

  const response = notFound
    ? NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url), { request: { headers: forwarded } })
    : NextResponse.next({ request: { headers: forwarded } });
  for (const [name, value] of Object.entries(headers.response)) response.headers.set(name, value);
  for (const name of headers.remove) response.headers.delete(name);
  return response;
}

/** Methods a page answers. Everything else, and every request naming a server action, gets 405. */
const PAGE_METHODS = ['GET', 'HEAD'];

function pageMethodRefused(request: NextRequest): boolean {
  return !PAGE_METHODS.includes(request.method) || request.headers.has('next-action');
}

/** 405 with the header set of the page's kind: no body for a framework to render, nothing stored. */
function methodNotAllowed(kind: PageKind, allow: string): NextResponse {
  const headers = buildSecurityHeaders({ kind, nonce: createNonce(), frameSites: null, development: isDevelopmentRuntime() });
  const response = new NextResponse('Method Not Allowed\n', { status: 405, headers: { 'Content-Type': 'text/plain; charset=utf-8', Allow: allow } });
  for (const [name, value] of Object.entries(headers.response)) response.headers.set(name, value);
  return response;
}

/**
 * Where a form is posted when Send is pressed before its scripts have arrived (a slow phone, a
 * proxy that blocks scripts). The form has method="post", so nothing of it goes into the address;
 * this answers 204 No Content, so the browser stays on the page, with everything that was typed.
 * The body is not read and nothing is kept. Once the scripts are there, the form sends itself.
 */
function formSend(request: NextRequest, form: string): NextResponse {
  if (request.method !== 'POST' || request.headers.has('next-action')) return methodNotAllowed('hosted-form', 'POST');
  return new NextResponse(null, {
    status: formExists(form) ? 204 : 404,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' },
  });
}

function apiNotFound(): NextResponse {
  return new NextResponse(JSON.stringify({ type: 'about:blank', title: 'Not Found', status: 404, code: 'not_found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/problem+json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

export async function proxy(request: NextRequest): Promise<Response> {
  const config = getConfig();
  const { pathname, search } = request.nextUrl;

  // The framework's own development endpoints (error overlay, hot reload under /_next/). They do not exist in a build.
  if (isDevelopmentRuntime() && (pathname.startsWith('/__nextjs') || pathname.startsWith('/_next/'))) return NextResponse.next();

  const surface = surfaceOfHost(request.headers.get('host'), config);
  const match = classifyRoute(pathname, config.devPages);
  const isApi = match?.kind === 'admin-api' || match?.kind === 'public-api';

  // Host separation: a route is answered only on its own surface.
  const allowed = match !== null && surface !== null && (match.surface === 'any' || match.surface === surface);
  if (!allowed) {
    // Asking for an API path on the wrong host gets the API's kind of answer, a page path gets the page.
    if (isApi || /^\/(?:api|public)\//.test(pathname)) return apiNotFound();
    return pageMethodRefused(request) ? methodNotAllowed('error', 'GET, HEAD') : page(request, 'error', null, true);
  }

  if (isApi) {
    // Not the framework's rewrite: that would replace the Host header, from which the API reads the surface.
    return forwardToApi({
      apiOrigin: config.apiOrigin,
      pathAndQuery: `${pathname}${search}`,
      method: request.method,
      headers: request.headers,
      body: request.body,
      surface: match.kind === 'public-api' ? 'public' : 'admin',
    });
  }

  if (match.kind === 'form-send') return formSend(request, match.params.form ?? '');

  if (match.kind === 'asset') {
    if (pageMethodRefused(request)) return methodNotAllowed('error', 'GET, HEAD');
    const response = NextResponse.next();
    response.headers.set('X-Content-Type-Options', 'nosniff');
    return response;
  }

  if (pageMethodRefused(request)) return methodNotAllowed(match.kind, 'GET, HEAD');

  // Only the frame page can ever carry a site list, and only for a form that has a valid one.
  const frameSites = match.kind === 'frame' ? resolveFrameSites(match.params.form ?? '') : null;
  return page(request, match.kind, frameSites, false);
}

export const config = {
  // Everything except the framework's own files, /_next/static/ (the only cacheable responses; they get
  // `nosniff` from next.config.ts). Any other path under /_next/ names nothing of this application
  // (no image optimiser, no data routes) and is answered here like any unknown path: the "not found"
  // page with the header set of its kind. Left to the framework it was that page without any of them.
  matcher: ['/((?!_next/static/).*)'],
};
