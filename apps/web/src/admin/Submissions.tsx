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
import { useEffect, useRef, useState } from 'react';

import { Alert, DataTable, EmptyState, FilterBar, PageHeader, Pagination, Select, StatusBadge, TextButton, TextField } from '@congresa/ui';

import styles from './admin.module.css';
import { conferenceLabel, useConference } from './conference-context';
import { formatDateTime } from './format';
import type { SubmissionPage, SubmissionSummary } from './intake-api';
import { m4, SORT_KEYS, STATUSES, type SortKey, type Status } from './m4-api';
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
/** The orders of the "Sort by" list of a phone, where the column headers are hidden (UX4-15): the API's fixed list. */
const ORDERS: ReadonlyArray<{ readonly sort: SortKey | null; readonly direction: 'asc' | 'desc' }> = [
  { sort: null, direction: 'desc' },
  { sort: 'receivedAt', direction: 'asc' },
  { sort: 'reference', direction: 'asc' },
  { sort: 'reference', direction: 'desc' },
  { sort: 'title', direction: 'asc' },
  { sort: 'firstAuthor', direction: 'asc' },
  { sort: 'status', direction: 'asc' },
];
const orderValue = (sort: SortKey | null, direction: 'asc' | 'desc') => (sort === null || (sort === 'receivedAt' && direction === 'desc') ? '' : `${sort}:${direction}`);

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

  // The query last asked for, until the address has it: a search that lands late keeps a filter chosen
  // meanwhile, also while the router has not written the address yet.
  const asked = useRef<URLSearchParams | null>(null);
  const current = params.toString();
  // The address as the latest render saw it: a timer set by an older render reads it here, not in its own closure.
  const latest = useRef(current);
  useEffect(() => {
    latest.current = current;
    // A new address (ours, or the way back) is the base again; a replace still on its way carries its own query.
    asked.current = null;
  }, [current]);
  const setQuery = (changes: Readonly<Record<string, string | null>>, keepPage = false) => {
    const next = new URLSearchParams(asked.current ?? latest.current);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    if (!keepPage) next.delete('page');
    asked.current = next;
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
  // After Next or Previous the focus and the window go to the first row of the new page (UX4-19).
  const table = useRef<HTMLDivElement>(null);
  const paged = useRef(false);
  const list = useLoad<SubmissionPage>(
    (c) => m4.submissions(c, { conferenceId, search: search || undefined, status: (STATUSES as readonly string[]).includes(status) ? [status as Status] : undefined, participationType: participation || undefined, sort: sort ?? undefined, direction, page, pageSize }),
    [conferenceId, search, status, participation, sort, direction, page, pageSize],
  );
  const none = (value: string | null) => (value === null || value === '' ? t.none : value);
  const rows = [...(list.state.data?.items ?? [])];
  const used = (key: 'memberMatch' | 'billingStatus') => rows.some((row) => row[key] !== null && row[key] !== '');
  const clear = () => {
    setTyped('');
    setQuery({ q: null, status: null, participation: null });
  };
  const data = list.state.data;
  useEffect(() => {
    if (!paged.current || list.state.phase !== 'ready') return;
    paged.current = false;
    table.current?.scrollIntoView({ block: 'start' });
    table.current?.querySelector<HTMLElement>('tbody .ud-table__open')?.focus({ preventScroll: true });
  }, [list.state]);
  // The rows the table shows now, said after every page, filter and search (UX4-19).
  const from = data && data.total > 0 ? (page - 1) * pageSize + 1 : 0;
  const to = data ? Math.min(data.total, page * pageSize) : 0;

  return (
    <div className={styles.stack}>
      <PageHeader title={t.title} description={selected ? `${conferenceLabel(selected)}. ${t.lead}` : t.lead} />
      {list.state.phase === 'failed' ? (
        <Alert tone="error" title={list.state.problem.title} action={<TextButton onClick={() => void list.reload()}>{TEXTS.connection.tryAgain}</TextButton>}>
          {list.state.problem.text}
        </Alert>
      ) : null}
      {list.state.phase === 'failed' && !list.state.data ? null : (
        <div ref={table} className={styles.anchored} data-congresa-submissions-table="">
        <DataTable<SubmissionSummary>
          caption={t.title}
          rows={rows}
          rowKey="id"
          loading={list.state.phase === 'loading' && !list.state.data}
          filtered={filtered}
          // One way to clear, the toolbar's (UX4-20); the empty result names the search.
          labels={{ noResults: search ? fill(t.noMatch, { q: search }) : t.noMatchFilters }}
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
              {/* A visible label, and a hint short enough for a phone (UX4-20). */}
              <TextField type="search" icon="search" label={t.search} placeholder={t.searchHint} value={typed} onChange={(event) => setTyped(event.target.value)} data-congresa-submission-search="" />
              {/* A phone hides the column headers, and with them the sort: there it is a list (UX4-15). */}
              <div className={styles.narrowOnly}>
                <Select
                  label={t.sortBy}
                  value={orderValue(sort, direction)}
                  onChange={(event) => {
                    const [key, dir] = event.target.value.split(':');
                    setQuery(key ? { sort: key, direction: dir ?? 'asc' } : { sort: null, direction: null });
                  }}
                  options={ORDERS.map((order) => ({ value: orderValue(order.sort, order.direction), label: t.orders[orderValue(order.sort, order.direction)] ?? '' }))}
                />
              </div>
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
              onPageChange={(next) => {
                paged.current = true;
                setQuery({ page: next === 1 ? null : String(next) }, true);
              }}
              pageSizeOptions={[...PAGE_SIZES]}
              onPageSizeChange={(size) => setQuery({ size: size === 25 ? null : String(size) })}
            />
          }
        />
        </div>
      )}
      {/* Shown with rows; with none the table says it, and this only tells a screen reader. */}
      <p className={data && data.total > 0 ? styles.small : styles.visuallyHidden} role="status">
        {data && data.total > 0 ? fill(t.showing, { from, to, total: data.total }) : data ? (search ? fill(t.noMatch, { q: search }) : filtered ? t.noMatchFilters : '') : ''}
        {data && data.total > 0 && status === '' ? ` ${t.withdrawnHidden}` : ''}
      </p>
    </div>
  );
}
