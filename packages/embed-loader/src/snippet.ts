/**
 * The snippet an admin pastes into a conference site (FR-FORM-06; decision
 * G2-17, form (a)): a plain frame served by Confera, a link to the hosted
 * form, and a few inline lines that only set the frame's height. No code is
 * loaded from Confera into the conference site; to update, the snippet is
 * pasted again.
 *
 * Rules of the inline lines (ADR-07, SEC-A-09), each covered by a test:
 *  - the frame address is built from the configured origin and a slug that
 *    matches [a-z0-9-]; anything else builds no snippet;
 *  - no markup is written and no text is run as code;
 *  - a message is read only when it comes from Confera's origin AND from the
 *    window of a frame with this id that is in the page when it arrives;
 *    everything else is ignored;
 *  - the lines never talk to the frame and never wait for anything; they work
 *    however late they run and whenever the frame arrives or is replaced;
 *  - the height must be a finite number and is kept inside fixed bounds.
 * Without the script (a site that strips scripts) the frame keeps its fixed
 * height and scrolls inside; the link to the hosted form is always there.
 */
import { FORM_SLUG_PATTERN, HEIGHT_MESSAGE, MAX_FRAME_HEIGHT, MIN_FRAME_HEIGHT } from './protocol';

export interface EmbedSnippetOptions {
  /** Origin of Confera's public surface, from configuration. */
  readonly publicOrigin: string;
  readonly slug: string;
  /** Accessible name of the frame, for example the form's title. */
  readonly title: string;
  /** Text of the link to the hosted form. */
  readonly linkText: string;
  /** Height before the first message arrives, and for ever where scripts are stripped. */
  readonly initialHeight?: number;
}

export class EmbedSnippetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmbedSnippetError';
  }
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function checkedOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new EmbedSnippetError('The public origin is not a URL');
  }
  const loopback = url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || /^127(?:\.\d{1,3}){3}$/.test(url.hostname);
  if (value !== url.origin || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))) {
    throw new EmbedSnippetError('The public origin must be an https origin, without a path');
  }
  return url.origin;
}

/** The frame element keeps its size whatever the theme of the conference site says about frames. */
function frameStyle(height: number): string {
  return [
    'display:block', 'width:100%', 'min-width:0', 'max-width:100%', `height:${height}px`, 'min-height:0', 'max-height:none',
    'border:0', 'margin:0', 'padding:0', 'visibility:visible', 'opacity:1',
  ].map((declaration) => `${declaration}!important`).join(';');
}

/**
 * The inline lines. Plain ES5 so that it runs wherever it is pasted.
 * `id` and `origin` are checked values and are written as JSON strings.
 *
 * Conference sites move pasted code and frames about: speed plugins run inline scripts late,
 * consent managers hold a frame back and put a new one in later. A snippet already pasted can
 * only be repaired by pasting it again, so the lines assume nothing about when they run:
 *  - the frame is looked up when a message arrives, as the frame with this id whose window
 *    sent it, never kept from the moment the lines ran (the origin is checked first);
 *  - a frame that already shows Confera's page when the lines run (its document is no longer
 *    the parent's to read) has told its height before anyone listened. The lines make it one
 *    pixel taller; the frame answers any change of its own size by telling its height again.
 *    No message is sent into the frame and nothing waits.
 */
export function listenerSource(frameId: string, origin: string): string {
  return (
    '(function(){' +
    `var o=${JSON.stringify(origin)},i=${JSON.stringify(frameId)};` +
    'function z(f,h){f.style.setProperty("height",h+"px","important")}' +
    'var f=document.getElementById(i),s=f&&!f.contentDocument&&parseInt(f.style.height);' +
    'if(s)z(f,s+1);' +
    'window.addEventListener("message",function(e){' +
    'if(e.origin!==o||!e.source)return;' +
    'for(var a=document.querySelectorAll("iframe#"+i),k=0,g;k<a.length;k++)if(a[k].contentWindow===e.source)g=a[k];' +
    'var d=e.data;' +
    `if(g&&d&&d.type===${JSON.stringify(HEIGHT_MESSAGE)}&&typeof d.height=="number"&&isFinite(d.height))` +
    `z(g,Math.min(${MAX_FRAME_HEIGHT},Math.max(${MIN_FRAME_HEIGHT},Math.round(d.height))))` +
    '})' +
    '})();'
  );
}

export function frameId(slug: string): string {
  return `confera-form-${slug}`;
}

/** Builds the snippet. Throws EmbedSnippetError instead of building one from a bad slug or origin. */
export function buildEmbedSnippet(options: EmbedSnippetOptions): string {
  if (!FORM_SLUG_PATTERN.test(options.slug)) throw new EmbedSnippetError('The form address may contain only lower-case letters, digits and hyphens');
  const origin = checkedOrigin(options.publicOrigin);
  const height = Math.round(options.initialHeight ?? 900);
  if (!Number.isFinite(height) || height < MIN_FRAME_HEIGHT || height > MAX_FRAME_HEIGHT) throw new EmbedSnippetError('The initial height is outside the bounds');
  const id = frameId(options.slug);

  return [
    `<iframe id="${id}" src="${origin}/embed/${options.slug}" title="${escapeHtml(options.title)}" loading="lazy" referrerpolicy="no-referrer" style="${frameStyle(height)}"></iframe>`,
    `<p><a href="${origin}/f/${options.slug}" target="_blank" rel="noopener">${escapeHtml(options.linkText)}</a></p>`,
    `<script>${listenerSource(id, origin)}</script>`,
  ].join('\n');
}
