import type { Metadata } from 'next';

import { ConferenceSettings } from '@/admin/ConferenceSettings';

export const metadata: Metadata = { title: 'Conference' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ConferenceSettings id={id} />;
}
