/**
 * Every route of the web application has a kind and a surface (ADR-28, ADR-02).
 * The list itself is routes.json, so that the build check (pnpm verify:build)
 * and the tests read the same declaration. A path that matches nothing here is
 * not found.
 */
import { devFixtures } from '#dev-fixtures';

import declared from './routes.json';

export type RouteKind = 'admin' | 'auth' | 'hosted-form' | 'frame' | 'secure-link' | 'dev' | 'asset' | 'admin-api' | 'public-api';
/** Which host name may answer: the admin's, the public one, or both. */
export type Surface = 'admin' | 'public' | 'any';

export interface RouteMatch {
  readonly kind: RouteKind;
  readonly surface: Surface;
  /** The declared pattern, for example `/embed/[form]`. */
  readonly route: string;
  /** Values of the `[name]` parts of the pattern. */
  readonly params: Readonly<Record<string, string>>;
}

interface DeclaredRoute {
  route: string;
  kind: string;
  surface: string;
  planned?: string;
}

const KINDS: readonly RouteKind[] = ['admin', 'auth', 'hosted-form', 'frame', 'secure-link', 'dev', 'asset', 'admin-api', 'public-api'];
const SURFACES: readonly Surface[] = ['admin', 'public', 'any'];

function checked<T extends string>(value: string, allowed: readonly T[], what: string): T {
  if (!(allowed as readonly string[]).includes(value)) throw new Error(`routes.json: unknown ${what} "${value}"`);
  return value as T;
}

/** `/embed/[form]` → a pattern that matches one path segment per `[name]`. */
function compile(route: string): { regex: RegExp; names: string[] } {
  const names: string[] = [];
  const source = route
    .split('/')
    .map((segment) => {
      const param = /^\[([a-z]+)\]$/.exec(segment);
      if (!param) return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      names.push(param[1]!);
      return '([^/]+)';
    })
    .join('/');
  return { regex: new RegExp(`^${source}$`), names };
}

const compiled = (entry: DeclaredRoute, devOnly: boolean) => ({
  ...compile(entry.route),
  route: entry.route,
  kind: checked(entry.kind, KINDS, 'kind'),
  surface: checked(entry.surface, SURFACES, 'surface'),
  devOnly,
});
// The routes of a test build come with the dev fixtures; a production build has none.
const ROUTES = [...(declared.routes as DeclaredRoute[]).map((entry) => compiled(entry, false)), ...devFixtures.routes.map((entry) => compiled(entry, true))];

const FORWARDED = declared.forwarded.map((entry) => ({
  prefix: entry.prefix,
  kind: checked(entry.kind, KINDS, 'kind'),
  surface: checked(entry.surface, SURFACES, 'surface'),
}));

/**
 * The kind of a path, or null when no route is declared for it.
 * `devPages` says whether this build contains the dev-only routes.
 */
export function classifyRoute(pathname: string, devPages: boolean): RouteMatch | null {
  for (const forwarded of FORWARDED) {
    if (pathname.startsWith(forwarded.prefix)) return { kind: forwarded.kind, surface: forwarded.surface, route: `${forwarded.prefix}*`, params: {} };
  }
  // One trailing slash is the same page.
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  for (const candidate of ROUTES) {
    if (candidate.devOnly && !devPages) continue;
    const match = candidate.regex.exec(path);
    if (!match) continue;
    const params: Record<string, string> = {};
    candidate.names.forEach((name, index) => (params[name] = match[index + 1]!));
    return { kind: candidate.kind, surface: candidate.surface, route: candidate.route, params };
  }
  return null;
}

/** The surface a Host header belongs to, or null when it is neither host name of this installation. */
export function surfaceOfHost(host: string | null, hosts: { adminHost: string; publicHost: string }): Exclude<Surface, 'any'> | null {
  const value = host?.toLowerCase() ?? '';
  if (value === hosts.adminHost) return 'admin';
  if (value === hosts.publicHost) return 'public';
  return null;
}

export const DECLARED_ROUTES: readonly { route: string; kind: RouteKind; surface: Surface; devOnly: boolean }[] = ROUTES.map(
  ({ route, kind, surface, devOnly }) => ({ route, kind, surface, devOnly }),
);
