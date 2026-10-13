// M1-FE-04 (spike): the embed on a hostile page, in the snippet form of G2-17 (a).
//
// The harness site (localhost:4000) is a "conference site" with hostile CSS and
// a hostile script; it is on the site list of the spike form. The snippet under
// test is the real one, built by @confera/embed-loader and pasted into the page.
// Confera's public surface is another site (127.0.0.1:3000), so the frame is a
// real third-party frame, and the browsers run with third-party cookies blocked.
import type { Frame, Page } from '@playwright/test';

import { buildEmbedSnippet, frameId, HEIGHT_MESSAGE } from '../packages/embed-loader/src/index';
import { API_STUB_ORIGIN, HARNESS_ORIGIN, PUBLIC_ORIGIN, UNLISTED_ORIGIN } from './env';
import { expect, test } from './support/fixtures';
import { watchPage } from './support/page-problems';

const SLUG = 'spike-abstract';
const FRAME = `#${frameId(SLUG)}`;
const snippetFor = (slug: string) => buildEmbedSnippet({ publicOrigin: PUBLIC_ORIGIN, slug, title: 'Abstract submission', linkText: 'Open the form in a new page' });

/** Opens the hostile page of a site with `paste` in the place where an admin pastes the snippet. */
async function openSite(page: Page, origin: string, paste: string, query = ''): Promise<void> {
  const params = new URLSearchParams(query);
  params.set('paste', Buffer.from(paste, 'utf8').toString('base64url'));
  await page.goto(`${origin}/hostile.html?${params.toString()}`);
}

async function formFrame(page: Page): Promise<Frame> {
  await page.locator(FRAME).scrollIntoViewIfNeeded();
  const element = await page.locator(FRAME).elementHandle();
  const frame = await element?.contentFrame();
  if (!frame) throw new Error('The frame of the form has no document');
  await frame.getByRole('heading', { level: 1, name: 'Abstract submission' }).waitFor();
  return frame;
}

const STYLED = ['html', 'body', 'h1', '.ud-tab.is-selected', '.ud-tab:not(.is-selected)', '.ud-form-card', '.ud-form-card__title', '.ud-field__label', '.ud-field__box', '.ud-field__control', '.ud-field__message', '.ud-check__box', '.ud-check__label', '.ud-repeater__row', '.ud-text-btn--add', '.ud-btn--primary'];
const PROPERTIES = ['display', 'boxSizing', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'color', 'backgroundColor', 'borderTopColor', 'borderTopWidth', 'borderTopStyle', 'borderTopLeftRadius', 'paddingTop', 'paddingLeft', 'opacity', 'visibility'] as const;

/** The computed style of the design-system parts of a form, as a browser resolved it. */
function stylesOf(target: Page | Frame): Promise<Record<string, Record<string, string>>> {
  return target.evaluate(
    ({ selectors, properties }) => {
      const out: Record<string, Record<string, string>> = {};
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (!element) continue;
        const computed = getComputedStyle(element) as unknown as Record<string, string>;
        out[selector] = Object.fromEntries(properties.map((p) => [p, computed[p] ?? '']));
      }
      return out;
    },
    { selectors: STYLED, properties: [...PROPERTIES] },
  );
}

const frameHeights = async (page: Page, frame: Frame) => ({
  element: await page.locator(FRAME).evaluate((el) => el.getBoundingClientRect().height),
  content: await frame.locator('[data-confera-embed-root]').evaluate((el) => Math.ceil(el.getBoundingClientRect().height)),
});
const expectHeightFollows = (page: Page, frame: Frame) =>
  expect
    .poll(async () => {
      const { element, content } = await frameHeights(page, frame);
      return Math.abs(element - content);
    }, { message: 'the frame is as tall as its content' })
    .toBeLessThanOrEqual(1);

