'use client';

/**
 * The admin shell (M2-FE-01): the design system's AppShell with the navigation, the conference
 * switch (a placeholder until the conference screens of M2-FE-03), the person's menu, and the
 * guard of the session. Without a session the person goes to sign-in and comes back to the
 * same page afterwards (the `next` rule); while the API does not answer, the shell says so.
 */
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { Alert, AppShell, Button, Select, SidebarNav, Spinner, TextButton, ToastHost } from '@confera/ui';

import { signInHref } from '@/lib/next-path';

import styles from './admin.module.css';
import { FreshPasswordProvider } from './FreshPassword';
import { call, callEmpty } from './problems';
import { SessionProvider, useSession } from './session';
import { fill, TEXTS } from './texts';

const NAV = [
  { value: '/', label: TEXTS.nav.home, icon: 'home' as const },
  { value: '/users', label: TEXTS.nav.users, icon: 'users' as const },
  { value: '/organisation', label: TEXTS.nav.organisation, icon: 'settings' as const },
  { value: '/audit', label: TEXTS.nav.audit, icon: 'file-text' as const },
  { value: '/account', label: TEXTS.nav.account, icon: 'user' as const },
];

/** The entry of the navigation a path belongs to: the longest prefix. */
function current(pathname: string): string {
  const match = NAV.filter((item) => item.value === '/' ? pathname === '/' : pathname === item.value || pathname.startsWith(`${item.value}/`)).sort((a, b) => b.value.length - a.value.length)[0];
  return match?.value ?? '/';
}

function Guarded({ children }: { children: ReactNode }) {
  const { status, session, refresh, client, background, clear, contact, setContact } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'signed-out') router.replace(signInHref(pathname));
  }, [status, router, pathname]);

  // The support contact of the organisation (decision D8 pending): read in the background, once a
  // session is there, by those who may read the profile; without it the messages say "another admin".
  const mayReadOrganisation = session?.user.permissions.includes('organisation.read') ?? false;
  useEffect(() => {
    if (status !== 'ready' || !mayReadOrganisation) return;
    let current = true;
    call(background.GET('/api/v1/organisation')).then(
      (organisation) => {
        if (current) setContact(organisation.contactEmail);
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [status, mayReadOrganisation, background, setContact]);

  if (status === 'loading' || status === 'signed-out') {
    return (
      <div className={styles.center} aria-busy="true">
        <Spinner label={TEXTS.common.loading} />
      </div>
    );
  }
  if (status === 'unreachable' || !session) {
    return (
      <div className={styles.auth}>
        <Alert tone="error" title={TEXTS.connection.down} action={<Button variant="dark" onClick={() => void refresh()}>{TEXTS.connection.tryAgain}</Button>}>
          {contact ? fill(TEXTS.connection.downText, { contact }) : TEXTS.connection.downTextNoContact}
        </Alert>
      </div>
    );
  }

  const signOut = async () => {
    try {
      await callEmpty(client.DELETE('/api/v1/session'));
    } finally {
      clear();
      router.replace('/sign-in');
    }
  };

  return (
    <AppShell
      product={TEXTS.product}
      logo={<img src="/icon.png" alt="" width={28} height={28} />}
      sidebar={<SidebarNav label={TEXTS.nav.main} value={current(pathname)} items={NAV.map((item) => ({ ...item, href: item.value }))} onNavigate={(value) => router.push(value)} />}
      topbar={
        <div className={styles.topbar}>
          <div className={styles.conference}>
            <Select label={TEXTS.nav.conferences} value="all" options={[{ value: 'all', label: TEXTS.nav.allConferences }]} disabled message={TEXTS.nav.conferenceSwitchHint} onChange={() => undefined} />
          </div>
          <div className={styles.topbarEnd}>
            <span className={styles.small} data-confera-user>
              {session.user.displayName}
            </span>
            <TextButton icon="log-out" onClick={() => void signOut()}>
              {TEXTS.nav.signOut}
            </TextButton>
          </div>
        </div>
      }
    >
      <FreshPasswordProvider>{children}</FreshPasswordProvider>
    </AppShell>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ToastHost />
      <Guarded>{children}</Guarded>
    </SessionProvider>
  );
}
