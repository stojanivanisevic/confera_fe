// The admin API as a signed-in browser uses it (ADR-03, M2-FE-01).
//
// A session is a `__Host-` cookie the browser holds and the API sets; the web application
// never reads it. What the application holds is the CSRF value of the session, which
// GET /api/v1/session hands out, and which every changing request carries in the header
// `X-CSRF-Token`. A request the person did not ask for (a refetch in the background) says so
// with `X-Confera-Background`, and does not renew the session.
import createClient, { type Client, type Middleware } from 'openapi-fetch';

import type { components, paths as AdminPaths } from './generated/admin';

export type Session = components['schemas']['SessionDto'];
export type SessionUser = components['schemas']['SessionUserDto'];
export type UserRecord = components['schemas']['UserDto'];
export type UserPage = components['schemas']['UserPageDto'];
export type Organisation = components['schemas']['OrganisationDto'];
export type AuditEntry = components['schemas']['AuditEntryDto'];
export type AuditPage = components['schemas']['AuditPageDto'];
export type LinkPerson = components['schemas']['LinkPersonDto'];
export type EmailChangeLink = components['schemas']['EmailChangeLinkDto'];
export type Conference = components['schemas']['ConferenceDto'];
export type ConferenceState = Conference['state'];
export type MailServer = components['schemas']['MailServerDto'];
export type TestMessageResult = components['schemas']['TestMessageResultDto'];
export type MailLogSummary = components['schemas']['MailLogSummaryDto'];
export type MailLogPage = components['schemas']['MailLogPageDto'];
export type MailLogEntry = components['schemas']['MailLogEntryDto'];
export type MailTemplate = components['schemas']['MailTemplateDto'];
export type TemplateCatalogue = components['schemas']['TemplateCatalogueDto'];
/** A client of /api/v1 with the session's CSRF header on every changing request. */
export type SessionClient = Client<AdminPaths>;

/** The header of every changing request of a signed-in user: the CSRF value of the session (ADR-03). */
export const CSRF_HEADER = 'X-CSRF-Token';
/** The header of a request the person did not ask for: it does not renew the session. */
export const BACKGROUND_HEADER = 'X-Confera-Background';

const READING = new Set(['GET', 'HEAD']);

export interface SessionClientOptions {
  /** Origin to call. Empty in a browser: the application's own origin. */
  readonly baseUrl?: string;
  readonly fetch?: typeof globalThis.fetch;
}

export interface SessionClients {
  /** The client of what the person asked for. */
  readonly client: SessionClient;
  /** The client of a refetch the person did not ask for: it does not renew the session. */
  readonly background: SessionClient;
  /** Gives both clients the CSRF value of the session (from GET /api/v1/session), or null when the session is gone. */
  readonly setCsrf: (csrf: string | null) => void;
  /** The CSRF value the clients hold. */
  readonly csrf: () => string | null;
}

/**
 * Two clients for /api/v1 of a signed-in browser: the session cookie travels by itself
 * (same-origin), the CSRF header is added to every changing request once `setCsrf` was given
 * one, and nothing is cached. `background` marks a request as one the person did not ask for.
 */
export function createSessionClient(options: SessionClientOptions = {}): SessionClients {
  let csrf: string | null = null;
  const make = (background: boolean): SessionClient => {
    const client = createClient<AdminPaths>({ baseUrl: options.baseUrl ?? '', fetch: options.fetch, credentials: 'same-origin', cache: 'no-store' });
    const middleware: Middleware = {
      onRequest({ request }) {
        if (!READING.has(request.method) && csrf !== null) request.headers.set(CSRF_HEADER, csrf);
        if (background) request.headers.set(BACKGROUND_HEADER, '1');
        return request;
      },
    };
    client.use(middleware);
    return client;
  };
  return {
    client: make(false),
    background: make(true),
    setCsrf: (value) => {
      csrf = value;
    },
    csrf: () => csrf,
  };
}

/** The password asked again is still valid in this session (ADR-03: 5 minutes). */
export function hasFreshPassword(session: Pick<Session, 'confirmationValidUntil'> | null, now: number = Date.now()): boolean {
  if (!session?.confirmationValidUntil) return false;
  const until = Date.parse(session.confirmationValidUntil);
  // Half a minute of margin: a request sent at the last second would be refused on arrival.
  return Number.isFinite(until) && until - now > 30_000;
}
