'use client';

/**
 * The conferences (M2-FE-03; FR-CONF-01): the list with a filter by state, and a new
 * conference, which starts as a draft. A row opens its settings.
 */
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import type { Conference, ConferenceState } from '@confera/api-client';
import { Alert, Button, CheckboxGroup, DataTable, Dialog, EmptyState, FilterBar, PageHeader, Select, StatusBadge, TextButton, TextField, toast } from '@confera/ui';

import styles from './admin.module.css';
import { ProblemAlert } from './ProblemAlert';
import { useConference } from './conference-context';
import { formatDate } from './format';
import { call, explain, fieldMessages, type Explained } from './problems';
import { useSession } from './session';
import { fill, TEXTS } from './texts';
import { useLoad } from './useLoad';

export const CONFERENCE_STATES: readonly ConferenceState[] = ['draft', 'open', 'closed', 'archived'];
export const LANGUAGES = ['en', 'sr'] as const;

/** The zones of this runtime, for a form drawn without the server's list (a unit test); the pages always hand in the server's. */
export const runtimeTimeZones = (): string[] => ['UTC', ...Intl.supportedValuesOf('timeZone').filter((zone) => zone !== 'UTC')];

export const stateTone = (state: string): 'success' | 'info' | 'neutral' | 'warning' => (state === 'open' ? 'success' : state === 'draft' ? 'info' : state === 'closed' ? 'warning' : 'neutral');

/** A year typed in a field: a number, null for an empty field, undefined for a text that is no year ("2O27"), which is refused before anything is sent (E2-18). */
export const yearOf = (text: string): number | null | undefined => {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  return /^\d{4}$/.test(trimmed) ? Number(trimmed) : undefined;
};

/** `timeZones`: the zones the API accepts, read on the server (src/server/time-zones.ts). */
export function Conferences({ timeZones = runtimeTimeZones() }: { timeZones?: readonly string[] }) {
  const router = useRouter();
  const { client, contact, session } = useSession();
  const { reload: reloadSwitch } = useConference();
  const t = TEXTS.conferences;
  const mayManage = session?.user.permissions.includes('conferences.manage') ?? false;

  const [state, setState] = useState<'' | ConferenceState>('');
  const list = useLoad((c) => call(c.GET('/api/v1/conferences', { params: { query: state ? { state } : {} } })), [state]);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [edition, setEdition] = useState('');
  const [timeZone, setTimeZone] = useState('Europe/Belgrade');
  const [languages, setLanguages] = useState<string[]>(['en', 'sr']);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Explained | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const open = () => {
    setName('');
    setCode('');
    setEdition(String(new Date().getFullYear()));
    setTimeZone('Europe/Belgrade');
    setLanguages(['en', 'sr']);
    setProblem(null);
    setFields({});
    setCreating(true);
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setProblem(null);
    setFields({});
    const editionYear = yearOf(edition);
    if (editionYear === undefined) return setFields({ editionYear: t.editionNotYear });
    setBusy(true);
    try {
      const created = await call(client.POST('/api/v1/conferences', { body: { name: name.trim(), code: code.trim(), editionYear, timeZone, languages: languages as ('en' | 'sr')[] } }));
      setCreating(false);
      toast({ title: fill(t.created, { name: created.name }), tone: 'success' });
      // A new conference does not change what the mail log and the templates show (UXUI-M2-05).
      await reloadSwitch();
      router.push(`/conferences/${created.id}`);
    } catch (error) {
      setFields(fieldMessages(error));
      setProblem(explain(error, contact));
    } finally {
      setBusy(false);
    }
  };

  const rows: Conference[] = list.state.data?.items ?? [];
  const createButton = mayManage ? (
    <Button icon="plus" onClick={open}>
      {t.create}
    </Button>
  ) : undefined;

  return (
    <div className={styles.stack}>
      <PageHeader title={t.title} description={t.lead} actions={createButton} />
      {list.state.phase === 'failed' ? (
        <Alert tone="error" title={list.state.problem.title} action={<TextButton onClick={() => void list.reload()}>{TEXTS.connection.tryAgain}</TextButton>}>
          {list.state.problem.text}
        </Alert>
      ) : null}
      {/* While the list failed it shows no empty state that would contradict the alert (UXUI-M2-15). */}
      {list.state.phase === 'failed' && !list.state.data ? null : (
      <DataTable<Conference>
        caption={t.title}
        rows={rows}
        rowKey="id"
        loading={list.state.phase === 'loading' && !list.state.data}
        filtered={state !== ''}
        onClearFilters={() => setState('')}
        empty={<EmptyState title={t.empty} description={t.emptyText} action={createButton} />}
        onRowClick={(row) => router.push(`/conferences/${row.id}`)}
        columns={[
          { key: 'name', header: t.name, render: (row) => <span className={styles.break}>{row.name}</span> },
          { key: 'code', header: t.code, render: (row) => `${row.code}${row.editionYear ? ` ${String(row.editionYear)}` : ''}` },
          { key: 'startsOn', header: t.dates, render: (row) => (row.startsOn ? `${formatDate(row.startsOn)}${row.endsOn ? ` – ${formatDate(row.endsOn)}` : ''}` : '') },
          { key: 'timeZone', header: t.timeZone },
          { key: 'state', header: t.state, render: (row) => <StatusBadge tone={stateTone(row.state)}>{t.states[row.state] ?? row.state}</StatusBadge> },
        ]}
        toolbar={
          <FilterBar onReset={state !== '' ? () => setState('') : undefined}>
            <Select label={t.state} value={state} onChange={(event) => setState(event.target.value as '' | ConferenceState)} options={[{ value: '', label: t.anyState }, ...CONFERENCE_STATES.map((value) => ({ value, label: t.states[value] ?? value }))]} />
          </FilterBar>
        }
      />
      )}

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title={t.createTitle}
        actions={
          <>
            <TextButton type="button" onClick={() => setCreating(false)}>
              {TEXTS.common.cancel}
            </TextButton>
            <Button type="submit" form="conference-form" disabled={busy}>
              {busy ? TEXTS.common.loading : t.createSubmit}
            </Button>
          </>
        }
      >
        <form id="conference-form" className={styles.form} onSubmit={(event) => void create(event)} noValidate>
          <p className="ud-dialog__text">{t.createText}</p>
          {problem ? (
            <ProblemAlert title={problem.title}>
              {problem.text}
            </ProblemAlert>
          ) : null}
          <TextField label={t.name} name="name" value={name} onChange={(event) => setName(event.target.value)} required status={fields.name ? 'error' : 'default'} message={fields.name} />
          <TextField label={t.code} name="code" value={code} maxLength={2} autoCapitalize="characters" onChange={(event) => setCode(event.target.value.toUpperCase())} required status={fields.code ? 'error' : 'default'} message={fields.code ?? t.codeHint} />
          <TextField label={t.edition} name="editionYear" inputMode="numeric" value={edition} onChange={(event) => setEdition(event.target.value)} status={fields.editionYear ? 'error' : 'default'} message={fields.editionYear ?? t.editionHint} />
          <Select label={t.timeZone} name="timeZone" value={timeZone} onChange={(event) => setTimeZone(event.target.value)} options={[...timeZones]} status={fields.timeZone ? 'error' : 'default'} message={fields.timeZone ?? t.timeZoneHint} />
          <CheckboxGroup label={t.languages} value={languages} onChange={setLanguages} options={LANGUAGES.map((value) => ({ value, label: t.languageNames[value] ?? value }))} status={fields.languages ? 'error' : 'default'} message={fields.languages} />
        </form>
      </Dialog>
    </div>
  );
}
