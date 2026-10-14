/**
 * Spike fixtures of 0.1.0: the forms the embed harness uses. This module is
 * compiled only into a test build (`--dev-pages`); a production build gets
 * dev-fixtures.none.ts instead. Addresses are the local harness of ADR-24: a site on
 * another host name than the public surface (127.0.0.1), so the frame is a third-party frame.
 */
import type { DevFixtures } from './dev-fixtures.types';

export const devFixtures: DevFixtures = {
  forms: {
    // Listed on the harness site only.
    'spike-abstract': { sites: ['http://localhost:4000'] },
    // A form with an empty site list: it may be framed nowhere.
    'spike-unlisted': { sites: [] },
  },
  routes: [
    { route: '/dev/gallery', kind: 'dev', surface: 'any' },
    // A page that fails while it is rendered: what the framework's error page carries (ADR-28).
    { route: '/dev/render-error', kind: 'dev', surface: 'any' },
  ],
};
