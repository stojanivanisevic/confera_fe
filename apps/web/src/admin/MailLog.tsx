'use client';

/**
 * The mail log (M2-FE-04, M4-FE-04; FR-SMTP-04, FR-SMTP-06): every attempt to send a message,
 * newest first, a page at a time, with filters by message and result; the conference of the switch
 * narrows it. Its settings are in a card of their own here (UXUI-M2-31): whether the content of a
 * message is kept, and for how many days an entry is kept (24 months unless changed).
 */
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { TEMPLATE_TYPES, type AdminPaths, type MailLogPage, type MailLogSummary, type Organisation } from '@confera/api-client';
import { Alert, Button, Card, DataTable, EmptyState, FilterBar, NumberField, PageHeader, Pagination, Select, StatusBadge, Switch, TextButton, toast } from '@confera/ui';

import styles from './admin.module.css';
import { conferenceLabel, useConference } from './conference-context';
import { formatDateTime } from './format';
import { m4 } from './m4-api';
import { call, explain, fieldMessages, type Explained } from './problems';
import { useSession } from './session';
import { fill, TEXTS } from './texts';
import { useLoad } from './useLoad';

type Query = NonNullable<AdminPaths['/api/v1/mail-log']['get']['parameters']['query']>;
type Kind = NonNullable<Query['kind']>;
type Result = NonNullable<Query['result']>;

export function MailLog() {
  const router = useRouter();
  const { selected, select } = useConference();
  const { session } = useSession();
  const mayReadServers = session?.user.permissions.includes('mail_servers.read') ?? false;
  const t = TEXTS.mailLog;
  const [kind, setKind] = useState<'' | Kind>('');
  const [result, setResult] = useState<'' | Result>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const conferenceId = selected?.id;
  const filtered = kind !== '' || result !== '';

  const log = useLoad<MailLogPage>(
    (c) => call(c.GET('/api/v1/mail-log', { params: { query: { ...(kind ? { kind } : {}), ...(result ? { result } : {}), ...(conferenceId ? { conferenceId } : {}), page, pageSize } } })),
    [kind, result, conferenceId, page, pageSize],
  );
  const clear = () => {
    setKind('');
    setResult('');
    setPage(1);
  };

  return (
    <div className={styles.stack}>
      <PageHeader title={t.title} description={selected ? fill(t.leadConference, { conference: conferenceLabel(selected) }) : t.lead} />
      {log.state.phase === 'failed' ? (
        <Alert tone="error" title={log.state.problem.title} action={<TextButton onClick={() => void log.reload()}>{TEXTS.connection.tryAgain}</TextButton>}>
          {log.state.problem.text}
        </Alert>
      ) : null}
      {session?.user.permissions.includes('organisation.read') ? <MailLogSettings mayManage={session.user.permissions.includes('organisation.manage') && session.user.permissions.includes('mail_log.manage')} /> : null}
      {/* While the list failed it shows no empty state that would contradict the alert (UXUI-M2-15). */}
      {log.state.phase === 'failed' && !log.state.data ? null : (
      <DataTable<MailLogSummary>
        caption={t.title}
        rows={log.state.data?.items ?? []}
        rowKey="id"
        loading={log.state.phase === 'loading' && !log.state.data}
        filtered={filtered}
        onClearFilters={clear}
        empty={
          selected ? (
            // The log of one conference is empty: say which, and that invitations and notices belong to no conference (UXUI-M2-05).
            <EmptyState
              title={fill(t.emptyConference, { conference: conferenceLabel(selected) })}
              description={t.emptyConferenceText}
              action={
                <TextButton icon="x" onClick={() => select(null)}>
                  {t.showAll}
                </TextButton>
              }
            />
          ) : (
          <EmptyState
            title={t.empty}
            description={t.emptyText}
            action={
              mayReadServers ? (
                <TextButton icon="send" onClick={() => router.push('/mail-servers')}>
                  {t.toServers}
                </TextButton>
              ) : undefined
            }
          />
          )
        }
        onRowClick={(row) => router.push(`/mail-log/${row.id}`)}
        openColumn="sentAt"
        columns={[
          { key: 'sentAt', header: t.sentAt, render: (row) => formatDateTime(row.sentAt) },
          { key: 'recipient', header: t.recipient },
          { key: 'kind', header: t.kind, render: (row) => TEXTS.templates.types[row.kind] ?? row.kind },
          // The subject in the list (M2-ISS-14); a message whose content is not kept has none.
          { key: 'subject', header: t.subject, render: (row) => <span className={styles.break}>{row.subject ?? ''}</span> },
          { key: 'language', header: t.language, render: (row) => TEXTS.conferences.languageNames[row.language] ?? row.language },
          { key: 'serverName', header: t.server, render: (row) => row.serverName ?? '' },
          { key: 'attempt', header: t.attempt, align: 'right' },
          { key: 'result', header: t.result, render: (row) => <StatusBadge tone={row.result === 'sent' ? 'success' : 'danger'}>{t.results[row.result] ?? row.result}</StatusBadge> },
          { key: 'errorCode', header: t.errorCode, render: (row) => (row.errorCode ? (t.errors[row.errorCode] ?? row.errorCode) : '') },
        ]}
        toolbar={
          <FilterBar onReset={filtered ? clear : undefined}>
            <Select
              label={t.kind}
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as '' | Kind);
                setPage(1);
              }}
              options={[{ value: '', label: t.anyKind }, ...TEMPLATE_TYPES.map((value) => ({ value, label: TEXTS.templates.types[value] ?? value }))]}
            />
            <Select
              label={t.result}
              value={result}
              onChange={(event) => {
                setResult(event.target.value as '' | Result);
                setPage(1);
              }}
              options={[{ value: '', label: t.anyResult }, ...(['sent', 'failed'] as const).map((value) => ({ value, label: t.results[value] ?? value }))]}
            />
          </FilterBar>
        }
        footer={
          <Pagination
            page={page}
            pageSize={pageSize}
            total={log.state.data?.total ?? 0}
            onPageChange={setPage}
            pageSizeOptions={[10, 25, 50, 100]}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        }
      />
      )}
    </div>
  );
}

