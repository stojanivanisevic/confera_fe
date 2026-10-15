import type { Metadata } from 'next';
import { Suspense } from 'react';

import { SignIn } from '@/admin/SignIn';

export const metadata: Metadata = { title: 'Sign in' };

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignIn />
    </Suspense>
  );
}
