import type { Metadata } from 'next';

import { MailServer } from '@/admin/MailServer';

export const metadata: Metadata = { title: 'Mail server' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MailServer id={id} />;
}
