// The snippet builder and the frame's height reporter (ADR-07, the parts of
// ST-37 that need no browser). The inline listener itself is run in
// tests/embed-listener.test.ts.
import { describe, expect, it, vi } from 'vitest';

import { startHeightReporter } from './frame';
import { clampHeight, HEIGHT_MESSAGE, heightMessage, isFormSlug, MAX_FRAME_HEIGHT, MIN_FRAME_HEIGHT } from './protocol';
import { buildEmbedSnippet, EmbedSnippetError, listenerSource } from './snippet';

const base = { publicOrigin: 'https://forms.example.test', slug: 'itema-2026-abstract', title: 'Abstract submission', linkText: 'Open the form' };

describe('form address parts', () => {
  it.each(['a', 'itema-2026-abstract', 'spike-abstract', '2026'])('%s is one', (slug) => {
    expect(isFormSlug(slug)).toBe(true);
  });

  it.each([
    'javascript:alert(1)', 'data:text/html,x', '//evil.example.test', 'evil.example.test', 'a.b', '../admin', 'a/b', 'a b', 'A', 'ä', '-a', 'a-', '',
    'a'.repeat(65), 'a"onload="x', 'a?x=1', 'a#b', '%2e%2e',
  ])('%j is not', (slug) => {
    expect(isFormSlug(slug)).toBe(false);
  });

  it('only a string can be one', () => {
    for (const value of [null, undefined, 1, {}, ['a']]) expect(isFormSlug(value)).toBe(false);
  });
});

describe('heights', () => {
  it.each([
    [640, 640],
    [640.4, 640],
    [-50, MIN_FRAME_HEIGHT],
    [0, MIN_FRAME_HEIGHT],
    [1e9, MAX_FRAME_HEIGHT],
  ])('%s becomes %s', (value, expected) => {
    expect(clampHeight(value)).toBe(expected);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '640', null, undefined, {}, [640]])('%j is not a height', (value) => {
    expect(clampHeight(value)).toBeNull();
    expect(heightMessage(value as number)).toBeNull();
  });

  it('a message holds a type and a height, nothing else', () => {
    expect(heightMessage(812)).toEqual({ type: HEIGHT_MESSAGE, height: 812 });
    expect(Object.keys(heightMessage(812)!)).toEqual(['type', 'height']);
  });
});

describe('the snippet', () => {
  const snippet = buildEmbedSnippet(base);

  it('is a frame, a link to the hosted form and one inline script', () => {
    expect(snippet).toContain('<iframe id="confera-form-itema-2026-abstract" src="https://forms.example.test/embed/itema-2026-abstract"');
    expect(snippet).toContain('<a href="https://forms.example.test/f/itema-2026-abstract"');
    expect(snippet.match(/<script>/g)).toHaveLength(1);
    expect(snippet).not.toMatch(/<script[^>]+src=/); // no code is loaded from anywhere
  });

  it('keeps the frame visible and sized whatever the theme says about frames', () => {
    const style = /style="([^"]*)"/.exec(snippet)![1]!;
    for (const property of ['display', 'width', 'max-width', 'height', 'min-height', 'max-height', 'border', 'visibility']) {
      expect(style).toMatch(new RegExp(`(^|;)${property}:[^;]+!important`));
    }
    expect(style).toContain('height:900px!important');
  });

  it.each(['javascript:alert(1)', '//evil.example.test', 'evil.example.test', 'a.b', '../x', 'a"><script>alert(1)</script>', ''])(
    'a slug like %j builds no snippet',
    (slug) => {
      expect(() => buildEmbedSnippet({ ...base, slug })).toThrow(EmbedSnippetError);
    },
  );

  it.each(['http://forms.example.test', 'https://forms.example.test/', 'https://forms.example.test/app', 'javascript:alert(1)', 'forms.example.test', '//forms.example.test', ''])(
    'an origin like %j builds no snippet',
    (publicOrigin) => {
      expect(() => buildEmbedSnippet({ ...base, publicOrigin })).toThrow(EmbedSnippetError);
    },
  );

  it('accepts the local origins of the development stack', () => {
    expect(buildEmbedSnippet({ ...base, publicOrigin: 'http://localhost:3000' })).toContain('src="http://localhost:3000/embed/');
  });

  it('writes the title and the link text as text', () => {
    const hostile = buildEmbedSnippet({ ...base, title: '"><script>alert(1)</script>', linkText: '<img src=x onerror=alert(1)>' });
    expect(hostile.match(/<script>/g)).toHaveLength(1);
    expect(hostile).not.toContain('<img');
    expect(hostile).toContain('title="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"');
  });

  it('refuses an initial height outside the bounds', () => {
    for (const initialHeight of [0, 50, 1e6, Number.NaN]) expect(() => buildEmbedSnippet({ ...base, initialHeight })).toThrow(EmbedSnippetError);
  });
});

