// The routes that exist only in a test build, and the list `pnpm verify:build` checks a production
// build against (scripts/verify-build.mjs, DEV_ONLY_MARKERS). A route added to the application and
// forgotten in that list could reach a production build unseen; one dropped from the list goes
// unchecked. So the list is held to what the source says, without typing the routes twice:
//  - a test-build-only page is a page file with the extension .dev.tsx or .dev.ts under
//    apps/web/src/app (next.config.ts treats that extension as a page only with --dev-pages);
//  - its declaration is in the dev fixtures (apps/web/src/server/dev-fixtures.dev.ts), with the
//    forms only the test build has.
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { devFixtures } from '../apps/web/src/server/dev-fixtures.dev';
// @ts-expect-error -- plain Node script without type declarations
import { DEV_ONLY_MARKERS } from '../scripts/verify-build.mjs';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const appDir = join(root, 'apps', 'web', 'src', 'app');
const markers = DEV_ONLY_MARKERS as string[];

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

/** The route of a page file: its folders under app/, without route groups such as `(public)`. */
const routeOf = (pageFile: string) =>
  `/${relative(appDir, dirname(pageFile))
    .split(/[\\/]/)
    .filter((segment) => segment !== '' && !/^\(.*\)$/.test(segment))
    .join('/')}`;

/** Every page that exists only in a test build, read from the files. */
const devPages = filesUnder(appDir)
  .filter((file) => /[\\/]page\.dev\.tsx?$/.test(file))
  .map(routeOf)
  .sort();

/** The markers of verify-build that name a route (the others name a form, a module or an attribute). */
const routeMarkers = markers
  .filter((marker) => marker.includes('/'))
  .map((marker) => `/${marker}`)
  .sort();

describe('the test-build-only routes and the list verify-build checks', () => {
  it('the source has test-build-only pages (the derivation finds them)', () => {
    expect(devPages).toContain('/dev/gallery');
    expect(devPages.length).toBeGreaterThanOrEqual(2);
  });

  it('every test-build-only page is declared in the dev fixtures, and every declaration has a page', () => {
    expect(devFixtures.routes.map((route) => route.route).sort()).toEqual(devPages);
  });

  it('verify-build looks for exactly those routes in a production build', () => {
    expect(routeMarkers).toEqual(devPages);
  });

  it('and for every form that only the test build has', () => {
    for (const slug of Object.keys(devFixtures.forms)) expect(markers, slug).toContain(slug);
  });
});
