import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { EmbeddedForm } from '@confera/form-renderer';

import { formMetadata, formOf, FormUnavailable, languageFor } from '@/server/form-page';
import { frameSitesFrom } from '@/server/security/frame-sites';
import { getConfig } from '@/config/env';

interface Props {
  readonly params: Promise<{ form: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  return formMetadata((await params).form, (await searchParams).lang);
}

/**
 * The frame page: the only page that may be framed, and only by the sites on the list of the
 * form's conference (the header is set in proxy.ts from the same list, read from the API). The
 * list is also what the frame tells its height to; it tells nobody else.
 */
export default async function EmbedPage({ params, searchParams }: Props) {
  const { form } = await params;
  const { lang } = await searchParams;
  const found = await formOf(form);
  if (found.kind === 'missing') notFound();
  if (found.kind === 'unavailable') return <FormUnavailable language={await languageFor(null, lang)} />;
  const sites = frameSitesFrom(found.form.frameSites, getConfig().stage !== 'prod') ?? [];
  return <EmbeddedForm form={found.form} language={await languageFor(found.form, lang)} parentOrigins={sites} />;
}
