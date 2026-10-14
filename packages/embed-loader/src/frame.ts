/**
 * The frame's side of the embed (ADR-07): it reports the height of its content
 * to the page that frames it, and nothing else.
 *
 *  - The message goes to the listed parent origins only, never to "*". The
 *    browser delivers it only if the parent really is that origin, and the
 *    frame page can only be framed by a listed site (`frame-ancestors`).
 *  - The message holds a type and a height. No form data, no reference.
 *  - It is sent when the height of the content changes, and again when the
 *    page around changes the size of the frame before it has ever followed a
 *    height the frame told (the snippet's lines started late).
 *  - After Send it may ask the page to bring a part of the form into view
 *    (requestIntoView below): a type and a number, to the same origins.
 *  - The frame reads no message from its parent at all.
 */
import { heightMessage, INTO_VIEW_MESSAGE, type IntoViewMessage } from './protocol';

export interface HeightReporterOptions {
  /** The element whose height is the height of the form. */
  readonly root: Element;
  /** The origins that may frame this form (the conference's site list). */
  readonly parentOrigins: readonly string[];
  /** The frame's window; injected in tests. */
  readonly win?: Window;
}

/** Starts reporting. Returns a function that stops it. Does nothing when the page is not framed. */
export function startHeightReporter(options: HeightReporterOptions): () => void {
  const win = options.win ?? window;
  const parent = win.parent;
  if (parent === win || options.parentOrigins.length === 0) return () => undefined;

  let last = -1;
  // Whether the frame has been as tall as it said: then the page around listens (or needs nothing).
  let heard = false;
  /** `again`: tell the height also when it did not change. */
  const report = (again = false) => {
    const message = heightMessage(Math.ceil(options.root.getBoundingClientRect().height));
    if (!message || (message.height === last && !again)) return;
    last = message.height;
    if (win.innerHeight === last) heard = true;
    for (const origin of options.parentOrigins) parent.postMessage(message, origin);
  };

  const observer = new ResizeObserver(() => report());
  observer.observe(options.root);
  // The page around changed the size of the frame. Until the page has once made the frame as tall
  // as the frame said, its inline lines may not have been listening: a site that runs them late
  // makes the frame one pixel taller when they start, and the height is told again. Once the page
  // has followed, a size it sets is its own business: the frame does not argue with it.
  const onResize = () => {
    if (win.innerHeight === last) heard = true;
    else if (!heard) report(true);
  };
  win.addEventListener('resize', onResize);
  report();
  return () => {
    observer.disconnect();
    win.removeEventListener('resize', onResize);
  };
}

export interface IntoViewOptions {
  /** The part of the form to bring into view: the error summary, the thank-you. */
  readonly element: Element;
  /** The origins that may frame this form: the only ones the request goes to. */
  readonly parentOrigins: readonly string[];
  /** The frame's window; injected in tests. */
  readonly win?: Window;
}

/**
 * Asks the page around the frame to bring a part of the form into view (UX-M1-01, 02). Moving the
 * focus there scrolls the page of the conference site along in Chromium and Firefox, but not in
 * Safari. Like the height, the request goes to the listed parent origins only, never to "*", and
 * holds a type and a number. Nothing is read back. The snippet acts on it once decision D1 allows.
 */
export function requestIntoView(options: IntoViewOptions): void {
  const win = options.win ?? window;
  const parent = win.parent;
  if (parent === win || options.parentOrigins.length === 0) return;
  const message: IntoViewMessage = { type: INTO_VIEW_MESSAGE, top: Math.max(0, Math.round(options.element.getBoundingClientRect().top + win.scrollY)) };
  for (const origin of options.parentOrigins) parent.postMessage(message, origin);
}
