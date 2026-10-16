'use client';

/**
 * The audit log (FR-AUD-02): read and filtered by an admin, newest first; nothing here changes
 * or removes an entry. A row opens its details in a drawer.
 */
import { useState } from 'react';

import type { AdminPaths, AuditEntry, AuditPage } from '@confera/api-client';
import { Alert, DataTable, DateField, DescriptionList, Drawer, FilterBar, PageHeader, Pagination, Select, TextButton } from '@confera/ui';

import styles from './admin.module.css';
import { conferenceLabel } from './conference-context';
import { formatDateTime } from './format';
import { call } from './problems';
import { useSession } from './session';
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

/** The names of what the log speaks of, read once: users, conferences, mail servers (UXUI-M2-12). */
function useNames(): ReadonlyMap<string, string> {
  const { session } = useSession();
  const may = (permission: string) => session?.user.permissions.includes(permission) ?? false;
  const names = useLoad<ReadonlyMap<string, string>>(
    async (c) => {
      const out = new Map<string, string>();
      const quietly = <T,>(promise: Promise<T>): Promise<T | null> => promise.catch(() => null);
      const [users, conferences, servers] = await Promise.all([
        may('users.read') ? quietly(call(c.GET('/api/v1/users', { params: { query: { page: 1, pageSize: 100 } } }))) : null,
        may('conferences.read') ? quietly(call(c.GET('/api/v1/conferences'))) : null,
        may('mail_servers.read') ? quietly(call(c.GET('/api/v1/mail-servers'))) : null,
      ]);
      for (const user of users?.items ?? []) out.set(user.id, user.displayName);
      for (const conference of conferences?.items ?? []) out.set(conference.id, conferenceLabel(conference));
      for (const server of servers?.items ?? []) out.set(server.id, server.name);
      return out;
    },
    [session?.user.id],
  );
  return names.state.data ?? new Map();
}

export function Audit() {
  const t = TEXTS.audit;
  const names = useNames();
  /** What an entry concerns, in words: the name of the object where it is known. */
  const subjectOf = (entry: AuditEntry): string => {
    if (entry.action === 'organisation.payment_details_changed') return t.subjects.payment ?? entry.subjectType;
    const name = entry.subjectId ? names.get(entry.subjectId) : undefined;
    const kind = t.subjects[entry.subjectType] ?? entry.subjectType;
    return name ? `${kind}: ${name}` : kind;
  };
  /** A field in words; a field without a name of its own is written with a capital (`password`: Password). */
  const fieldName = (field: string): string => t.fieldNames[field] ?? field.charAt(0).toUpperCase() + field.slice(1);
  const fieldsOf = (fields: readonly string[]): string => fields.map(fieldName).join(', ');
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

  const changes = (entry: AuditEntry) => Object.entries(entry.changes as Record<string, { old?: unknown; new?: unknown }>).map(([field, change]) => ({ label: fieldName(field), value: <span className={styles.break}>{`${show(change.old)} → ${show(change.new)}`}</span> }));

  return (
    <div className={styles.stack}>
      <PageHeader title={t.title} description={t.lead} />
      {entries.state.phase === 'failed' ? (
        <Alert tone="error" title={entries.state.problem.title} action={<TextButton onClick={() => void entries.reload()}>{TEXTS.connection.tryAgain}</TextButton>}>
          {entries.state.problem.text}
        </Alert>
      ) : null}
      {/* While the list failed it shows no empty state that would contradict the alert (UXUI-M2-15). */}
      {entries.state.phase === 'failed' && !entries.state.data ? null : (
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
          { key: 'subjectType', header: t.subject, render: (row) => <span className={styles.break}>{subjectOf(row)}</span> },
          { key: 'fields', header: t.fields, render: (row) => fieldsOf(row.fields) },
        ]}
        toolbar={
          <FilterBar onReset={filtered ? clearFilters : undefined}>
            <Select label={t.action} value={action} onChange={(event) => { setAction(event.target.value as '' | Action); setPage(1); }} options={[{ value: '', label: t.anyAction }, ...ACTIONS.map((value) => ({ value, label: actionText(value) }))]} />
            <DateField label={t.from} value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} />
            <DateField label={t.to} value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} />
          </FilterBar>
        }
        footer={<Pagination page={page} pageSize={pageSize} total={entries.state.data?.total ?? 0} onPageChange={setPage} pageSizeOptions={[10, 25, 50, 100]} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />}
      />
      )}
      <Drawer open={opened !== null} onClose={() => setOpened(null)} title={opened ? actionText(opened.action) : t.entry}>
        {opened ? (
          <>
            <DescriptionList
              items={[
                { label: t.when, value: formatDateTime(opened.occurredAt) },
                { label: t.who, value: opened.actor?.displayName ?? t.system },
                { label: t.subject, value: <span className={styles.break}>{subjectOf(opened)}</span> },
                { label: t.fields, value: fieldsOf(opened.fields) },
                ...(opened.subjectId ? [{ label: t.recordId, value: <span className={styles.break}>{opened.subjectId}</span> }] : []),
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