for (const width of [1440, 375]) {
  test.describe(`the embed on a hostile page, ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('styles inside the frame equal the design system\'s, whatever the site does', async ({ page, browser }) => {
      const problems = watchPage(page);
      await openSite(page, HARNESS_ORIGIN, snippetFor(SLUG));
      const frame = await formFrame(page);
      await frame.evaluate(() => document.fonts.ready);
      const framed = await stylesOf(frame);

      // The same form as a page of its own, at the width the frame has.
      const frameWidth = await frame.evaluate(() => window.innerWidth);
      const context = await browser.newContext({ viewport: { width: frameWidth, height: 900 } });
      const hosted = await context.newPage();
      await hosted.goto(`${PUBLIC_ORIGIN}/f/${SLUG}`);
      await hosted.getByRole('heading', { level: 1, name: 'Abstract submission' }).waitFor();
      await hosted.evaluate(() => document.fonts.ready);
      const alone = await stylesOf(hosted);
      await context.close();

      expect(Object.keys(framed).sort()).toEqual([...STYLED].sort());
      expect(framed).toEqual(alone);

      // And they are the design system's values, not the site's.
      expect(framed.html!.fontSize).toBe('16px'); // the site sets 62.5%
      expect(framed['.ud-btn--primary']).toMatchObject({ backgroundColor: 'rgb(239, 123, 6)', color: 'rgb(23, 25, 27)', fontSize: '14px', letterSpacing: '-0.42px' });
      expect(framed['.ud-btn--primary']!.fontFamily).toMatch(/^"?Manrope"?/);
      expect(framed['.ud-field__label']).toMatchObject({ display: 'block', color: 'rgb(23, 25, 27)' });
      expect(framed['.ud-field__label']!.fontFamily).toMatch(/^"?Inter"?/);
      expect(framed['.ud-form-card']).toMatchObject({ backgroundColor: 'rgb(255, 255, 255)', boxSizing: 'border-box' });
      expect(framed['.ud-field__control']!.display).not.toBe('none');
      expect(problems.messages).toEqual([]);
    });

    test('the frame keeps its place: full width, visible, no border, in spite of the site\'s rules for frames', async ({ page }) => {
      await openSite(page, HARNESS_ORIGIN, snippetFor(SLUG));
      await formFrame(page);
      const box = await page.locator(FRAME).evaluate((el) => {
        const s = getComputedStyle(el);
        return { display: s.display, visibility: s.visibility, opacity: s.opacity, border: s.borderTopWidth, margin: s.marginTop, padding: s.paddingTop, maxHeight: s.maxHeight, width: el.getBoundingClientRect().width, slot: el.parentElement!.getBoundingClientRect().width };
      });
      expect(box).toMatchObject({ display: 'block', visibility: 'visible', opacity: '1', border: '0px', margin: '0px', padding: '0px', maxHeight: 'none' });
      expect(Math.abs(box.width - box.slot)).toBeLessThanOrEqual(1);
    });

    test('no horizontal scroll, in the site and in the frame', async ({ page, browser }) => {
      await openSite(page, HARNESS_ORIGIN, snippetFor(SLUG));
      const frame = await formFrame(page);
      const overflow = () => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth });
      const site = await page.evaluate(overflow);
      const inside = await frame.evaluate(overflow);
      // The hostile site may overflow by itself (its own input does, in one engine): the form adds nothing to it.
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const bare = await context.newPage();
      await openSite(bare, HARNESS_ORIGIN, '<div style="height:1200px"></div>');
      const siteAlone = await bare.evaluate(overflow);
      await context.close();
      expect(site.scroll, 'the form makes the site scroll sideways').toBeLessThanOrEqual(Math.max(site.client, siteAlone.scroll));
      const frameBox = await page.locator(FRAME).evaluate((el) => ({ right: el.getBoundingClientRect().right, slot: el.parentElement!.getBoundingClientRect().right }));
      expect(frameBox.right, 'the frame sticks out of its place').toBeLessThanOrEqual(frameBox.slot + 0.5);
      expect(inside.scroll, 'the frame scrolls sideways').toBeLessThanOrEqual(inside.client);
      // Nothing of the form sticks out of the frame.
      const widest = await frame.evaluate(() => Math.max(...[...document.querySelectorAll('[data-confera-embed-root] *')].map((el) => el.getBoundingClientRect().right)));
      expect(widest).toBeLessThanOrEqual(inside.client + 0.5);
    });

    test('the height follows the content, up and down', async ({ page }) => {
      await openSite(page, HARNESS_ORIGIN, snippetFor(SLUG));
      const frame = await formFrame(page);
      await expectHeightFollows(page, frame);
      const start = (await frameHeights(page, frame)).element;

      await frame.getByRole('button', { name: 'Add author' }).click();
      await frame.getByRole('button', { name: 'Add author' }).click();
      await expectHeightFollows(page, frame);
      const grown = (await frameHeights(page, frame)).element;
      expect(grown).toBeGreaterThan(start + 100);

      await frame.getByRole('button', { name: 'Remove author 3' }).click();
      await frame.getByRole('button', { name: 'Remove author 2' }).click();
      await expectHeightFollows(page, frame);
      expect(Math.abs((await frameHeights(page, frame)).element - start)).toBeLessThanOrEqual(1);

      // An error summary makes the form taller; the frame follows, and has no scroll bar of its own.
      await frame.getByRole('button', { name: 'Send abstract' }).click();
      await expect(frame.locator('.ud-alert--error')).toContainText('Please correct the marked fields');
      await expect(frame.locator('.ud-alert--error')).toHaveAttribute('role', 'alert');
      await expectHeightFollows(page, frame);
      expect((await frameHeights(page, frame)).element).toBeGreaterThan(start);
      expect(await frame.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
    });
  });
}

test.describe('the embed: what the site and the frame can and cannot do to each other', () => {
  test('the site is unchanged by the snippet', async ({ page, browser }) => {
    const inspect = async (target: Page) =>
      target.evaluate(() => {
        const pick = (el: Element) => {
          const s = getComputedStyle(el);
          return [s.fontSize, s.fontFamily, s.color, s.backgroundColor, s.letterSpacing, s.boxSizing, s.display, s.position, s.borderTopWidth].join('|');
        };
        return {
          styles: ['html', 'body', '#host-header', '#host-title', '#host-text', '#host-input', '#host-after'].map((s) => `${s}: ${pick(document.querySelector(s)!)}`),
          // Without the frame indexes, and without what the test tool itself puts on the window.
          globals: Object.getOwnPropertyNames(window).filter((name) => !/^\d+$/.test(name) && !/^__(?:playwright|pw)/.test(name)).sort(),
          sheets: document.styleSheets.length,
          title: document.title,
        };
      });
    const header = { x: 0, y: 0, width: 1440, height: 220 };

    await openSite(page, HARNESS_ORIGIN, snippetFor(SLUG));
    await formFrame(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    const withForm = await inspect(page);
    const pictureWith = await page.screenshot({ clip: header });

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const bare = await context.newPage();
    await openSite(bare, HARNESS_ORIGIN, '<div style="height:1200px"></div>'); // as tall as the form, so both pages scroll alike
    const without = await inspect(bare);
    const pictureWithout = await bare.screenshot({ clip: header });
    await context.close();

    expect(withForm.styles).toEqual(without.styles);
    expect(withForm.globals).toEqual(without.globals); // the inline lines leave no global behind
    expect(withForm.sheets).toBe(without.sheets);
    expect(withForm.title).toBe(without.title);
    expect(pictureWith.equals(pictureWithout), 'the top of the site looks different with the form in it').toBe(true);
  });

  test('messages: the frame tells a type and a height only, and the site cannot drive the frame', async ({ page }) => {
    await openSite(page, HARNESS_ORIGIN, snippetFor(SLUG));
    const frame = await formFrame(page);
    await frame.getByLabel('Title of the paper').fill('Tajni naslov rada');
    await frame.getByLabel('Abstract').fill('Poverljiv tekst apstrakta.');
    await frame.getByRole('button', { name: 'Add author' }).click();
    await expectHeightFollows(page, frame);

    // The hostile script of the site has been posting fake heights all along (5, 99999999, and into the frame).
    await page.waitForTimeout(400);
    await expectHeightFollows(page, frame);

    const received = await page.evaluate(() => (window as unknown as { __received: Array<{ origin: string; fromFrame: boolean; data: unknown }> }).__received);
    const fromFrame = received.filter((m) => m.fromFrame);
    expect(fromFrame.length).toBeGreaterThan(1);
    for (const message of fromFrame) {
      expect(message.origin).toBe(PUBLIC_ORIGIN);
      expect(Object.keys(message.data as object)).toEqual(['type', 'height']);
      expect((message.data as { type: string }).type).toBe(HEIGHT_MESSAGE);
      expect(Number.isInteger((message.data as { height: number }).height)).toBe(true);
    }
    // Nothing the author typed left the frame.
    expect(JSON.stringify(received)).not.toMatch(/Tajni|Poverljiv/);

    // The messages the site posted into the frame changed nothing in it.
    await expect(frame.getByLabel('Title of the paper')).toHaveValue('Tajni naslov rada');
    await expect(frame.getByRole('heading', { level: 1 })).toHaveText('Abstract submission');
  });

  test('the site cannot read the form', async ({ page }) => {
    await openSite(page, HARNESS_ORIGIN, snippetFor(SLUG));
    const frame = await formFrame(page);
    await frame.getByLabel('Title of the paper').fill('Tajni naslov rada');
    const reach = await page.locator(FRAME).evaluate((el: HTMLIFrameElement) => {
      const attempt = (read: () => unknown) => {
        try {
          return read() === null ? 'null' : 'read';
        } catch (error) {
          return (error as Error).name;
        }
      };
      return { document: attempt(() => el.contentDocument), body: attempt(() => el.contentWindow!.document.body), storage: attempt(() => el.contentWindow!.sessionStorage) };
    });
    expect(reach.document).toBe('null');
    expect(reach.body).toBe('SecurityError');
    expect(reach.storage).toBe('SecurityError');
  });

  // A browser that refuses to show a page in a frame does not load that page: none of its
  // scripts and stylesheets is requested, and the browser says in the console that it refused.
  // (Looking inside the refused frame is not possible in every engine: one shows its own error page there.)
  const REFUSED = /frame-ancestors|X-Frame-Options|Refused to (?:frame|display|load)/i;
  function watchFraming(page: Page) {
    const documents = new Map<string, { status: number; policy: string | undefined; legacy: string | undefined }>();
    const loadedByFrames: string[] = [];
    const refusals: string[] = [];
    page.on('response', (r) => {
      if (!r.url().startsWith(PUBLIC_ORIGIN)) return;
      if (r.request().resourceType() === 'document') documents.set(new URL(r.url()).pathname, { status: r.status(), policy: r.headers()['content-security-policy'], legacy: r.headers()['x-frame-options'] });
      else loadedByFrames.push(new URL(r.url()).pathname);
    });
    page.on('console', (m) => {
      if (REFUSED.test(m.text())) refusals.push(m.text());
    });
    return { documents, loadedByFrames, refusals };
  }

  test('an unlisted site is blocked', async ({ page }) => {
    const seen = watchFraming(page);
    await openSite(page, UNLISTED_ORIGIN, snippetFor(SLUG));
    await page.locator(FRAME).scrollIntoViewIfNeeded();
    await expect.poll(() => seen.documents.size).toBe(1);
    // The page says who may frame it, and this site is not on the list ...
    const document = seen.documents.get(`/embed/${SLUG}`)!;
    expect(document.policy).toMatch(new RegExp(`^frame-ancestors ${HARNESS_ORIGIN}; `));
    // ... so the browser refuses it: it says so, and loads nothing of the form.
    await expect.poll(() => seen.refusals.length, { message: 'the browser reports that it refused the frame' }).toBeGreaterThan(0);
    await page.waitForTimeout(1000);
    expect(seen.loadedByFrames).toEqual([]);
    // The frame element stays, empty, and the link to the hosted form still works.
    expect(await page.locator(FRAME).count()).toBe(1);
    await expect(page.getByRole('link', { name: 'Open the form in a new page' })).toHaveAttribute('href', `${PUBLIC_ORIGIN}/f/${SLUG}`);
  });

  test('the same snippet on the listed site is shown (the control of the test above)', async ({ page }) => {
    const seen = watchFraming(page);
    await openSite(page, HARNESS_ORIGIN, snippetFor(SLUG));
    await formFrame(page);
    expect(seen.refusals).toEqual([]);
    expect(seen.loadedByFrames.some((path) => path.startsWith('/_next/static/'))).toBe(true);
  });

  test('a form without a site list, the hosted form, an unknown form and the sign-in page cannot be framed even by a listed site', async ({ page }) => {
    const seen = watchFraming(page);
    const paths = ['/embed/spike-unlisted', `/f/${SLUG}`, '/embed/no-such-form', '/no-such-page'];
    const frames = paths
      .map((path, i) => `<iframe id="blocked-${i}" title="blocked ${i}" src="${PUBLIC_ORIGIN}${path}" style="display:block!important;width:100%!important;height:300px!important;visibility:visible!important;max-height:none!important"></iframe>`)
      .join('\n');
    await openSite(page, HARNESS_ORIGIN, frames);
    await expect.poll(() => seen.documents.size).toBe(paths.length);
    for (const [path, document] of seen.documents) {
      expect(document.policy, path).toMatch(/^frame-ancestors 'none'; /);
      expect(document.legacy, path).toBe('DENY');
    }
    expect(seen.documents.get('/embed/no-such-form')!.status).toBe(404);
    await expect.poll(() => seen.refusals.length).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(1000);
    expect(seen.loadedByFrames).toEqual([]);
  });

  test('it works with third-party cookies blocked, and sets no cookie', async ({ page, context }) => {
    // Control: in this browser a third-party frame really cannot keep a cookie.
    const probe = `<iframe id="probe" title="cookie probe" src="${API_STUB_ORIGIN}/cookie-probe" style="display:block!important;height:10px!important;visibility:visible!important;max-height:none!important"></iframe>`;
    await openSite(page, HARNESS_ORIGIN, `${snippetFor(SLUG)}\n${probe}`);
    const frame = await formFrame(page);
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __received: Array<{ data: { type?: string; kept?: boolean } }> }).__received.find((m) => m.data?.type === 'cookie-probe')?.data.kept))
      .toBe(false);

    // The form works all the same.
    await frame.getByRole('radio', { name: 'Srpski' }).click();
    await expect(frame.getByRole('heading', { level: 1 })).toHaveText('Prijava apstrakta');
    await frame.getByLabel('Naslov rada').fill('Održivi turizam na Balkanu');
    await frame.getByLabel('Ime autora 1').fill('Marta Kovač');
    await frame.getByLabel('Prihvatam uslove objavljivanja').check({ force: true });
    await frame.getByRole('button', { name: 'Pošalji apstrakt' }).click();
    await expect(frame.locator('.ud-alert--success')).toContainText('Hvala');
    await expectHeightFollows(page, frame);

    // Confera's public surface set no cookie at all.
    expect(await context.cookies(PUBLIC_ORIGIN)).toEqual([]);
  });

  test('it works when the browser refuses storage to the frame', async ({ page }) => {
    // Every access to storage throws, as it does in a frame with storage blocked.
    await page.addInitScript(() => {
      if (window.top === window) return;
      const refuse = () => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      };
      for (const name of ['sessionStorage', 'localStorage'] as const) Object.defineProperty(window, name, { configurable: true, get: refuse });
    });
    const problems = watchPage(page);
    await openSite(page, HARNESS_ORIGIN, snippetFor(SLUG));
    const frame = await formFrame(page);
    expect(await frame.evaluate(() => { try { return typeof window.sessionStorage; } catch (error) { return (error as Error).name; } })).toBe('SecurityError');

    await expect(frame.getByText('This browser does not let the form keep a draft')).toBeVisible();
    await frame.getByLabel('Title of the paper').fill('Sustainable tourism in the Balkans');
    await frame.getByLabel('Name of author 1').fill('Marta Kovač');
    await frame.getByLabel('I accept the terms of publication').check({ force: true });
    await frame.getByRole('button', { name: 'Send abstract' }).click();
    await expect(frame.locator('.ud-alert--success')).toContainText('Thank you');
    await expectHeightFollows(page, frame);
    expect(problems.messages).toEqual([]);
  });

  test('the language switch keeps what was typed, and the frame document follows the language', async ({ page }) => {
    await openSite(page, HARNESS_ORIGIN, snippetFor(SLUG));
    const frame = await formFrame(page);
    await frame.getByLabel('Title of the paper').fill('Šta đaci čitaju');
    await frame.getByRole('radio', { name: 'Srpski' }).click();
    await expect(frame.getByLabel('Naslov rada')).toHaveValue('Šta đaci čitaju');
    await expect(frame.getByRole('button', { name: 'Dodaj autora' })).toBeVisible();
    expect(await frame.evaluate(() => document.documentElement.lang)).toBe('sr');
    await expectHeightFollows(page, frame);
  });

  test('on a site with a strict policy of its own the form still works', async ({ page }) => {
    await openSite(page, HARNESS_ORIGIN, snippetFor(SLUG), 'csp=allow-inline');
    const frame = await formFrame(page);
    await expectHeightFollows(page, frame);
  });

  test('where the site lets no pasted script run, the frame keeps its fixed height and the form is still usable', async ({ page }) => {
    await openSite(page, HARNESS_ORIGIN, snippetFor(SLUG), 'csp=no-inline');
    const frame = await formFrame(page);
    await frame.getByRole('button', { name: 'Add author' }).click();
    await page.waitForTimeout(300);
    expect((await frameHeights(page, frame)).element).toBe(900); // the fixed height of the snippet
    await frame.getByLabel('Name of author 2').fill('Đorđe Šćepanović');
    await expect(frame.getByLabel('Name of author 2')).toHaveValue('Đorđe Šćepanović');
    await expect(page.getByRole('link', { name: 'Open the form in a new page' })).toBeVisible();
  });
});
