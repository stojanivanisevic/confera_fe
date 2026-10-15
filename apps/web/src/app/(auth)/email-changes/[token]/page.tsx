import type { Metadata } from 'next';

import { ConfirmEmailChange } from '@/admin/ConfirmEmailChange';

export const metadata: Metadata = { title: 'Confirm your new address' };

/** The page of an email-change link (ADR-03): opening it shows the new address; the POST confirms. */
export default async function EmailChangePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ConfirmEmailChange token={token} />;
}
