import type { Metadata } from 'next';

import { Conferences } from '@/admin/Conferences';

export const metadata: Metadata = { title: 'Conferences' };

export default function Page() {
  return <Conferences />;
}
