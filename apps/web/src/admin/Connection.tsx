'use client';

/**
 * The connection card of the home page (UX-M1-14, decision D8 pending): "Confera is working",
 * with the versions in small print; "Confera cannot reach its server" with a button to try
 * again; "Confera has been updated" when the API is of another major version (ADR-19).
 */
import { useCallback, useEffect, useState } from 'react';

import { compatibility, CONTRACT_VERSION, createAdminClient, getMeta, type Meta } from '@confera/api-client';
import { Alert, Button, Card, DescriptionList, Spinner, StatusBadge } from '@confera/ui';

import { useSession } from './session';
import { fill, TEXTS } from './texts';

type State = { phase: 'loading' } | { phase: 'connected'; meta: Meta } | { phase: 'mismatch'; meta: Meta } | { phase: 'unreachable' };

export function Connection() {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const { contact } = useSession();

  /** Asks the API who it is. Returns what stops a late answer from landing after the card is gone. */
  const ask = useCallback(() => {
    let current = true;
    getMeta(createAdminClient()).then(
      (meta) => {
        if (current) setState({ phase: compatibility(meta.version) === 'compatible' ? 'connected' : 'mismatch', meta });
      },
      () => {
        if (current) setState({ phase: 'unreachable' });
      },
    );
    return () => {
      current = false;
    };
  }, []);
  const tryAgain = () => {
    setState({ phase: 'loading' });
    ask();
  };

  useEffect(() => ask(), [ask]);

  const t = TEXTS.connection;
  return (
    <Card title={t.title} headingLevel={2} data-confera-connection={state.phase}>
      {state.phase === 'loading' ? (
        <p>
          <Spinner size="sm" label={t.checking} /> {t.checking}
        </p>
      ) : null}
      {state.phase === 'unreachable' ? (
        <Alert tone="error" title={t.down} action={<Button variant="dark" onClick={tryAgain}>{t.tryAgain}</Button>}>
          {contact ? fill(t.downText, { contact }) : t.downTextNoContact}
        </Alert>
      ) : null}
      {state.phase === 'mismatch' ? (
        <Alert tone="error" title={t.updated} action={<Button variant="dark" onClick={() => window.location.reload()}>{t.reload}</Button>}>
          {contact ? fill(t.updatedText, { contact }) : t.updatedTextNoContact}
        </Alert>
      ) : null}
      {state.phase === 'connected' ? (
        <>
          <p>
            <StatusBadge tone="success">{t.working}</StatusBadge>
          </p>
          <details>
            <summary>{t.details}</summary>
            <DescriptionList
              items={[
                { label: t.service, value: state.meta.name },
                { label: t.version, value: state.meta.version },
                { label: t.contract, value: CONTRACT_VERSION },
              ]}
            />
          </details>
        </>
      ) : null}
    </Card>
  );
}
