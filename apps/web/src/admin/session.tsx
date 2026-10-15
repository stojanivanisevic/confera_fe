'use client';

/**
 * The session of the signed-in person (ADR-03, ADR-20): what GET /api/v1/session says, the
 * CSRF value of the session for every changing request, and the clients the screens call the
 * API with. The web application never reads the session cookie; the API decides.
 *
 * `status`:
 *   loading      the first question to the API is on its way
 *   ready        a session: `session` holds the person, the organisation and the CSRF value
 *   signed-out   no session (401): the shell sends the person to sign-in
 *   unreachable  the API gave no answer: the shell says so and offers to try again
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { createSessionClient, hasFreshPassword, type Session, type SessionClient } from '@confera/api-client';

import { call, isUnauthenticated } from './problems';

/** `signed-out`: the API has no session (a screen sends to sign-in and comes back afterwards); `ended`: the person signed out (sign-in, without a way back). */
export type SessionStatus = 'loading' | 'ready' | 'signed-out' | 'ended' | 'unreachable';

export interface SessionState {
  readonly status: SessionStatus;
  readonly session: Session | null;
  /** The client of what the person asked for. */
  readonly client: SessionClient;
  /** The client of a refetch the person did not ask for: it does not renew the session. */
  readonly background: SessionClient;
  /** Asks the API for the session again (after sign-in, a password confirmation, a change of the person). */
  readonly refresh: (options?: { background?: boolean }) => Promise<Session | null>;
  /** Forgets the session: `ended` after a sign-out by the person, otherwise when the API says 401. */
  readonly clear: (how?: 'ended') => void;
  /** The password asked again is still valid in this session. */
  readonly fresh: () => boolean;
  /** Remembers a confirmation the API just gave, without a round trip. */
  readonly confirmed: (validUntil: string) => void;
  /** The support contact of the organisation (decision D8 pending: the contact email of the profile), when known. */
  readonly contact: string | null;
  readonly setContact: (contact: string | null) => void;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [contact, setContact] = useState<string | null>(null);
  // The clients are made once; they hold the CSRF value themselves, given when a session comes or goes.
  const [clients] = useState(() => createSessionClient());

  const take = useCallback(
    (next: Session | null, nextStatus: SessionStatus) => {
      clients.setCsrf(next?.csrf ?? null);
      setSession(next);
      setStatus(nextStatus);
    },
    [clients],
  );

  const refresh = useCallback(
    (options: { background?: boolean } = {}): Promise<Session | null> =>
      call((options.background ? clients.background : clients.client).GET('/api/v1/session')).then(
        (next) => {
          take(next, 'ready');
          return next;
        },
        (error: unknown) => {
          if (isUnauthenticated(error)) take(null, 'signed-out');
          else setStatus('unreachable');
          return null;
        },
      ),
    [clients, take],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<SessionState>(
    () => ({
      status,
      session,
      client: clients.client,
      background: clients.background,
      refresh,
      clear: (how) => take(null, how ?? 'signed-out'),
      fresh: () => hasFreshPassword(session),
      confirmed: (validUntil) => setSession((current) => (current ? { ...current, confirmationValidUntil: validUntil } : current)),
      contact,
      setContact,
    }),
    [status, session, clients, refresh, take, contact],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
