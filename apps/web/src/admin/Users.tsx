'use client';

/**
 * The users (FR-USR-04): the list with search and filters, a page at a time, and the
 * invitation of a colleague (FR-USR-02), which asks for the password again (ADR-03).
 */
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import type { UserPage, UserRecord } from '@confera/api-client';
import { Alert, Button, DataTable, Dialog, FilterBar, PageHeader, Pagination, SearchField, Select, StatusBadge, TextButton, TextField, toast } from '@confera/ui';

import styles from './admin.module.css';
import { ProblemAlert } from './ProblemAlert';
import { formatDate } from './format';
import { isCancelled, useFreshPassword } from './FreshPassword';
import { call, explain, fieldMessages, isApiError } from './problems';
import { useSession } from './session';
import { fill, TEXTS } from './texts';
import { looksLikeAddress, useMailReady } from './mail-ready';
import { useLoad } from './useLoad';

const STATUSES = ['invited', 'active', 'deactivated', 'removed'] as const;
const ROLES = ['admin', 'reviewer'] as const;
type Status = (typeof STATUSES)[number];
type Role = (typeof ROLES)[number];

export const statusTone = (status: string): 'success' | 'info' | 'neutral' | 'danger' => (status === 'active' ? 'success' : status === 'invited' ? 'info' : status === 'removed' ? 'danger' : 'neutral');

