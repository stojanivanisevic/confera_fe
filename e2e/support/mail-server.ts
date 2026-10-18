// A default mail server of organisation A that sends to the mail catcher of a real confera_be
// (README, "Against the real API"). A spec that waits for an email calls `ensureMailServer` in
// its own setup, so that it never depends on another spec having added one (on a fresh
// `seed:e2e` the outbox would otherwise wait with `waiting_for_server`). The same server as
// qa-real-api-flows.spec.ts adds through the screens: 127.0.0.1, the catcher's SMTP port, no TLS
// (refused by confera_be unless its STAGE is local, dev or test), default, enabled.
//
// Through the web application's forward, as the admin screens call it: the session cookie, the
// CSRF value of the session and the admin surface's Origin; the password asked again before the
// change (`x-confera-fresh-password`). No browser is involved, so it works in every engine, also
// in WebKit, which keeps no Secure cookie on http://localhost. Idempotent: a matching default
// server is left as it is.
import { ADMIN_ORIGIN } from '../env';
import { ADMIN, AGAINST_REAL_API } from './admin';

export const MAILPIT_SMTP_PORT = Number(process.env.CONFERA_E2E_MAILPIT_SMTP_PORT ?? '1025');
const HOST = '127.0.0.1';

interface MailServer { readonly host: string; readonly port: number; readonly isDefault: boolean; readonly enabled: boolean; readonly tlsMode: string }

async function call(path: string, init: { method?: string; cookie?: string; csrf?: string; body?: unknown } = {}): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json', Origin: ADMIN_ORIGIN };
  if (init.cookie) headers.Cookie = init.cookie;
  if (init.csrf) headers['X-CSRF-Token'] = init.csrf;
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(`${ADMIN_ORIGIN}${path}`, { method: init.method ?? 'GET', headers, body: init.body === undefined ? undefined : JSON.stringify(init.body), redirect: 'manual' });
}

async function expectOk(response: Response, what: string): Promise<void> {
  if (!response.ok) throw new Error(`ensureMailServer: ${what} answered ${response.status}: ${await response.text()}`);
}

/** Makes sure organisation A has an enabled default mail server that sends to the mail catcher. Against the stub: nothing. */
export async function ensureMailServer(): Promise<void> {
  if (!AGAINST_REAL_API) return;
  const signIn = await call('/api/v1/session', { method: 'POST', body: { email: ADMIN.email, password: ADMIN.password } });
  await expectOk(signIn, 'the sign-in');
  const cookie = signIn.headers.getSetCookie().map((line) => line.split(';')[0]!).join('; ');
  const { csrf } = (await signIn.json()) as { csrf: string };
  try {
    const list = await call('/api/v1/mail-servers', { cookie });
    await expectOk(list, 'the list of mail servers');
    const { items } = (await list.json()) as { items: MailServer[] };
    if (items.some((server) => server.isDefault && server.enabled && server.host === HOST && server.port === MAILPIT_SMTP_PORT && server.tlsMode === 'none')) return;
    await expectOk(await call('/api/v1/session/password-confirmation', { method: 'POST', cookie, csrf, body: { password: ADMIN.password } }), 'the password asked again');
    const created = await call('/api/v1/mail-servers', {
      method: 'POST',
      cookie,
      csrf,
      body: { name: `Mailpit e2e ${Date.now().toString(36)}`, host: HOST, port: MAILPIT_SMTP_PORT, tlsMode: 'none', fromAddress: 'office@a.example.test', fromName: 'Udruženje za probe A', isDefault: true, enabled: true },
    });
    await expectOk(created, 'adding the mail server');
  } finally {
    await call('/api/v1/session', { method: 'DELETE', cookie, csrf });
  }
}
