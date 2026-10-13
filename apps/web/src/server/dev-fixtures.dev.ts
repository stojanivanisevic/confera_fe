/**
 * Spike fixtures of 0.1.0: the forms the embed harness uses. This module is
 * compiled only into a test build (`--dev-pages`); a production build gets
 * dev-fixtures.none.ts instead. Addresses are the local harness of ADR-24.
 */
import type { DevFixtures } from './dev-fixtures.types';

export const devFixtures: DevFixtures = {
  forms: {
    // Listed on the harness site only.
    'spike-abstract': { sites: ['http://127.0.0.1:4000'] },
    // A form with an empty site list: it may be framed nowhere.
    'spike-unlisted': { sites: [] },
  },
};
