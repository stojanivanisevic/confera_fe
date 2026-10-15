'use client';

/**
 * The audit log (FR-AUD-02): read and filtered by an admin, newest first; nothing here changes
 * or removes an entry. A row opens its details in a drawer.
 */
import { useState } from 'react';

import type { AdminPaths, AuditEntry, AuditPage } from '@confera/api-client';
import { Alert, Button, DataTable, DateField, DescriptionList, Drawer, FilterBar, PageHeader, Pagination, Select, TextButton } from '@confera/ui';

import styles from './admin.module.css';
import { formatDateTime } from './format';
import { call } from './problems';
import { TEXTS } from './texts';
import { useLoad } from './useLoad';

type AuditQuery = NonNullable<AdminPaths['/api/v1/audit']['get']['parameters']['query']>;
type Action = NonNullable<AuditQuery['action']>;
/** The actions the API knows, in the order of the catalogue (a text per action). */
const ACTIONS = Object.keys(TEXTS.audit.actions) as Action[];

const actionText = (action: string) => TEXTS.audit.actions[action] ?? action;
/** A value of the log as text: the log keeps settings, never personal values. */
const show = (value: unknown): string => {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
};
/** The start of a day, and the start of the next one, in the browser's time zone. */
const dayStart = (day: string) => (day ? new Date(`${day}T00:00:00`).toISOString() : undefined);
const dayEnd = (day: string) => {
  if (!day) return undefined;
  const next = new Date(`${day}T00:00:00`);
  next.setDate(next.getDate() + 1);
  return next.toISOString();
};

export function Audit() {
  const t = TEXTS.audit;
  const [action, setAction] = useState<'' | Action>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [opened, setOpened] = useState<AuditEntry | null>(null);
  const filtered = action !== '' || from !== '' || to !== '';

  const entries = useLoad<AuditPage>(
    (client) =>
      call(
        client.GET('/api/v1/audit', {
          params: { query: { ...(action ? { action } : {}), ...(from ? { from: dayStart(from) } : {}), ...(to ? { to: dayEnd(to) } : {}), page, pageSize } },
        }),
      ),
    [action, from, to, page, pageSize],
  );
  const rows = entries.state.data?.items ?? [];
  const clearFilters = () => {
    setAction('');
    setFrom('');
    setTo('');
    setPage(1);
  };

  const changes = (entry: AuditEntry) => Object.entries(entry.changes as Record<string, { old?: unknown; new?: unknown }>).map(([field, change]) => ({ label: field, value: `${show(change.old)} → ${show(change.new)}` }));

  return (
    <div className={styles.stack}>
      <PageHeader title={t.title} description={t.lead} />
      {entries.state.phase === 'failed' ? (
        <Alert tone="error" title={entries.state.problem.title} action={<TextButton onClick={() => void entries.reload()}>{TEXTS.connection.tryAgain}</TextButton>}>
          {entries.state.problem.text}
        </Alert>
      ) : null}
      <DataTable<AuditEntry>
        caption={t.title}
        rows={rows}
        rowKey="id"
        loading={entries.state.phase === 'loading' && !entries.state.data}
        filtered={filtered}
        onClearFilters={clearFilters}
        onRowClick={setOpened}
        openColumn="occurredAt"
        columns={[
          { key: 'occurredAt', header: t.when, render: (row) => formatDateTime(row.occurredAt) },
          { key: 'actor', header: t.who, render: (row) => row.actor?.displayName ?? t.system },
          { key: 'action', header: t.action, render: (row) => actionText(row.action) },
          { key: 'subjectType', header: t.subject, render: (row) => row.subjectType },
          { key: 'fields', header: t.fields, render: (row) => row.fields.join(', ') },
        ]}
        toolbar={
          <FilterBar onReset={filtered ? clearFilters : undefined} actions={<Button variant="dark" onClick={() => void entries.reload()}>{t.apply}</Button>}>
            <Select label={t.action} value={action} onChange={(event) => { setAction(event.target.value as '' | Action); setPage(1); }} options={[{ value: '', label: t.anyAction }, ...ACTIONS.map((value) => ({ value, label: actionText(value) }))]} />
            <DateField label={t.from} value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} />
            <DateField label={t.to} value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} />
          </FilterBar>
        }
        footer={<Pagination page={page} pageSize={pageSize} total={entries.state.data?.total ?? 0} onPageChange={setPage} pageSizeOptions={[10, 25, 50, 100]} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />}
      />
      <Drawer open={opened !== null} onClose={() => setOpened(null)} title={opened ? actionText(opened.action) : t.entry}>
        {opened ? (
          <>
            <DescriptionList
              items={[
                { label: t.when, value: formatDateTime(opened.occurredAt) },
                { label: t.who, value: opened.actor?.displayName ?? t.system },
                { label: t.subject, value: `${opened.subjectType}${opened.subjectId ? ` ${opened.subjectId}` : ''}` },
                { label: t.fields, value: opened.fields.join(', ') },
                { label: t.traceId, value: opened.traceId ?? '—' },
              ]}
            />
            {changes(opened).length > 0 ? <DescriptionList items={changes(opened)} /> : opened.fields.length > 0 ? <p className={styles.text}>{t.noValues}</p> : null}
            {Object.keys(opened.detail).length > 0 ? <DescriptionList items={Object.entries(opened.detail as Record<string, unknown>).map(([label, value]) => ({ label, value: show(value) }))} /> : null}
          </>
        ) : null}
      </Drawer>
    </div>
  );
}
