import type { Metadata } from 'next';

import { HeldMail } from '@/admin/HeldMail';

export const metadata: Metadata = { title: 'Held emails' };

export default function Page() {
  return <HeldMail />;
}
