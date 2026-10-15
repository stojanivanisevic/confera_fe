'use client';

/**
 * One request of a screen: what it gave, or what went wrong, with a way to ask again. A 401
 * forgets the session (the shell then sends the person to sign-in). A reload the person did
 * not ask for (after a change elsewhere on the page) is marked as background, so it does not
 * renew the session.
 */
import { useCallback, useEffect, useState } from 'react';

import type { SessionClient } from '@confera/api-client';

import { explain, isUnauthenticated, type Explained } from './problems';
import { useSession } from './session';

export type Loaded<T> = { readonly phase: 'loading'; readonly data: T | null } | { readonly phase: 'ready'; readonly data: T } | { readonly phase: 'failed'; readonly data: T | null; readonly problem: Explained };

export interface Load<T> {
  readonly state: Loaded<T>;
  /** Asks again. `background` for a refetch the person did not ask for. */
  readonly reload: (options?: { background?: boolean }) => Promise<void>;
  /** Replaces what is loaded without a request (after a change that answered with the new record). */
  readonly replace: (data: T) => void;
}

export function useLoad<T>(fetcher: (client: SessionClient) => Promise<T>, deps: readonly unknown[]): Load<T> {
  const { client, background, clear, contact } = useSession();
  const [state, setState] = useState<Loaded<T>>({ phase: 'loading', data: null });

  const reload = useCallback(
    async (options: { background?: boolean } = {}): Promise<void> => {
      setState((current) => ({ phase: 'loading', data: current.data }));
      try {
        const data = await fetcher(options.background ? background : client);
        setState({ phase: 'ready', data });
      } catch (error) {
        if (isUnauthenticated(error)) clear();
        setState((current) => ({ phase: 'failed', data: current.data, problem: explain(error, contact) }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller names what the request depends on
    [client, background, clear, contact, ...deps],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  return { state, reload, replace: (data) => setState({ phase: 'ready', data }) };
}
