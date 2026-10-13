'use client';

import { useEffect, useState } from 'react';

import { compatibility, CONTRACT_VERSION, createAdminClient, getMeta, type Meta } from '@confera/api-client';
import { Alert, Card, DescriptionList, Spinner, StatusBadge } from '@confera/ui';

type State = { phase: 'loading' } | { phase: 'connected'; meta: Meta } | { phase: 'mismatch'; meta: Meta } | { phase: 'unreachable' };

/**
 * Asks the API who it is (GET /api/v1/meta, the one typed call of 0.1.0) and
 * stops on a major-version mismatch: a page built for another major version
 * of the API must not be used (ADR-19).
 */
export function ApiStatus() {
  const [state, setState] = useState<State>({ phase: 'loading' });

  useEffect(() => {
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

  if (state.phase === 'mismatch') {
    return (
      <Alert tone="error" title="This page and the API are of different versions">
        The API is version {state.meta.version}; this page was built for version {CONTRACT_VERSION}. Reload the page. If the message stays, tell the administrator.
      </Alert>
    );
  }

  return (
    <Card title="API" subtitle="The service this application talks to">
      {state.phase === 'loading' ? <Spinner label="Asking the API" /> : null}
      {state.phase === 'unreachable' ? (
        <Alert tone="warning" title="The API does not answer">
          Start the API of confera_be, then reload this page.
        </Alert>
      ) : null}
      {state.phase === 'connected' ? (
        <DescriptionList
          items={[
            { label: 'Status', value: <StatusBadge tone="success">Connected</StatusBadge> },
            { label: 'Service', value: state.meta.name },
            { label: 'Version', value: state.meta.version },
            { label: 'Contract of this build', value: CONTRACT_VERSION },
          ]}
        />
      ) : null}
    </Card>
  );
}
