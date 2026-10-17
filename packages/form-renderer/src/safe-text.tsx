/**
 * The one link syntax of the office's texts (ADR-09): `[terms of publication](https://…)`.
 * Everything else is text. A link is made only for an https address (http only for this
 * machine), opens in a new tab and says so to a screen reader, and carries no referrer; any other
 * address leaves the words as text. No markup of a text is ever rendered as markup.
 */
import type { ReactNode } from 'react';

const LINK = /\[([^\]\n]{1,200})\]\(([^)\s]{1,2000})\)/g;

/** The address of a link, when it is one the form may open; null otherwise. */
export function safeHref(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname.endsWith('.test');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return null;
  if (url.username || url.password) return null;
  return url.href;
}

export interface TextPart {
  readonly text: string;
  readonly href?: string;
}

/** The text in parts: words, and links where the syntax names a safe address. */
export function textParts(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let at = 0;
  for (const match of text.matchAll(LINK)) {
    const start = match.index ?? 0;
    if (start > at) parts.push({ text: text.slice(at, start) });
    const href = safeHref(match[2] ?? '');
    parts.push(href ? { text: match[1] ?? '', href } : { text: match[1] ?? '' });
    at = start + match[0].length;
  }
  if (at < text.length) parts.push({ text: text.slice(at) });
  return parts;
}

export function SafeText({ text, newTab }: { text: string; newTab: string }): ReactNode {
  return textParts(text).map((part, index) =>
    part.href ? (
      <a key={index} className="ud-link" href={part.href} target="_blank" rel="noopener noreferrer">
        {part.text}
        <span className="ud-sr"> {newTab}</span>
      </a>
    ) : (
      part.text
    ),
  );
}