export function Users() {
  const router = useRouter();
  const { client, contact, session } = useSession();
  const { withFreshPassword, asking } = useFreshPassword();
  const mailReady = useMailReady();
  const t = TEXTS.users;
  const mayManage = session?.user.permissions.includes('users.manage') ?? false;

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | Status>('');
  const [role, setRole] = useState<'' | Role>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const filtered = search.trim() !== '' || status !== '' || role !== '';

  const users = useLoad<UserPage>(
    (client) =>
      call(
        client.GET('/api/v1/users', {
          params: { query: { ...(search.trim() ? { search: search.trim() } : {}), ...(status ? { status } : {}), ...(role ? { role } : {}), page, pageSize } },
        }),
      ),
    [search, status, role, page, pageSize],
  );

  const [inviting, setInviting] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('reviewer');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteProblem, setInviteProblem] = useState<{ title: string; text: string } | null>(null);
  const [inviteFields, setInviteFields] = useState<Record<string, string>>({});

  const openInvite = () => {
    setInviteName('');
    setInviteEmail('');
    setInviteRole('reviewer');
    setInviteProblem(null);
    setInviteFields({});
    setInviting(true);
  };

  const sendInvitation = async (event: FormEvent) => {
    event.preventDefault();
    setInviteProblem(null);
    setInviteFields({});
    // What the browser can check is checked before the password is asked (UXUI-M2-06).
    const missing: Record<string, string> = {};
    if (inviteName.trim() === '') missing.displayName = TEXTS.common.required;
    if (inviteEmail.trim() === '') missing.email = TEXTS.common.required;
    else if (!looksLikeAddress(inviteEmail)) missing.email = TEXTS.problems.fields.isMailAddress ?? TEXTS.problems.fieldFallback;
    if (Object.keys(missing).length > 0) {
      setInviteFields(missing);
      return;
    }
    setInviteBusy(true);
    try {
      const created = await withFreshPassword(() => call(client.POST('/api/v1/users', { body: { email: inviteEmail.trim(), displayName: inviteName.trim(), role: inviteRole } })));
      setInviting(false);
      // Without a mail server the invitation waits: the toast says what is true (UXUI-M2-01).
      // What is true at this moment (UXUI-M2-42): "sent" only once the API says so; the user's page follows the rest.
      toast({ title: fill(created.invitationDelivery === 'sent' ? t.invited : created.invitationDelivery === 'waiting_for_server' ? t.invitedWaiting : t.invitedSaved, { email: created.email }), tone: 'success' });
      router.push(`/users/${created.id}`);
    } catch (error) {
      if (isCancelled(error)) {
        // The person closed the password dialog: nothing happened.
      } else if (isApiError(error) && error.code === 'email_taken') {
        setInviteFields({ email: t.emailTaken });
        setInviteProblem({ title: t.emailTaken, text: t.emailTakenText });
      } else {
        setInviteFields(fieldMessages(error));
        setInviteProblem(explain(error, contact));
      }
    } finally {
      setInviteBusy(false);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setStatus('');
    setRole('');
    setPage(1);
  };

  const rows: UserRecord[] = users.state.data?.items ?? [];
  const total = users.state.data?.total ?? 0;

  return (
    <div className={styles.stack}>
      <PageHeader title={t.title} description={t.lead} actions={mayManage ? <Button icon="plus" onClick={openInvite}>{t.invite}</Button> : undefined} />
      {users.state.phase === 'failed' ? (
        <Alert tone="error" title={users.state.problem.title} action={<TextButton onClick={() => void users.reload()}>{TEXTS.connection.tryAgain}</TextButton>}>
          {users.state.problem.text}
        </Alert>
      ) : null}
      {/* While the list failed it shows no empty state that would contradict the alert (UXUI-M2-15). */}
      {users.state.phase === 'failed' && !users.state.data ? null : (
      <DataTable<UserRecord>
        caption={t.title}
        rows={rows}
        rowKey="id"
        loading={users.state.phase === 'loading' && !users.state.data}
        filtered={filtered}
        onClearFilters={clearFilters}
        empty={undefined}
        emptyAction={mayManage ? <Button icon="plus" onClick={openInvite}>{t.invite}</Button> : undefined}
        onRowClick={(row) => router.push(`/users/${row.id}`)}
        columns={[
          { key: 'displayName', header: t.name, render: (row) => <span className={styles.break}>{row.displayName}</span> },
          { key: 'email', header: t.email, render: (row) => <span className={styles.break}>{row.email}</span> },
          { key: 'role', header: t.role, render: (row) => t.roles[row.role] ?? row.role },
          { key: 'status', header: t.status, render: (row) => <StatusBadge tone={statusTone(row.status)}>{t.statuses[row.status] ?? row.status}</StatusBadge> },
          { key: 'createdAt', header: t.created, render: (row) => formatDate(row.createdAt) },
        ]}
        toolbar={
          <FilterBar onReset={filtered ? clearFilters : undefined}>
            <SearchField
              label={t.search}
              placeholder={t.search}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              onClear={() => {
                setSearch('');
                setPage(1);
              }}
            />
            <Select
              label={t.status}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as '' | Status);
                setPage(1);
              }}
              options={[{ value: '', label: t.anyStatus }, ...STATUSES.map((value) => ({ value, label: t.statuses[value] ?? value }))]}
            />
            <Select
              label={t.role}
              value={role}
              onChange={(event) => {
                setRole(event.target.value as '' | Role);
                setPage(1);
              }}
              options={[{ value: '', label: t.anyRole }, ...ROLES.map((value) => ({ value, label: t.roles[value] ?? value }))]}
            />
          </FilterBar>
        }
        footer={<Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} pageSizeOptions={[10, 25, 50, 100]} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />}
      />
      )}

      <Dialog
        open={inviting}
        onClose={() => setInviting(false)}
        title={t.inviteTitle}
        actions={
          <>
            <TextButton type="button" onClick={() => setInviting(false)}>
              {TEXTS.common.cancel}
            </TextButton>
            <Button type="submit" form="invite-form" disabled={inviteBusy}>
              {inviteBusy && !asking ? TEXTS.forgot.working : t.inviteSubmit}
            </Button>
          </>
        }
      >
        <form id="invite-form" className={styles.form} onSubmit={(event) => void sendInvitation(event)} noValidate>
          <p className="ud-dialog__text">{t.inviteText}</p>
          {mailReady === false ? (
            <Alert tone="warning" title={t.noServer} action={<Button variant="dark" onClick={() => router.push('/mail-servers/new')}>{TEXTS.mailServers.add}</Button>}>
              {t.noServerText}
            </Alert>
          ) : null}
          {inviteProblem ? (
            <ProblemAlert title={inviteProblem.title}>
              {inviteProblem.text}
            </ProblemAlert>
          ) : null}
          <TextField label={t.inviteName} name="displayName" value={inviteName} onChange={(event) => setInviteName(event.target.value)} required status={inviteFields.displayName ? 'error' : 'default'} message={inviteFields.displayName} />
          <TextField label={t.inviteEmail} name="email" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} required status={inviteFields.email ? 'error' : 'default'} message={inviteFields.email} />
          <Select label={t.inviteRole} name="role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as Role)} options={ROLES.map((value) => ({ value, label: t.roles[value] ?? value }))} required />
        </form>
      </Dialog>
    </div>
  );
}
