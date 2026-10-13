import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { EmbeddedForm } from '@confera/form-renderer';

import { formExists, resolveFrameSites } from '@/server/security/frame-sites';

export const metadata: Metadata = { title: 'Form' };

/**
 * The frame page: the only page that may be framed, and only by the sites on
 * the form's list (the header is set in proxy.ts from the same list). The
 * list is also what the frame tells its height to; it tells nobody else.
 */
export default async function EmbedPage({ params }: { params: Promise<{ form: string }> }) {
  const { form } = await params;
  if (!formExists(form)) notFound();
  return <EmbeddedForm slug={form} parentOrigins={resolveFrameSites(form) ?? []} />;
}
