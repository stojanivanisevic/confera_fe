'use client';

/**
 * One mail server (M2-FE-04; FR-SMTP-01 to 03, ADR-11, ST-19, ST-20): its settings, the
 * password write-only (never shown, kept unless a new one is typed or it is removed; a new
 * target without a new password clears it on the server), the default and fallback marks;
 * every change asks for the password again. A test message goes to one address. `id` "new"
 * is the form of a new server.
 */
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import type { MailServer as MailServerRecord, TestMessageResult } from '@confera/api-client';
import { Alert, Button, Card, ConfirmDialog, NumberField, PageHeader, PasswordField, Select, Switch, TextButton, TextField, toast } from '@confera/ui';

import styles from './admin.module.css';
import { ProblemAlert } from './ProblemAlert';
import { LANGUAGES } from './Conferences';
import { formatDateTime } from './format';
import { isCancelled, useFreshPassword } from './FreshPassword';
import { call, callEmpty, explain, fieldMessages, isApiError, type Explained } from './problems';
import { useSession } from './session';
import { fill, TEXTS } from './texts';
import { useLoad } from './useLoad';

type TlsMode = MailServerRecord['tlsMode'];
const TLS_MODES: readonly TlsMode[] = ['implicit', 'starttls', 'none'];
const DEFAULT_PORT: Readonly<Record<TlsMode, number>> = { implicit: 465, starttls: 587, none: 1025 };

interface Form {
  name: string;
  host: string;
  port: string;
  tlsMode: TlsMode;
  username: string;
  fromAddress: string;
  fromName: string;
  rate: string;
  isDefault: boolean;
  isFallback: boolean;
  enabled: boolean;
}

const EMPTY: Form = { name: '', host: '', port: '587', tlsMode: 'starttls', username: '', fromAddress: '', fromName: '', rate: '60', isDefault: false, isFallback: false, enabled: true };

const formOf = (server: MailServerRecord): Form => ({
  name: server.name,
  host: server.host,
  port: String(server.port),
  tlsMode: server.tlsMode,
  username: server.username ?? '',
  fromAddress: server.fromAddress,
  fromName: server.fromName,
  rate: String(server.sendRatePerMinute),
  isDefault: server.isDefault,
  isFallback: server.isFallback,
  enabled: server.enabled,
});

