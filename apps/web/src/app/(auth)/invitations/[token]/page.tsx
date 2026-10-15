import type { Metadata } from 'next';

import { SetPasswordByLink } from '@/admin/SetPasswordByLink';

export const metadata: Metadata = { title: 'Your invitation' };

/** The page of an invitation link (FR-USR-02): the token stays in the path and is never logged (ADR-04). */
export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SetPasswordByLink purpose="invitation" token={token} />;
}
