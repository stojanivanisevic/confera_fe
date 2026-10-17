/**
 * The one link syntax of the office's texts (ADR-09; `src/modules/forms/safe-text.ts` of
 * confera_be, whose vectors `tests/form-rule-vectors.test.ts` runs):
 *
 *   [the label](https://example.org/terms)   a link to an https address
 *   [the label](terms)                       the conference's terms of publication (D6)
 *   [the label](privacy)                     the conference's privacy notice (D6)
 *
 * Everything else is text, `<b>` and braces included; a link whose target is not allowed stays
 * text, and a named link the conference has no address for is shown as its label. A link opens in
 * a new tab, says so to a screen reader, and carries no referrer. No text is ever rendered as markup.
 */
import type { ReactNode } from 'react';

export const NAMED_LINKS = ['terms', 'privacy'] as const;
export type NamedLink = (typeof NAMED_LINKS)[number];
export type Links = Readonly<Partial<Record<NamedLink, string | null>>>;

export type TextSegment = { readonly type: 'text'; readonly text: string } | { readonly type: 'link'; readonly text: string; readonly target: string };

const LINK = /\[([^[\]\n]{1,200})\]\(([^()\s]{1,500})\)/g;

/** An https address that holds nothing but an address: no user part, no space, no quote. */
export function isSafeHttpsUrl(value: string): boolean {
  if (value.length > 500 || !/^https:\/\/[^\s<>"'`\\]+$/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username === '' && url.password === '' && url.hostname !== '';
  } catch {
    return false;
  }
}

const isTarget = (target: string): boolean => (NAMED_LINKS as readonly string[]).includes(target) || isSafeHttpsUrl(target);

/** The segments of a text, exactly as the API reads them. */
export function parseSafeText(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    const [whole, label, target] = match;
    if (label === undefined || target === undefined || !isTarget(target)) continue;
    if (match.index > last) segments.push({ type: 'text', text: text.slice(last, match.index) });
    segments.push({ type: 'link', text: label, target });
    last = match.index + whole.length;
  }
  if (last < text.length) segments.push({ type: 'text', text: text.slice(last) });
  return segments;
}

/** The address a link goes to: an https address, or the conference's address for a named link; null when there is none. */
export function hrefOf(target: string, links: Links): string | null {
  if ((NAMED_LINKS as readonly string[]).includes(target)) {
    const address = links[target as NamedLink];
    return typeof address === 'string' && isSafeHttpsUrl(address) ? address : null;
  }
  return isSafeHttpsUrl(target) ? target : null;
}

export function SafeText({ text, newTab, links = {} }: { text: string; newTab: string; links?: Links }): ReactNode {
  return parseSafeText(text).map((segment, index) => {
    const href = segment.type === 'link' ? hrefOf(segment.target, links) : null;
    return href ? (
      <a key={index} className="ud-link" href={href} target="_blank" rel="noopener noreferrer">
        {segment.text}
        <span className="ud-sr"> {newTab}</span>
      </a>
    ) : (
      segment.text
    );
  });
}
