/**
 * The snippet an admin pastes into a conference site (FR-FORM-06; decision
 * G2-17, form (a)): a line with a link to the hosted form, a plain frame
 * served by Confera, and a few inline lines that set the frame's height and,
 * after Send, bring the frame's summary or thank-you into view. No code is
 * loaded from Confera into the conference site; to update, the snippet is
 * pasted again.
 *
 * Decided for 0.3.0 (the owner's decisions of the 0.1.0 reviews, built as recommended):
 *  - D2: the snippet carries the language of the site it is pasted into
 *    (`?lang=sr` on the frame and on the link); without one, the browser's
 *    language decides inside the form;
 *  - D5: the link "Form not showing? Open it on its own page." stands ABOVE
 *    the frame, in that language, so it is in view while the frame loads and
 *    when a site that is not listed gets a blocked frame (UX-M1-12). The frame
 *    shows no heading of its own; the site's page has one;
 *  - D1: the lines may scroll the page to the part of the form the frame asks
 *    for, within the Security reviewer's limits (below).
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
 *  - the height must be a finite number and is kept inside fixed bounds;
 *  - the scroll (D1): only for that frame, only vertical, only when the part
 *    the frame names is out of view, `top` a finite number clamped to the
 *    frame's own height, at most once a second, and nothing else.
 * Without the script (a site that strips scripts) the frame keeps its fixed
 * height and scrolls inside; the link to the hosted form is always there.
 */
import { FORM_SLUG_PATTERN, HEIGHT_MESSAGE, INTO_VIEW_MESSAGE, MAX_FRAME_HEIGHT, MIN_FRAME_HEIGHT } from './protocol';

/** The languages a snippet can carry (the form's languages). */
export const SNIPPET_LANGUAGES = ['en', 'sr'] as const;
export type SnippetLanguage = (typeof SNIPPET_LANGUAGES)[number];

export interface EmbedSnippetOptions {
  /** Origin of Confera's public surface, from configuration. */
  readonly publicOrigin: string;
  readonly slug: string;
  /** Accessible name of the frame, for example the form's title. */
  readonly title: string;
  /** Text of the link to the hosted form, above the frame (D5). */
  readonly linkText: string;
  /** The language of the site (D2). Without it the form follows the visitor's browser. */
  readonly language?: SnippetLanguage;
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
 * A site that zooms its content (CSS `zoom`): WebKit then gives the frame's page fewer pixels than
 * the frame is tall, and a frame made as tall as its content still scrolled inside (Q3-12). The
 * frame tells its own viewport height (`view`) with its height. A message with a viewport the lines
 * have not seen yet gives the ratio of the frame's height on this page to the pixels its page gets
 * (1 without zoom, and in Chromium and Firefox), and every height is multiplied by it. A message
 * that names the viewport of the one before keeps that ratio: one sent before the frame followed a
 * height (it crossed that height on the way) cannot make it wrong. A site that zooms later is
 * followed from the next height the frame tells.
 *
 * Conference sites move pasted code and frames about: speed plugins run inline scripts late,
 * consent managers hold a frame back and put a new one in later. A snippet already pasted can
 * only be repaired by pasting it again, so the lines assume nothing about when they run:
 *  - the frame is looked up when a message arrives, as the frame with this id whose window
 *    sent it, never kept from the moment the lines ran (the origin is checked first);
 *  - a frame that already shows Confera's page when the lines run (its document is no longer
 *    the parent's to read) has told its height before anyone listened. The lines make it one
 *    pixel taller; a frame the page has never yet made as tall as it said answers that by
 *    telling its height again.
 *    No message is sent into the frame and nothing waits.
 *
 * After Send the frame asks for the part it shows next (the summary of errors, the thank-you):
 * `top` is how far down the frame that part starts. The lines clamp it to the frame's height,
 * and scroll the page (vertically, `scrollBy(0, …)`) only when that point is outside the window,
 * so that it lands a quarter of the window from the top (below a site's sticky header). A second
 * request within a second is ignored (D1, the Security reviewer's limits). Chromium and Firefox
 * scroll the site along with the focus inside the frame; Safari does not, which is why this is here.
 */
export function listenerSource(frameId: string, origin: string): string {
  return (
    '!function(){' +
    `var o=${JSON.stringify(origin)},i=${JSON.stringify(frameId)};` +
    'function z(f,h){f.style.setProperty("height",h+"px","important")}' +
    'var N=Number.isFinite,M=Math,w=0,q=1,l,' +
    'f=document.getElementById(i),s=f&&!f.contentDocument&&parseInt(f.style.height);' +
    'if(s)z(f,s+1);' +
    'addEventListener("message",function(e){' +
    'if(e.origin!==o||!e.source)return;' +
    'for(var a=document.querySelectorAll("iframe#"+i),k=0,g;k<a.length;k++)if(a[k].contentWindow===e.source)g=a[k];' +
    'var d=g&&e.data||{},t=d.top,r,n=Date.now(),h=innerHeight;' +
    `if(d.type===${JSON.stringify(HEIGHT_MESSAGE)}&&N(d.height)){` +
    'if(l!=d.view)q=parseInt(g.style.height)/(l=d.view)||1;' +
    `z(g,M.min(${MAX_FRAME_HEIGHT.toExponential().replace('+', '')},M.max(${MIN_FRAME_HEIGHT},M.ceil(d.height*q))))}` +
    `if(d.type===${JSON.stringify(INTO_VIEW_MESSAGE)}&&N(t)&&n-w>999){` +
    'r=g.getBoundingClientRect();t=r.top+M.min(M.max(t,0),r.height);' +
    'if(t<0||t>h){w=n;scrollBy(0,t-h/4)}}' +
    '})' +
    '}()'
  );
}

export function frameId(slug: string): string {
  return `confera-form-${slug}`;
}

/** The address of the frame page or of the hosted form, with the snippet's language. */
function address(origin: string, path: 'embed' | 'f', slug: string, language: SnippetLanguage | undefined): string {
  return `${origin}/${path}/${slug}${language ? `?lang=${language}` : ''}`;
}

/** Builds the snippet. Throws EmbedSnippetError instead of building one from a bad slug, origin or language. */
export function buildEmbedSnippet(options: EmbedSnippetOptions): string {
  if (!FORM_SLUG_PATTERN.test(options.slug)) throw new EmbedSnippetError('The form address may contain only lower-case letters, digits and hyphens');
  const origin = checkedOrigin(options.publicOrigin);
  const height = Math.round(options.initialHeight ?? 900);
  if (!Number.isFinite(height) || height < MIN_FRAME_HEIGHT || height > MAX_FRAME_HEIGHT) throw new EmbedSnippetError('The initial height is outside the bounds');
  if (options.language !== undefined && !(SNIPPET_LANGUAGES as readonly string[]).includes(options.language)) throw new EmbedSnippetError('The language is not one of the form languages');
  const id = frameId(options.slug);
  const lang = options.language ? ` lang="${options.language}"` : '';

  return [
    `<p${lang}><a href="${address(origin, 'f', options.slug, options.language)}">${escapeHtml(options.linkText)}</a></p>`,
    `<iframe id="${id}" src="${address(origin, 'embed', options.slug, options.language)}" title="${escapeHtml(options.title)}"${lang} loading="lazy" referrerpolicy="no-referrer" style="${frameStyle(height)}"></iframe>`,
    `<script>${listenerSource(id, origin)}</script>`,
  ].join('\n');
}
