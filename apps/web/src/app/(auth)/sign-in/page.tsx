import type { Metadata } from 'next';

import { Alert, PageHeader } from '@confera/ui';

export const metadata: Metadata = { title: 'Sign in' };

/** The sign-in route exists from 0.1.0 so that the host separation can be tested (ST-66); the form arrives with 0.2.0. */
export default function SignInPage() {
  return (
    <main className="confera-page">
      <PageHeader title="Sign in" />
      <Alert tone="info" title="Sign-in arrives with release 0.2.0">
        There are no accounts yet in this release.
      </Alert>
    </main>
  );
}
