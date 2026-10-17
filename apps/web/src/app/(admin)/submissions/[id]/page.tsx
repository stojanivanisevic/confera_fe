import type { Metadata } from 'next';

import { Submission } from '@/admin/Submission';

export const metadata: Metadata = { title: 'Submission' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Submission id={id} />;
}
