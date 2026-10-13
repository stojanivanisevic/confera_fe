// @vitest-environment jsdom
//
// ST-37, for the snippet form of G2-17 (a): the few inline lines of the
// snippet are run here exactly as a conference site would run them, and are
// sent hostile messages.
//  - a message from another window or another origin is ignored;
//  - a height that is not a number is ignored; a negative or huge one is clamped;
//  - the lines do nothing else.
import { runInThisContext } from 'node:vm';

import { beforeEach, describe, expect, it } from 'vitest';

import { buildEmbedSnippet, HEIGHT_MESSAGE, MAX_FRAME_HEIGHT, MIN_FRAME_HEIGHT } from '../packages/embed-loader/src/index';

const ORIGIN = 'https://forms.example.test';
const snippet = buildEmbedSnippet({ publicOrigin: ORIGIN, slug: 'itema-2026-abstract', title: 'Abstract submission', linkText: 'Open the form' });

let frame: HTMLIFrameElement;
let other: HTMLIFrameElement;

function send(data: unknown, origin = ORIGIN, source: Window | null = frame.contentWindow): void {
  window.dispatchEvent(new MessageEvent('message', { data, origin, source }));
}
const height = () => frame.style.getPropertyValue('height');

beforeEach(() => {
  // Paste the snippet into a page: markup first, then the inline script, as a browser does.
  const parsed = new DOMParser().parseFromString(`<body>${snippet}<iframe id="other"></iframe></body>`, 'text/html');
  const script = parsed.querySelector('script')!.textContent;
  document.body.replaceChildren(...Array.from(parsed.body.children).filter((el) => el.tagName !== 'SCRIPT').map((el) => document.importNode(el, true)));
  frame = document.querySelector<HTMLIFrameElement>('#confera-form-itema-2026-abstract')!;
  other = document.querySelector<HTMLIFrameElement>('#other')!;
  runInThisContext(script);
});

describe('the inline lines of the snippet, running in a host page', () => {
  it('start with the fixed height of the snippet', () => {
    expect(height()).toBe('900px');
    expect(frame.style.getPropertyPriority('height')).toBe('important');
  });

  it('set the height the frame reports', () => {
    send({ type: HEIGHT_MESSAGE, height: 1234 });
    expect(height()).toBe('1234px');
    expect(frame.style.getPropertyPriority('height')).toBe('important');
  });

  it('ignore a message from another origin', () => {
    send({ type: HEIGHT_MESSAGE, height: 1234 }, 'https://evil.example.test');
    send({ type: HEIGHT_MESSAGE, height: 1234 }, 'https://forms.example.test.evil.example.test');
    send({ type: HEIGHT_MESSAGE, height: 1234 }, 'http://forms.example.test');
    send({ type: HEIGHT_MESSAGE, height: 1234 }, 'null');
    expect(height()).toBe('900px');
  });

  it("ignore a message from another window, even with Confera's origin", () => {
    send({ type: HEIGHT_MESSAGE, height: 1234 }, ORIGIN, other.contentWindow);
    send({ type: HEIGHT_MESSAGE, height: 1234 }, ORIGIN, window);
    send({ type: HEIGHT_MESSAGE, height: 1234 }, ORIGIN, null);
    expect(height()).toBe('900px');
  });

  it.each([
    ['a string', '1234'],
    ['not a number', Number.NaN],
    ['infinity', Number.POSITIVE_INFINITY],
    ['null', null],
    ['an object', { valueOf: () => 1234 }],
    ['an array', [1234]],
    ['a missing height', undefined],
  ])('ignore a height that is %s', (_what, value) => {
    send({ type: HEIGHT_MESSAGE, height: value });
    expect(height()).toBe('900px');
  });

  it('clamp a negative and a huge height', () => {
    send({ type: HEIGHT_MESSAGE, height: -500 });
    expect(height()).toBe(`${MIN_FRAME_HEIGHT}px`);
    send({ type: HEIGHT_MESSAGE, height: 1e12 });
    expect(height()).toBe(`${MAX_FRAME_HEIGHT}px`);
    send({ type: HEIGHT_MESSAGE, height: 640.6 });
    expect(height()).toBe('641px');
  });

  it.each([
    ['another type', { type: 'confera:navigate', height: 1234 }],
    ['no type', { height: 1234 }],
    ['a string', 'confera:height:1234'],
    ['null', null],
    ['a number', 1234],
  ])('ignore a message with %s', (_what, data) => {
    send(data);
    expect(height()).toBe('900px');
  });

  it('change nothing but the height: no attribute, no global, no other style', () => {
    const attributes = () => [...frame.attributes].map((a) => `${a.name}=${a.name === 'style' ? '' : a.value}`).join('|');
    const before = { attributes: attributes(), globals: Object.keys(window).length, src: frame.src, style: frame.style.cssText.replace(/height:[^;]+;?/, '') };
    send({ type: HEIGHT_MESSAGE, height: 1500, src: 'https://evil.example.test', html: '<script>alert(1)</script>' });
    expect(height()).toBe('1500px');
    expect(attributes()).toBe(before.attributes);
    expect(frame.src).toBe(before.src);
    expect(Object.keys(window).length).toBe(before.globals);
    expect(frame.style.cssText.replace(/(?<!-)height:[^;]+;?/, '')).toBe(before.style.replace(/(?<!-)height:[^;]+;?/, ''));
    expect(document.querySelectorAll('script')).toHaveLength(0);
  });
});
