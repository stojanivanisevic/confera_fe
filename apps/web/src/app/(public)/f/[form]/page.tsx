import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { HostedForm } from '@confera/form-renderer';

import { formExists } from '@/server/security/frame-sites';

export const metadata: Metadata = { title: 'Form' };

/**
 * The hosted form: a page of its own on Confera's public host. It can be
 * framed nowhere (frame-ancestors 'none', ADR-07); the frame page is /embed.
 * In 0.1.0 the only forms are the spike fixtures of a test build.
 */
export default async function HostedFormPage({ params }: { params: Promise<{ form: string }> }) {
  const { form } = await params;
  if (!formExists(form)) notFound();
  return <HostedForm slug={form} />;
}
