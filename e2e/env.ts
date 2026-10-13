// Addresses of the local test stack (ADR-24: web 3000, harness 4000).
//
// Two host names without any DNS or hosts-file change: `localhost` and
// `127.0.0.1` are different hosts (and different sites) for a browser. They
// are the same pair, with the same roles, as in confera_be.
//   admin surface   http://localhost:3000    admin, sign-in, /api/v1
//   public surface  http://127.0.0.1:3000    hosted forms, the embed frame, /public/v1
//   harness         http://localhost:4000    a "conference site" that is listed for the spike form
//   unlisted site   http://localhost:4001    a site that is NOT listed
//   API stub        http://127.0.0.1:3101    behaves like the API of confera_be for GET /api/v1/meta
//   real API        http://127.0.0.1:3001    confera_be itself, only when CONFERA_E2E_API_ORIGIN names it
// The harness (localhost) and the public surface (127.0.0.1) are different
// sites, so the frame is a real third-party frame.
export const WEB_PORT = 3000;
export const ADMIN_ORIGIN = `http://localhost:${WEB_PORT}`;
export const PUBLIC_ORIGIN = `http://127.0.0.1:${WEB_PORT}`;
export const HARNESS_ORIGIN = 'http://localhost:4000';
export const UNLISTED_ORIGIN = 'http://localhost:4001';
export const API_STUB_ORIGIN = 'http://127.0.0.1:3101';

/**
 * The cross-repo smoke test (M1-QA-02; README, "Against the real API"): when the variable
 * CONFERA_E2E_API_ORIGIN names a confera_be that runs on this machine, the web application
 * under test forwards to it and not to the stub. Nothing else changes.
 *
 * Only an address of this machine is taken: `http://127.0.0.1:<port>` or
 * `http://localhost:<port>`. The browser tests send odd and hostile requests; they must
 * never be pointed at a server.
 */
export function realApiOrigin(value: string | undefined): string | null {
  if (value === undefined || value.trim() === '') return null;
  const refuse = (why: string): never => {
    throw new Error(`CONFERA_E2E_API_ORIGIN is "${value}": ${why}. Write it as http://127.0.0.1:3001 (the API of confera_be on this machine), or leave it unset to use the stub.`);
  };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return refuse('it is not an address');
  }
  if (url.protocol !== 'http:') refuse('only http is taken');
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') refuse('only this machine is taken (127.0.0.1 or localhost)');
  if (url.port === '') refuse('the port is missing');
  if (url.username !== '' || url.password !== '') refuse('an address with a user or a password is not taken');
  if (value !== url.origin) refuse('it must be an origin and nothing more (no path, no query)');
  if (url.origin === API_STUB_ORIGIN) refuse('that is the address of the stub');
  return url.origin;
}

/** The real API of this run, or null when the run uses the stub. */
export const REAL_API_ORIGIN = realApiOrigin(process.env.CONFERA_E2E_API_ORIGIN);
/** The API the web application under test forwards to. */
export const API_ORIGIN = REAL_API_ORIGIN ?? API_STUB_ORIGIN;

/** The same application in development mode (React's development build), for the hydration check. */
export const DEV_PORT = 3100;
export const DEV_ADMIN_ORIGIN = `http://localhost:${DEV_PORT}`;
export const DEV_PUBLIC_ORIGIN = `http://127.0.0.1:${DEV_PORT}`;

/** Environment of the web application under test. It does not depend on a local .env file. */
export const webEnv = (port: number): Record<string, string> => ({
  STAGE: 'test',
  CONFERA_ADMIN_ORIGIN: `http://localhost:${port}`,
  CONFERA_PUBLIC_ORIGIN: `http://127.0.0.1:${port}`,
  CONFERA_API_ORIGIN: API_ORIGIN,
  PORT: String(port),
});