/** What the mail log keeps and how long (FR-SMTP-06; UXUI-M2-31): the content switch of the profile and the retention, one card. */
function MailLogSettings({ mayManage }: { mayManage: boolean }) {
  const { client, contact } = useSession();
  const t = TEXTS.mailLog;
  const settings = useLoad<{ profile: Organisation; days: number }>(async (c) => {
    const [profile, retention] = await Promise.all([call(c.GET('/api/v1/organisation')), m4.retention(c)]);
    return { profile, days: retention.days };
  }, []);
  const record = settings.state.data;
  const [days, setDays] = useState('');
  const [content, setContent] = useState(true);
  const [held, setHeld] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Explained | null>(null);
  const [fields, setFields] = useState<Readonly<Record<string, string>>>({});
  const heldKey = record ? `${String(record.profile.version)}:${String(record.days)}` : null;
  if (record && heldKey !== held) {
    setHeld(heldKey);
    setDays(String(record.days));
    setContent(record.profile.mailLogContent);
  }
  if (!record) return null;
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const value = Number(days);
    if (!Number.isInteger(value) || value < 30 || value > 3650) {
      setFields({ days: t.retentionHint });
      return;
    }
    setBusy(true);
    setProblem(null);
    setFields({});
    try {
      // Both are settings of the organisation profile, one version for both: the content first, then the days.
      let profile = record.profile;
      if (content !== profile.mailLogContent) profile = await call(client.PATCH('/api/v1/organisation', { body: { mailLogContent: content, version: profile.version } }));
      let kept = record.days;
      if (value !== record.days) {
        const retention = await m4.setRetention(client, value, profile.version);
        kept = retention.days;
        profile = { ...profile, version: retention.version };
      }
      settings.replace({ profile, days: kept });
      toast({ title: fill(t.retentionSaved, { days: kept }), tone: 'success' });
    } catch (error) {
      setFields(fieldMessages(error));
      setProblem(explain(error, contact));
      void settings.reload({ background: true });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title={t.settings} subtitle={fill(t.retentionNow, { days: record.days, months: Math.round(record.days / 30.4) })} headingLevel={2} id="mail-log-settings" data-confera-mail-log-settings="">
      <form className={styles.form} onSubmit={(event) => void save(event)} noValidate>
        <p className={styles.text}>{t.settingsLead}</p>
        {problem && Object.keys(fields).length === 0 ? <Alert tone="error" title={problem.title}>{problem.text}</Alert> : null}
        <div className={styles.fields}>
          <NumberField label={t.retention} unit={t.retentionUnit} name="days" min={30} max={3650} step={1} value={days} disabled={!mayManage} onChange={(event) => setDays(event.target.value)} status={fields.days ? 'error' : 'default'} message={fields.days ?? t.retentionHint} />
        </div>
        <Switch label={t.content} description={t.contentHint} checked={content} disabled={!mayManage} onChange={(event) => setContent(event.target.checked)} />
        {mayManage ? (
          <div className={styles.actionsInline}>
            <Button type="submit" variant="dark" disabled={busy}>
              {busy ? TEXTS.common.loading : t.retentionSave}
            </Button>
          </div>
        ) : null}
      </form>
    </Card>
  );
}
