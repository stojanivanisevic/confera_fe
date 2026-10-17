// The moment after Send, in a real browser (UX-M1-01, 02, 03; UI-M1-06, 11), on Confera's own
// page and in the frame of a conference site, in all three engines:
//  - nothing the author typed ever travels in an address: before the scripts arrive Send is not
//    pressable and Enter submits nothing; the form posts in any case (method=post, 204);
//  - a failed Send moves the focus to the summary of the errors, which comes into view, and each
//    item takes the focus to its field; a successful Send moves it to the thank-you;
//  - inside the frame the page around is asked to bring that part into view. Chromium and Firefox
//    scroll the site along with the focus; WebKit does not, and there the snippet's lines do it
//    (decision D1, built in 0.3.0): in all three engines the part ends in the site's window.
import type { Frame, Page, Request } from '@playwright/test';

import { buildEmbedSnippet, frameId, INTO_VIEW_MESSAGE } from '../packages/embed-loader/src/index';
import { HARNESS_ORIGIN, PUBLIC_ORIGIN } from './env';
import { expect, test } from './support/fixtures';

const SLUG = 'spike-abstract';
const FORM = `${PUBLIC_ORIGIN}/f/${SLUG}`;
/** One word that appears in everything typed below, and nowhere else: if it shows up in an address, something leaked. */
const MARK = 'zqxw';

/** Holds the scripts of the page back until the returned function is called; the server's markup arrives at once. */
async function holdScripts(page: Page): Promise<() => void> {
  let release: () => void = () => undefined;
  const mayLoad = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/_next\/static\/.*\.js(?:\?.*)?$/, async (route) => {
    await mayLoad;
    await route.continue();
  });
  return release;
}

/** Every address the page and its frames asked for, and every form of the mark that could stand in one. */
function recordAddresses(page: Page): () => string[] {
  const urls: string[] = [];
  page.on('request', (request: Request) => urls.push(request.url()));
  page.on('framenavigated', (frame) => urls.push(frame.url()));
  return () => urls.filter((url) => url.toLowerCase().includes(MARK) || /[?&](?:title|abstract|authors\.|consent)=/.test(url));
}

/** Is the element within the window of the page it is in (for a frame: within the frame's own window)? */
const inWindow = (page: Page | Frame, selector: string) =>
  page.locator(selector).evaluate((el) => {
    const box = el.getBoundingClientRect();
    return box.top >= -1 && box.top < window.innerHeight; // a fraction of a pixel above the edge is in view
  });

