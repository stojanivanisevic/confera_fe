'use client';

/**
 * The submissions (M3-FE-06; FR-SUB-02): one table of every submission of the organisation, a page
 * at a time, newest first, narrowed by the conference switch. A row opens the submission; it is
 * reached by Tab and opened by Enter (the design system's DataTable, M1-ISS-10). The member match
 * and the billing state arrive with 0.8.0 and 0.6.0: the columns are there and say "—".
 */
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert, DataTable, EmptyState, PageHeader, Pagination, StatusBadge, TextButton } from '@confera/ui';

import styles from './admin.module.css';
import { conferenceLabel, useConference } from './conference-context';
import { formatDateTime } from './format';
import { intake, type SubmissionPage, type SubmissionSummary } from './intake-api';
import { fill, TEXTS } from './texts';
import { useLoad } from './useLoad';

export const statusText = (status: string): string => TEXTS.submissions.statuses[status] ?? status;

export function Submissions() {
  const router = useRouter();
  const { selected } = useConference();
  const t = TEXTS.submissions;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const conferenceId = selected?.id;
  const list = useLoad<SubmissionPage>((c) => intake.submissions(c, { ...(conferenceId ? { conferenceId } : {}), page, pageSize }), [conferenceId, page, pageSize]);
  const none = (value: string | null) => (value === null || value === '' ? t.none : value);

  return (
    <div className={styles.stack}>
      <PageHeader title={t.title} description={selected ? `${conferenceLabel(selected)}. ${t.lead}` : t.lead} />
      {list.state.phase === 'failed' ? (
        <Alert tone="error" title={list.state.problem.title} action={<TextButton onClick={() => void list.reload()}>{TEXTS.connection.tryAgain}</TextButton>}>
          {list.state.problem.text}
        </Alert>
      ) : null}
      {list.state.phase === 'failed' && !list.state.data ? null : (
        <DataTable<SubmissionSummary>
          caption={t.title}
          rows={[...(list.state.data?.items ?? [])]}
          rowKey="id"
          loading={list.state.phase === 'loading' && !list.state.data}
          empty={<EmptyState title={t.empty} description={t.emptyText} />}
          onRowClick={(row) => router.push(`/submissions/${row.id}`)}
          columns={[
            { key: 'reference', header: t.reference, render: (row) => <span className={styles.mono}>{row.reference}</span> },
            { key: 'conference', header: t.conference, render: (row) => `${row.conference.code}${row.conference.editionYear ? ` ${String(row.conference.editionYear)}` : ''}` },
            { key: 'title', header: t.titleColumn, render: (row) => <span className={styles.break}>{none(row.title)}</span> },
            { key: 'firstAuthor', header: t.firstAuthor },
            { key: 'institution', header: t.institution, render: (row) => none(row.institution) },
            { key: 'participationType', header: t.participation, render: (row) => (row.participationType ? (t.participations[row.participationType] ?? row.participationType) : t.none) },
            { key: 'status', header: t.status, render: (row) => <StatusBadge tone="info">{statusText(row.status)}</StatusBadge> },
            { key: 'memberMatch', header: t.memberMatch, render: (row) => none(row.memberMatch) },
            { key: 'billingStatus', header: t.billing, render: (row) => none(row.billingStatus) },
            { key: 'receivedAt', header: t.received, render: (row) => formatDateTime(row.receivedAt) },
          ]}
          footer={
            <Pagination
              page={page}
              pageSize={pageSize}
              total={list.state.data?.total ?? 0}
              onPageChange={setPage}
              pageSizeOptions={[25, 50, 100]}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          }
        />
      )}
      {list.state.data && list.state.data.total > 0 ? <p className={styles.small}>{fill('{n} {rows}', { n: list.state.data.total, rows: TEXTS.common.rows })}</p> : null}
    </div>
  );
}
