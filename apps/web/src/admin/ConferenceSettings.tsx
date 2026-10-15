'use client';

/**
 * The settings of one conference (M2-FE-03; FR-CONF-01 to 04, ST-30): name, code and edition,
 * dates and venue, languages, time zone, mail server and the listed sites; its state as
 * FR-CONF-04 allows (archived is final and read-only); a copy as a new draft. Every change is
 * made on the version the screen holds.
 */
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import type { Conference as ConferenceRecord, ConferenceState, MailServer } from '@confera/api-client';
import { Alert, Button, Card, CheckboxGroup, ConfirmDialog, DateField, Dialog, PageHeader, Select, StatusBadge, Textarea, TextButton, TextField, toast } from '@confera/ui';

import styles from './admin.module.css';
import { conferenceLabel, useConference } from './conference-context';
import { LANGUAGES, stateTone, timeZones, yearOf } from './Conferences';
import { call, explain, fieldMessages, isApiError, type Explained } from './problems';
import { useSession } from './session';
import { fill, TEXTS } from './texts';
import { useLoad } from './useLoad';

/** The changes of state FR-CONF-04 allows. */
const NEXT_STATES: Readonly<Record<ConferenceState, readonly ConferenceState[]>> = {
  draft: ['open', 'archived'],
  open: ['closed'],
  closed: ['open', 'archived'],
  archived: [],
};

interface Form {
  name: string;
  code: string;
  edition: string;
  startsOn: string;
  endsOn: string;
  venue: string;
  languages: string[];
  timeZone: string;
  mailServerId: string;
  sites: string;
}

const formOf = (conference: ConferenceRecord): Form => ({
  name: conference.name,
  code: conference.code,
  edition: conference.editionYear === null ? '' : String(conference.editionYear),
  startsOn: conference.startsOn ?? '',
  endsOn: conference.endsOn ?? '',
  venue: conference.venue ?? '',
  languages: [...conference.languages],
  timeZone: conference.timeZone,
  mailServerId: conference.mailServerId ?? '',
  sites: conference.listedSites.join('\n'),
});

/** The refusals of the listed sites, as one message for the field: "Line 3: only the site: no path". */
function sitesMessage(fields: Record<string, string>): string | undefined {
  const lines = Object.entries(fields)
    .map(([path, message]) => [/^listedSites\[(\d+)\]$/.exec(path)?.[1], message] as const)
    .filter((entry): entry is readonly [string, string] => entry[0] !== undefined)
    .map(([index, message]) => fill(TEXTS.conferences.sitesLine, { line: Number(index) + 1, problem: message }));
  return lines.length > 0 ? lines.join(' ') : fields.listedSites;
}

