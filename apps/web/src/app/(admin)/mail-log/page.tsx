import type { Metadata } from 'next';

import { MailLog } from '@/admin/MailLog';

export const metadata: Metadata = { title: 'Mail log' };

export default function Page() {
  return <MailLog />;
}
