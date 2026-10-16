'use client';

/**
 * The home (UXUI-M2-13): what to do first, each step with its state read from the API, and the
 * connection under it. Steps the person may not take are not shown.
 */
import Link from 'next/link';

import { Card, Icon, PageHeader } from '@confera/ui';

import styles from './admin.module.css';
import { Connection } from './Connection';
import { useMailReady } from './mail-ready';
import { call } from './problems';
import { useSession } from './session';
import { fill, TEXTS } from './texts';
import { useLoad } from './useLoad';

interface Step {
  readonly key: string;
  readonly href: string;
  readonly label: string;
  readonly done: boolean | null;
}

export function Home() {
  const { session } = useSession();
  const t = TEXTS.home;
  const may = (permission: string) => session?.user.permissions.includes(permission) ?? false;
  const mailReady = useMailReady();
  const facts = useLoad(
    async (c) => {
      const quietly = <T,>(promise: Promise<T>): Promise<T | null> => promise.catch(() => null);
      const [organisation, users, conferences] = await Promise.all([
        may('organisation.read') ? quietly(call(c.GET('/api/v1/organisation'))) : null,
        may('users.read') ? quietly(call(c.GET('/api/v1/users', { params: { query: { page: 1, pageSize: 1 } } }))) : null,
        may('conferences.read') ? quietly(call(c.GET('/api/v1/conferences'))) : null,
      ]);
      return {
        profile: organisation ? Boolean(organisation.legalName && organisation.address && organisation.contactEmail) : null,
        colleague: users ? users.total > 1 : null,
        conference: conferences ? conferences.items.length > 0 : null,
      };
    },
    [session?.user.id],
  );
  const known = facts.state.data;
  const steps: Step[] = [
    ...(may('mail_servers.manage') ? [{ key: 'mail', href: '/mail-servers', label: t.steps.mail, done: mailReady }] : []),
    ...(may('organisation.manage') ? [{ key: 'profile', href: '/organisation', label: t.steps.profile, done: known?.profile ?? null }] : []),
    ...(may('users.manage') ? [{ key: 'colleague', href: '/users', label: t.steps.colleague, done: known?.colleague ?? null }] : []),
    ...(may('conferences.read') ? [{ key: 'conference', href: '/conferences', label: t.steps.conference, done: known?.conference ?? null }] : []),
  ];
  const name = session?.user.displayName ?? '';
  return (
    <div className={styles.stack}>
      <PageHeader title={fill(t.welcome, { name })} description={session?.organisation.name ?? ''} />
      <div className={styles.cards}>
        {steps.length > 0 ? (
          <Card title={t.first} headingLevel={2}>
            <ol className={styles.steps} data-confera-first-steps>
              {steps.map((step) => (
                <li key={step.key} data-step={step.key} data-done={step.done === null ? undefined : String(step.done)}>
                  <Icon name={step.done ? 'check-circle-2' : 'circle'} size={16} />
                  <Link className="ud-link" href={step.href}>
                    {step.label}
                  </Link>
                  <span className={styles.text}>{step.done === null ? '' : step.done ? t.done : t.notDone}</span>
                </li>
              ))}
            </ol>
          </Card>
        ) : null}
        <Card title={TEXTS.account.title} headingLevel={2}>
          <p className={styles.text}>{fill(t.signedInAs, { email: session?.user.email ?? '', role: session?.user.roles.map((role) => TEXTS.users.roles[role] ?? role).join(', ') ?? '' })}</p>
        </Card>
        <Connection />
      </div>
    </div>
  );
}
