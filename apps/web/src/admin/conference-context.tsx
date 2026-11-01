'use client';

/**
 * The conference switch (M2-FE-03): the conference the office works on, kept across screens.
 * It lives in the admin layout, which stays mounted while the person moves between screens,
 * and in the tab's session storage, so a reload keeps it too. "All conferences" is no choice
 * (null). A conference that no longer exists, or that the person may not read, is dropped.
 *
 * After a load of the page the choice kept in the tab is known by its id only, until the list of
 * conferences arrives. Until then the choice is not settled: a screen the switch narrows waits
 * (`useLoad(..., { wait: !settled })`) instead of showing every conference and, a moment later, the
 * chosen one in its place, which moved the rows under the person's click and could open a row of
 * the wrong list.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { Conference } from '@congresa/api-client';

import { call } from './problems';
import { useSession } from './session';

const STORAGE_KEY = 'congresa.conference';

export interface ConferenceState {
  /** The conferences of the organisation, when the person may read them and they arrived. */
  readonly conferences: readonly Conference[];
  /** The chosen conference, or null for all. */
  readonly selected: Conference | null;
  /** False while a conference is chosen but the list of conferences has not answered yet: `selected` does not say the choice yet. */
  readonly settled: boolean;
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
  // The list has answered once (or failed): from then on `selected` says what is chosen.
  const [listed, setListed] = useState(false);
  const [chosen, setChosen] = useState<string | null>(() => (typeof window === 'undefined' ? null : stored()));

  const reload = useCallback(
    (): Promise<void> =>
      mayRead
        ? call(background.GET('/api/v1/conferences')).then(
            (list) => {
              setConferences(list.items);
              setListed(true);
            },
            () => setListed(true),
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

  // Nothing chosen, or nothing to wait for (a person who may not read conferences sees no switch): settled at once.
  const settled = chosen === null || listed || (session !== null && !mayRead);
  const value = useMemo<ConferenceState>(() => {
    const selected = chosen === null ? null : (conferences.find((conference) => conference.id === chosen) ?? null);
    return { conferences, selected, settled, select, reload };
  }, [conferences, chosen, settled, select, reload]);
  return <ConferenceContext.Provider value={value}>{children}</ConferenceContext.Provider>;
}

export function useConference(): ConferenceState {
  const value = useContext(ConferenceContext);
  if (!value) throw new Error('useConference must be used inside ConferenceProvider');
  return value;
}

/** How a conference is named in a list: its name, code and edition. */
export const conferenceLabel = (conference: Pick<Conference, 'name' | 'code' | 'editionYear'>): string => `${conference.name} (${conference.code}${conference.editionYear ? ` ${String(conference.editionYear)}` : ''})`;
