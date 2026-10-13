// ST-12 (unit part) and ST-66 (routing part): the header set of every kind of
// page, the one place a site list can appear, and the host separation.
// e2e/security-headers.spec.ts asserts the same on the running application.
import { describe, expect, it } from 'vitest';

import { frameSitesFrom, MAX_FRAME_SITES, normaliseFrameSite, resolveFrameSites } from './frame-sites';
import { buildSecurityHeaders, createNonce, frameAncestors, type PageKind } from './headers';
import { classifyRoute, DECLARED_ROUTES, surfaceOfHost } from './route-kinds';

const NONCE = 'bm9uY2Utbm9uY2Utbm9uY2U=';
const SITES = ['https://itema.example.test', 'https://eman.example.test'];
const PAGE_KINDS: PageKind[] = ['admin', 'auth', 'hosted-form', 'frame', 'secure-link', 'dev', 'error'];
const headers = (kind: PageKind, frameSites: readonly string[] | null = null, development = false) =>
  buildSecurityHeaders({ kind, nonce: NONCE, frameSites, development });

describe('header set of every kind of page (ADR-28)', () => {
  it.each(PAGE_KINDS)('%s: the baseline', (kind) => {
    const { response, policy } = headers(kind);
    expect(response['Content-Security-Policy']).toBe(`frame-ancestors 'none'; script-src-attr 'nonce-${NONCE}'`);
    expect(response['X-Frame-Options']).toBe('DENY');
    expect(response['Cache-Control']).toBe('no-store');
    expect(response['X-Content-Type-Options']).toBe('nosniff');
    expect(response['Referrer-Policy']).toBe('no-referrer');
    expect(response['Permissions-Policy']).toContain('camera=()');
    expect(response['Content-Security-Policy-Report-Only']).toBe(policy);
  });

  it('the report-only policy is the baseline of the decision', () => {
    const directives = headers('admin').policy.split('; ');
    expect(directives).toContain("default-src 'self'");
    expect(directives).toContain(`script-src 'self' 'nonce-${NONCE}' 'report-sample'`);
    expect(directives).toContain("object-src 'none'");
    expect(directives).toContain("base-uri 'none'");
    expect(directives).toContain("form-action 'self'");
    expect(directives).toContain("connect-src 'self'");
    expect(directives).toContain("font-src 'self'");
  });

  it('what is enforced from 0.1.0 is framing and "no inline event handlers", nothing else', () => {
    const enforced = headers('admin').response['Content-Security-Policy']!.split('; ').map((d) => d.split(' ')[0]);
    expect(enforced).toEqual(['frame-ancestors', 'script-src-attr']);
    expect(headers('admin').response['Content-Security-Policy']).not.toMatch(/unsafe-inline|unsafe-hashes/);
  });

  it('scripts: no inline handlers, no eval, no wildcard, no other origin', () => {
    const script = headers('hosted-form').policy.split('; ').find((d) => d.startsWith('script-src'))!;
    expect(script).not.toMatch(/unsafe-inline|unsafe-eval|\*|https?:/);
  });

  it('eval is allowed for the framework in development mode only', () => {
    expect(headers('admin', null, true).policy).toContain("'unsafe-eval'");
    expect(headers('admin', null, false).policy).not.toContain("'unsafe-eval'");
  });

  it('secure-link pages are also kept out of search engines', () => {
    expect(headers('secure-link').response['X-Robots-Tag']).toBe('noindex, nofollow');
    for (const kind of PAGE_KINDS.filter((k) => k !== 'secure-link')) expect(headers(kind).response['X-Robots-Tag']).toBeUndefined();
  });

  it('a nonce is fresh and unguessable', () => {
    const nonces = new Set(Array.from({ length: 200 }, createNonce));
    expect(nonces.size).toBe(200);
    for (const nonce of nonces) expect(nonce).toMatch(/^[A-Za-z0-9+/]{24}$/);
  });
});

describe('only the frame page can ever carry a site list (ADR-07)', () => {
  it('the frame page of a form with a list gets the list, and the legacy header is dropped', () => {
    const result = headers('frame', SITES);
    expect(result.response['Content-Security-Policy']).toBe(`frame-ancestors ${SITES.join(' ')}; script-src-attr 'nonce-${NONCE}'`);
    expect(result.response['X-Frame-Options']).toBeUndefined();
    expect(result.remove).toEqual(['X-Frame-Options']);
  });

  it.each(PAGE_KINDS.filter((k) => k !== 'frame'))('%s keeps none even when it is handed a list', (kind) => {
    const result = headers(kind, SITES);
    expect(result.response['Content-Security-Policy']).toMatch(/^frame-ancestors 'none'; /);
    expect(result.response['X-Frame-Options']).toBe('DENY');
  });

  it.each([[null], [[]]])('the frame page without a list (%j) is none', (sites) => {
    expect(frameAncestors('frame', sites)).toBe("'none'");
    expect(headers('frame', sites).response['X-Frame-Options']).toBe('DENY');
  });
});

