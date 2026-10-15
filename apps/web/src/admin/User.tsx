'use client';

/**
 * One user (FR-USR-04): rename, change the role, deactivate, reactivate, remove, send the
 * invitation again, end the sessions. Every change asks for the password again (ADR-03), is
 * made on the version the screen holds (409 when another admin changed it first), and the
 * last-admin rule's refusal is shown as the API gives it (409 `last_admin`).
 */
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import type { UserRecord } from '@confera/api-client';
import { Alert, Button, Card, ConfirmDialog, DescriptionList, Dialog, PageHeader, Select, StatusBadge, TextButton, TextField, toast } from '@confera/ui';

import styles from './admin.module.css';
import { formatDateTime } from './format';
import { isCancelled, useFreshPassword } from './FreshPassword';
import { call, callEmpty, explain, fieldMessages, isApiError, type Explained } from './problems';
import { useSession } from './session';
import { fill, TEXTS } from './texts';
import { useLoad } from './useLoad';
import { statusTone } from './Users';

type Ask = null | 'rename' | 'role' | 'deactivate' | 'reactivate' | 'remove' | 'resend' | 'sessions';

export function User({ id }: { id: string }) {
  const router = useRouter();
  const { client, contact } = useSession();
  const { withFreshPassword } = useFreshPassword();
  const t = TEXTS.user;
  const user = useLoad<UserRecord>((c) => call(c.GET('/api/v1/users/{id}', { params: { path: { id } } })), [id]);

  const [ask, setAsk] = useState<Ask>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Explained | { title: string; text: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [name, setName] = useState('');
  const [role, setRole] = useState<'admin' | 'reviewer'>('reviewer');

  const record = user.state.data;
  const open = (what: Exclude<Ask, null>) => {
    if (!record) return;
    setName(record.displayName);
    setRole(record.role === 'admin' ? 'admin' : 'reviewer');
    setFields({});
    setProblem(null);
    setAsk(what);
  };

  /** Runs a change with the password asked again; shows the refusal; reloads on success. */
  const change = async (work: () => Promise<UserRecord | void>, done: string, after?: () => void) => {
    setBusy(true);
    setProblem(null);
    setFields({});
    try {
      const result = await withFreshPassword(work);
      setAsk(null);
      toast({ title: done, tone: 'success' });
      if (after) after();
      else if (result) user.replace(result);
      else await user.reload({ background: true });
    } catch (error) {
      if (isCancelled(error)) return;
      if (isApiError(error) && error.code === 'last_admin' && record) setProblem({ title: fill(t.lastAdmin, { name: record.displayName }), text: t.lastAdminText });
      else {
        setFields(fieldMessages(error));
        setProblem(explain(error, contact));
      }
      if (isApiError(error) && error.code === 'version_conflict') await user.reload({ background: true });
      // A form dialog shows the refusal at its fields; a confirmation has no place for it, so it closes and the page shows it.
      if (ask !== 'rename' && ask !== 'role') setAsk(null);
    } finally {
      setBusy(false);
    }
  };

  if (user.state.phase === 'failed' && !record) {
    const notFound = user.state.problem.status === 404;
    return (
      <div className={styles.stack}>
        <PageHeader title={t.title} breadcrumbs={[{ label: t.back, href: '/users', onClick: () => router.push('/users') }, { label: t.title }]} />
        <Alert tone="error" title={notFound ? t.notFound : user.state.problem.title} action={notFound ? undefined : <TextButton onClick={() => void user.reload()}>{TEXTS.connection.tryAgain}</TextButton>}>
          {notFound ? t.notFoundText : user.state.problem.text}
        </Alert>
      </div>
    );
  }
  if (!record) return <PageHeader title={t.title} description={TEXTS.common.loading} />;

  const rename = (event: FormEvent) => {
    event.preventDefault();
    void change(() => call(client.PATCH('/api/v1/users/{id}', { params: { path: { id } }, body: { displayName: name.trim(), version: record.version } })), t.renamed);
  };
  const changeRole = (event: FormEvent) => {
    event.preventDefault();
    void change(() => call(client.PUT('/api/v1/users/{id}/role', { params: { path: { id } }, body: { role, version: record.version } })), fill(t.roleChanged, { role: TEXTS.users.roles[role] ?? role }));
  };

  const removed = record.status === 'removed';
  const actions = (
    <div className={styles.actions}>
      {!removed ? <Button variant="dark" onClick={() => open('rename')}>{t.rename}</Button> : null}
      {!removed ? <Button variant="dark" onClick={() => open('role')}>{t.changeRole}</Button> : null}
      {record.status === 'invited' ? <Button variant="dark" onClick={() => open('resend')}>{t.resend}</Button> : null}
      {record.status === 'active' ? <Button variant="dark" onClick={() => open('deactivate')}>{t.deactivate}</Button> : null}
      {record.status === 'deactivated' ? <Button variant="dark" onClick={() => open('reactivate')}>{t.reactivate}</Button> : null}
      {record.status === 'active' ? <Button variant="dark" onClick={() => open('sessions')}>{t.endSessions}</Button> : null}
      {!removed ? <Button variant="danger" onClick={() => open('remove')}>{t.remove}</Button> : null}
    </div>
  );

  return (
    <div className={styles.stack}>
      <PageHeader title={record.displayName} breadcrumbs={[{ label: t.back, href: '/users', onClick: () => router.push('/users') }, { label: record.displayName }]} />
      {problem && ask === null ? (
        <Alert tone="error" title={problem.title} onClose={() => setProblem(null)}>
          {problem.text}
        </Alert>
      ) : null}
      <div className={styles.cards}>
        <Card title={t.details} headingLevel={2}>
          <DescriptionList
            items={[
              { label: t.name, value: record.displayName },
              { label: t.email, value: record.email },
              { label: t.role, value: TEXTS.users.roles[record.role] ?? record.role },
              { label: t.status, value: <StatusBadge tone={statusTone(record.status)}>{TEXTS.users.statuses[record.status] ?? record.status}</StatusBadge> },
              { label: t.created, value: formatDateTime(record.createdAt) },
            ]}
          />
        </Card>
        <Card title={t.actions} headingLevel={2}>
          {actions}
        </Card>
      </div>

      <Dialog open={ask === 'rename'} onClose={() => setAsk(null)} title={t.rename} size="sm" actions={<><TextButton onClick={() => setAsk(null)}>{TEXTS.common.cancel}</TextButton><Button type="submit" form="rename-form" disabled={busy}>{t.renameSubmit}</Button></>}>
        <form id="rename-form" className={styles.form} onSubmit={rename} noValidate>
          {problem ? <Alert tone="error" title={problem.title}>{problem.text}</Alert> : null}
          <TextField label={t.name} name="displayName" value={name} onChange={(event) => setName(event.target.value)} required status={fields.displayName ? 'error' : 'default'} message={fields.displayName} />
        </form>
      </Dialog>

      <Dialog open={ask === 'role'} onClose={() => setAsk(null)} title={t.changeRole} size="sm" actions={<><TextButton onClick={() => setAsk(null)}>{TEXTS.common.cancel}</TextButton><Button type="submit" form="role-form" disabled={busy}>{t.changeRoleSubmit}</Button></>}>
        <form id="role-form" className={styles.form} onSubmit={changeRole} noValidate>
          <p className="ud-dialog__text">{t.changeRoleText}</p>
          {problem ? <Alert tone="error" title={problem.title}>{problem.text}</Alert> : null}
          <Select label={t.role} name="role" value={role} onChange={(event) => setRole(event.target.value === 'admin' ? 'admin' : 'reviewer')} options={[{ value: 'admin', label: TEXTS.users.roles.admin! }, { value: 'reviewer', label: TEXTS.users.roles.reviewer! }]} />
        </form>
      </Dialog>

      <ConfirmDialog open={ask === 'deactivate'} title={fill(t.deactivateQuestion, { name: record.displayName })} confirmText={t.deactivate} busy={busy} onCancel={() => setAsk(null)} onConfirm={() => void change(() => call(client.POST('/api/v1/users/{id}/deactivation', { params: { path: { id } }, body: { version: record.version } })), fill(t.deactivated, { name: record.displayName }))}>
        {t.deactivateText}
      </ConfirmDialog>
      <ConfirmDialog open={ask === 'reactivate'} title={fill(t.reactivateQuestion, { name: record.displayName })} confirmText={t.reactivate} busy={busy} onCancel={() => setAsk(null)} onConfirm={() => void change(() => call(client.POST('/api/v1/users/{id}/reactivation', { params: { path: { id } }, body: { version: record.version } })), fill(t.reactivated, { name: record.displayName }))}>
        {t.reactivateText}
      </ConfirmDialog>
      <ConfirmDialog open={ask === 'remove'} title={fill(t.removeQuestion, { name: record.displayName })} confirmText={t.remove} destructive busy={busy} onCancel={() => setAsk(null)} onConfirm={() => void change(() => callEmpty(client.DELETE('/api/v1/users/{id}', { params: { path: { id } } })), fill(t.removed, { name: record.displayName }), () => router.push('/users'))}>
        {t.removeText}
      </ConfirmDialog>
      <ConfirmDialog open={ask === 'resend'} title={t.resend} confirmText={t.resend} busy={busy} onCancel={() => setAsk(null)} onConfirm={() => void change(() => call(client.POST('/api/v1/users/{id}/invitation', { params: { path: { id } } })), fill(t.resent, { email: record.email }))}>
        {fill(t.resendText, { email: record.email })}
      </ConfirmDialog>
      <ConfirmDialog open={ask === 'sessions'} title={fill(t.endSessionsQuestion, { name: record.displayName })} confirmText={t.endSessions} busy={busy} onCancel={() => setAsk(null)} onConfirm={() => void change(() => callEmpty(client.DELETE('/api/v1/users/{id}/sessions', { params: { path: { id } } })), fill(t.sessionsEnded, { name: record.displayName }))}>
        {t.endSessionsText}
      </ConfirmDialog>
    </div>
  );
}
