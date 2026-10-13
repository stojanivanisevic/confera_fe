'use client';

import { useEffect, useRef } from 'react';

import { startHeightReporter } from '@confera/embed-loader';

import { SpikeForm } from './SpikeForm';
import styles from './spike-form.module.css';

export interface HostedFormProps {
  slug: string;
}

/** The form as a page of its own on Confera's domain (/f/[form]). */
export function HostedForm({ slug }: HostedFormProps) {
  return (
    <main className={styles.hosted}>
      <SpikeForm slug={slug} />
    </main>
  );
}

export interface EmbeddedFormProps {
  slug: string;
  /** The sites that may frame this form: the only origins the frame tells its height to (ADR-07). */
  parentOrigins: readonly string[];
}

/** The form inside the frame of a conference site (/embed/[form]). */
export function EmbeddedForm({ slug, parentOrigins }: EmbeddedFormProps) {
  const root = useRef<HTMLElement>(null);
  const origins = parentOrigins.join(' ');
  useEffect(() => {
    if (!root.current) return undefined;
    return startHeightReporter({ root: root.current, parentOrigins: origins.split(' ').filter(Boolean) });
  }, [origins]);

  return (
    <main ref={root} className={styles.embedded} data-confera-embed-root="">
      <SpikeForm slug={slug} />
    </main>
  );
}