export function MailServer({ id }: { id: string }) {
  const creating = id === 'new';
  const router = useRouter();
  const { client, contact, session } = useSession();
  const { withFreshPassword } = useFreshPassword();
  const t = TEXTS.mailServers;
  const mayManage = session?.user.permissions.includes('mail_servers.manage') ?? false;
  const server = useLoad<MailServerRecord | null>((c) => (creating ? Promise.resolve(null) : call(c.GET('/api/v1/mail-servers/{id}', { params: { path: { id } } }))), [id]);
  const record = server.state.data ?? null;

  const [form, setForm] = useState<Form>(EMPTY);
  const [formKey, setFormKey] = useState<string | null>(null);
  const key = record ? `${record.id}:${String(record.version)}` : creating ? 'new' : null;
  // The form follows the record: a new version (after a save) replaces what is typed.
  const [secret, setSecret] = useState('');
  const [removeSecret, setRemoveSecret] = useState(false);
  if (key !== null && key !== formKey) {
    setFormKey(key);
    setForm(record ? formOf(record) : EMPTY);
    setSecret('');
    setRemoveSecret(false);
  }

  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Explained | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState(false);
  const [testTo, setTestTo] = useState(session?.user.email ?? '');
  const [testLanguage, setTestLanguage] = useState<'en' | 'sr'>('en');
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<(TestMessageResult & { to: string }) | null>(null);
  const [testProblem, setTestProblem] = useState<Explained | null>(null);

  if (!creating && server.state.phase === 'failed' && !record) {
    return (
      <div className={styles.stack}>
        <PageHeader title={t.title} breadcrumbs={[{ label: t.back, href: '/mail-servers', onClick: () => router.push('/mail-servers') }]} />
        <Alert tone="error" title={server.state.problem.title} action={<TextButton onClick={() => void server.reload()}>{TEXTS.connection.tryAgain}</TextButton>}>
          {server.state.problem.text}
        </Alert>
      </div>
    );
  }
  if (!creating && !record) return null;

  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const readOnly = !mayManage;
  const targetChanged = record !== null && (form.host.trim().toLowerCase() !== record.host || Number(form.port) !== record.port || form.tlsMode !== record.tlsMode || (form.username.trim() || null) !== record.username);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    setFields({});
    const settings = {
      name: form.name.trim(),
      host: form.host.trim(),
      port: Number(form.port),
      tlsMode: form.tlsMode,
      username: form.username.trim() === '' ? null : form.username.trim(),
      fromAddress: form.fromAddress.trim(),
      fromName: form.fromName.trim(),
      sendRatePerMinute: Number(form.rate),
      isDefault: form.isDefault,
      isFallback: form.isFallback,
      enabled: form.enabled,
    };
    try {
      if (record === null) {
        const created = await withFreshPassword(() => call(client.POST('/api/v1/mail-servers', { body: { ...settings, ...(secret !== '' ? { password: secret } : {}) } })));
        setSecret('');
        toast({ title: fill(t.created, { name: created.name }), tone: 'success' });
        router.replace(`/mail-servers/${created.id}`);
      } else {
        const credential = secret !== '' ? { password: secret } : removeSecret ? { password: null } : {};
        const next = await withFreshPassword(() => call(client.PATCH('/api/v1/mail-servers/{id}', { params: { path: { id } }, body: { ...settings, ...credential, version: record.version } })));
        server.replace(next);
        toast({ title: fill(t.saved, { name: next.name }), tone: 'success' });
      }
    } catch (error) {
      if (isCancelled(error)) return;
      const named = fieldMessages(error);
      setFields(named);
      // The target rules of ADR-11 are answered with 422 and the field they concern (UXUI-M2-10); an API that
      // names no field still has its code shown at the field.
      if (Object.keys(named).length === 0 && isApiError(error) && (error.code === 'tls_required' || error.code === 'port_not_allowed' || error.code === 'address_not_allowed')) {
        const reason = t.reasons[error.code] ?? t.reasonFallback;
        setFields({ [error.code === 'tls_required' ? 'tlsMode' : error.code === 'port_not_allowed' ? 'port' : 'host']: reason.charAt(0).toUpperCase() + reason.slice(1) });
      }
      setProblem(explain(error, contact));
      if (isApiError(error) && error.code === 'version_conflict') await server.reload({ background: true });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!record) return;
    setBusy(true);
    setProblem(null);
    try {
      await withFreshPassword(() => callEmpty(client.DELETE('/api/v1/mail-servers/{id}', { params: { path: { id }, query: { version: record.version } } })));
      setDeleting(false);
      toast({ title: fill(t.removed, { name: record.name }), tone: 'success' });
      router.push('/mail-servers');
    } catch (error) {
      setDeleting(false);
      if (isCancelled(error)) return;
      setProblem(explain(error, contact));
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async (event: FormEvent) => {
    event.preventDefault();
    if (!record) return;
    setTestBusy(true);
    setTestResult(null);
    setTestProblem(null);
    try {
      const result = await call(client.POST('/api/v1/mail-servers/{id}/test-message', { params: { path: { id } }, body: { to: testTo.trim(), language: testLanguage } }));
      setTestResult({ ...result, to: testTo.trim() });
    } catch (error) {
      setTestProblem(explain(error, contact));
    } finally {
      setTestBusy(false);
    }
  };

  const secretMessage = fields.password ?? (removeSecret ? t.secretRemoved : record?.credentialSet ? fill(t.secretSet, { date: formatDateTime(record.credentialSetAt) }) : `${t.secretNotSet} ${t.secretHint}`);
  const title = record ? record.name : t.newTitle;

  return (
    <div className={styles.stack}>
      <PageHeader
        title={title}
        breadcrumbs={[{ label: t.back, href: '/mail-servers', onClick: () => router.push('/mail-servers') }, { label: title }]}
        actions={
          record && mayManage ? (
            <Button variant="danger" icon="trash" onClick={() => setDeleting(true)}>
              {t.remove}
            </Button>
          ) : undefined
        }
      />
      {problem ? (
        <ProblemAlert title={problem.title} onClose={() => setProblem(null)}>
          {problem.text}
        </ProblemAlert>
      ) : null}
      <Card title={TEXTS.conferences.settings} headingLevel={2}>
        <form className={styles.fields} onSubmit={(event) => void save(event)} noValidate data-confera-mail-server>
          <TextField label={t.name} name="name" value={form.name} disabled={readOnly} onChange={(event) => set({ name: event.target.value })} required status={fields.name ? 'error' : 'default'} message={fields.name} />
          <TextField label={t.host} name="host" value={form.host} disabled={readOnly} autoComplete="off" spellCheck={false} onChange={(event) => set({ host: event.target.value })} required status={fields.host ? 'error' : 'default'} message={fields.host} />
          <Select
            label={t.tlsMode}
            name="tlsMode"
            value={form.tlsMode}
            disabled={readOnly}
            onChange={(event) => {
              const tlsMode = event.target.value as TlsMode;
              // The usual port of the mode, unless another one was typed on purpose.
              set({ tlsMode, port: Object.values(DEFAULT_PORT).map(String).includes(form.port) ? String(DEFAULT_PORT[tlsMode]) : form.port });
            }}
            options={TLS_MODES.map((value) => ({ value, label: t.tlsModes[value] ?? value }))}
            status={fields.tlsMode ? 'error' : 'default'}
            message={fields.tlsMode}
          />
          <NumberField label={t.port} name="port" value={form.port} disabled={readOnly} min={1} max={65535} onChange={(event) => set({ port: event.target.value })} required status={fields.port ? 'error' : 'default'} message={fields.port} />
          <TextField label={t.username} name="username" value={form.username} disabled={readOnly} autoComplete="off" spellCheck={false} onChange={(event) => set({ username: event.target.value })} status={fields.username ? 'error' : 'default'} message={fields.username} />
          <div className={styles.form}>
            <PasswordField label={t.secretLabel} name="password" value={secret} disabled={readOnly} autoComplete="new-password" onChange={(event) => setSecret(event.target.value)} status={fields.password ? 'error' : 'default'} message={secretMessage} />
            {record?.credentialSet && !readOnly && secret === '' ? (
              <TextButton type="button" onClick={() => setRemoveSecret(!removeSecret)}>
                {removeSecret ? t.secretKeep : t.secretRemove}
              </TextButton>
            ) : null}
          </div>
          {targetChanged && record?.credentialSet && secret === '' ? (
            <div className={styles.all}>
              <Alert tone="warning" title={t.targetNotice} />
            </div>
          ) : null}
          <TextField label={t.fromAddress} name="fromAddress" type="email" value={form.fromAddress} disabled={readOnly} onChange={(event) => set({ fromAddress: event.target.value })} required status={fields.fromAddress ? 'error' : 'default'} message={fields.fromAddress} />
          <TextField label={t.fromName} name="fromName" value={form.fromName} disabled={readOnly} onChange={(event) => set({ fromName: event.target.value })} required status={fields.fromName ? 'error' : 'default'} message={fields.fromName} />
          <NumberField label={t.rate} name="sendRatePerMinute" value={form.rate} disabled={readOnly} min={1} max={600} onChange={(event) => set({ rate: event.target.value })} status={fields.sendRatePerMinute ? 'error' : 'default'} message={fields.sendRatePerMinute ?? t.rateHint} />
          <div className={styles.all}>
            {/* One switch per line, each with what it means (UXUI-M2-23). */}
            <div className={styles.form}>
              <Switch label={t.isDefault} description={t.isDefaultHint} checked={form.isDefault} disabled={readOnly} onChange={(event) => set({ isDefault: event.target.checked })} />
              <Switch label={t.isFallback} description={t.isFallbackHint} checked={form.isFallback} disabled={readOnly} onChange={(event) => set({ isFallback: event.target.checked })} />
              <Switch label={t.enabled} description={t.enabledHint} checked={form.enabled} disabled={readOnly} onChange={(event) => set({ enabled: event.target.checked })} />
            </div>
          </div>
          {readOnly ? null : (
            <div className={styles.all}>
              <Button type="submit" disabled={busy}>
                {busy ? TEXTS.common.loading : record ? t.save : t.create}
              </Button>
            </div>
          )}
        </form>
      </Card>

      <Card title={t.test} headingLevel={2}>
        {record === null ? (
          <p className={styles.text}>{t.testSaveFirst}</p>
        ) : (
          <form className={styles.fields} onSubmit={(event) => void sendTest(event)} noValidate data-confera-test-message>
            <p className={`${styles.text} ${styles.all}`}>{t.testText}</p>
            <TextField label={t.testTo} name="to" type="email" value={testTo} onChange={(event) => setTestTo(event.target.value)} required />
            <Select label={t.testLanguage} name="language" value={testLanguage} onChange={(event) => setTestLanguage(event.target.value as 'en' | 'sr')} options={LANGUAGES.map((value) => ({ value, label: TEXTS.conferences.languageNames[value] ?? value }))} />
            <div className={styles.all}>
              <Button type="submit" variant="dark" icon="send" disabled={testBusy || !mayManage || testTo.trim() === ''}>
                {testBusy ? t.testSending : t.testSend}
              </Button>
            </div>
            {testResult ? (
              <div className={styles.all} data-confera-test-result={testResult.result}>
                <Alert tone={testResult.result === 'sent' ? 'success' : 'error'} title={fill(t.testResult[testResult.result] ?? '', { to: testResult.to, reason: testResult.reason ? (t.reasons[testResult.reason] ?? t.reasonFallback) : t.reasonFallback })}>
                  {/* What kind of failure it was, in the office's words (M2-ISS-14, UXUI-M2-11). */}
                  {testResult.result === 'failed' && testResult.cause ? <span data-confera-test-cause={testResult.cause}>{t.causes[testResult.cause] ?? ''}</span> : null}
                </Alert>
              </div>
            ) : null}
            {testProblem ? (
              <div className={styles.all}>
                <ProblemAlert title={testProblem.title}>
                  {testProblem.text}
                </ProblemAlert>
              </div>
            ) : null}
          </form>
        )}
      </Card>

      {record ? (
        <ConfirmDialog open={deleting} title={fill(t.removeQuestion, { name: record.name })} confirmText={t.remove} destructive busy={busy} onCancel={() => setDeleting(false)} onConfirm={() => void remove()}>
          {t.removeText}
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
