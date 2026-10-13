/**
 * Runs once when the server starts, before any request is answered.
 * The configuration is checked here, so a bad one stops the start
 * (./server/startup-guard).
 */
export async function register(): Promise<void> {
  // eslint-disable-next-line no-restricted-syntax -- NEXT_RUNTIME is not configuration: the framework fills it in at build time, and the bundler needs it written out here to leave the Node-only guard out of any other runtime
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { refuseToStartOnBadConfiguration } = await import('./server/startup-guard');
    refuseToStartOnBadConfiguration();
  }
}
