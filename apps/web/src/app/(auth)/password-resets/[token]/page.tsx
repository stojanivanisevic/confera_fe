import type { Metadata } from 'next';

import { SetPasswordByLink } from '@/admin/SetPasswordByLink';

export const metadata: Metadata = { title: 'New password' };

/** The page of a password-reset link (FR-USR-03, ADR-04). */
export default async function PasswordResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SetPasswordByLink purpose="password_reset" token={token} />;
}
