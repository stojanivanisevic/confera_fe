import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Sign in' };

/** The sign-in route exists from 0.1.0 so that the host separation can be tested (ST-66); the form arrives with 0.2.0. */
export default function SignInPage() {
  return (
    <main>
      <h1>Sign in</h1>
      <p>Sign-in arrives with release 0.2.0.</p>
    </main>
  );
}
