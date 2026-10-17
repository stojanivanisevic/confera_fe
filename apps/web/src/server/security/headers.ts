/**
 * The one place that decides the security headers of every response of the
 * web application, by kind of page (ADR-28, ADR-07).
 *
 * Two policies exist:
 *  - the ENFORCED policy. From 0.1.0 it has two rules for every page.
 *    `frame-ancestors`: framing must hold from the first release; the default is
 *    'none', and only the frame page of a form with a valid site list gets that
 *    list. `script-src-attr` with the nonce: no inline event handler runs (part
 *    of the baseline, and nothing in the application uses one). This second rule
 *    is also how the framework learns the nonce: it copies the enforced policy of
 *    the proxy onto the request and reads the nonce for its own scripts from the
 *    first script-src* directive it finds there. Without it the framework's
 *    scripts get no nonce.
 *    From 0.2.0 the admin and auth pages enforce the WHOLE baseline (ADR-28:
 *    "enforced on the admin at 0.2.0"): one policy, and what it blocks is
 *    reported to the API (`report-uri`, `report-to`; M1-ISS-11).
 *    From 0.3.0 the public pages (the hosted form, the frame, the secure-link pages)
 *    enforce it too (ADR-28), with the frame page's site list as its framing rule.
 *  - the baseline in REPORT-ONLY mode: what is left of it is the error page, which keeps
 *    the two rules of 0.1.0 enforced and reports the rest.
 * Every HTML response carries a fresh script nonce and is never stored (SEC-A-51).
 */
import type { RouteKind } from './route-kinds';

/** Kinds that answer with a page. API kinds are forwarded and keep the API's own headers. */
export type PageKind = Exclude<RouteKind, 'admin-api' | 'public-api' | 'asset' | 'form-send'> | 'error';

/** The kinds whose baseline is enforced: the pages of the admin surface (0.2.0) and the public pages (0.3.0, ADR-28). */
export const ENFORCED_KINDS: readonly PageKind[] = ['admin', 'auth', 'hosted-form', 'frame', 'secure-link'];

export interface HeaderInput {
  readonly kind: PageKind;
  readonly nonce: string;
  /** The validated site list of the form. Used for the kind `frame` only; null means 'none'. */
  readonly frameSites: readonly string[] | null;
  /** `next dev`: the framework's development tooling needs eval. Never true in a build. */
  readonly development: boolean;
  /** Where the browser sends what the policy blocked: the API's report route (an absolute address). Null: no report. */
  readonly reportTo?: string | null;
}

export interface SecurityHeaders {
  /** Headers of the response. */
  readonly response: Readonly<Record<string, string>>;
  /** The baseline policy of this response (enforced or report-only, by kind). */
  readonly policy: string;
  /** Response headers that must not be present. */
  readonly remove: readonly string[];
}

const PERMISSIONS = ['accelerometer', 'camera', 'geolocation', 'gyroscope', 'magnetometer', 'microphone', 'payment', 'usb']
  .map((feature) => `${feature}=()`)
  .join(', ');

/** The name of the reporting endpoint in `Reporting-Endpoints` and `report-to`. */
const REPORT_GROUP = 'csp';

/** A fresh, unguessable nonce for one response. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes));
}

/** The policy every page enforced from 0.1.0: who may frame the page, and no inline event handlers. */
export function enforcedPolicy(ancestors: string, nonce: string): string {
  return `frame-ancestors ${ancestors}; script-src-attr 'nonce-${nonce}'`;
}

/** The value of `frame-ancestors`: the site list for the frame page of a form that has one, else 'none'. */
export function frameAncestors(kind: PageKind, frameSites: readonly string[] | null): string {
  if (kind !== 'frame' || !frameSites || frameSites.length === 0) return "'none'";
  return frameSites.join(' ');
}

/** The baseline of ADR-28, without the framing rule and without a report address. */
export function baselineDirectives(nonce: string, development: boolean): string[] {
  return [
    "default-src 'self'",
    // Scripts: our own files and this response's nonce. No inline handlers, no eval.
    `script-src 'self' 'nonce-${nonce}' 'report-sample'${development ? " 'unsafe-eval'" : ''}`,
    `script-src-attr 'nonce-${nonce}'`,
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
  ];
}

export function reportOnlyPolicy(nonce: string, development: boolean): string {
  return baselineDirectives(nonce, development)
    .filter((directive) => !directive.startsWith('script-src-attr '))
    .join('; ');
}

/** The whole baseline, enforced: the framing rule first (the framework reads the nonce from the first script-src* directive after it). */
export function enforcedBaselinePolicy(ancestors: string, nonce: string, development: boolean, reportTo: string | null): string {
  const directives = [`frame-ancestors ${ancestors}`, ...baselineDirectives(nonce, development)];
  if (reportTo) directives.push(`report-uri ${reportTo}`, `report-to ${REPORT_GROUP}`);
  return directives.join('; ');
}

export function buildSecurityHeaders(input: HeaderInput): SecurityHeaders {
  const ancestors = frameAncestors(input.kind, input.frameSites);
  const framed = ancestors !== "'none'";
  const enforced = ENFORCED_KINDS.includes(input.kind);
  const reportTo = input.reportTo ?? null;
  const policy = enforced ? enforcedBaselinePolicy(ancestors, input.nonce, input.development, reportTo) : reportOnlyPolicy(input.nonce, input.development);

  const response: Record<string, string> = {
    'Content-Security-Policy': enforced ? policy : enforcedPolicy(ancestors, input.nonce),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': PERMISSIONS,
  };
  if (!enforced) response['Content-Security-Policy-Report-Only'] = policy;
  if (enforced && reportTo) response['Reporting-Endpoints'] = `${REPORT_GROUP}="${reportTo}"`;
  // The legacy header cannot express a site list: it is sent with 'none' and dropped with a list.
  if (!framed) response['X-Frame-Options'] = 'DENY';
  if (input.kind === 'secure-link') response['X-Robots-Tag'] = 'noindex, nofollow';

  return { response, policy, remove: framed ? ['X-Frame-Options'] : [] };
}
