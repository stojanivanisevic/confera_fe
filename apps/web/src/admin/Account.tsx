'use client';

/**
 * My account (FR-USR-03, FR-USR-06, ADR-03): the own password changed with the current one and
 * the live checklist; the email address changed through a link to the new address; sign out,
 * also everywhere.
 */
import { useState, type FormEvent } from 'react';

import { Alert, Button, Card, ConfirmDialog, DescriptionList, PageHeader, PasswordField, TextField, toast } from '@confera/ui';

import styles from './admin.module.css';
import { ProblemAlert } from './ProblemAlert';
import { PasswordChecklist } from './PasswordChecklist';
import { callEmpty, explain, fieldMessages, isApiError } from './problems';
import { useSession } from './session';
import { fill, TEXTS } from './texts';

type Problem = { title: string; text: string } | null;

export function Account() {
  const { session, client, clear, refresh, contact } = useSession();
  const t = TEXTS.account;

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRepeat, setNewRepeat] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordProblem, setPasswordProblem] = useState<Problem>(null);
  const [passwordFields, setPasswordFields] = useState<Record<string, string>>({});
  const [refused, setRefused] = useState<string[]>([]);

  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailProblem, setEmailProblem] = useState<Problem>(null);
  const [emailFields, setEmailFields] = useState<Record<string, string>>({});
  const [emailSent, setEmailSent] = useState<string | null>(null);

  const [everywhere, setEverywhere] = useState(false);
  const [everywhereBusy, setEverywhereBusy] = useState(false);

  if (!session) return null;
  const { user, organisation } = session;
  const context = { email: user.email, displayName: user.displayName, organisationName: organisation.name };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordBusy(true);
    setPasswordProblem(null);
    setPasswordFields({});
    setRefused([]);
    try {
      await callEmpty(client.POST('/api/v1/account/password', { body: { currentPassword, newPassword, newPasswordRepeat: newRepeat } }));
      setCurrentPassword('');
      setNewPassword('');
      setNewRepeat('');
      toast({ title: t.passwordChanged, description: t.passwordChangedText, tone: 'success', duration: 8000 });
      await refresh({ background: true });
    } catch (error) {
      if (isApiError(error) && error.code === 'password_refused') {
        setRefused((error.problem?.errors ?? []).map((field) => field.code));
        setPasswordProblem({ title: TEXTS.setPassword.refused, text: TEXTS.setPassword.refusedText });
      } else if (isApiError(error) && error.code === 'password_incorrect') {
        setPasswordFields({ currentPassword: TEXTS.freshPassword.wrong });
        setPasswordProblem({ title: TEXTS.freshPassword.wrong, text: TEXTS.freshPassword.wrongText });
      } else {
        setPasswordFields(fieldMessages(error));
        setPasswordProblem(explain(error, contact));
      }
    } finally {
      setPasswordBusy(false);
    }
  };

  const changeEmail = async (event: FormEvent) => {
    event.preventDefault();
    setEmailBusy(true);
    setEmailProblem(null);
    setEmailFields({});
    try {
      await callEmpty(client.POST('/api/v1/account/email', { body: { password: emailPassword, newEmail: newEmail.trim() } }));
      setEmailSent(newEmail.trim());
      setNewEmail('');
      setEmailPassword('');
    } catch (error) {
      if (isApiError(error) && error.code === 'password_incorrect') {
        setEmailFields({ password: TEXTS.freshPassword.wrong });
        setEmailProblem({ title: TEXTS.freshPassword.wrong, text: TEXTS.freshPassword.wrongText });
      } else {
        setEmailFields(fieldMessages(error));
        setEmailProblem(explain(error, contact));
      }
    } finally {
      setEmailBusy(false);
    }
  };

  const signOut = async (all: boolean) => {
    setEverywhereBusy(true);
    try {
      await callEmpty(client.DELETE(all ? '/api/v1/sessions' : '/api/v1/session'));
    } finally {
      clear('ended');
    }
  };

  return (
    <div className={styles.stack}>
      <PageHeader title={t.title} description={t.lead} />
      <div className={styles.cards}>
        <Card title={t.details} headingLevel={2}>
          <DescriptionList
            items={[
              { label: t.name, value: user.displayName },
              { label: t.email, value: user.email },
              { label: t.role, value: user.roles.map((role) => TEXTS.users.roles[role] ?? role).join(', ') },
              { label: t.organisation, value: organisation.name },
            ]}
          />
        </Card>

        <Card title={t.changePasswordTitle} headingLevel={2}>
          <form className={styles.form} onSubmit={(event) => void changePassword(event)} noValidate data-confera-change-password>
            {passwordProblem ? (
              <ProblemAlert title={passwordProblem.title}>
                {passwordProblem.text}
              </ProblemAlert>
            ) : null}
            <PasswordField label={t.currentPasswordLabel} name="currentPassword" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required status={passwordFields.currentPassword ? 'error' : 'default'} message={passwordFields.currentPassword} />
            <PasswordField label={t.newPasswordLabel} name="newPassword" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required aria-describedby="account-checklist" />
            <PasswordField label={t.newPasswordRepeat} name="newPasswordRepeat" autoComplete="new-password" value={newRepeat} onChange={(event) => setNewRepeat(event.target.value)} required aria-describedby="account-checklist" />
            <PasswordChecklist id="account-checklist" password={newPassword} repeat={newRepeat} context={context} refused={refused} />
            <div className={styles.actions}>
              <Button type="submit" disabled={passwordBusy}>
                {passwordBusy ? TEXTS.setPassword.working : t.savePasswordButton}
              </Button>
            </div>
          </form>
        </Card>

        <Card title={t.changeEmail} subtitle={t.changeEmailLead} headingLevel={2}>
          {emailSent ? (
            <Alert tone="success" title={fill(t.emailLinkSent, { email: emailSent })} onClose={() => setEmailSent(null)}>
              {fill(t.emailLinkSentText, { current: user.email })}
            </Alert>
          ) : null}
          <form className={styles.form} onSubmit={(event) => void changeEmail(event)} noValidate data-confera-change-email>
            {emailProblem ? (
              <ProblemAlert title={emailProblem.title}>
                {emailProblem.text}
              </ProblemAlert>
            ) : null}
            <TextField label={t.newEmail} name="newEmail" type="email" autoComplete="off" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} required status={emailFields.newEmail ? 'error' : 'default'} message={emailFields.newEmail} />
            <PasswordField label={t.passwordForEmail} name="password" autoComplete="current-password" value={emailPassword} onChange={(event) => setEmailPassword(event.target.value)} required status={emailFields.password ? 'error' : 'default'} message={emailFields.password} />
            <div className={styles.actions}>
              <Button type="submit" disabled={emailBusy || newEmail.trim() === '' || emailPassword === ''}>
                {emailBusy ? TEXTS.forgot.working : t.sendEmailLink}
              </Button>
            </div>
          </form>
        </Card>

        <Card title={t.sessions} subtitle={t.sessionsLead} headingLevel={2}>
          <div className={styles.actions}>
            <Button variant="dark" onClick={() => void signOut(false)}>
              {t.signOut}
            </Button>
            <Button variant="dark" onClick={() => setEverywhere(true)}>
              {t.signOutEverywhere}
            </Button>
          </div>
          <ConfirmDialog open={everywhere} title={t.signOutEverywhereQuestion} confirmText={t.signOutEverywhere} busy={everywhereBusy} onConfirm={() => void signOut(true)} onCancel={() => setEverywhere(false)}>
            {t.signOutEverywhereText}
          </ConfirmDialog>
        </Card>
      </div>
    </div>
  );
}
