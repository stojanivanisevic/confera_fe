'use client';

/**
 * The submissions (M3-FE-06, M4-FE-01; FR-SUB-02, FR-SUB-03, FR-SUB-08): one table of every
 * submission of the organisation, a page at a time, newest first, narrowed by the conference
 * switch. A search over the reference, the title, the authors' names and addresses and the
 * institutions, without diacritics ("Zivkovic" finds "Živković"; the API folds them), filters by
 * status and participation, and a sort by the column headers from the API's fixed list. A withdrawn
 * submission leaves the default view and is found with the status filter. The query lives in the
 * address, so the way back from a submission finds the same rows. A row opens the submission; it is
 * reached by Tab and opened by Enter (DataTable, M1-ISS-10). The member and billing columns appear
 * once a row has a value (0.6.0, 0.8.0; UX3-22).
 */
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Alert, DataTable, EmptyState, FilterBar, PageHeader, Pagination, SearchField, Select, StatusBadge, TextButton } from '@confera/ui';

import styles from './admin.module.css';
import { conferenceLabel, useConference } from './conference-context';
import { formatDateTime } from './format';
import type { SubmissionPage, SubmissionSummary } from './intake-api';
import { m4, SORT_KEYS, STATUSES, type SortKey } from './m4-api';
import { fill, TEXTS } from './texts';
import { useLoad } from './useLoad';

export const statusText = (status: string): string => TEXTS.submissions.statuses[status] ?? status;
/** The colour of a status: done in green, refused and withdrawn in grey, waiting for the author in amber. */
export const statusTone = (status: string): 'info' | 'success' | 'warning' | 'neutral' | 'danger' =>
  status === 'accepted' ? 'success' : status === 'returned_for_revision' ? 'warning' : status === 'rejected' || status === 'withdrawn' ? 'neutral' : 'info';

const PAGE_SIZES = [25, 50, 100] as const;
const PARTICIPATIONS = ['with_paper', 'without_paper'] as const;
/** The columns the API sorts by, by the key of their column. */
const SORTABLE: Readonly<Record<string, SortKey>> = { reference: 'reference', title: 'title', firstAuthor: 'firstAuthor', status: 'status', receivedAt: 'receivedAt' };

