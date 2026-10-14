// @vitest-environment jsdom
//
// Edge cases of the snippet's inline lines found by the edge-case hunter (M1-REV-01):
// a conference site whose scripts move the frame element.
//
// ADR-07 / M1-FE-04: "the height follows the content", on a hostile page. The inline
// lines look the frame element up ONCE, when they run, and keep that element:
//   var f = document.getElementById(id); if (!f || ...) return;
// Two things that real sites do break that:
//  - a cookie-consent manager (they block unknown third-party frames by default) or a
//    lazy loader takes the frame out of the page and puts a NEW element with the same
//    markup back later. The kept element is detached, its contentWindow is null, and every
//    message of the frame that is really in the page is ignored, for ever.
//  - the frame is not in the page yet when the lines run (the consent manager holds it
//    back, or a theme moves inline scripts into the head). The lines return at once and
//    never listen at all.
// In both cases the frame stays at its fixed height for the life of the page, and the
// snippet cannot be fixed afterwards without every conference site pasting it again
// ("to update, the snippet is pasted again", G2-17). The rules of ADR-07 (only messages
// whose source is the frame and whose origin is Confera's) stay what they are.
import { runInThisContext } from 'node:vm';

import { beforeEach, describe, expect, it } from 'vitest';

import { buildEmbedSnippet, frameId, HEIGHT_MESSAGE } from '../packages/embed-loader/src/index';

const ORIGIN = 'https://forms.example.test';
const SLUG = 'itema-2026-abstract';
const snippet = buildEmbedSnippet({ publicOrigin: ORIGIN, slug: SLUG, title: 'Abstract submission', linkText: 'Open the form' });

const parsed = new DOMParser().parseFromString(`<body>${snippet}</body>`, 'text/html');
const SCRIPT = parsed.querySelector('script')!.textContent;

/** A new frame element made from the pasted markup, as a consent manager or a lazy loader puts it back. */
function frameFromMarkup(): HTMLIFrameElement {
  return document.importNode(parsed.querySelector('iframe')!, true);
}

function send(frame: HTMLIFrameElement, height: number): void {
  window.dispatchEvent(new MessageEvent('message', { data: { type: HEIGHT_MESSAGE, height }, origin: ORIGIN, source: frame.contentWindow }));
}

const current = () => document.getElementById(frameId(SLUG)) as HTMLIFrameElement;

beforeEach(() => {
  document.body.replaceChildren();
});

describe('edge cases of the inline lines (M1-REV-01)', () => {
  it('the height follows the frame that is in the page after a consent manager put it back', () => {
    const slot = document.createElement('div');
    slot.appendChild(frameFromMarkup());
    document.body.appendChild(slot);
    runInThisContext(SCRIPT);

    // Consent given: the manager replaces the blocked frame by a fresh one with the same markup.
    slot.replaceChildren(frameFromMarkup());
    const frame = current();
    expect(frame.contentWindow).not.toBeNull();

    send(frame, 1234);
    expect(frame.style.getPropertyValue('height')).toBe('1234px');
  });

  it('the height follows a frame that arrives after the inline lines ran', () => {
    // The lines run first (moved into the head, or the frame is still held back) ...
    runInThisContext(SCRIPT);
    // ... and the frame comes afterwards.
    document.body.appendChild(frameFromMarkup());
    const frame = current();

    send(frame, 1234);
    expect(frame.style.getPropertyValue('height')).toBe('1234px');
  });

  it('control: when nothing moves, the lines do their work (so the two tests above fail for the reason they name)', () => {
    document.body.appendChild(frameFromMarkup());
    runInThisContext(SCRIPT);
    send(current(), 1234);
    expect(current().style.getPropertyValue('height')).toBe('1234px');
  });
});
