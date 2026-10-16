import type { Metadata } from 'next';

import { ConferenceSettings } from '@/admin/ConferenceSettings';
import { apiTimeZones } from '@/server/time-zones';

export const metadata: Metadata = { title: 'Conference' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ConferenceSettings id={id} timeZones={apiTimeZones()} />;
}
