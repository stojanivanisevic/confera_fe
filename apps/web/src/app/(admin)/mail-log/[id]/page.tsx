import type { Metadata } from 'next';

import { MailLogEntry } from '@/admin/MailLogEntry';

export const metadata: Metadata = { title: 'Mail log entry' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MailLogEntry id={id} />;
}
