// REVIEWED COMPONENT: the only place in confera_fe that may render stored
// markup (ADR-20, SEC-A-19). The lint rule that bans raw-markup rendering has
// exactly one exception, and it is this file. Do not add a second one.
//
// Stored markup (a mail-log body, a template preview) is never inserted into
// the application's own document. It is shown inside a frame that
//   - has the sandbox attribute with NO token: no scripts, no same-origin,
//     no forms, no popups, no top navigation;
//   - carries its own content security policy that allows nothing but inline
//     styles and embedded images, so the markup cannot load or send anything;
//   - is not in the tab order unless the caller asks for it.
// A sanitiser bypass in stored markup therefore reaches no script context.
import type { CSSProperties } from 'react';

export interface SandboxedMarkupFrameProps {
  /** The stored markup. It is shown, never executed. */
  markup: string;
  /** Accessible name of the frame, for example "Email body". */
  title: string;
  className?: string;
  style?: CSSProperties;
}

const FRAME_POLICY = "default-src 'none'; style-src 'unsafe-inline'; img-src data: cid:; base-uri 'none'; form-action 'none'";

/** The document the frame shows: the policy first, so it applies to everything after it. */
export function sandboxedDocument(markup: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${FRAME_POLICY}"><meta name="referrer" content="no-referrer"></head><body>${markup}</body></html>`;
}

export function SandboxedMarkupFrame({ markup, title, className, style }: SandboxedMarkupFrameProps) {
  return (
    <iframe
      title={title}
      className={className}
      style={style}
      // An empty sandbox attribute is the strictest one. Never add a token here.
      sandbox=""
      referrerPolicy="no-referrer"
      loading="lazy"
      srcDoc={sandboxedDocument(markup)}
    />
  );
}
