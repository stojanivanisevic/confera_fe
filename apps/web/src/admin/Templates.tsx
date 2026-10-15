'use client';

/**
 * The email templates (M2-FE-05): the organisation's, or the conference's of the switch. A row
 * opens the editor, which is a spike in 0.2.0: it loads, edits and checks a template, and does
 * not save it (templates are edited for real from 0.4.0).
 */
import { useRouter } from 'next/navigation';

import type { MailTemplate } from '@confera/api-client';
import { Alert, DataTable, PageHeader, TextButton } from '@confera/ui';

import styles from './admin.module.css';
import { conferenceLabel, useConference } from './conference-context';
import { formatDateTime } from './format';
import { call } from './problems';
import { fill, TEXTS } from './texts';
import { useLoad } from './useLoad';

export function Templates() {
  const router = useRouter();
  const { selected } = useConference();
  const t = TEXTS.templates;
  const conferenceId = selected?.id;
  const list = useLoad<readonly MailTemplate[]>((c) => call(c.GET('/api/v1/mail-templates', { params: { query: conferenceId ? { conferenceId } : {} } })).then((answer) => answer.items), [conferenceId]);

  return (
    <div className={styles.stack}>
      <PageHeader title={t.title} description={selected ? fill(t.leadConference, { conference: conferenceLabel(selected) }) : t.lead} />
      {list.state.phase === 'failed' ? (
        <Alert tone="error" title={list.state.problem.title} action={<TextButton onClick={() => void list.reload()}>{TEXTS.connection.tryAgain}</TextButton>}>
          {list.state.problem.text}
        </Alert>
      ) : null}
      <DataTable<MailTemplate>
        caption={t.title}
        rows={[...(list.state.data ?? [])]}
        rowKey="id"
        loading={list.state.phase === 'loading' && !list.state.data}
        empty={t.empty}
        onRowClick={(row) => router.push(`/templates/${row.id}`)}
        columns={[
          { key: 'type', header: t.type, render: (row) => t.types[row.type] ?? row.type },
          { key: 'language', header: t.language, render: (row) => TEXTS.conferences.languageNames[row.language] ?? row.language },
          { key: 'updatedAt', header: t.updated, render: (row) => formatDateTime(row.updatedAt) },
        ]}
      />
    </div>
  );
}
