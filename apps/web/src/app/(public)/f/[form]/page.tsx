import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { HostedForm } from '@confera/form-renderer';

import { formMetadata, formOf, FormUnavailable, languageFor } from '@/server/form-page';
import { StagingBanner } from '@/server/staging';

interface Props {
  readonly params: Promise<{ form: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  return formMetadata((await params).form, (await searchParams).lang);
}

/**
 * The hosted form: a page of its own on Confera's public host, for a site that strips the snippet
 * and for the snippet's link (D5). It can be framed nowhere (frame-ancestors 'none', ADR-07); the
 * frame page is /embed. The form comes from the API (M3-FE-02).
 */
export default async function HostedFormPage({ params, searchParams }: Props) {
  const { form } = await params;
  const { lang } = await searchParams;
  const found = await formOf(form);
  if (found.kind === 'missing') notFound();
  if (found.kind === 'unavailable') return <FormUnavailable language={await languageFor(null, lang)} />;
  return <HostedForm form={found.form} language={await languageFor(found.form, lang)} banner={<StagingBanner inside />} />;
}
