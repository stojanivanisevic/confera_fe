/**
 * The published form of a slug, read by the web application's server from the API (ADR-20: the
 * web application gets data only from the API). The request is the public surface's: the Host
 * header is the public host name, from which the API reads the surface, and no cookie is sent.
 * Nothing is cached: removing a site from the list, closing a form or extending its deadline
 * works on the next page load (ADR-07).
 *
 * A slug that is not a form address is never asked for. An answer that cannot be read, a
 * failure and a timeout are "unavailable", never a form: the frame page then carries
 * `frame-ancestors 'none'` and the page says the form cannot be shown (fail closed).
 */
import { readPublishedForm, type PublishedForm } from '@confera/form-renderer';

import { getConfig } from '@/config/env';

import { forwardToApi } from './forward';

const FORM_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
/** The page waits this long for the API. A form a phone cannot open in 2 s is not usable (NFR-PERF-01). */
const TIMEOUT_MS = 5_000;
/** A definition is a few tens of kilobytes; anything far larger is not read. */
const MAX_BYTES = 1_000_000;

export type FormLookup = { readonly kind: 'form'; readonly form: PublishedForm } | { readonly kind: 'missing' } | { readonly kind: 'unavailable' };

export async function lookUpForm(slug: string): Promise<FormLookup> {
  if (!FORM_SLUG.test(slug)) return { kind: 'missing' };
  const config = getConfig();
  try {
    const response = await forwardToApi({
      apiOrigin: config.apiOrigin,
      pathAndQuery: `/public/v1/forms/${slug}`,
      method: 'GET',
      headers: new Headers({ host: config.publicHost, accept: 'application/json' }),
      body: null,
      surface: 'public',
      timeoutMs: TIMEOUT_MS,
    });
    if (response.status === 404) return { kind: 'missing' };
    if (!response.ok) return { kind: 'unavailable' };
    const text = await response.text();
    if (text.length > MAX_BYTES) return { kind: 'unavailable' };
    const form = readPublishedForm(JSON.parse(text));
    return form.slug === slug ? { kind: 'form', form } : { kind: 'unavailable' };
  } catch {
    return { kind: 'unavailable' };
  }
}
