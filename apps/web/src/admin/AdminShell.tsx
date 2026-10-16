'use client';

/**
 * The admin shell (M2-FE-01, M2-FE-03): the design system's AppShell with the navigation (the
 * entries the person's permissions allow), the conference switch, kept across screens, the
 * person's menu, and the guard of the session. Without a session the person goes to sign-in and comes back to the
 * same page afterwards (the `next` rule); while the API does not answer, the shell says so.
 */
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { Alert, AppShell, Button, Select, SidebarNav, Spinner, TextButton, ToastHost } from '@confera/ui';

import { signInHref } from '@/lib/next-path';

import styles from './admin.module.css';
import { FreshPasswordProvider } from './FreshPassword';
import { conferenceLabel, ConferenceProvider, useConference } from './conference-context';
import { call, callEmpty } from './problems';
import { SessionProvider, useSession } from './session';
import { fill, TEXTS } from './texts';

// An entry shows when the person holds its permission; a screen reached by its address still says "not allowed".
const NAV = [
  { value: '/', label: TEXTS.nav.home, icon: 'home' as const, permission: null },
  { value: '/conferences', label: TEXTS.nav.conferenceList, icon: 'calendar' as const, permission: 'conferences.read' },
  { value: '/templates', label: TEXTS.nav.templates, icon: 'mail' as const, permission: 'templates.read' },
  { value: '/mail-log', label: TEXTS.nav.mailLog, icon: 'inbox' as const, permission: 'mail_log.read' },
  { value: '/mail-servers', label: TEXTS.nav.mailServers, icon: 'send' as const, permission: 'mail_servers.read' },
  { value: '/users', label: TEXTS.nav.users, icon: 'users' as const, permission: 'users.read' },
  { value: '/organisation', label: TEXTS.nav.organisation, icon: 'settings' as const, permission: 'organisation.read' },
  { value: '/audit', label: TEXTS.nav.audit, icon: 'file-text' as const, permission: 'audit.read' },
  { value: '/account', label: TEXTS.nav.account, icon: 'user' as const, permission: null },
];

/** The entry of the navigation a path belongs to: the longest prefix. */
function current(pathname: string): string {
  const match = NAV.filter((item) => item.value === '/' ? pathname === '/' : pathname === item.value || pathname.startsWith(`${item.value}/`)).sort((a, b) => b.value.length - a.value.length)[0];
  return match?.value ?? '/';
}

/** The conference switch: the conference the screens show, kept while the person moves between them. */
function ConferenceSwitch() {
  const { conferences, selected, select } = useConference();
  return (
    <Select
      label={TEXTS.nav.conferences}
      value={selected?.id ?? ''}
      options={[{ value: '', label: TEXTS.nav.allConferences }, ...conferences.map((conference) => ({ value: conference.id, label: conferenceLabel(conference) }))]}
      onChange={(event) => select(event.target.value === '' ? null : event.target.value)}
      data-confera-conference-switch
    />
  );
}

function Guarded({ children }: { children: ReactNode }) {
  const { status, session, refresh, client, background, clear, contact, setContact } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'signed-out') router.replace(signInHref(pathname));
    // The session ran out or was ended elsewhere: sign-in says so, and leads back here (E2-20).
    if (status === 'expired') router.replace(signInHref(pathname, 'session-ended'));
    if (status === 'ended') router.replace('/sign-in');
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

  if (status === 'loading' || status === 'signed-out' || status === 'expired' || status === 'ended') {
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
      clear('ended');
    }
  };

  const permissions = session.user.permissions;
  const nav = NAV.filter((item) => item.permission === null || permissions.includes(item.permission)).map(({ value, label, icon }) => ({ value, label, icon, href: value }));

  return (
    <ConferenceProvider>
      <AppShell
        product={TEXTS.product}
        logo={<img src="/icon.png" alt="" width={28} height={28} />}
        sidebar={<SidebarNav label={TEXTS.nav.main} value={current(pathname)} items={nav} onNavigate={(value) => router.push(value)} />}
        topbar={
          <div className={styles.topbar}>
            <div className={styles.conference}>{permissions.includes('conferences.read') ? <ConferenceSwitch /> : null}</div>
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
    </ConferenceProvider>
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
