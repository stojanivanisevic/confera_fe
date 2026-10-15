'use client';

import { Card, PageHeader } from '@confera/ui';

import styles from './admin.module.css';
import { Connection } from './Connection';
import { useSession } from './session';
import { fill, TEXTS } from './texts';

export function Home() {
  const { session } = useSession();
  const name = session?.user.displayName ?? '';
  return (
    <div className={styles.stack}>
      <PageHeader title={fill('Welcome, {name}', { name })} description={fill('{organisation} in Confera. Release 0.2.0: sign-in, users, the organisation profile and the audit log.', { organisation: session?.organisation.name ?? '' })} />
      <div className={styles.cards}>
        <Connection />
        <Card title={TEXTS.account.title} headingLevel={2}>
          <p className={styles.text}>
            {fill('You are signed in as {email}, {role}.', { email: session?.user.email ?? '', role: session?.user.roles.map((role) => TEXTS.users.roles[role] ?? role).join(', ') ?? '' })}
          </p>
        </Card>
      </div>
    </div>
  );
}
