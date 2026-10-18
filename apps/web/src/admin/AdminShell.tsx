'use client';

/**
 * The admin shell (M2-FE-01, M2-FE-03): the design system's AppShell with the navigation (the
 * entries the person's permissions allow), the conference switch, kept across screens, the
 * person's menu, and the guard of the session. Without a session the person goes to sign-in and comes back to the
 * same page afterwards (the `next` rule); while the API does not answer, the shell says so.
 */
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Alert, AppShell, Button, Menu, PageHeader, Select, SidebarNav, Spinner, TextButton, toast, ToastHost } from '@confera/ui';

import { signInHref } from '@/lib/next-path';

import styles from './admin.module.css';
import { FreshPasswordProvider } from './FreshPassword';
import { HeldMailAlert } from './HeldMail';
import { conferenceLabel, ConferenceProvider, useConference } from './conference-context';
import { DRAWER_EVENT } from './drawer-event';
import { call, callEmpty, SESSION_ENDED_EVENT } from './problems';
import { SessionProvider, useSession } from './session';
import { fill, TEXTS } from './texts';

// An entry shows when the person holds its permission; a screen reached by its address still says "not allowed".
const NAV = [
  { value: '/', label: TEXTS.nav.home, icon: 'home' as const, permission: null },
  { value: '/conferences', label: TEXTS.nav.conferenceList, icon: 'calendar' as const, permission: 'conferences.read' },
  { value: '/forms', label: TEXTS.nav.forms, icon: 'file-text' as const, permission: 'forms.read' },
  { value: '/submissions', label: TEXTS.nav.submissions, icon: 'list' as const, permission: 'submissions.read' },
  { value: '/held-mail', label: TEXTS.nav.heldMail, icon: 'clock' as const, permission: 'held_mail.manage' },
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

/** The screens the conference switch narrows; elsewhere it is not shown (UXUI-M2-05). */
const NARROWED = ['/mail-log', '/templates', '/forms', '/submissions'];
const narrows = (pathname: string) => NARROWED.some((path) => pathname === path || pathname.startsWith(`${path}/`));

/** The conference switch: what the mail log and the templates show, kept while the person moves between screens. */
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

/**
 * A change met a session that has ended (UXUI-M2-02): nothing on the page is lost. The person signs in
 * again in a new tab (the session cookie is shared), comes back and continues; the page reads the new
 * session (and its CSRF value) and the next save goes through.
 */
function SessionEnded({ onContinued }: { onContinued: () => void }) {
  const { refresh } = useSession();
  const pathname = usePathname();
  const [still, setStill] = useState(false);
  const t = TEXTS.problems;
  const goOn = async () => {
    const back = await refresh({ quiet: true });
    if (back) {
      onContinued();
      toast({ title: t.signedInAgain, tone: 'success' });
    } else {
      setStill(true);
    }
  };
  return (
    <div className={styles.banner} data-confera-session-ended>
      <Alert
        tone="warning"
        title={t.sessionEnded}
        action={
          <div className={styles.actionsInline}>
            <a className="ud-link" href={signInHref(pathname)} target="_blank" rel="noopener noreferrer">
              {t.signInNewTab}
            </a>
            <Button variant="dark" onClick={() => void goOn()}>
              {t.continue}
            </Button>
          </div>
        }
      >
        {still ? t.stillSignedOut : t.sessionEndedText}
      </Alert>
    </div>
  );
}

/** The API does not answer: the shell stays, the page says so in its content and tries again every 30 seconds (UXUI-M2-16). */
function Unreachable({ page = false }: { page?: boolean }) {
  const { refresh, contact } = useSession();
  useEffect(() => {
    const again = window.setInterval(() => void refresh({ background: true }), 30_000);
    return () => window.clearInterval(again);
  }, [refresh]);
  return (
    <div className={styles.stack} data-confera-unreachable>
      {page ? <PageHeader title={TEXTS.connection.down} /> : null}
      <Alert tone="error" title={TEXTS.connection.down} action={<Button variant="dark" onClick={() => void refresh()}>{TEXTS.connection.tryNow}</Button>}>
        {contact ? fill(TEXTS.connection.downTextRetry, { contact }) : TEXTS.connection.downTextRetryNoContact}
      </Alert>
    </div>
  );
}

function Guarded({ children }: { children: ReactNode }) {
  const { status, session, client, background, clear, setContact } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  // The session a change found ended, by its CSRF value: a new session (signed in again) has another,
  // and the message goes by itself (UXUI-M2-02).
  const csrfNow = useRef<string | null>(null);
  useEffect(() => {
    csrfNow.current = session?.csrf ?? null;
  }, [session]);
  const [endedFor, setEndedFor] = useState<string | null>(null);
  useEffect(() => {
    const onEnded = () => setEndedFor(csrfNow.current ?? '');
    window.addEventListener(SESSION_ENDED_EVENT, onEnded);
    return () => window.removeEventListener(SESSION_ENDED_EVENT, onEnded);
  }, []);
  const ended = endedFor !== null && endedFor === (session?.csrf ?? '');

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
        <noscript>
          <p className={styles.text}>{TEXTS.common.noScript}</p>
        </noscript>
        <Spinner label={TEXTS.common.loading} />
      </div>
    );
  }
  if (status === 'unreachable' && !session) {
    // Nothing is known of the person yet: the shell with the home only, and the page that says why.
    return (
      <AppShell
        product={TEXTS.product}
        logo={<img src="/icon.png" alt="" width={28} height={28} />}
        sidebar={<SidebarNav label={TEXTS.nav.main} value="/" items={[{ value: '/', label: TEXTS.nav.home, icon: 'home' as const, href: '/' }]} onNavigate={(value) => router.push(value)} />}
      >
        <Unreachable page />
      </AppShell>
    );
  }
  if (!session) return null;

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
            <div className={styles.conference}>{permissions.includes('conferences.read') && narrows(pathname) ? <ConferenceSwitch /> : null}</div>
            <div className={styles.topbarEnd}>
              {/* The person's menu (UXUI-M2-24): the name and two entries, one target at any width. */}
              <Menu
                label={TEXTS.nav.userMenu}
                align="end"
                trigger={
                  <TextButton icon="user" data-confera-user aria-label={`${TEXTS.nav.userMenu}: ${session.user.displayName}`}>
                    <span className={styles.userName}>{session.user.displayName}</span>
                  </TextButton>
                }
                items={[
                  { label: TEXTS.nav.account, icon: 'user', onSelect: () => router.push('/account') },
                  { label: TEXTS.nav.signOut, icon: 'log-out', onSelect: () => void signOut() },
                ]}
              />
            </div>
          </div>
        }
      >
        {ended ? <SessionEnded onContinued={() => setEndedFor(null)} /> : null}
        {status === 'unreachable' ? <Unreachable /> : null}
        {permissions.includes('held_mail.manage') && current(pathname) !== '/held-mail' ? <HeldMailAlert onOpen={() => router.push('/held-mail')} /> : null}
        <FreshPasswordProvider>{children}</FreshPasswordProvider>
      </AppShell>
    </ConferenceProvider>
  );
}

/** Toasts go to the top while a drawer is open, so that they never cover its footer and its buttons (UX3-22). */
function Toasts() {
  const [drawer, setDrawer] = useState(false);
  useEffect(() => {
    const onDrawer = (event: Event) => setDrawer((event as CustomEvent<boolean>).detail);
    window.addEventListener(DRAWER_EVENT, onDrawer);
    return () => window.removeEventListener(DRAWER_EVENT, onDrawer);
  }, []);
  return <ToastHost position={drawer ? 'top' : 'bottom'} />;
}

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <Toasts />
      <Guarded>{children}</Guarded>
    </SessionProvider>
  );
}
