// Where `pnpm dev` and `pnpm start` listen (ADR-24; the disposition of SEC-A-03:
// "non-production only on loopback"). The same rule, variable and defaults as confera_be.
//
// The origins of the two surfaces say which host NAMES the application answers to, but the
// Host header is written by the client: who can reach the server is decided by the address
// it listens on. Next listens on every address of the machine unless it is told otherwise,
// and the web application forwards /api/v1 with the client's Host header to an API that
// itself listens on loopback only. So local, dev and test listen on loopback, and a
// LISTEN_HOST that is not a loopback address stops the start on those stages.
//
//   LISTEN_HOST   default 127.0.0.1 outside prod (this machine only), 0.0.0.0 on prod
//                 (inside its container, behind the reverse proxy)

export const LOOPBACK_ONLY =
  'on STAGE=local, dev or test the web application must listen on a loopback address only (127.0.0.1, ::1 or localhost): these stages run only on a developer machine, and every server runs STAGE=prod';

/** An address only this machine can reach: 127.0.0.0/8, ::1 or localhost. A `.test` name is none: it may resolve to any interface. */
export function isLoopbackAddress(listenHost) {
  const host = listenHost.toLowerCase();
  return (
    host === 'localhost' ||
    host === '::1' ||
    host === '[::1]' ||
    /^127\.(25[0-5]|2[0-4]\d|1?\d?\d)\.(25[0-5]|2[0-4]\d|1?\d?\d)\.(25[0-5]|2[0-4]\d|1?\d?\d)$/.test(host)
  );
}

/**
 * The address the server listens on, or why it may not start.
 * @param {Readonly<Record<string, string | undefined>>} env
 * @returns {{ host: string } | { problem: string }}
 */
export function listenHost(env) {
  const prod = env.STAGE === 'prod';
  const value = env.LISTEN_HOST === undefined || env.LISTEN_HOST === '' ? (prod ? '0.0.0.0' : '127.0.0.1') : env.LISTEN_HOST;
  if (!/^[A-Za-z0-9.:[\]-]+$/.test(value)) return { problem: 'LISTEN_HOST must be an IP address or a host name without spaces' };
  if (!prod && !isLoopbackAddress(value)) return { problem: `LISTEN_HOST ${LOOPBACK_ONLY}` };
  return { host: value.replace(/^\[(.*)\]$/, '$1') };
}
