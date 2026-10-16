import type { Metadata } from 'next';

import { Conferences } from '@/admin/Conferences';
import { apiTimeZones } from '@/server/time-zones';

export const metadata: Metadata = { title: 'Conferences' };

export default function Page() {
  return <Conferences timeZones={apiTimeZones()} />;
}
