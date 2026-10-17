'use client';

/**
 * The forms (M3-FE-05; FR-FORM-01, FR-FORM-02): the forms of the conferences, narrowed by the
 * conference switch, each with its address, what it shows now and its published version. A
 * conference that has no abstract form yet gets one with a click. A row opens the form.
 */
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert, Button, DataTable, EmptyState, PageHeader, StatusBadge, TextButton, toast } from '@confera/ui';

import styles from './admin.module.css';
import { conferenceLabel, useConference } from './conference-context';
import { intake, type FormSummary } from './intake-api';
import { ProblemAlert } from './ProblemAlert';
import { explain, type Explained } from './problems';
import { useSession } from './session';
import { fill, TEXTS } from './texts';
import { useLoad } from './useLoad';

/** What a form shows now, for a badge: open, or closed with its reason. */
export function formStateText(state: string, reason: string | null): string {
  const t = TEXTS.forms;
  return state === 'open' ? (t.states.open ?? state) : reason ? (t.reasons[reason] ?? t.states.closed ?? state) : (t.states.closed ?? state);
}

export function Forms() {
  const router = useRouter();
  const { client, contact, session } = useSession();
  const { conferences, selected } = useConference();
  const t = TEXTS.forms;
  const mayManage = session?.user.permissions.includes('forms.manage') ?? false;
  const list = useLoad<readonly FormSummary[]>((c) => intake.forms(c, selected?.id), [selected?.id]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Explained | null>(null);

  const conferenceOf = (id: string) => conferences.find((conference) => conference.id === id);
  const hasForm = selected ? (list.state.data ?? []).some((form) => form.conferenceId === selected.id && form.type === 'abstract') : true;

  const create = async () => {
    if (!selected) return;
    setBusy(true);
    setProblem(null);
    try {
      const created = await intake.createForm(client, selected.id);
      toast({ title: fill(t.created, { name: conferenceLabel(selected) }), tone: 'success' });
      router.push(`/forms/${created.id}`);
    } catch (error) {
      setProblem(explain(error, contact));
    } finally {
      setBusy(false);
    }
  };
  const createButton =
    mayManage && selected && !hasForm ? (
      <Button icon="plus" disabled={busy} onClick={() => void create()}>
        {t.create}
      </Button>
    ) : undefined;

  return (
    <div className={styles.stack}>
      <PageHeader title={t.title} description={t.lead} actions={createButton} />
      {mayManage && !selected ? <p className={styles.text}>{t.chooseConference}</p> : null}
      {problem ? (
        <ProblemAlert title={problem.title} onClose={() => setProblem(null)}>
          {problem.text}
        </ProblemAlert>
      ) : null}
      {list.state.phase === 'failed' ? (
        <Alert tone="error" title={list.state.problem.title} action={<TextButton onClick={() => void list.reload()}>{TEXTS.connection.tryAgain}</TextButton>}>
          {list.state.problem.text}
        </Alert>
      ) : null}
      {list.state.phase === 'failed' && !list.state.data ? null : (
        <DataTable<FormSummary>
          caption={t.title}
          rows={[...(list.state.data ?? [])]}
          rowKey="id"
          loading={list.state.phase === 'loading' && !list.state.data}
          empty={<EmptyState title={t.empty} description={t.emptyText} action={createButton} />}
          onRowClick={(row) => router.push(`/forms/${row.id}`)}
          columns={[
            { key: 'type', header: t.form, render: (row) => t.types[row.type] ?? row.type },
            {
              key: 'conferenceId',
              header: t.conference,
              render: (row) => {
                const conference = conferenceOf(row.conferenceId);
                return conference ? conferenceLabel(conference) : row.conferenceId;
              },
            },
            { key: 'slug', header: t.address, render: (row) => <span className={styles.mono}>/f/{row.slug}</span> },
            { key: 'state', header: t.state, render: (row) => <StatusBadge tone={row.state === 'open' ? 'success' : 'neutral'}>{formStateText(row.state, row.closedReason)}</StatusBadge> },
            { key: 'currentVersionNumber', header: t.published, render: (row) => (row.currentVersionNumber === null ? t.notPublished : fill(t.versionNumber, { n: row.currentVersionNumber })) },
          ]}
        />
      )}
    </div>
  );
}
