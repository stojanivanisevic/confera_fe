import type { Metadata } from 'next';

import { TemplateEditor } from '@/admin/TemplateEditor';

export const metadata: Metadata = { title: 'Email template' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TemplateEditor id={id} />;
}
