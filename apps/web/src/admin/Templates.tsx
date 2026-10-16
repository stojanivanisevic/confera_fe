'use client';

/**
 * The email templates (M2-FE-05): the organisation's, or the conference's of the switch. A row
 * opens the editor, which is a spike in 0.2.0: it loads, edits and checks a template, and does
 * not save it (templates are edited for real from 0.4.0).
 */
import { useRouter } from 'next/navigation';

import type { MailTemplate } from '@confera/api-client';
import { Alert, DataTable, EmptyState, PageHeader, StatusBadge, TextButton } from '@confera/ui';

import styles from './admin.module.css';
import { conferenceLabel, useConference } from './conference-context';
import { formatDateTime } from './format';
import { call } from './problems';
import { fill, TEXTS } from './texts';
import { useLoad } from './useLoad';

type Listed = MailTemplate & { readonly inherited: boolean };

export function Templates() {
  const router = useRouter();
  const { selected } = useConference();
  const t = TEXTS.templates;
  const conferenceId = selected?.id;
  // A conference uses the organisation's template of a type and language until it has its own: the list
  // shows both, the organisation's marked as such (UXUI-M2-05).
  const list = useLoad<readonly Listed[]>(async (c) => {
    const own = await call(c.GET('/api/v1/mail-templates', { params: { query: {} } }));
    if (!conferenceId) return own.items.map((template) => ({ ...template, inherited: false }));
    const theirs = await call(c.GET('/api/v1/mail-templates', { params: { query: { conferenceId } } }));
    const key = (template: MailTemplate) => `${template.type}:${template.language}`;
    const taken = new Set(theirs.items.map(key));
    return [...theirs.items.map((template) => ({ ...template, inherited: false })), ...own.items.filter((template) => !taken.has(key(template))).map((template) => ({ ...template, inherited: true }))].sort((a, b) => a.type.localeCompare(b.type) || a.language.localeCompare(b.language));
  }, [conferenceId]);

  return (
    <div className={styles.stack}>
      <PageHeader title={t.title} description={selected ? fill(t.leadConference, { conference: conferenceLabel(selected) }) : t.lead} />
      {list.state.phase === 'failed' ? (
        <Alert tone="error" title={list.state.problem.title} action={<TextButton onClick={() => void list.reload()}>{TEXTS.connection.tryAgain}</TextButton>}>
          {list.state.problem.text}
        </Alert>
      ) : null}
      {list.state.phase === 'failed' && !list.state.data ? null : (
      <DataTable<Listed>
        caption={t.title}
        rows={[...(list.state.data ?? [])]}
        rowKey="id"
        loading={list.state.phase === 'loading' && !list.state.data}
        empty={<EmptyState title={t.empty} description={t.emptyText} />}
        onRowClick={(row) => router.push(`/templates/${row.id}`)}
        columns={[
          { key: 'type', header: t.type, render: (row) => t.types[row.type] ?? row.type },
          { key: 'language', header: t.language, render: (row) => TEXTS.conferences.languageNames[row.language] ?? row.language },
          ...(selected ? [{ key: 'inherited', header: t.from, render: (row: Listed) => (row.inherited ? <StatusBadge tone="neutral">{t.organisations}</StatusBadge> : t.thisConference) }] : []),
          { key: 'updatedAt', header: t.updated, render: (row) => formatDateTime(row.updatedAt) },
        ]}
      />
      )}
    </div>
  );
}
