/**
 * The routes only a test build has. This module is compiled only into a test build
 * (`--dev-pages`); a production build gets dev-fixtures.none.ts instead. The forms of the browser
 * tests come from the API stub (e2e/servers/public-forms.json) since 0.3.0.
 */
import type { DevFixtures } from './dev-fixtures.types';

export const devFixtures: DevFixtures = {
  routes: [
    { route: '/dev/gallery', kind: 'dev', surface: 'any' },
    // A page that fails while it is rendered: what the framework's error page carries (ADR-28).
    { route: '/dev/render-error', kind: 'dev', surface: 'any' },
  ],
};
