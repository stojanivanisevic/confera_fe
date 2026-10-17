/**
 * The sites that may frame a form (FR-FORM-07, ADR-07, SEC-A-08).
 *
 * The value of `frame-ancestors` is built here and nowhere else, from the list the API keeps for
 * the form's conference, and it fails closed: an empty list, an entry that is not a clean origin,
 * too many entries, an unknown form or a failed lookup all give `'none'`. https only, except for
 * loopback names on the stages that run on a developer's machine (the local harness; M1-ISS-39,
 * M2-ISS-21: on `prod` a loopback entry closes the frame).
 */
import { getConfig } from '@/config/env';
import { lookUpForm } from '@/server/public-forms';

export const MAX_FRAME_SITES = 20;
const FORM_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname.endsWith('.localhost') || /^127(?:\.\d{1,3}){3}$/.test(hostname) || hostname === '[::1]';
}

/**
 * Reduces one stored entry to `scheme://host[:port]`, or returns null when it is not exactly an
 * origin. https only, except for loopback names when `allowLoopback` (never on `prod`). No
 * wildcard, path, query, fragment or user part; lower case.
 */
export function normaliseFrameSite(entry: string, allowLoopback = true): string | null {
  if (typeof entry !== 'string' || entry.length > 300 || /[\s;,'"*<>\\]/.test(entry)) return null;
  let url: URL;
  try {
    url = new URL(entry);
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
  const loopback = isLoopback(url.hostname);
  if (loopback && !allowLoopback) return null;
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) return null;
  // The entry must already be in its normal form: nothing is repaired silently.
  if (entry !== url.origin || entry !== entry.toLowerCase()) return null;
  return url.origin;
}

/** The validated site list of a form, or null when the form may be framed nowhere. */
export function frameSitesFrom(entries: readonly string[] | null | undefined, allowLoopback = true): readonly string[] | null {
  if (!entries || entries.length === 0 || entries.length > MAX_FRAME_SITES) return null;
  const sites: string[] = [];
  for (const entry of entries) {
    const site = normaliseFrameSite(entry, allowLoopback);
    if (site === null) return null; // one bad entry closes the frame: fail closed
    if (!sites.includes(site)) sites.push(site);
  }
  return sites;
}

/** How the site list of a form is found: the API's published form. Tests give one of their own. */
export type FrameSiteLookup = (slug: string) => Promise<readonly string[] | null>;

const fromApi: FrameSiteLookup = async (slug) => {
  const found = await lookUpForm(slug);
  return found.kind === 'form' ? found.form.frameSites : null;
};

/** The sites that may frame the form with this slug, or null (`'none'`). */
export async function resolveFrameSites(slug: string, lookup: FrameSiteLookup = fromApi, allowLoopback: boolean = getConfig().stage !== 'prod'): Promise<readonly string[] | null> {
  if (!FORM_SLUG.test(slug)) return null;
  try {
    return frameSitesFrom(await lookup(slug), allowLoopback);
  } catch {
    return null;
  }
}

