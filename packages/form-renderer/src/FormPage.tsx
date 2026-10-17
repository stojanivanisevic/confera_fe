'use client';

import { useCallback, useEffect, useRef } from 'react';

import { requestIntoView, startHeightReporter } from '@confera/embed-loader';

import type { PublishedForm } from './definition';
import styles from './form.module.css';
import { FormRenderer } from './FormRenderer';
import type { FormLanguage } from './i18n/catalogue';

export interface HostedFormProps {
  readonly form: PublishedForm;
  readonly language: FormLanguage;
}

/** The form as a page of its own on Confera's domain (/f/[form]). */
export function HostedForm({ form, language }: HostedFormProps) {
  return (
    <main className={styles.hosted}>
      <FormRenderer form={form} language={language} />
    </main>
  );
}

export interface EmbeddedFormProps {
  readonly form: PublishedForm;
  readonly language: FormLanguage;
  /** The sites that may frame this form: the only origins the frame tells its height to (ADR-07). */
  readonly parentOrigins: readonly string[];
}

/** The form inside the frame of a conference site (/embed/[form]): no heading of its own on show (D5). */
export function EmbeddedForm({ form, language, parentOrigins }: EmbeddedFormProps) {
  const root = useRef<HTMLElement>(null);
  const origins = parentOrigins.join(' ');
  useEffect(() => {
    if (!root.current) return undefined;
    return startHeightReporter({ root: root.current, parentOrigins: origins.split(' ').filter(Boolean) });
  }, [origins]);
  // After Send: the page around is asked to bring the summary or the thank-you into view (UX-M1-01, 02; D1).
  const onShow = useCallback((element: HTMLElement) => requestIntoView({ element, parentOrigins: origins.split(' ').filter(Boolean) }), [origins]);

  return (
    <main ref={root} className={styles.embedded} data-confera-embed-root="">
      <FormRenderer form={form} language={language} embedded onShow={onShow} />
    </main>
  );
}
