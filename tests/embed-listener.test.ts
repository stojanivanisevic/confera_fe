// @vitest-environment jsdom
//
// ST-37, for the snippet form of G2-17 (a): the few inline lines of the
// snippet are run here exactly as a conference site would run them, and are
// sent hostile messages.
//  - a message from another window or another origin is ignored;
//  - a height that is not a number is ignored; a negative or huge one is clamped;
//  - the lines do nothing else.
import { runInThisContext } from 'node:vm';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildEmbedSnippet, HEIGHT_MESSAGE, INTO_VIEW_MESSAGE, MAX_FRAME_HEIGHT, MIN_FRAME_HEIGHT } from '../packages/embed-loader/src/index';

const ORIGIN = 'https://forms.example.test';
const snippet = buildEmbedSnippet({ publicOrigin: ORIGIN, slug: 'itema-2026-abstract', title: 'Abstract submission', linkText: 'Open the form' });

let frame: HTMLIFrameElement;
let other: HTMLIFrameElement;

function send(data: unknown, origin = ORIGIN, source: Window | null = frame.contentWindow): void {
  window.dispatchEvent(new MessageEvent('message', { data, origin, source }));
}
const height = () => frame.style.getPropertyValue('height');

/** The listeners the lines of earlier tests added: each test has the lines of its own page only. */
const listening: Array<[string, EventListenerOrEventListenerObject]> = [];

