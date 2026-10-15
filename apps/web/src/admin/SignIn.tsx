'use client';

/**
 * Sign-in (FR-USR-03, ADR-03, ST-26). Every failure reads alike, as the API answers alike.
 * Afterwards the person goes to `next` when it is a path of this origin, else home.
 */
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { createSessionClient } from '@confera/api-client';
import { Alert, Button, PageHeader, PasswordField, TextField } from '@confera/ui';

import { safeNextPath } from '@/lib/next-path';

import styles from './admin.module.css';
import { call, explain, isApiError, isUnauthenticated } from './problems';
import { TEXTS } from './texts';

type Problem = { title: string; text: string } | null;

export function SignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get('next'));
  const reason = params.get('reason');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  const [clients] = useState(() => createSessionClient());

  // A person with a session has no business here: on to the destination.
  useEffect(() => {
    let current = true;
    call(clients.client.GET('/api/v1/session')).then(
      () => {
        if (current) router.replace(next);
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [clients, router, next]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await call(clients.client.POST('/api/v1/session', { body: { email: email.trim(), password } }));
      setPassword('');
      router.replace(next);
    } catch (error) {
      if (isApiError(error) && (error.code === 'sign_in_failed' || isUnauthenticated(error))) setProblem({ title: TEXTS.signIn.failed, text: TEXTS.signIn.failedText });
      else setProblem(explain(error));
      setBusy(false);
    }
  };

  const t = TEXTS.signIn;
  return (
    <>
      <PageHeader title={t.title} />
      {reason === 'session-ended' ? <Alert tone="info" title={t.signedOut}>{t.sessionEnded}</Alert> : null}
      {problem ? (
        <Alert tone="error" title={problem.title}>
          {problem.text}
        </Alert>
      ) : null}
      <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate data-confera-sign-in>
        <TextField label={t.email} name="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <PasswordField label={t.passwordLabel} name="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        <div className={styles.actions}>
          <Button type="submit" disabled={busy}>
            {busy ? t.working : t.submit}
          </Button>
        </div>
        <div className={styles.links}>
          <Link className="ud-link" href="/forgot-password">
            {t.forgot}
          </Link>
        </div>
      </form>
    </>
  );
}
