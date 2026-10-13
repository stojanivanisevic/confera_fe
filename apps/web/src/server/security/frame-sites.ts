/**
 * The sites that may frame a form (FR-FORM-07, ADR-07, SEC-A-08).
 *
 * The value of `frame-ancestors` is built here and nowhere else, from stored
 * entries only, and it fails closed: an empty list, an entry that is not a
 * clean origin, too many entries, an unknown form or a failed lookup all give
 * `'none'`.
 */
import { devFixtures } from '#dev-fixtures';

export const MAX_FRAME_SITES = 20;
const FORM_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname.endsWith('.localhost') || /^127(?:\.\d{1,3}){3}$/.test(hostname) || hostname === '[::1]';
}

/**
 * Reduces one stored entry to `scheme://host[:port]`, or returns null when it
 * is not exactly an origin. https only, except for loopback names (the local
 * harness). No wildcard, path, query, fragment or user part; lower case.
 */
export function normaliseFrameSite(entry: string): string | null {
  if (typeof entry !== 'string' || entry.length > 300 || /[\s;,'"*<>\\]/.test(entry)) return null;
  let url: URL;
  try {
    url = new URL(entry);
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url.hostname))) return null;
  // The entry must already be in its normal form: nothing is repaired silently.
  if (entry !== url.origin || entry !== entry.toLowerCase()) return null;
  return url.origin;
}

/** The validated site list of a form, or null when the form may be framed nowhere. */
export function frameSitesFrom(entries: readonly string[] | null | undefined): readonly string[] | null {
  if (!entries || entries.length === 0 || entries.length > MAX_FRAME_SITES) return null;
  const sites: string[] = [];
  for (const entry of entries) {
    const site = normaliseFrameSite(entry);
    if (site === null) return null; // one bad entry closes the frame: fail closed
    if (!sites.includes(site)) sites.push(site);
  }
  return sites;
}

/**
 * The sites that may frame the form with this slug, or null (`'none'`).
 *
 * In 0.1.0 the forms are the spike fixtures of a test build; a production
 * build has none, so every form is unknown. From 0.3.0 this reads the
 * conference's site list from the API (M3-FE-02); a failed lookup stays null.
 */
export function resolveFrameSites(slug: string): readonly string[] | null {
  if (!FORM_SLUG.test(slug)) return null;
  const form = Object.hasOwn(devFixtures.forms, slug) ? devFixtures.forms[slug] : undefined;
  return frameSitesFrom(form?.sites);
}

/** True when a form with this slug exists (0.1.0: in the spike fixtures). */
export function formExists(slug: string): boolean {
  return FORM_SLUG.test(slug) && Object.hasOwn(devFixtures.forms, slug);
}
