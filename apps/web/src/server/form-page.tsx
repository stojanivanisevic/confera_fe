/**
 * What the two public pages of a form share (M3-FE-02): the published form read once per request
 * from the API, the language it opens in (decision D2: the snippet's `?lang=`, else the browser's,
 * else English; the tab's draft may switch it once the form is attached), the title of the page in
 * that language ("Abstract submission · ITEMA 2026", UX-M1-19) and the page shown when the API
 * cannot give the form.
 */
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { cache } from 'react';

import { Alert } from '@confera/ui';
import { fill, FORM_LANGUAGES, FORM_TEXTS, pickLanguage, textOf, type FormLanguage, type PublishedForm } from '@confera/form-renderer';

import { lookUpForm } from './public-forms';

/** One lookup per request, for the page and its metadata. */
export const formOf = cache(lookUpForm);

export async function languageFor(form: PublishedForm | null, requested: string | string[] | undefined): Promise<FormLanguage> {
  const browser = (await headers()).get('accept-language');
  return pickLanguage({ available: form?.conference.languages ?? FORM_LANGUAGES, requested: typeof requested === 'string' ? requested : undefined, browser });
}

export async function formMetadata(slug: string, requested: string | string[] | undefined): Promise<Metadata> {
  const found = await formOf(slug);
  if (found.kind !== 'form') return { title: { absolute: 'Confera' }, robots: { index: false } };
  const language = await languageFor(found.form, requested);
  return { title: { absolute: fill(FORM_TEXTS[language].page.title, { title: textOf(found.form.definition.texts.title, language), conference: found.form.conference.name }) } };
}

/** The API did not give the form: the page says so, in the visitor's language, and nothing is framed. */
export function FormUnavailable({ language }: { language: FormLanguage }) {
  const t = FORM_TEXTS[language].problems;
  return (
    <main className="confera-page" lang={language}>
      <h1 className="ud-sr">{t.unavailableTitle}</h1>
      <Alert tone="warning" title={t.unavailableTitle}>
        {t.unavailableText}
      </Alert>
    </main>
  );
}
