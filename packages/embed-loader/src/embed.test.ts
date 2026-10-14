// The snippet builder and the frame's height reporter (ADR-07, the parts of
// ST-37 that need no browser). The inline listener itself is run in
// tests/embed-listener.test.ts.
import { describe, expect, it, vi } from 'vitest';

import { requestIntoView, startHeightReporter } from './frame';
import { clampHeight, HEIGHT_MESSAGE, heightMessage, INTO_VIEW_MESSAGE, isFormSlug, MAX_FRAME_HEIGHT, MIN_FRAME_HEIGHT } from './protocol';
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

  it('check the origin first, then find the frame by the window that sent the message, before reading anything', () => {
    expect(source).toContain('var o="https://forms.example.test",i="confera-form-x";');
    expect(source).toContain('if(e.origin!==o||!e.source)return;');
    expect(source).toContain('for(var a=document.querySelectorAll("iframe#"+i),k=0,g;k<a.length;k++)if(a[k].contentWindow===e.source)g=a[k];');
    expect(source.indexOf('e.origin!==o')).toBeLessThan(source.indexOf('contentWindow===e.source'));
    expect(source.indexOf('contentWindow===e.source')).toBeLessThan(source.indexOf('e.data'));
  });

  it('keep no frame from the moment they ran: the frame is looked up when a message arrives', () => {
    const handler = source.slice(source.indexOf('addEventListener("message"'));
    expect(handler).toContain('document.querySelectorAll("iframe#"+i)');
    expect(handler).not.toMatch(/[^a-z]f[.,)]/);
  });

  it('make a frame that already shows its page one pixel taller, so that it tells its height again', () => {
    expect(source).toContain('var f=document.getElementById(i),s=f&&!f.contentDocument&&parseInt(f.style.height);if(s)z(f,s+1);');
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
    const listeners = new Map<string, () => void>();
    // The frame's own viewport: the fixed height of the snippet until the page around sets another.
    const win = {
      innerHeight: 900,
      addEventListener: vi.fn((type: string, listener: () => void) => listeners.set(type, listener)),
      removeEventListener: vi.fn((type: string) => listeners.delete(type)),
    } as { parent?: unknown; innerHeight: number; addEventListener: unknown; removeEventListener: unknown };
    win.parent = framed ? parent : win;
    const stop = startHeightReporter({ root, parentOrigins, win: win as unknown as Window });
    return {
      parent,
      stop,
      win,
      resize: (next: number) => ((height = next), FakeObserver.last?.callback()),
      /** The page around makes the frame this tall. */
      frameResized: (viewport: number) => {
        win.innerHeight = viewport;
        listeners.get('resize')?.();
      },
    };
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

  it('tells the height again, also unchanged, when the page around changes the size of the frame before it ever followed', () => {
    // A site that ran the snippet late: the frame told 641 to nobody, and the lines, starting now,
    // make it one pixel taller than the fixed height to hear it.
    const { parent, frameResized } = setup(['https://itema.example.test']);
    expect(parent.postMessage).toHaveBeenCalledTimes(1);
    frameResized(901);
    expect(parent.postMessage).toHaveBeenCalledTimes(2);
    expect(parent.postMessage).toHaveBeenLastCalledWith({ type: HEIGHT_MESSAGE, height: 641 }, 'https://itema.example.test');
  });

  it('once the page has followed, a size it sets is not argued with', () => {
    const { parent, frameResized, resize } = setup(['https://itema.example.test']);
    frameResized(641); // the page made the frame as tall as it said
    frameResized(640); // and then something of the site sets another size: the frame does not fight it
    frameResized(5000);
    expect(parent.postMessage).toHaveBeenCalledTimes(1);
    // A change of its own content is still told.
    resize(700);
    expect(parent.postMessage).toHaveBeenCalledTimes(2);
  });

  it('a frame that is already as tall as it says needs nothing more', () => {
    const { parent, frameResized, resize } = setup(['https://itema.example.test']);
    resize(900); // the content is as tall as the fixed height
    expect(parent.postMessage).toHaveBeenCalledTimes(2);
    frameResized(901);
    expect(parent.postMessage).toHaveBeenCalledTimes(2);
  });

  it('stops when asked', () => {
    const { stop, win, parent, frameResized } = setup(['https://itema.example.test']);
    stop();
    expect(FakeObserver.last?.disconnect).toHaveBeenCalled();
    expect(win.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    frameResized(901);
    expect(parent.postMessage).toHaveBeenCalledTimes(1);
  });
});

describe('the request to bring a part of the form into view (UX-M1-01, 02; read by the snippet after decision D1)', () => {
  const setup = (parentOrigins: string[], framed = true) => {
    const parent = { postMessage: vi.fn() };
    const win = { scrollY: 120 } as { parent?: unknown; scrollY: number };
    win.parent = framed ? parent : win;
    const element = { getBoundingClientRect: () => ({ top: 340.6 }) } as unknown as Element;
    requestIntoView({ element, parentOrigins, win: win as unknown as Window });
    return parent;
  };

  it('tells the listed origins how far down the frame that part starts, and nothing else', () => {
    const parent = setup(['https://itema.example.test', 'https://eman.example.test']);
    expect(parent.postMessage.mock.calls).toEqual([
      [{ type: INTO_VIEW_MESSAGE, top: 461 }, 'https://itema.example.test'],
      [{ type: INTO_VIEW_MESSAGE, top: 461 }, 'https://eman.example.test'],
    ]);
  });

  it('says nothing without a site list or a frame', () => {
    expect(setup([]).postMessage).not.toHaveBeenCalled();
    expect(setup(['https://itema.example.test'], false).postMessage).not.toHaveBeenCalled();
  });
});
