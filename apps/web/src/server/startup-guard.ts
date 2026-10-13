import { ConfigError, getConfig } from '@/config/env';

/**
 * Stops the start of the server on an invalid configuration (ADR-24, ADR-02):
 * a missing or misspelt STAGE, a non-production stage on a public origin, one
 * host name for both surfaces, a DEV_ variable on prod. It says which
 * variables are wrong, never their values, and ends the process.
 * Node only: it is loaded by instrumentation.ts for the Node runtime.
 */
export function refuseToStartOnBadConfiguration(): void {
  try {
    getConfig();
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    console.error(`\n${error.message}\n\nThe web application did not start. See .env.example.\n`);
    process.exit(1);
  }
}
