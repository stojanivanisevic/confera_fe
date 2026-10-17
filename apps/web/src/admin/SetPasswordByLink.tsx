'use client';

/**
 * The page of an invitation or a reset link (FR-USR-02, FR-USR-03, ADR-04): opening the link
 * shows whose account it is and uses nothing up; the password is set by the POST, with the live
 * checklist (ST-62) and the server's own check behind it.
 */
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';

import { createSessionClient, type LinkPerson } from '@confera/api-client';
import { Alert, Button, PageHeader, PasswordField } from '@confera/ui';

import styles from './admin.module.css';
import { ProblemAlert } from './ProblemAlert';
import { formatDateTime } from './format';
import { PasswordChecklist } from './PasswordChecklist';
import { call, callEmpty, explain, isApiError } from './problems';
import { fill, TEXTS } from './texts';

export interface SetPasswordByLinkProps {
  readonly purpose: 'invitation' | 'password_reset';
  readonly token: string;
}

type State = { phase: 'loading' } | { phase: 'open'; person: LinkPerson } | { phase: 'invalid' } | { phase: 'done'; person: LinkPerson } | { phase: 'failed'; title: string; text: string };

const PATHS = { invitation: '/api/v1/invitations/{token}', password_reset: '/api/v1/password-resets/{token}' } as const;

export function SetPasswordByLink({ purpose, token }: SetPasswordByLinkProps) {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string[]>([]);
  const [problem, setProblem] = useState<{ title: string; text: string } | null>(null);
  const [clients] = useState(() => createSessionClient());
  const path = PATHS[purpose];

  useEffect(() => {
    let current = true;
    call(clients.client.GET(path, { params: { path: { token } } })).then(
      (person) => {
        if (current) setState({ phase: 'open', person });
      },
      (error: unknown) => {
        if (!current) return;
        if (isApiError(error) && (error.code === 'link_invalid' || error.status === 404)) setState({ phase: 'invalid' });
        else setState({ phase: 'failed', ...explain(error) });
      },
    );
    return () => {
      current = false;
    };
  }, [clients, path, token]);

  const t = TEXTS.setPassword;
  const invitation = purpose === 'invitation';

  if (state.phase === 'loading') return <PageHeader title={invitation ? TEXTS.product : t.resetTitle} description={TEXTS.common.loading} />;
  if (state.phase === 'invalid' || state.phase === 'failed') {
    return (
      <>
        {/* A dead link says so as the page's heading, not as a heading over an alert (UXUI-M2-28). */}
        <PageHeader title={state.phase === 'invalid' ? t.invalidTitle : invitation ? TEXTS.product : t.resetTitle} />
        <Alert tone="error" title={state.phase === 'invalid' ? undefined : state.title}>
          {state.phase === 'invalid' ? (invitation ? t.invalidInvitation : t.invalidReset) : state.text}
        </Alert>
        <div className={styles.links}>
          {!invitation && state.phase === 'invalid' ? (
            <Link className="ud-link" href="/forgot-password">
              {t.askAgain}
            </Link>
          ) : null}
          <Link className="ud-link" href="/sign-in">
            {t.toSignIn}
          </Link>
        </div>
      </>
    );
  }
  if (state.phase === 'done') {
    return (
      <>
        <PageHeader title={invitation ? t.doneInvitation : t.doneReset} />
        <Alert tone="success" title={invitation ? t.doneInvitation : t.doneReset}>
          {invitation ? fill(t.doneInvitationText, { email: state.person.email }) : t.doneResetText}
        </Alert>
        <div className={styles.links}>
          <Link className="ud-link" href="/sign-in">
            {t.toSignIn}
          </Link>
        </div>
      </>
    );
  }

  const { person } = state;
  const context = { email: person.email, displayName: person.displayName, organisationName: person.organisationName };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    setRefused([]);
    try {
      await callEmpty(clients.client.POST(path, { params: { path: { token } }, body: { password, passwordRepeat: repeat } }));
      setPassword('');
      setRepeat('');
      setState({ phase: 'done', person });
    } catch (error) {
      if (isApiError(error) && error.code === 'password_refused') {
        setRefused((error.problem?.errors ?? []).map((field) => field.code));
        setProblem({ title: t.refused, text: t.refusedText });
      } else if (isApiError(error) && (error.code === 'link_invalid' || error.status === 404)) {
        setState({ phase: 'invalid' });
      } else {
        setProblem(explain(error));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title={invitation ? fill(t.invitationTitle, { organisation: person.organisationName }) : t.resetTitle}
        description={invitation ? fill(t.invitationLead, { email: person.email }) : fill(t.resetLead, { email: person.email })}
      />
      {problem ? (
        <ProblemAlert title={problem.title}>
          {problem.text}
        </ProblemAlert>
      ) : null}
      <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate data-confera-set-password>
        <PasswordField label={t.passwordLabel} name="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required aria-describedby="password-checklist" />
        <PasswordField label={t.repeat} name="passwordRepeat" autoComplete="new-password" value={repeat} onChange={(event) => setRepeat(event.target.value)} required aria-describedby="password-checklist" />
        <PasswordChecklist id="password-checklist" password={password} repeat={repeat} context={context} refused={refused} />
        <div className={styles.actions}>
          <Button type="submit" disabled={busy}>
            {busy ? t.working : invitation ? t.submitInvitation : t.submitReset}
          </Button>
        </div>
        <p className={styles.small}>{fill(t.linkExpires, { when: formatDateTime(person.expiresAt) })}</p>
      </form>
    </>
  );
}