export function ConferenceSettings({ id }: { id: string }) {
  const router = useRouter();
  const { client, contact, session } = useSession();
  const switcher = useConference();
  const t = TEXTS.conferences;
  const permissions = session?.user.permissions ?? [];
  const mayManage = permissions.includes('conferences.manage');
  const conference = useLoad<ConferenceRecord>((c) => call(c.GET('/api/v1/conferences/{id}', { params: { path: { id } } })), [id]);
  const servers = useLoad<readonly MailServer[]>((c) => (permissions.includes('mail_servers.read') ? call(c.GET('/api/v1/mail-servers')).then((list) => list.items) : Promise.resolve([])), [permissions.includes('mail_servers.read')]);

  const record = conference.state.data;
  // The form follows the record: a new version from the server (after a save) replaces it.
  const [form, setForm] = useState<Form | null>(null);
  const [formVersion, setFormVersion] = useState<string | null>(null);
  const recordKey = record ? `${record.id}:${String(record.version)}` : null;
  if (record && recordKey !== formVersion) {
    setFormVersion(recordKey);
    setForm(formOf(record));
  }

  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Explained | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [asked, setAsked] = useState<ConferenceState | null>(null);
  const [copying, setCopying] = useState(false);
  const [copyName, setCopyName] = useState('');
  const [copyCode, setCopyCode] = useState('');
  const [copyEdition, setCopyEdition] = useState('');
  const [copyFields, setCopyFields] = useState<Record<string, string>>({});
  const [copyProblem, setCopyProblem] = useState<Explained | null>(null);

  if (conference.state.phase === 'failed' && !record) {
    return (
      <div className={styles.stack}>
        <PageHeader title={t.title} breadcrumbs={[{ label: t.back, href: '/conferences', onClick: () => router.push('/conferences') }]} />
        <Alert tone="error" title={conference.state.problem.title} action={<TextButton onClick={() => void conference.reload()}>{TEXTS.connection.tryAgain}</TextButton>}>
          {conference.state.problem.text}
        </Alert>
      </div>
    );
  }
  if (!record || !form) return null;

  const archived = record.state === 'archived';
  const readOnly = archived || !mayManage;
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });

  const refused = async (error: unknown) => {
    setFields(fieldMessages(error));
    setProblem(explain(error, contact));
    if (isApiError(error) && error.code === 'version_conflict') await conference.reload({ background: true });
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    setFields({});
    try {
      const sites = form.sites
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '');
      const next = await call(
        client.PATCH('/api/v1/conferences/{id}', {
          params: { path: { id } },
          body: {
            version: record.version,
            name: form.name.trim(),
            code: form.code.trim(),
            editionYear: yearOf(form.edition),
            startsOn: form.startsOn === '' ? null : form.startsOn,
            endsOn: form.endsOn === '' ? null : form.endsOn,
            venue: form.venue.trim() === '' ? null : form.venue.trim(),
            languages: form.languages as ('en' | 'sr')[],
            timeZone: form.timeZone,
            mailServerId: form.mailServerId === '' ? null : form.mailServerId,
            listedSites: sites,
          },
        }),
      );
      conference.replace(next);
      toast({ title: fill(t.saved, { name: next.name }), tone: 'success' });
      await switcher.reload();
    } catch (error) {
      await refused(error);
    } finally {
      setBusy(false);
    }
  };

  const changeState = async (state: ConferenceState) => {
    setBusy(true);
    setProblem(null);
    try {
      const next = await call(client.POST('/api/v1/conferences/{id}/state', { params: { path: { id } }, body: { state, version: record.version } }));
      setAsked(null);
      conference.replace(next);
      toast({ title: fill(t.stateChanged, { name: next.name, state: (t.states[next.state] ?? next.state).toLowerCase() }), tone: 'success' });
      await switcher.reload();
    } catch (error) {
      setAsked(null);
      await refused(error);
    } finally {
      setBusy(false);
    }
  };

  const openCopy = () => {
    setCopyName(`${record.name}`);
    setCopyCode(record.code);
    setCopyEdition(record.editionYear === null ? '' : String(record.editionYear + 1));
    setCopyFields({});
    setCopyProblem(null);
    setCopying(true);
  };

  const copy = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setCopyFields({});
    setCopyProblem(null);
    try {
      const created = await call(client.POST('/api/v1/conferences/{id}/copy', { params: { path: { id } }, body: { name: copyName.trim(), code: copyCode.trim(), editionYear: yearOf(copyEdition) } }));
      setCopying(false);
      toast({ title: fill(t.copied, { name: conferenceLabel(created) }), tone: 'success' });
      await switcher.reload();
      router.push(`/conferences/${created.id}`);
    } catch (error) {
      setCopyFields(fieldMessages(error));
      setCopyProblem(explain(error, contact));
    } finally {
      setBusy(false);
    }
  };

  const working = switcher.selected?.id === record.id;
  const stateButtons = mayManage
    ? NEXT_STATES[record.state].map((state) => (
        <Button key={state} variant={state === 'archived' ? 'danger' : 'dark'} onClick={() => setAsked(state)}>
          {state === 'open' && record.state === 'closed' ? t.reopen : (t.to[state] ?? state)}
        </Button>
      ))
    : [];
  const serverOptions = [{ value: '', label: t.mailServerDefault }, ...(servers.state.data ?? []).map((server) => ({ value: server.id, label: server.name }))];
  if (form.mailServerId !== '' && !serverOptions.some((option) => option.value === form.mailServerId)) serverOptions.push({ value: form.mailServerId, label: form.mailServerId });

  return (
    <div className={styles.stack}>
      <PageHeader
        title={record.name}
        description={`${record.code}${record.editionYear ? ` ${String(record.editionYear)}` : ''}`}
        breadcrumbs={[{ label: t.back, href: '/conferences', onClick: () => router.push('/conferences') }, { label: record.name }]}
        actions={
          <div className={styles.actionsInline}>
            <StatusBadge tone={stateTone(record.state)}>{t.states[record.state] ?? record.state}</StatusBadge>
            {working ? null : (
              <Button variant="dark" onClick={() => switcher.select(record.id)}>
                {t.use}
              </Button>
            )}
            {mayManage ? (
              <Button variant="dark" icon="copy" onClick={openCopy}>
                {t.copy}
              </Button>
            ) : null}
            {stateButtons}
          </div>
        }
      />
      {working ? <p className={styles.text}>{t.inUse}</p> : null}
      {archived ? (
        <Alert tone="info" title={t.archived}>
          {t.archivedText}
        </Alert>
      ) : null}
      {problem ? (
        <Alert tone="error" title={problem.title} onClose={() => setProblem(null)}>
          {problem.text}
        </Alert>
      ) : null}
      <Card title={t.settings} headingLevel={2}>
        <form className={styles.fields} onSubmit={(event) => void save(event)} noValidate data-confera-conference-settings>
          <TextField label={t.name} name="name" value={form.name} disabled={readOnly} onChange={(event) => set({ name: event.target.value })} required status={fields.name ? 'error' : 'default'} message={fields.name} />
          <TextField label={t.code} name="code" value={form.code} maxLength={2} disabled={readOnly} onChange={(event) => set({ code: event.target.value.toUpperCase() })} required status={fields.code ? 'error' : 'default'} message={fields.code ?? t.codeHint} />
          <TextField label={t.edition} name="editionYear" inputMode="numeric" value={form.edition} disabled={readOnly} onChange={(event) => set({ edition: event.target.value })} status={fields.editionYear ? 'error' : 'default'} message={fields.editionYear ?? t.editionHint} />
          <TextField label={t.venue} name="venue" value={form.venue} disabled={readOnly} onChange={(event) => set({ venue: event.target.value })} status={fields.venue ? 'error' : 'default'} message={fields.venue} />
          <DateField label={t.startsOn} name="startsOn" value={form.startsOn} disabled={readOnly} onChange={(event) => set({ startsOn: event.target.value })} status={fields.startsOn ? 'error' : 'default'} message={fields.startsOn} />
          <DateField label={t.endsOn} name="endsOn" value={form.endsOn} disabled={readOnly} onChange={(event) => set({ endsOn: event.target.value })} status={fields.endsOn ? 'error' : 'default'} message={fields.endsOn} />
          <Select label={t.timeZone} name="timeZone" value={form.timeZone} disabled={readOnly} onChange={(event) => set({ timeZone: event.target.value })} options={timeZones()} status={fields.timeZone ? 'error' : 'default'} message={fields.timeZone ?? t.timeZoneHint} />
          <Select label={t.mailServer} name="mailServerId" value={form.mailServerId} disabled={readOnly} onChange={(event) => set({ mailServerId: event.target.value })} options={serverOptions} status={fields.mailServerId ? 'error' : 'default'} message={fields.mailServerId ?? t.mailServerHint} />
          <div className={styles.all}>
            <CheckboxGroup label={t.languages} value={form.languages} disabled={readOnly} onChange={(languages) => set({ languages })} options={LANGUAGES.map((value) => ({ value, label: t.languageNames[value] ?? value }))} direction="row" status={fields.languages ? 'error' : 'default'} message={fields.languages} />
          </div>
          <div className={styles.all}>
            <Textarea label={t.sites} name="listedSites" rows={4} value={form.sites} disabled={readOnly} onChange={(event) => set({ sites: event.target.value })} spellCheck={false} status={sitesMessage(fields) ? 'error' : 'default'} message={sitesMessage(fields) ?? t.sitesHint} />
          </div>
          {readOnly ? null : (
            <div className={styles.all}>
              <Button type="submit" disabled={busy}>
                {busy ? TEXTS.common.loading : t.save}
              </Button>
            </div>
          )}
        </form>
      </Card>

      <ConfirmDialog open={asked !== null} title={asked ? fill(t.stateQuestion[asked] ?? '', { name: record.name }) : ''} confirmText={asked ? (asked === 'open' && record.state === 'closed' ? t.reopen : (t.to[asked] ?? asked)) : ''} destructive={asked === 'archived'} busy={busy} onCancel={() => setAsked(null)} onConfirm={() => asked && void changeState(asked)}>
        {asked ? t.stateText[asked] : null}
      </ConfirmDialog>

      <Dialog
        open={copying}
        onClose={() => setCopying(false)}
        title={fill(t.copyTitle, { name: record.name })}
        actions={
          <>
            <TextButton type="button" onClick={() => setCopying(false)}>
              {TEXTS.common.cancel}
            </TextButton>
            <Button type="submit" form="copy-form" disabled={busy}>
              {busy ? TEXTS.common.loading : t.copySubmit}
            </Button>
          </>
        }
      >
        <form id="copy-form" className={styles.form} onSubmit={(event) => void copy(event)} noValidate>
          <p className="ud-dialog__text">{t.copyText}</p>
          {copyProblem ? (
            <Alert tone="error" title={copyProblem.title}>
              {copyProblem.text}
            </Alert>
          ) : null}
          <TextField label={t.name} name="name" value={copyName} onChange={(event) => setCopyName(event.target.value)} required status={copyFields.name ? 'error' : 'default'} message={copyFields.name} />
          <TextField label={t.code} name="code" value={copyCode} maxLength={2} onChange={(event) => setCopyCode(event.target.value.toUpperCase())} status={copyFields.code ? 'error' : 'default'} message={copyFields.code ?? t.codeHint} />
          <TextField label={t.edition} name="editionYear" inputMode="numeric" value={copyEdition} onChange={(event) => setCopyEdition(event.target.value)} status={copyFields.editionYear ? 'error' : 'default'} message={copyFields.editionYear ?? t.editionHint} />
        </form>
      </Dialog>
    </div>
  );
}
