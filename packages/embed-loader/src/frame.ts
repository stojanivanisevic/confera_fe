/**
 * The frame's side of the embed (ADR-07): it reports the height of its content
 * to the page that frames it, and nothing else.
 *
 *  - The message goes to the listed parent origins only, never to "*". The
 *    browser delivers it only if the parent really is that origin, and the
 *    frame page can only be framed by a listed site (`frame-ancestors`).
 *  - The message holds a type and a height. No form data, no reference.
 *  - The frame reads no message from its parent at all.
 */
import { heightMessage } from './protocol';

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
  const report = () => {
    const message = heightMessage(Math.ceil(options.root.getBoundingClientRect().height));
    if (!message || message.height === last) return;
    last = message.height;
    for (const origin of options.parentOrigins) parent.postMessage(message, origin);
  };

  const observer = new ResizeObserver(report);
  observer.observe(options.root);
  report();
  return () => observer.disconnect();
}
