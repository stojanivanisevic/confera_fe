/**
 * What a production build gets in place of the spike fixtures: nothing.
 * `#dev-fixtures` points here unless the build is made with `--dev-pages`
 * (next.config.ts), so no fixture text exists in a production build (ADR-24).
 */
import type { DevFixtures } from './dev-fixtures.types';

export const devFixtures: DevFixtures = { forms: {} };
