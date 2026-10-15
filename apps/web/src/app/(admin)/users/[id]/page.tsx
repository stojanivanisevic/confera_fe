import type { Metadata } from 'next';

import { User } from '@/admin/User';

export const metadata: Metadata = { title: 'User' };

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <User id={id} />;
}
