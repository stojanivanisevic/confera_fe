/**
 * The one place that decides the security headers of every response of the
 * web application, by kind of page (ADR-28, ADR-07).
 *
 * Two policies are sent:
 *  - an ENFORCED policy with two rules. `frame-ancestors`: framing must hold
 *    from the first release; the default is 'none', and only the frame page of a
 *    form with a valid site list gets that list. `script-src-attr` with the
 *    nonce: no inline event handler runs (part of the baseline, and nothing in
 *    the application uses one). This second rule is also how the framework
 *    learns the nonce: it copies the enforced policy of the proxy onto the
 *    request and reads the nonce for its own scripts from the first script-src*
 *    directive it finds there. Without it the framework's scripts get no nonce.
 *  - the full baseline in REPORT-ONLY mode (0.1.0). It is enforced on the admin
 *    at 0.2.0 and on the public pages at 0.3.0; then the two become one.
 * Every HTML response carries a fresh script nonce and is never stored (SEC-A-51).
 */
import type { RouteKind } from './route-kinds';

/** Kinds that answer with a page. API kinds are forwarded and keep the API's own headers. */
export type PageKind = Exclude<RouteKind, 'admin-api' | 'public-api' | 'asset'> | 'error';

export interface HeaderInput {
  readonly kind: PageKind;
  readonly nonce: string;
  /** The validated site list of the form. Used for the kind `frame` only; null means 'none'. */
  readonly frameSites: readonly string[] | null;
  /** `next dev`: the framework's development tooling needs eval. Never true in a build. */
  readonly development: boolean;
}

export interface SecurityHeaders {
  /** Headers of the response. */
  readonly response: Readonly<Record<string, string>>;
  /** The report-only policy, also passed to the framework so that it puts the nonce on its own scripts. */
  readonly policy: string;
  /** Response headers that must not be present. */
  readonly remove: readonly string[];
}

const PERMISSIONS = ['accelerometer', 'camera', 'geolocation', 'gyroscope', 'magnetometer', 'microphone', 'payment', 'usb']
  .map((feature) => `${feature}=()`)
  .join(', ');

/** A fresh, unguessable nonce for one response. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes));
}

/** The policy that is enforced from 0.1.0: who may frame the page, and no inline event handlers. */
export function enforcedPolicy(ancestors: string, nonce: string): string {
  return `frame-ancestors ${ancestors}; script-src-attr 'nonce-${nonce}'`;
}

/** The value of `frame-ancestors`: the site list for the frame page of a form that has one, else 'none'. */
export function frameAncestors(kind: PageKind, frameSites: readonly string[] | null): string {
  if (kind !== 'frame' || !frameSites || frameSites.length === 0) return "'none'";
  return frameSites.join(' ');
}

export function reportOnlyPolicy(nonce: string, development: boolean): string {
  return [
    "default-src 'self'",
    // Scripts: our own files and this response's nonce. No inline handlers, no eval.
    `script-src 'self' 'nonce-${nonce}' 'report-sample'${development ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'nonce-${nonce}'`,
    // The design system positions a few things with a style attribute (a progress bar's width).
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-src 'none'",
    "worker-src 'none'",
    "manifest-src 'self'",
    "media-src 'none'",
  ].join('; ');
}

export function buildSecurityHeaders(input: HeaderInput): SecurityHeaders {
  const ancestors = frameAncestors(input.kind, input.frameSites);
  const framed = ancestors !== "'none'";
  const policy = reportOnlyPolicy(input.nonce, input.development);

  const response: Record<string, string> = {
    'Content-Security-Policy': enforcedPolicy(ancestors, input.nonce),
    'Content-Security-Policy-Report-Only': policy,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': PERMISSIONS,
  };
  // The legacy header cannot express a site list: it is sent with 'none' and dropped with a list.
  if (!framed) response['X-Frame-Options'] = 'DENY';
  if (input.kind === 'secure-link') response['X-Robots-Tag'] = 'noindex, nofollow';

  return { response, policy, remove: framed ? ['X-Frame-Options'] : [] };
}
