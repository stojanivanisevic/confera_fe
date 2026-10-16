'use client';

/**
 * The mail servers (M2-FE-04; FR-SMTP-01, ADR-11): the list, with the default and the
 * fallback marked and whether a password is stored. A password is never shown: the list says
 * only "Stored" or "None".
 */
import { useRouter } from 'next/navigation';

import type { MailServer } from '@confera/api-client';
import { Alert, Button, DataTable, EmptyState, PageHeader, StatusBadge, TextButton } from '@confera/ui';

import styles from './admin.module.css';
import { call } from './problems';
import { useSession } from './session';
import { TEXTS } from './texts';
import { useLoad } from './useLoad';

export function MailServers() {
  const router = useRouter();
  const { session } = useSession();
  const t = TEXTS.mailServers;
  const mayManage = session?.user.permissions.includes('mail_servers.manage') ?? false;
  const list = useLoad<readonly MailServer[]>((c) => call(c.GET('/api/v1/mail-servers')).then((answer) => answer.items), []);
  const add = mayManage ? (
    <Button icon="plus" onClick={() => router.push('/mail-servers/new')}>
      {t.add}
    </Button>
  ) : undefined;

  return (
    <div className={styles.stack}>
      <PageHeader title={t.title} description={t.lead} actions={add} />
      {list.state.phase === 'failed' ? (
        <Alert tone="error" title={list.state.problem.title} action={<TextButton onClick={() => void list.reload()}>{TEXTS.connection.tryAgain}</TextButton>}>
          {list.state.problem.text}
        </Alert>
      ) : null}
      {/* While the list failed it shows no empty state that would contradict the alert (UXUI-M2-15). */}
      {list.state.phase === 'failed' && !list.state.data ? null : (
      <DataTable<MailServer>
        caption={t.title}
        rows={[...(list.state.data ?? [])]}
        rowKey="id"
        loading={list.state.phase === 'loading' && !list.state.data}
        empty={<EmptyState title={t.empty} description={t.emptyText} action={add} />}
        onRowClick={(row) => router.push(`/mail-servers/${row.id}`)}
        columns={[
          { key: 'name', header: t.name },
          { key: 'host', header: t.host, render: (row) => `${row.host}:${String(row.port)}` },
          { key: 'fromAddress', header: t.fromAddress },
          {
            key: 'isDefault',
            header: t.flags,
            render: (row) => (
              <span className={styles.actionsInline}>
                {row.isDefault ? <StatusBadge tone="info">{t.defaultBadge}</StatusBadge> : null}
                {row.isFallback ? <StatusBadge tone="neutral">{t.fallbackBadge}</StatusBadge> : null}
              </span>
            ),
          },
          { key: 'credentialSet', header: t.secretState, render: (row) => (row.credentialSet ? t.stored : t.missing) },
          { key: 'enabled', header: t.enabled, render: (row) => <StatusBadge tone={row.enabled ? 'success' : 'neutral'}>{row.enabled ? t.on : t.off}</StatusBadge> },
        ]}
      />
      )}
    </div>
  );
}