describe('the inline lines', () => {
  const source = listenerSource('confera-form-x', 'https://forms.example.test');

  it('write no markup, run no text as code, load nothing and store nothing', () => {
    expect(source).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|Function\(|setTimeout|setInterval|import\(|fetch\(|XMLHttpRequest|cookie|localStorage|sessionStorage|createElement|\.src\b|location/);
  });

  it('never talk back: there is no postMessage in them', () => {
    expect(source).not.toContain('postMessage');
  });

  it('check the origin and the source window before anything else', () => {
    expect(source).toContain('if(e.origin!=="https://forms.example.test"||e.source!==f.contentWindow)return;');
    expect(source.indexOf('e.origin!==')).toBeLessThan(source.indexOf('e.data'));
  });

  it('are short', () => {
    expect(source.length).toBeLessThan(600);
  });
});

describe("the frame's height reporter", () => {
  class FakeObserver {
    static last: FakeObserver | undefined;
    constructor(readonly callback: () => void) {
      FakeObserver.last = this;
    }
    observe = vi.fn();
    disconnect = vi.fn();
  }
  const setup = (parentOrigins: string[], framed = true) => {
    vi.stubGlobal('ResizeObserver', FakeObserver);
    let height = 640.2;
    const root = { getBoundingClientRect: () => ({ height }) } as unknown as Element;
    const parent = { postMessage: vi.fn() };
    const win = {} as { parent: unknown };
    win.parent = framed ? parent : win;
    const stop = startHeightReporter({ root, parentOrigins, win: win as unknown as Window });
    return { parent, stop, resize: (next: number) => ((height = next), FakeObserver.last?.callback()) };
  };

  it('tells the listed origins the height of the content, and nothing else', () => {
    const { parent, resize } = setup(['https://itema.example.test', 'https://eman.example.test']);
    expect(parent.postMessage.mock.calls).toEqual([
      [{ type: HEIGHT_MESSAGE, height: 641 }, 'https://itema.example.test'],
      [{ type: HEIGHT_MESSAGE, height: 641 }, 'https://eman.example.test'],
    ]);
    resize(900);
    expect(parent.postMessage).toHaveBeenLastCalledWith({ type: HEIGHT_MESSAGE, height: 900 }, 'https://eman.example.test');
  });

  it('never posts to "*"', () => {
    const { parent, resize } = setup(['https://itema.example.test']);
    resize(300);
    resize(1200);
    for (const call of parent.postMessage.mock.calls) expect(call[1]).toBe('https://itema.example.test');
  });

  it('says nothing when the height did not change', () => {
    const { parent, resize } = setup(['https://itema.example.test']);
    resize(641);
    expect(parent.postMessage).toHaveBeenCalledTimes(1);
  });

  it('says nothing when the form has no site list or is not framed', () => {
    expect(setup([]).parent.postMessage).not.toHaveBeenCalled();
    expect(setup(['https://itema.example.test'], false).parent.postMessage).not.toHaveBeenCalled();
  });

  it('stops when asked', () => {
    const { stop } = setup(['https://itema.example.test']);
    stop();
    expect(FakeObserver.last?.disconnect).toHaveBeenCalled();
  });
});
