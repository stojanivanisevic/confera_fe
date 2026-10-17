import type { Metadata } from 'next';

import { Submissions } from '@/admin/Submissions';

export const metadata: Metadata = { title: 'Submissions' };

export default function Page() {
  return <Submissions />;
}
