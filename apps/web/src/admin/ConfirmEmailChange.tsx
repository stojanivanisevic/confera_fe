'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { createSessionClient, type EmailChangeLink } from '@confera/api-client';
import { Alert, Button, PageHeader } from '@confera/ui';

import styles from './admin.module.css';
import { call, callEmpty, explain, isApiError } from './problems';
import { fill, TEXTS } from './texts';

type State = { phase: 'loading' } | { phase: 'open'; link: EmailChangeLink } | { phase: 'invalid'; text: string } | { phase: 'done'; email: string } | { phase: 'failed'; title: string; text: string };

export function ConfirmEmailChange({ token }: { token: string }) {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [busy, setBusy] = useState(false);
  const [clients] = useState(() => createSessionClient());
  const t = TEXTS.emailChange;

  useEffect(() => {
    let current = true;
    call(clients.client.GET('/api/v1/email-changes/{token}', { params: { path: { token } } })).then(
      (link) => {
        if (current) setState({ phase: 'open', link });
      },
      (error: unknown) => {
        if (!current) return;
        if (isApiError(error) && (error.code === 'link_invalid' || error.status === 404)) setState({ phase: 'invalid', text: t.invalidText });
        else setState({ phase: 'failed', ...explain(error) });
      },
    );
    return () => {
      current = false;
    };
  }, [clients, token, t.invalidText]);

  const confirm = async (link: EmailChangeLink) => {
    setBusy(true);
    try {
      await callEmpty(clients.client.POST('/api/v1/email-changes/{token}', { params: { path: { token } } }));
      setState({ phase: 'done', email: link.newEmail });
    } catch (error) {
      if (isApiError(error) && error.code === 'email_taken') setState({ phase: 'invalid', text: t.taken });
      else if (isApiError(error) && (error.code === 'link_invalid' || error.status === 404)) setState({ phase: 'invalid', text: t.invalidText });
      else setState({ phase: 'failed', ...explain(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={state.phase === 'done' ? t.done : t.title} description={state.phase === 'open' ? fill(t.lead, { email: state.link.newEmail }) : undefined} />
      {state.phase === 'loading' ? <p className={styles.text}>{TEXTS.common.loading}</p> : null}
      {state.phase === 'invalid' ? (
        <Alert tone="error" title={t.invalidTitle}>
          {state.text}
        </Alert>
      ) : null}
      {state.phase === 'failed' ? (
        <Alert tone="error" title={state.title}>
          {state.text}
        </Alert>
      ) : null}
      {state.phase === 'open' ? (
        <div className={styles.actions}>
          <Button onClick={() => void confirm(state.link)} disabled={busy}>
            {busy ? t.working : t.submit}
          </Button>
        </div>
      ) : null}
      {state.phase === 'done' ? (
        <Alert tone="success" title={t.done}>
          {fill(t.doneText, { email: state.email })}
        </Alert>
      ) : null}
      <div className={styles.links}>
        <Link className="ud-link" href="/sign-in">
          {TEXTS.setPassword.toSignIn}
        </Link>
      </div>
    </>
  );
}
