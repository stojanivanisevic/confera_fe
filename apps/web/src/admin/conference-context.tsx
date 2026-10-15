'use client';

/**
 * The conference switch (M2-FE-03): the conference the office works on, kept across screens.
 * It lives in the admin layout, which stays mounted while the person moves between screens,
 * and in the tab's session storage, so a reload keeps it too. "All conferences" is no choice
 * (null). A conference that no longer exists, or that the person may not read, is dropped.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { Conference } from '@confera/api-client';

import { call } from './problems';
import { useSession } from './session';

const STORAGE_KEY = 'confera.conference';

export interface ConferenceState {
  /** The conferences of the organisation, when the person may read them and they arrived. */
  readonly conferences: readonly Conference[];
  /** The chosen conference, or null for all. */
  readonly selected: Conference | null;
  readonly select: (id: string | null) => void;
  /** Reads the list again (after a create, a copy, a change of name or state). */
  readonly reload: () => Promise<void>;
}

const ConferenceContext = createContext<ConferenceState | null>(null);

function stored(): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function store(id: string | null): void {
  try {
    if (id === null) window.sessionStorage.removeItem(STORAGE_KEY);
    else window.sessionStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Without storage the choice still holds while the page is open.
  }
}

export function ConferenceProvider({ children }: { children: ReactNode }) {
  const { session, background } = useSession();
  const mayRead = session?.user.permissions.includes('conferences.read') ?? false;
  const [conferences, setConferences] = useState<readonly Conference[]>([]);
  const [chosen, setChosen] = useState<string | null>(() => (typeof window === 'undefined' ? null : stored()));

  const reload = useCallback(
    (): Promise<void> =>
      mayRead
        ? call(background.GET('/api/v1/conferences')).then(
            (list) => setConferences(list.items),
            () => undefined,
          )
        : Promise.resolve(),
    [mayRead, background],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const select = useCallback((id: string | null) => {
    store(id);
    setChosen(id);
  }, []);

  const value = useMemo<ConferenceState>(() => {
    const selected = chosen === null ? null : (conferences.find((conference) => conference.id === chosen) ?? null);
    return { conferences, selected, select, reload };
  }, [conferences, chosen, select, reload]);
  return <ConferenceContext.Provider value={value}>{children}</ConferenceContext.Provider>;
}

export function useConference(): ConferenceState {
  const value = useContext(ConferenceContext);
  if (!value) throw new Error('useConference must be used inside ConferenceProvider');
  return value;
}

/** How a conference is named in a list: its name, code and edition. */
export const conferenceLabel = (conference: Pick<Conference, 'name' | 'code' | 'editionYear'>): string => `${conference.name} (${conference.code}${conference.editionYear ? ` ${String(conference.editionYear)}` : ''})`;
