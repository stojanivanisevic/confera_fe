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

/** One GET of the public surface of the API: the status and the parsed body, or null when it did not answer. */
async function getPublic(path: string): Promise<{ status: number; body: unknown } | null> {
  const config = getConfig();
  try {
    const response = await forwardToApi({
      apiOrigin: config.apiOrigin,
      pathAndQuery: path,
      method: 'GET',
      headers: new Headers({ host: config.publicHost, accept: 'application/json' }),
      body: null,
      surface: 'public',
      timeoutMs: TIMEOUT_MS,
    });
    if (!response.ok) return { status: response.status, body: null };
    const text = await response.text();
    if (text.length > MAX_BYTES) return null;
    return { status: response.status, body: JSON.parse(text) as unknown };
  } catch {
    return null;
  }
}

/** The published form of a slug (GET /public/v1/forms/{slug}). */
export async function lookUpForm(slug: string): Promise<FormLookup> {
  if (!FORM_SLUG.test(slug)) return { kind: 'missing' };
  const answer = await getPublic(`/public/v1/forms/${slug}`);
  if (answer?.status === 404) return { kind: 'missing' };
  if (!answer || answer.status !== 200) return { kind: 'unavailable' };
  try {
    const form = readPublishedForm(answer.body);
    return form.slug === slug ? { kind: 'form', form } : { kind: 'unavailable' };
  } catch {
    return { kind: 'unavailable' };
  }
}

/**
 * The sites that may frame the form (GET /public/v1/forms/{slug}/frame-sites): the conference's
 * checked list while it takes submissions, else none. Null when there is no answer to read: the
 * frame is then framed nowhere (fail closed).
 */
export async function lookUpFrameSites(slug: string): Promise<readonly string[] | null> {
  if (!FORM_SLUG.test(slug)) return null;
  const answer = await getPublic(`/public/v1/forms/${slug}/frame-sites`);
  if (!answer || answer.status !== 200 || typeof answer.body !== 'object' || answer.body === null) return null;
  const sites = (answer.body as { sites?: unknown }).sites;
  return Array.isArray(sites) && sites.every((site): site is string => typeof site === 'string') ? sites : null;
}