test.describe('nothing typed into the form ever travels in an address (UX-M1-03)', () => {
  test('before the scripts arrive Send cannot be pressed and Enter submits nothing; then the form works, and no address ever carries what was typed', async ({ page }) => {
    const leaked = recordAddresses(page);
    const sends: string[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith(`/f/${SLUG}/send`)) sends.push(request.method());
    });
    const release = await holdScripts(page);
    // The page is not loaded while its scripts are held: wait for the server's markup, not for the load event.
    await page.goto(FORM, { waitUntil: 'commit' });
    const form = page.locator('[data-confera-form]');
    await form.waitFor();
    await expect(form, 'the control: the form is on the screen and not attached yet').toHaveAttribute('data-hydrated', 'false');
    await expect(page.locator('form')).toHaveAttribute('method', 'post');

    const typeInto = async (label: string, text: string) => {
      await page.getByLabel(label).focus();
      await page.keyboard.type(text);
    };
    await typeInto('Title of the paper', `Sustainable tourism ${MARK}`);
    await typeInto('Abstract', `First ${MARK} second`);
    await typeInto('First and last name of author 1', `Marta ${MARK}`);
    await typeInto('Email of author 1', `${MARK}@example.test`);

    // Send is not pressable yet, and Enter in a field submits nothing (the form's one submit button is disabled).
    await expect(page.getByRole('button', { name: 'Send abstract' })).toBeDisabled();
    await page.getByLabel('Title of the paper').press('Enter');
    await page.waitForTimeout(500);
    expect(sends, 'nothing was submitted').toEqual([]);
    expect(page.url()).toBe(FORM);

    // The scripts arrive: the form is attached to what is there, and sends itself.
    release();
    await expect(form).toHaveAttribute('data-hydrated', 'true', { timeout: 30_000 });
    await expect(page.getByLabel('Title of the paper'), 'what was typed is still there').toHaveValue(`Sustainable tourism ${MARK}`);
    await page.getByRole('button', { name: 'Send abstract' }).click(); // the consent is missing
    await expect(page.locator('[data-confera-errors]')).toBeFocused();
    await page.getByRole('radio', { name: 'Srpski' }).click();
    await page.getByText('Prihvatam uslove objavljivanja').click();
    await page.getByRole('button', { name: 'Pošalji apstrakt' }).click();
    await expect(page.locator('[data-confera-thanks]')).toBeFocused();

    expect(sends, 'the form sent itself, not the browser').toEqual([]);
    expect(page.url()).toBe(FORM);
    expect(leaked(), 'addresses that carried what was typed').toEqual([]);
  });

  test('without scripts at all the form says it needs them, and nothing submits it into an address', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    const leaked = recordAddresses(page);
    await page.goto(FORM);
    // A <noscript> is read by a browser without scripts; the test runner's text search leaves it out, so the markup is read.
    expect(await page.content()).toContain('This form needs JavaScript. Turn it on, or open the form in another browser.');
    await page.getByLabel('Title of the paper').fill(`Sustainable tourism ${MARK}`);
    await expect(page.getByRole('button', { name: 'Send abstract' })).toBeDisabled();
    await page.getByLabel('Title of the paper').press('Enter');
    await page.waitForTimeout(500);
    await expect(page.getByLabel('Title of the paper')).toHaveValue(`Sustainable tourism ${MARK}`);
    expect(page.url()).toBe(FORM);
    expect(leaked()).toEqual([]);
    await context.close();
  });
});

test.describe('on a phone, on Confera\'s page: the result of Send is where the author is (UX-M1-01, 02)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('a failed Send: the summary has the focus and is in view, every time; each item takes the focus to its field', async ({ page }) => {
    await page.goto(FORM);
    await page.locator('[data-confera-form][data-hydrated="true"]').waitFor();
    await page.getByLabel('Title of the paper').fill('Održivi turizam na Balkanu');
    await page.getByLabel('First and last name of author 1').fill('Marta Kovač');
    await page.getByLabel('Email of author 1').fill('marta@example'); // not an address
    const send = page.getByRole('button', { name: 'Send abstract' });
    await send.scrollIntoViewIfNeeded();
    await send.click();

    const summary = page.locator('[data-confera-errors]');
    await expect(summary).toBeFocused();
    expect(await inWindow(page, '[data-confera-errors]'), 'the summary is in the window').toBe(true);
    await expect(summary.getByRole('link')).toHaveText(['Author 1: Enter an email address like name@university.edu', 'Accept the terms to send your abstract']);
    // The consent says so at the box too (UI-M1-06), and is marked as required.
    await expect(page.getByLabel('I accept the terms of publication')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('I accept the terms of publication')).toHaveAccessibleDescription('Accept the terms to send your abstract');

    await summary.getByRole('link', { name: 'Author 1: Enter an email address like name@university.edu' }).click();
    await expect(page.getByLabel('Email of author 1')).toBeFocused();
    expect(page.url()).toBe(FORM);

    // Send again with the same mistake: the summary takes the focus again (and is read out again).
    await send.click();
    await expect(summary).toBeFocused();
  });

  test('too many words: the counter is the error at once; Send refuses', async ({ page }) => {
    await page.goto(FORM);
    await page.locator('[data-confera-form][data-hydrated="true"]').waitFor();
    await page.getByLabel('Abstract').fill(Array.from({ length: 385 }, (_, i) => `reč${i}`).join(' '));
    await expect(page.getByLabel('Abstract')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Abstract')).toHaveAccessibleDescription('385 of 300 words. Shorten the text by 85 words.');
  });

  test('a successful Send: the thank-you has the focus and is in view', async ({ page }) => {
    await page.goto(FORM);
    await page.locator('[data-confera-form][data-hydrated="true"]').waitFor();
    await page.getByLabel('Title of the paper').fill('Održivi turizam na Balkanu');
    await page.getByLabel('First and last name of author 1').fill('Marta Kovač');
    await page.getByLabel('Email of author 1').fill('marta@example.test');
    await page.getByText('I accept the terms of publication').click();
    await page.getByRole('button', { name: 'Send abstract' }).click();
    await expect(page.locator('[data-confera-thanks]')).toBeFocused();
    expect(await inWindow(page, '[data-confera-thanks]')).toBe(true);
  });
});

