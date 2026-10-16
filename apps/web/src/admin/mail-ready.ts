'use client';

/**
 * Whether Confera can send mail now (UXUI-M2-01): a mail server that is switched on exists. An
 * invitation made without one waits and goes out once a server is set up (the backend holds the
 * message); the screens say so instead of "sent". `null` while it is not known, or when the
 * person may not read the mail servers.
 */
import { useEffect, useState } from 'react';

import { call } from './problems';
import { useSession } from './session';

export function useMailReady(): boolean | null {
  const { session, background } = useSession();
  const mayRead = session?.user.permissions.includes('mail_servers.read') ?? false;
  const [ready, setReady] = useState<boolean | null>(null);
  useEffect(() => {
    if (!mayRead) return;
    let current = true;
    call(background.GET('/api/v1/mail-servers')).then(
      (list) => {
        if (current) setReady(list.items.some((server) => server.enabled));
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [mayRead, background]);
  return mayRead ? ready : null;
}

/** A plain check of an email address before anything is sent (the API checks it again). */
export const looksLikeAddress = (text: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim());
