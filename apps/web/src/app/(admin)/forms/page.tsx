import type { Metadata } from 'next';

import { Forms } from '@/admin/Forms';

export const metadata: Metadata = { title: 'Forms' };

export default function Page() {
  return <Forms />;
}
