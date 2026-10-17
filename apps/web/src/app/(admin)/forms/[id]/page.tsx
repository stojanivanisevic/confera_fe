import type { Metadata } from 'next';

import { FormSettings } from '@/admin/FormSettings';
import { getConfig } from '@/config/env';

export const metadata: Metadata = { title: 'Form' };

/** The public origin goes to the snippet: the frame and the link of the conference sites point there (ADR-02). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FormSettings id={id} publicOrigin={getConfig().publicOrigin} />;
}