export function Submissions() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { selected } = useConference();
  const t = TEXTS.submissions;
  const conferenceId = selected?.id;

  // The query, read from the address.
  const search = params.get('q') ?? '';
  const status = params.get('status') ?? '';
  const participation = params.get('participation') ?? '';
  const sortParam = params.get('sort') ?? '';
  const sort = (SORT_KEYS as readonly string[]).includes(sortParam) ? (sortParam as SortKey) : null;
  const direction = params.get('direction') === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const pageSizeParam = Number(params.get('size'));
  const pageSize = (PAGE_SIZES as readonly number[]).includes(pageSizeParam) ? pageSizeParam : 25;

  const setQuery = (changes: Readonly<Record<string, string | null>>, keepPage = false) => {
    // The address as it is now, not as this render saw it: a search that lands late keeps a filter chosen meanwhile.
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    if (!keepPage) next.delete('page');
    const text = next.toString();
    router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false });
  };

  // What is typed goes into the address a moment after the last key, not at every key.
  const [typed, setTyped] = useState(search);
  const [heldSearch, setHeldSearch] = useState(search);
  if (search !== heldSearch) {
    setHeldSearch(search);
    setTyped(search);
  }
  useEffect(() => {
    if (typed.trim() === search) return undefined;
    const timer = window.setTimeout(() => setQuery({ q: typed.trim() }), 300);
    return () => window.clearTimeout(timer);
    // setQuery is made anew each render; the address is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed, search]);

  const filtered = search !== '' || status !== '' || participation !== '';
  const list = useLoad<SubmissionPage>(
    (c) => m4.submissions(c, { conferenceId, search: search || undefined, status: status ? [status] : undefined, participationType: participation || undefined, sort: sort ?? undefined, direction, page, pageSize }),
    [conferenceId, search, status, participation, sort, direction, page, pageSize],
  );
  const none = (value: string | null) => (value === null || value === '' ? t.none : value);
  const rows = [...(list.state.data?.items ?? [])];
  const used = (key: 'memberMatch' | 'billingStatus') => rows.some((row) => row[key] !== null && row[key] !== '');
  const clear = () => {
    setTyped('');
    setQuery({ q: null, status: null, participation: null });
  };

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
          rows={rows}
          rowKey="id"
          loading={list.state.phase === 'loading' && !list.state.data}
          filtered={filtered}
          onClearFilters={clear}
          empty={<EmptyState title={t.empty} description={t.emptyText} />}
          onRowClick={(row) => router.push(`/submissions/${row.id}`)}
          manualSort
          sort={sort ? { key: Object.keys(SORTABLE).find((key) => SORTABLE[key] === sort) ?? sort, direction } : null}
          onSortChange={(next) => (next && SORTABLE[next.key] ? setQuery({ sort: SORTABLE[next.key] ?? null, direction: next.direction }) : setQuery({ sort: null, direction: null }))}
          columns={[
            { key: 'reference', header: t.reference, sortable: true, render: (row) => <span className={styles.mono}>{row.reference}</span> },
            { key: 'conference', header: t.conference, render: (row) => `${row.conference.code}${row.conference.editionYear ? ` ${String(row.conference.editionYear)}` : ''}` },
            { key: 'title', header: t.titleColumn, sortable: true, render: (row) => <span className={styles.break}>{none(row.title)}</span> },
            { key: 'firstAuthor', header: t.firstAuthor, sortable: true },
            { key: 'institution', header: t.institution, render: (row) => none(row.institution) },
            { key: 'participationType', header: t.participation, render: (row) => (row.participationType ? (t.participations[row.participationType] ?? row.participationType) : t.none) },
            { key: 'status', header: t.status, sortable: true, render: (row) => <StatusBadge tone={statusTone(row.status)}>{statusText(row.status)}</StatusBadge> },
            // A flagged or waiting file shows in the list, so the office need not open every submission to find one (UX3-07).
            {
              key: 'files',
              header: t.filesColumn,
              render: (row) =>
                row.fileSigns && (row.fileSigns.flags.length > 0 || row.fileSigns.scanPending) ? (
                  <span className={styles.signs}>
                    {row.fileSigns.flags.length > 0 ? (
                      <span title={row.fileSigns.flags.map((flag) => t.scanFlags[flag] ?? flag).join('; ')}>
                        <StatusBadge tone="warning">{t.signFlagged}</StatusBadge>
                      </span>
                    ) : null}
                    {row.fileSigns.scanPending ? <StatusBadge tone="info">{t.signPending}</StatusBadge> : null}
                  </span>
                ) : (
                  t.none
                ),
            },
            ...(used('memberMatch') ? [{ key: 'memberMatch', header: t.memberMatch, render: (row: SubmissionSummary) => none(row.memberMatch) }] : []),
            ...(used('billingStatus') ? [{ key: 'billingStatus', header: t.billing, render: (row: SubmissionSummary) => none(row.billingStatus) }] : []),
            { key: 'receivedAt', header: t.received, sortable: true, render: (row) => formatDateTime(row.receivedAt) },
          ]}
          toolbar={
            <FilterBar onReset={filtered ? clear : undefined}>
              <SearchField label={t.search} placeholder={t.searchHint} value={typed} onChange={(event) => setTyped(event.target.value)} onClear={() => setTyped('')} data-confera-submission-search="" />
              <Select
                label={t.status}
                value={status}
                onChange={(event) => setQuery({ status: event.target.value })}
                options={[{ value: '', label: t.anyStatus }, ...STATUSES.map((value) => ({ value, label: statusText(value) }))]}
              />
              <Select
                label={t.participation}
                value={participation}
                onChange={(event) => setQuery({ participation: event.target.value })}
                options={[{ value: '', label: t.anyParticipation }, ...PARTICIPATIONS.map((value) => ({ value, label: t.participations[value] ?? value }))]}
              />
            </FilterBar>
          }
          footer={
            <Pagination
              page={page}
              pageSize={pageSize}
              total={list.state.data?.total ?? 0}
              onPageChange={(next) => setQuery({ page: next === 1 ? null : String(next) }, true)}
              pageSizeOptions={[...PAGE_SIZES]}
              onPageSizeChange={(size) => setQuery({ size: size === 25 ? null : String(size) })}
            />
          }
        />
      )}
      {list.state.data && list.state.data.total > 0 ? (
        <p className={styles.small} role="status">
          {fill('{n} {rows}', { n: list.state.data.total, rows: TEXTS.common.rows })}
          {status === '' ? ` ${t.withdrawnHidden}` : ''}
        </p>
      ) : null}
    </div>
  );
}
