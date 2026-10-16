'use client';

/**
 * The mail log (M2-FE-04; FR-SMTP-04): every attempt to send a message, newest first, a page
 * at a time, with filters by message and result; the conference of the switch narrows it.
 */
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { TEMPLATE_TYPES, type AdminPaths, type MailLogPage, type MailLogSummary } from '@confera/api-client';
import { Alert, DataTable, EmptyState, FilterBar, PageHeader, Pagination, Select, StatusBadge, TextButton } from '@confera/ui';

import styles from './admin.module.css';
import { conferenceLabel, useConference } from './conference-context';
import { formatDateTime } from './format';
import { call } from './problems';
import { useSession } from './session';
import { fill, TEXTS } from './texts';
import { useLoad } from './useLoad';

type Query = NonNullable<AdminPaths['/api/v1/mail-log']['get']['parameters']['query']>;
type Kind = NonNullable<Query['kind']>;
type Result = NonNullable<Query['result']>;

export function MailLog() {
  const router = useRouter();
  const { selected, select } = useConference();
  const { session } = useSession();
  const mayReadServers = session?.user.permissions.includes('mail_servers.read') ?? false;
  const t = TEXTS.mailLog;
  const [kind, setKind] = useState<'' | Kind>('');
  const [result, setResult] = useState<'' | Result>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const conferenceId = selected?.id;
  const filtered = kind !== '' || result !== '';

  const log = useLoad<MailLogPage>(
    (c) => call(c.GET('/api/v1/mail-log', { params: { query: { ...(kind ? { kind } : {}), ...(result ? { result } : {}), ...(conferenceId ? { conferenceId } : {}), page, pageSize } } })),
    [kind, result, conferenceId, page, pageSize],
  );
  const clear = () => {
    setKind('');
    setResult('');
    setPage(1);
  };

  return (
    <div className={styles.stack}>
      <PageHeader title={t.title} description={selected ? fill(t.leadConference, { conference: conferenceLabel(selected) }) : t.lead} />
      {log.state.phase === 'failed' ? (
        <Alert tone="error" title={log.state.problem.title} action={<TextButton onClick={() => void log.reload()}>{TEXTS.connection.tryAgain}</TextButton>}>
          {log.state.problem.text}
        </Alert>
      ) : null}
      {/* While the list failed it shows no empty state that would contradict the alert (UXUI-M2-15). */}
      {log.state.phase === 'failed' && !log.state.data ? null : (
      <DataTable<MailLogSummary>
        caption={t.title}
        rows={log.state.data?.items ?? []}
        rowKey="id"
        loading={log.state.phase === 'loading' && !log.state.data}
        filtered={filtered}
        onClearFilters={clear}
        empty={
          selected ? (
            // The log of one conference is empty: say which, and that invitations and notices belong to no conference (UXUI-M2-05).
            <EmptyState
              title={fill(t.emptyConference, { conference: conferenceLabel(selected) })}
              description={t.emptyConferenceText}
              action={
                <TextButton icon="x" onClick={() => select(null)}>
                  {t.showAll}
                </TextButton>
              }
            />
          ) : (
          <EmptyState
            title={t.empty}
            description={t.emptyText}
            action={
              mayReadServers ? (
                <TextButton icon="send" onClick={() => router.push('/mail-servers')}>
                  {t.toServers}
                </TextButton>
              ) : undefined
            }
          />
          )
        }
        onRowClick={(row) => router.push(`/mail-log/${row.id}`)}
        openColumn="sentAt"
        columns={[
          { key: 'sentAt', header: t.sentAt, render: (row) => formatDateTime(row.sentAt) },
          { key: 'recipient', header: t.recipient },
          { key: 'kind', header: t.kind, render: (row) => TEXTS.templates.types[row.kind] ?? row.kind },
          { key: 'language', header: t.language, render: (row) => TEXTS.conferences.languageNames[row.language] ?? row.language },
          { key: 'serverName', header: t.server, render: (row) => row.serverName ?? '' },
          { key: 'attempt', header: t.attempt, align: 'right' },
          { key: 'result', header: t.result, render: (row) => <StatusBadge tone={row.result === 'sent' ? 'success' : 'danger'}>{t.results[row.result] ?? row.result}</StatusBadge> },
          { key: 'errorCode', header: t.errorCode, render: (row) => (row.errorCode ? (t.errors[row.errorCode] ?? row.errorCode) : '') },
        ]}
        toolbar={
          <FilterBar onReset={filtered ? clear : undefined}>
            <Select
              label={t.kind}
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as '' | Kind);
                setPage(1);
              }}
              options={[{ value: '', label: t.anyKind }, ...TEMPLATE_TYPES.map((value) => ({ value, label: TEXTS.templates.types[value] ?? value }))]}
            />
            <Select
              label={t.result}
              value={result}
              onChange={(event) => {
                setResult(event.target.value as '' | Result);
                setPage(1);
              }}
              options={[{ value: '', label: t.anyResult }, ...(['sent', 'failed'] as const).map((value) => ({ value, label: t.results[value] ?? value }))]}
            />
          </FilterBar>
        }
        footer={
          <Pagination
            page={page}
            pageSize={pageSize}
            total={log.state.data?.total ?? 0}
            onPageChange={setPage}
            pageSizeOptions={[10, 25, 50, 100]}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        }
      />
      )}
    </div>
  );
}
