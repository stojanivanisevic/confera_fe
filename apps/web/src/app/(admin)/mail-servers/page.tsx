import type { Metadata } from 'next';

import { MailServers } from '@/admin/MailServers';

export const metadata: Metadata = { title: 'Mail servers' };

export default function Page() {
  return <MailServers />;
}
