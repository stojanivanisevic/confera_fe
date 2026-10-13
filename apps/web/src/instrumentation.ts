import { getConfig } from '@/config/env';

/**
 * Runs once when the server starts. An invalid configuration (a missing or
 * misspelt STAGE, a non-production stage on a public origin, one host name
 * for both surfaces) stops the start here (ADR-24, ADR-02).
 */
export function register(): void {
  getConfig();
}