test.describe('in the frame of a long conference page (UX-M1-01, 02)', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  const FRAME = `#${frameId(SLUG)}`;
  const snippet = buildEmbedSnippet({ publicOrigin: PUBLIC_ORIGIN, slug: SLUG, title: 'Abstract submission', linkText: 'Open the form in a new page' });
  // The site goes on for a long way below the form, as a real page with a footer does.
  const longPage = `${snippet}\n<div style="height:2400px!important;display:block!important;visibility:visible!important" aria-hidden="true"></div>`;

  async function openFrame(page: Page): Promise<Frame> {
    await page.goto(`${HARNESS_ORIGIN}/hostile.html?paste=${Buffer.from(longPage, 'utf8').toString('base64url')}`);
    await page.locator(FRAME).scrollIntoViewIfNeeded();
    const frame = await (await page.locator(FRAME).elementHandle())?.contentFrame();
    if (!frame) throw new Error('the frame of the form has no document');
    await frame.locator('[data-confera-form][data-hydrated="true"]').waitFor();
    return frame;
  }
  /** Is a part of the form in the window of the site (the frame's place plus the part's place in it)? */
  const inSiteWindow = async (page: Page, frame: Frame, selector: string) => {
    const frameTop = await page.locator(FRAME).evaluate((el) => el.getBoundingClientRect().top);
    const partTop = await frame.locator(selector).evaluate((el) => el.getBoundingClientRect().top);
    const top = frameTop + partTop;
    return top >= -1 && top < (await page.evaluate(() => window.innerHeight));
  };
  const askedIntoView = (page: Page) =>
    page.evaluate((type) => (window as unknown as { __received: Array<{ fromFrame: boolean; data: { type?: string } }> }).__received.filter((m) => m.fromFrame && m.data?.type === type).length, INTO_VIEW_MESSAGE);

  test('a failed and then a successful Send: the focus is on the summary, then on the thank-you, and they come into the site\'s window', async ({ page, browserName }) => {
    const frame = await openFrame(page);
    // The author is at the button, at the bottom of the form.
    const send = frame.getByRole('button', { name: 'Send abstract' });
    await send.scrollIntoViewIfNeeded();
    await send.click();
    await expect(frame.locator('[data-confera-errors]')).toBeFocused();
    await expect.poll(() => askedIntoView(page), 'the frame asked the site to show the summary').toBeGreaterThan(0);
    // Chromium and Firefox bring the focused summary into the site's window by themselves; in WebKit
    // the snippet's lines do it (D1). In every engine it ends in the site's window.
    await expect.poll(() => inSiteWindow(page, frame, '[data-confera-errors]'), `the summary is in the site's window (${browserName})`).toBe(true);

    await frame.getByLabel('Title of the paper').fill('Održivi turizam na Balkanu');
    await frame.getByLabel('First and last name of author 1').fill('Marta Kovač');
    await frame.getByLabel('Email of author 1').fill('marta@example.test');
    await frame.getByText('I accept the terms of publication').click();
    const before = await askedIntoView(page);
    await send.scrollIntoViewIfNeeded();
    await send.click();
    await expect(frame.locator('[data-confera-thanks]')).toBeFocused();
    await expect.poll(() => askedIntoView(page), 'the frame asked the site to show the thank-you').toBeGreaterThan(before);
    await expect.poll(() => inSiteWindow(page, frame, '[data-confera-thanks]'), `the thank-you is in the site's window (${browserName})`).toBe(true);
  });
});