describe('the site list is validated and fails closed (SEC-A-08)', () => {
  it.each(['https://itema.example.test', 'https://itema.example.test:8443', 'http://127.0.0.1:4000', 'http://localhost:4000'])('accepts %s', (site) => {
    expect(normaliseFrameSite(site)).toBe(site);
  });

  it.each([
    ['a wildcard', 'https://*.example.test'],
    ['a bare wildcard', '*'],
    ['plain http on a public name', 'http://itema.example.test'],
    ['a path', 'https://itema.example.test/conference'],
    ['a trailing slash', 'https://itema.example.test/'],
    ['a query', 'https://itema.example.test?x=1'],
    ['a fragment', 'https://itema.example.test#x'],
    ['a user part', 'https://user@itema.example.test'],
    ['upper case', 'https://ITEMA.example.test'],
    ['a second directive', "https://itema.example.test; script-src 'unsafe-inline'"],
    ['a space', 'https://itema.example.test https://evil.example.test'],
    ['a keyword', "'self'"],
    ['a scheme only', 'https:'],
    ['a script scheme', 'javascript:alert(1)'],
    ['a data scheme', 'data:text/html,x'],
    ['no scheme', 'itema.example.test'],
    ['an empty entry', ''],
  ])('refuses %s', (_what, site) => {
    expect(normaliseFrameSite(site)).toBeNull();
  });

  it('one bad entry closes the frame for the whole list', () => {
    expect(frameSitesFrom([...SITES, 'https://*.example.test'])).toBeNull();
  });

  it('an empty list, a missing list and too many entries give none', () => {
    expect(frameSitesFrom([])).toBeNull();
    expect(frameSitesFrom(null)).toBeNull();
    expect(frameSitesFrom(undefined)).toBeNull();
    const many = Array.from({ length: MAX_FRAME_SITES + 1 }, (_, i) => `https://site${i}.example.test`);
    expect(frameSitesFrom(many)).toBeNull();
    expect(frameSitesFrom(many.slice(0, MAX_FRAME_SITES))).toHaveLength(MAX_FRAME_SITES);
  });

  it('an unknown form, a form without sites and a bad slug resolve to none', () => {
    expect(resolveFrameSites('spike-abstract')).toEqual(['http://localhost:4000']);
    expect(resolveFrameSites('spike-unlisted')).toBeNull();
    expect(resolveFrameSites('no-such-form')).toBeNull();
    expect(resolveFrameSites('../spike-abstract')).toBeNull();
    expect(resolveFrameSites('constructor')).toBeNull();
    expect(resolveFrameSites('__proto__')).toBeNull();
  });
});

describe('every route has a kind and a surface (ADR-28, ADR-02)', () => {
  it.each([
    ['/', 'admin', 'admin'],
    ['/sign-in', 'auth', 'admin'],
    ['/sign-in/', 'auth', 'admin'],
    ['/f/itema-2026-abstract', 'hosted-form', 'public'],
    ['/embed/itema-2026-abstract', 'frame', 'public'],
    ['/s/some-token', 'secure-link', 'public'],
    ['/pay/some-token', 'secure-link', 'public'],
    ['/api/v1/meta', 'admin-api', 'admin'],
    ['/api/v1/auth/sign-in', 'admin-api', 'admin'],
    ['/public/v1/forms/x', 'public-api', 'public'],
    ['/icon.png', 'asset', 'any'],
  ])('%s is %s on the %s surface', (path, kind, surface) => {
    expect(classifyRoute(path, false)).toMatchObject({ kind, surface });
  });

  it.each(['/admin', '/embed', '/embed/a/b', '/f', '/api', '/api/v2/meta', '/public', '/sign-in/extra', '/.env', '/uploads/abc', '/files/storage-key'])(
    '%s is not a route',
    (path) => {
      expect(classifyRoute(path, true)).toBeNull();
    },
  );

  it('the dev pages are routes in a test build only', () => {
    expect(classifyRoute('/dev/gallery', true)).toMatchObject({ kind: 'dev', surface: 'any' });
    expect(classifyRoute('/dev/gallery', false)).toBeNull();
  });

  it('the parts in brackets are handed over as parameters', () => {
    expect(classifyRoute('/embed/spike-abstract', false)?.params).toEqual({ form: 'spike-abstract' });
  });

  it('every declared route has a known kind and surface', () => {
    expect(DECLARED_ROUTES.length).toBeGreaterThan(5);
    for (const route of DECLARED_ROUTES) {
      expect(route.kind).toBeTruthy();
      expect(['admin', 'public', 'any']).toContain(route.surface);
    }
    // The admin and the public surface share no page route.
    const pages = DECLARED_ROUTES.filter((r) => r.kind !== 'asset' && !r.devOnly);
    expect(pages.every((r) => r.surface === 'admin' || r.surface === 'public')).toBe(true);
  });
});

describe('the host decides the surface, by exact match (SEC-A-50)', () => {
  const hosts = { adminHost: 'admin.example.test', publicHost: 'forms.example.test' };

  it.each([
    ['admin.example.test', 'admin'],
    ['ADMIN.example.test', 'admin'],
    ['forms.example.test', 'public'],
  ])('%s is the %s surface', (host, surface) => {
    expect(surfaceOfHost(host, hosts)).toBe(surface);
  });

  it.each([null, '', 'example.test', 'admin.example.test.evil.example', 'xadmin.example.test', 'admin.example.test:8080', 'admin.example.test.', 'forms.example.test@admin.example.test'])(
    '%j is neither surface',
    (host) => {
      expect(surfaceOfHost(host, hosts)).toBeNull();
    },
  );
});