beforeEach(() => {
  for (const [type, listener] of listening.splice(0)) window.removeEventListener(type, listener);
  // Paste the snippet into a page: markup first, then the inline script, as a browser does.
  const parsed = new DOMParser().parseFromString(`<body>${snippet}<iframe id="other"></iframe></body>`, 'text/html');
  const script = parsed.querySelector('script')!.textContent;
  document.body.replaceChildren(...Array.from(parsed.body.children).filter((el) => el.tagName !== 'SCRIPT').map((el) => document.importNode(el, true)));
  frame = document.querySelector<HTMLIFrameElement>('#confera-form-itema-2026-abstract')!;
  other = document.querySelector<HTMLIFrameElement>('#other')!;
  const spy = vi.spyOn(window, 'addEventListener');
  try {
    runInThisContext(script);
    for (const [type, listener] of spy.mock.calls) if (listener) listening.push([type, listener]);
  } finally {
    spy.mockRestore();
  }
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

  // Q3-12: on a site with CSS zoom, WebKit gives the frame's page fewer pixels than the frame is tall.
  it('on a zoomed site make the frame as tall as its page needs, by the ratio of the first message', () => {
    // The frame is 900 px on the page and its page gets 720 of them: the site zooms by 1.25.
    send({ type: HEIGHT_MESSAGE, height: 4540, view: 720 });
    expect(height()).toBe('5675px');
    // A message sent before that height arrived still names the old viewport: the ratio stays.
    send({ type: HEIGHT_MESSAGE, height: 4600, view: 720 });
    expect(height()).toBe('5750px');
    send({ type: HEIGHT_MESSAGE, height: 1e9, view: 720 });
    expect(height()).toBe(`${MAX_FRAME_HEIGHT}px`);
  });

  it('follow a site that starts to zoom later, from the next viewport the frame names', () => {
    send({ type: HEIGHT_MESSAGE, height: 1000, view: 900 });
    expect(height()).toBe('1000px');
    // The site zooms by 1.25: the frame, 1000 px on the page, gets 800 of them.
    send({ type: HEIGHT_MESSAGE, height: 1100, view: 800 });
    expect(height()).toBe('1375px');
  });

  it.each([
    ['as tall as the frame (no zoom)', 900],
    ['missing', undefined],
    ['not a number', 'a lot'],
  ])('take the height as it is when the viewport is %s', (_what, view) => {
    send({ type: HEIGHT_MESSAGE, height: 1234, view });
    expect(height()).toBe('1234px');
  });

  it('keep the frame inside the bounds whatever viewport a message names', () => {
    send({ type: HEIGHT_MESSAGE, height: 1234, view: 0 });
    expect(height()).toBe(`${MAX_FRAME_HEIGHT}px`);
    send({ type: HEIGHT_MESSAGE, height: 1234, view: -720 });
    expect(height()).toBe(`${MIN_FRAME_HEIGHT}px`);
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

// Decision D1, within the Security reviewer's limits: after Send the frame names how far down
// it the summary or the thank-you starts; the lines scroll the page there, and do nothing else.
describe('the scroll after Send (decision D1)', () => {
  let scrolled: Array<[number, number]>;
  let now: number;
  /** The frame starts `top` px below the top of the window and is `tall` px tall. */
  const place = (top: number, tall = 2000) => {
    frame.getBoundingClientRect = () => ({ top, height: tall, bottom: top + tall, left: 0, right: 800, width: 800, x: 0, y: top, toJSON: () => ({}) });
  };
  beforeEach(() => {
    scrolled = [];
    now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    window.scrollBy = ((x: number, y: number) => void scrolled.push([x, y])) as typeof window.scrollBy;
  });
  const ask = (top: unknown, origin = ORIGIN, source: Window | null = frame.contentWindow) => send({ type: INTO_VIEW_MESSAGE, top }, origin, source);

  it('scrolls vertically to a part that is below the window, a quarter of the window from the top', () => {
    place(100);
    ask(1500); // 1600 px down the page: out of view
    expect(scrolled).toEqual([[0, 1600 - 200]]);
  });

  it('scrolls to a part that is above the window', () => {
    place(-3000);
    ask(400); // 2600 px above the window
    expect(scrolled).toEqual([[0, -2600 - 200]]);
  });

  it('does nothing when the part is already in view', () => {
    place(100);
    ask(300);
    ask(0);
    expect(scrolled).toEqual([]);
  });

  it('clamps the request to the frame’s own height: a frame cannot send the page further than itself', () => {
    place(100, 900);
    ask(1e9);
    expect(scrolled).toEqual([[0, 100 + 900 - 200]]);
    now += 1000;
    place(-5000, 900);
    ask(-1e9);
    expect(scrolled[1]).toEqual([0, -5000 - 200]);
  });

  it('acts at most once a second', () => {
    place(100);
    ask(1500);
    now += 500;
    ask(1500);
    now += 499;
    ask(1500);
    expect(scrolled).toHaveLength(1);
    now += 1;
    ask(1500);
    expect(scrolled).toHaveLength(2);
  });

  it('a request that does not count (in view, not a number) does not use up the second', () => {
    place(100);
    ask(300);
    ask('1500');
    ask(1500);
    expect(scrolled).toHaveLength(1);
  });

  it.each([
    ['a string', '1500'],
    ['not a number', Number.NaN],
    ['infinity', Number.POSITIVE_INFINITY],
    ['null', null],
    ['an object', { valueOf: (): number => 1500 }],
    ['an array', [1500]],
  ])('ignores a top that is %s', (_what, top) => {
    place(100);
    ask(top);
    expect(scrolled).toEqual([]);
  });

  it('ignores a request from another origin or another window, even with Confera’s origin', () => {
    place(100);
    ask(1500, 'https://evil.example.test');
    ask(1500, 'http://forms.example.test');
    ask(1500, ORIGIN, other.contentWindow);
    ask(1500, ORIGIN, window);
    ask(1500, ORIGIN, null);
    expect(scrolled).toEqual([]);
  });

  it('changes nothing else: not the frame, not its height, not the focus', () => {
    place(100);
    const before = { style: frame.style.cssText, attributes: [...frame.attributes].map((a) => `${a.name}=${a.value}`).join('|'), focus: document.activeElement };
    send({ type: INTO_VIEW_MESSAGE, top: 1500, height: 5, src: 'https://evil.example.test' });
    expect(scrolled).toHaveLength(1);
    expect(frame.style.cssText).toBe(before.style);
    expect([...frame.attributes].map((a) => `${a.name}=${a.value}`).join('|')).toBe(before.attributes);
    expect(document.activeElement).toBe(before.focus);
  });
});