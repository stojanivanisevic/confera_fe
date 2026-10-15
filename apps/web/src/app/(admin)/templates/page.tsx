import type { Metadata } from 'next';

import { Templates } from '@/admin/Templates';

export const metadata: Metadata = { title: 'Email templates' };

export default function Page() {
  return <Templates />;
}
