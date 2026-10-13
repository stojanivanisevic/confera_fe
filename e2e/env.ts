// Addresses of the local test stack (ADR-24: web 3000, harness 4000).
//
// Two host names without any DNS or hosts-file change: `localhost` and
// `127.0.0.1` are different hosts (and different sites) for a browser.
//   public surface  http://localhost:3000    hosted forms, the embed frame
//   admin surface   http://127.0.0.1:3000    admin, sign-in, /api/v1
//   harness         http://127.0.0.1:4000    a "conference site" that is listed for the spike form
//   unlisted site   http://127.0.0.1:4001    a site that is NOT listed
//   API stub        http://127.0.0.1:3101    answers GET /api/v1/meta from the vendored contract
// The harness (127.0.0.1) and the public surface (localhost) are different
// sites, so the frame is a real third-party frame.
export const WEB_PORT = 3000;
export const PUBLIC_ORIGIN = `http://localhost:${WEB_PORT}`;
export const ADMIN_ORIGIN = `http://127.0.0.1:${WEB_PORT}`;
export const HARNESS_ORIGIN = 'http://127.0.0.1:4000';
export const UNLISTED_ORIGIN = 'http://127.0.0.1:4001';
export const API_STUB_ORIGIN = 'http://127.0.0.1:3101';

/** The same application in development mode (React's development build), for the hydration check. */
export const DEV_PORT = 3100;
export const DEV_PUBLIC_ORIGIN = `http://localhost:${DEV_PORT}`;
export const DEV_ADMIN_ORIGIN = `http://127.0.0.1:${DEV_PORT}`;

/** Environment of the web application under test. It does not depend on a local .env file. */
export const webEnv = (port: number): Record<string, string> => ({
  STAGE: 'test',
  CONFERA_PUBLIC_ORIGIN: `http://localhost:${port}`,
  CONFERA_ADMIN_ORIGIN: `http://127.0.0.1:${port}`,
  CONFERA_API_ORIGIN: API_STUB_ORIGIN,
  PORT: String(port),
});
