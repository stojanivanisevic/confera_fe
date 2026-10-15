'use client';

/** A password reset asked for (FR-USR-03, ADR-04): the answer is the same for every address. */
import Link from 'next/link';
import { useState, type FormEvent } from 'react';

import { createSessionClient } from '@confera/api-client';
import { Alert, Button, PageHeader, TextField } from '@confera/ui';

import styles from './admin.module.css';
import { callEmpty, explain } from './problems';
import { fill, TEXTS } from './texts';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ title: string; text: string } | null>(null);
  const [clients] = useState(() => createSessionClient());

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await callEmpty(clients.client.POST('/api/v1/password-resets', { body: { email: email.trim() } }));
      setSent(email.trim());
    } catch (error) {
      setProblem(explain(error));
    } finally {
      setBusy(false);
    }
  };

  const t = TEXTS.forgot;
  return (
    <>
      <PageHeader title={t.title} description={sent ? undefined : t.lead} />
      {sent ? (
        <Alert tone="success" title={t.sent}>
          {fill(t.sentText, { email: sent })}
        </Alert>
      ) : (
        <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
          {problem ? (
            <Alert tone="error" title={problem.title}>
              {problem.text}
            </Alert>
          ) : null}
          <TextField label={t.email} name="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <div className={styles.actions}>
            <Button type="submit" disabled={busy || email.trim() === ''}>
              {busy ? t.working : t.submit}
            </Button>
          </div>
        </form>
      )}
      <div className={styles.links}>
        <Link className="ud-link" href="/sign-in">
          {t.backToSignIn}
        </Link>
      </div>
    </>
  );
}
