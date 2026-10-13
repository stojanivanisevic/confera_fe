// Probes of the test engineer beyond the acceptance list of 0.1.0 (M1-QA-01, M1-QA-03):
// the embed and the hosted form where the spec does not look yet.
//
//   - 320 px wide, and at 200 % and 400 % zoom (WCAG 2.1 AA, 1.4.10 Reflow and 1.4.4
//     Resize text: NFR-A11Y-01 asks for AA, NFR-RESP-01 starts at 375 px);
//   - a conference site whose width keeps changing;
//   - a conference site that forges height messages in the frame's own name;
//   - a browser whose storage throws, also in the middle of a session;
//   - the form components of the gallery, by keyboard only (NFR-A11Y-02);
//   - a visitor who asked for reduced motion.
//
// Third-party cookies blocked on all three engines is e2e/embed.spec.ts ("it works with
// third-party cookies blocked, and sets no cookie"), which runs in every project.
import type { Browser, BrowserContext, Frame, Page } from '@playwright/test';

import { buildEmbedSnippet, frameId, HEIGHT_MESSAGE, MAX_FRAME_HEIGHT, MIN_FRAME_HEIGHT } from '../packages/embed-loader/src/index';
import { HARNESS_ORIGIN, PUBLIC_ORIGIN } from './env';
import { expect, neutraliseLocalSoftware, test } from './support/fixtures';
import { watchPage } from './support/page-problems';

const SLUG = 'spike-abstract';
const FRAME = `#${frameId(SLUG)}`;
const snippet = buildEmbedSnippet({ publicOrigin: PUBLIC_ORIGIN, slug: SLUG, title: 'Abstract submission', linkText: 'Open the form in a new page' });

async function openSite(page: Page, paste = snippet): Promise<void> {
  await page.goto(`${HARNESS_ORIGIN}/hostile.html?paste=${Buffer.from(paste, 'utf8').toString('base64url')}`);
}

async function formFrame(page: Page): Promise<Frame> {
  await page.locator(FRAME).scrollIntoViewIfNeeded();
  const frame = await (await page.locator(FRAME).elementHandle())?.contentFrame();
  if (!frame) throw new Error('The frame of the form has no document');
  await frame.locator('[data-confera-form][data-hydrated="true"]').waitFor();
  return frame;
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

/** How far the content of a document sticks out of its window, sideways. Zero when nothing does. */
const sidewaysOverflow = (target: Page | Frame) =>
  target.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));

/** The parts of the form that are wider than the window they are in. */
const widerThanWindow = (target: Page | Frame) =>
  target.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-confera-form] *')]
      .filter((el) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().right > window.innerWidth + 0.5)
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className} right=${Math.round(el.getBoundingClientRect().right)} window=${window.innerWidth}`),
  );

async function zoomed(browser: Browser, cssWidth: number, cssHeight: number, factor: number): Promise<{ context: BrowserContext; page: Page }> {
  // A window of 1280 px at a zoom of `factor` is `1280 / factor` CSS pixels wide, each drawn with `factor` device pixels.
  const context = await browser.newContext({ viewport: { width: cssWidth, height: cssHeight }, deviceScaleFactor: factor });
  await neutraliseLocalSoftware(context);
  return { context, page: await context.newPage() };
}

/**
 * Ticks the consent box as an author does: by its text. The box itself is a drawn one; the
 * real input next to it is one invisible pixel, and a click aimed at that pixel (a forced
 * `check`) can land beside it when the page is zoomed. That would test the aim, not the form.
 */
async function accept(target: Page | Frame): Promise<void> {
  await target.getByText('I accept the terms of publication').click();
  await expect(target.getByLabel('I accept the terms of publication')).toBeChecked();
}

async function fillAndSend(target: Page | Frame): Promise<void> {
  await target.getByLabel('Title of the paper').fill('Održivi turizam na Balkanu');
  await target.getByLabel('Name of author 1').fill('Živana Đorđević');
  await accept(target);
  await target.getByRole('button', { name: 'Send abstract' }).click();
  await expect(target.locator('.ud-alert--success')).toContainText('Thank you');
}

test.describe('320 px wide (WCAG 1.4.10 Reflow)', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test('the hosted form does not scroll sideways, with errors showing and after sending', async ({ page }) => {
    const problems = watchPage(page);
    await page.goto(`${PUBLIC_ORIGIN}/f/${SLUG}`);
    await page.locator('[data-confera-form][data-hydrated="true"]').waitFor();
    expect(await sidewaysOverflow(page), 'the empty form').toBe(0);
    expect(await widerThanWindow(page)).toEqual([]);

    await page.getByRole('button', { name: 'Add author' }).click();
    await page.getByRole('button', { name: 'Send abstract' }).click();
    await expect(page.locator('.ud-alert--error')).toBeVisible();
    expect(await sidewaysOverflow(page), 'the form with errors').toBe(0);
    expect(await widerThanWindow(page)).toEqual([]);

    await page.getByRole('button', { name: 'Remove author 2' }).click();
    await fillAndSend(page);
    expect(await sidewaysOverflow(page), 'the thank-you').toBe(0);
    expect(problems.messages).toEqual([]);
  });

  test('the form in the frame does not scroll sideways, and the frame follows its height', async ({ page }) => {
    await openSite(page);
    const frame = await formFrame(page);
    await expectHeightFollows(page, frame);
    expect(await sidewaysOverflow(frame), 'the frame scrolls sideways').toBe(0);
    expect(await widerThanWindow(frame)).toEqual([]);

    await frame.getByRole('button', { name: 'Add author' }).click();
    await frame.getByRole('button', { name: 'Send abstract' }).click();
    await expect(frame.locator('.ud-alert--error')).toBeVisible();
    await expectHeightFollows(page, frame);
    expect(await sidewaysOverflow(frame), 'the frame with errors').toBe(0);
    expect(await widerThanWindow(frame)).toEqual([]);

    // The frame itself stays inside its place in the site.
    const box = await page.locator(FRAME).evaluate((el) => ({ right: el.getBoundingClientRect().right, slot: el.parentElement!.getBoundingClientRect().right }));
    expect(box.right).toBeLessThanOrEqual(box.slot + 0.5);
  });
});

test.describe('zoom (WCAG 1.4.4 Resize text, 1.4.10 Reflow)', () => {
  for (const [name, width, height, factor] of [
    ['200 %', 640, 400, 2],
    ['400 %', 320, 256, 4],
  ] as const) {
    test(`at ${name} the hosted form reflows, and can be filled in and sent`, async ({ browser }) => {
      const { context, page } = await zoomed(browser, width, height, factor);
      try {
        const problems = watchPage(page);
        await page.goto(`${PUBLIC_ORIGIN}/f/${SLUG}`);
        await page.locator('[data-confera-form][data-hydrated="true"]').waitFor();
        expect(await page.evaluate(() => window.devicePixelRatio)).toBe(factor);
        expect(await sidewaysOverflow(page)).toBe(0);
        expect(await widerThanWindow(page)).toEqual([]);
        await fillAndSend(page);
        expect(await sidewaysOverflow(page)).toBe(0);
        expect(problems.messages).toEqual([]);
      } finally {
        await context.close();
      }
    });

    test(`at ${name} the form in the frame reflows, and the frame follows its height`, async ({ browser }) => {
      const { context, page } = await zoomed(browser, width, height, factor);
      try {
        await openSite(page);
        const frame = await formFrame(page);
        await expectHeightFollows(page, frame);
        expect(await sidewaysOverflow(frame)).toBe(0);
        expect(await widerThanWindow(frame)).toEqual([]);
        await fillAndSend(frame);
        await expectHeightFollows(page, frame);
      } finally {
        await context.close();
      }
    });
  }
});

test.describe('a conference site whose width keeps changing', () => {
  test('the frame follows every time, and falls silent when the site holds still', async ({ page }) => {
    const problems = watchPage(page);
    await openSite(page);
    const frame = await formFrame(page);
    await frame.getByLabel('Title of the paper').fill('Šta đaci čitaju');

    for (const width of [1440, 375, 900, 320, 1200, 480, 1440, 375]) {
      await page.setViewportSize({ width, height: 900 });
      await expectHeightFollows(page, frame);
      expect(await sidewaysOverflow(frame), `the frame scrolls sideways at ${width}px`).toBe(0);
    }
    // Twenty changes with no pause between them.
    for (let index = 0; index < 20; index += 1) await page.setViewportSize({ width: index % 2 === 0 ? 340 : 1300, height: 900 });
    await expectHeightFollows(page, frame);

    // Still: the frame has nothing more to say. A frame and a listener that kept answering each
    // other (a scroll bar that comes and goes) would show up here as messages without end.
    const fromFrame = () => page.evaluate(() => (window as unknown as { __received: Array<{ fromFrame: boolean }> }).__received.filter((m) => m.fromFrame).length);
    await page.waitForTimeout(500);
    const before = await fromFrame();
    await page.waitForTimeout(1500);
    expect(await fromFrame(), 'the frame keeps reporting although nothing changes').toBe(before);

    // What was typed survived all of it.
    await expect(frame.getByLabel('Title of the paper')).toHaveValue('Šta đaci čitaju');
    // One engine notes, about the conference site's own document, that it stopped re-anchoring the
    // scroll position after ten adjustments of 0 px: its note on a window resized 28 times in a row,
    // not a message of the form. Everything else still counts.
    const notOurs = /Scroll anchoring was disabled in a scroll container/;
    expect(problems.messages.filter((message) => !notOurs.test(message))).toEqual([]);
  });
});

test.describe('a conference site that forges height messages', () => {
  type Source = 'frame' | 'other' | 'self' | 'nobody';
  interface ForgingWindow {
    __forge(data: unknown, from?: Source): number | 'refused';
    __forgeWhatCannotTravel(): number | 'refused';
  }

  /**
   * Gives the site a script of its own that dispatches message events which claim Confera's
   * origin and, by default, the frame's own window as their source. One engine refuses to
   * build such an event at all (the window of a frame of another site is not accepted as a
   * source): there the forgery is impossible, and the script says "refused".
   */
  async function armTheSite(page: Page): Promise<void> {
    await page.addScriptTag({
      content: `
        window.__forge = function (data, from) {
          var frame = document.querySelector(${JSON.stringify(FRAME)});
          var other = document.querySelector('#other');
          var source = from === 'other' ? other.contentWindow : from === 'self' ? window : from === 'nobody' ? null : frame.contentWindow;
          var event;
          try {
            event = new MessageEvent('message', { data: data, origin: ${JSON.stringify(PUBLIC_ORIGIN)}, source: source });
          } catch (error) {
            return 'refused';
          }
          window.dispatchEvent(event);
          return frame.getBoundingClientRect().height;
        };
        window.__forgeWhatCannotTravel = function () {
          var last = 0;
          [NaN, Infinity, -Infinity, undefined].forEach(function (height) { last = window.__forge({ type: ${JSON.stringify(HEIGHT_MESSAGE)}, height: height }); });
          return last;
        };`,
    });
  }
  const forge = (page: Page, height: unknown, type: string = HEIGHT_MESSAGE, from: Source = 'frame') =>
    page.evaluate(({ data, source }) => (window as unknown as ForgingWindow).__forge(data, source), { data: { type, height }, source: from });

  test('a forged height is kept inside the bounds, and what is not a number changes nothing', async ({ page }) => {
    await openSite(page);
    const frame = await formFrame(page);
    await expectHeightFollows(page, frame);
    const honest = (await frameHeights(page, frame)).element;
    await armTheSite(page);

    if ((await forge(page, 640.4)) === 'refused') {
      // This engine does not let a page build the forgery: every attempt is refused and nothing moves.
      for (const value of [1e12, -500, 0, '900', null]) expect(await forge(page, value)).toBe('refused');
      expect((await frameHeights(page, frame)).element).toBe(honest);
    } else {
      // The site can only do to the frame's height what it can do to its own element anyway.
      expect(await forge(page, 640.4)).toBe(640);
      expect(await forge(page, 1e12)).toBe(MAX_FRAME_HEIGHT);
      expect(await forge(page, -500)).toBe(MIN_FRAME_HEIGHT);
      expect(await forge(page, 0)).toBe(MIN_FRAME_HEIGHT);
      expect(await forge(page, 640.4)).toBe(640);
      for (const value of ['900', null, {}, [900], true]) expect(await forge(page, value), `height ${JSON.stringify(value)}`).toBe(640);
      expect(await forge(page, 900, 'confera:navigate')).toBe(640);
      // Not a number, infinite or missing: values that cannot travel as JSON are made inside the page.
      expect(await page.evaluate(() => (window as unknown as ForgingWindow).__forgeWhatCannotTravel())).toBe(640);
    }

    // The forgery reached nothing inside the frame, and the frame is still heard.
    await expect(frame.getByRole('heading', { level: 1 })).toHaveText('Abstract submission');
    await frame.getByRole('button', { name: 'Add author' }).click();
    await expectHeightFollows(page, frame);
    expect((await frameHeights(page, frame)).element).toBeGreaterThan(honest);
  });

  test("a message from another frame of the site, from the site itself or from nobody, in Confera's name, is ignored", async ({ page }) => {
    await openSite(page, `${snippet}\n<iframe id="other" title="another frame" srcdoc="<p>x</p>" style="display:block!important;height:50px!important;visibility:visible!important;max-height:none!important"></iframe>`);
    const frame = await formFrame(page);
    await expectHeightFollows(page, frame);
    const honest = (await frameHeights(page, frame)).element;
    await armTheSite(page);
    for (const from of ['other', 'self', 'nobody'] as const) {
      expect(await forge(page, 5000, HEIGHT_MESSAGE, from), `a message from ${from}`).toBe(honest);
    }
    // The control: the same message in the frame's own name is taken, where the engine lets it be built.
    expect([5000, 'refused']).toContain(await forge(page, 5000));
  });
});

test.describe('storage that throws', () => {
  test('the hosted form works when every access to storage throws, and says that no draft is kept', async ({ page }) => {
    await page.addInitScript(() => {
      const refuse = () => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      };
      for (const name of ['sessionStorage', 'localStorage'] as const) Object.defineProperty(window, name, { configurable: true, get: refuse });
    });
    const problems = watchPage(page);
    await page.goto(`${PUBLIC_ORIGIN}/f/${SLUG}`);
    await page.locator('[data-confera-form][data-hydrated="true"]').waitFor();
    await expect(page.getByText('This browser does not let the form keep a draft')).toBeVisible();
    await fillAndSend(page);
    expect(problems.messages).toEqual([]);
  });

  test('storage that fills up in the middle of a session does not break the form', async ({ page }) => {
    const problems = watchPage(page);
    await page.goto(`${PUBLIC_ORIGIN}/f/${SLUG}`);
    await page.locator('[data-confera-form][data-hydrated="true"]').waitFor();
    await page.getByLabel('Title of the paper').fill('Prvi naslov');
    // From now on every write and every read fails, as with a full or revoked store.
    await page.evaluate(() => {
      const fail = () => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      };
      Storage.prototype.setItem = fail;
      Storage.prototype.getItem = fail;
      Storage.prototype.removeItem = fail;
    });
    await page.getByLabel('Title of the paper').fill('Održivi turizam na Balkanu');
    await page.getByLabel('Abstract').fill('Prva druga treća četvrta');
    await expect(page.getByText('4 of 300 words')).toBeVisible();
    await page.getByRole('button', { name: 'Add author' }).click();
    await page.getByRole('button', { name: 'Remove author 2' }).click();
    await page.getByLabel('Name of author 1').fill('Živana Đorđević');
    await accept(page);
    await page.getByRole('button', { name: 'Send abstract' }).click();
    await expect(page.locator('.ud-alert--success')).toContainText('Thank you');
    expect(problems.messages).toEqual([]);
  });

  test('a draft that is not a draft (text another page left in the store) does not break the form', async ({ page }) => {
    const problems = watchPage(page);
    for (const stored of ['{not json', 'null', '[]', '42', '{"title":{"a":1},"authors":"x","language":"xx"}', JSON.stringify({ title: 'x'.repeat(200_000) })]) {
      await page.goto(`${PUBLIC_ORIGIN}/f/${SLUG}`);
      await page.evaluate(({ key, value }) => window.sessionStorage.setItem(key, value), { key: `confera:draft:${SLUG}`, value: stored });
      await page.reload();
      await page.locator('[data-confera-form][data-hydrated="true"]').waitFor();
      await expect(page.getByRole('heading', { level: 1 }), `with ${stored.slice(0, 30)} in the store`).toBeVisible();
      await expect(page.getByRole('button', { name: /Send abstract|Pošalji apstrakt/ })).toBeVisible();
    }
    expect(problems.messages).toEqual([]);
  });
});

test.describe('the form components of the gallery, by keyboard only (NFR-A11Y-02)', () => {
  const FORM_COMPONENTS = ['TextField', 'Select', 'Textarea', 'Checkbox', 'Radio', 'NumberField', 'DateField', 'PasswordField', 'CheckboxGroup', 'Autocomplete', 'Repeater'];

  async function openGallery(page: Page) {
    await page.goto(`${PUBLIC_ORIGIN}/dev/gallery`);
    await expect(page.locator('[data-confera-dev="gallery"]')).toHaveAttribute('data-hydrated', 'true', { timeout: 60_000 });
  }

  test('Tab reaches every control of every form component, in order, and each shows where the focus is', async ({ page }) => {
    test.setTimeout(180_000);
    await openGallery(page);

    for (const name of FORM_COMPONENTS) {
      const card = page.locator(`[data-component="${name}"]`);
      await card.scrollIntoViewIfNeeded();
      // What a keyboard user must be able to reach in this card: one stop per control, one per group of radios.
      const expected = await card.evaluate((root) => {
        const seenGroups = new Set<string>();
        const stops: string[] = [];
        const describe = (el: Element) => `${el.tagName.toLowerCase()}${el.getAttribute('type') ? `[${el.getAttribute('type')}]` : ''}:${el.getAttribute('aria-label') ?? (el as HTMLInputElement).labels?.[0]?.textContent?.trim() ?? el.textContent?.trim().slice(0, 30) ?? ''}`;
        for (const el of root.querySelectorAll<HTMLElement>('input, select, textarea, button, a[href], [tabindex]')) {
          if ((el as HTMLInputElement).disabled || el.getAttribute('tabindex') === '-1' || (el as HTMLInputElement).type === 'hidden') continue;
          const box = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          if (style.visibility === 'hidden' || style.display === 'none' || (box.width === 0 && box.height === 0 && !(el instanceof HTMLInputElement))) continue;
          if (el instanceof HTMLInputElement && el.type === 'radio') {
            const group = `${el.form?.id ?? ''}/${el.name}`;
            if (seenGroups.has(group)) continue;
            seenGroups.add(group);
            stops.push(`radio-group:${el.name}`);
            continue;
          }
          stops.push(describe(el));
        }
        return stops;
      });
      expect(expected.length, `${name} has no control to reach`).toBeGreaterThan(0);

      // Walk: focus the first control, then Tab until the focus leaves the card.
      await card.locator('input, select, textarea, button, a[href], [tabindex]:not([tabindex="-1"])').first().focus();
      const visited: string[] = [];
      const withoutSign: string[] = [];
      for (let step = 0; step < expected.length * 6 + 5; step += 1) {
        const here = await card.evaluate((root) => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || !root.contains(el)) return null;
          const describe = (e: Element) => `${e.tagName.toLowerCase()}${e.getAttribute('type') ? `[${e.getAttribute('type')}]` : ''}:${e.getAttribute('aria-label') ?? (e as HTMLInputElement).labels?.[0]?.textContent?.trim() ?? e.textContent?.trim().slice(0, 30) ?? ''}`;
          const label = el instanceof HTMLInputElement && el.type === 'radio' ? `radio-group:${el.name}` : describe(el);
          // The sign of focus: an outline or a ring on the control or on a part of the component around it.
          let sign = false;
          for (let node: HTMLElement | null = el, depth = 0; node && depth < 4 && root.contains(node); node = node.parentElement, depth += 1) {
            const style = getComputedStyle(node);
            if ((style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0) || style.boxShadow !== 'none') sign = true;
          }
          // A control that is drawn by a sibling (a hidden checkbox with a drawn box next to it).
          const drawn = el.nextElementSibling ?? el.parentElement?.querySelector('[class*="__box"], [class*="__mark"], [class*="__track"]');
          if (!sign && drawn) {
            const style = getComputedStyle(drawn);
            if ((style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0) || style.boxShadow !== 'none') sign = true;
          }
          return { label, sign };
        });
        if (here === null) break;
        // A date field is several stops in one control (day, month, year): it counts once.
        if (visited.at(-1) !== here.label) {
          visited.push(here.label);
          if (!here.sign) withoutSign.push(here.label);
        }
        await page.keyboard.press('Tab');
      }
      expect(visited, `${name}: the controls Tab reaches, in order`).toEqual(expected);
      expect(withoutSign, `${name}: focused without a visible sign of focus`).toEqual([]);
    }
  });

  test('the controls answer to the keyboard: space, arrows, typing and Enter', async ({ page }) => {
    const problems = watchPage(page);
    await openGallery(page);
    const card = (name: string) => page.locator(`[data-component="${name}"]`);

    // A checkbox: Space.
    const checkbox = card('Checkbox').getByRole('checkbox', { name: 'I am the corresponding author' });
    await checkbox.focus();
    const was = await checkbox.isChecked();
    await page.keyboard.press('Space');
    expect(await checkbox.isChecked()).toBe(!was);

    // Radios: the arrow keys move the choice inside the group, Tab leaves the group.
    const radios = card('Radio').getByRole('radio');
    await radios.first().focus();
    await page.keyboard.press('ArrowDown');
    await expect(radios.nth(1)).toBeFocused();
    await expect(radios.nth(1)).toBeChecked();

    // A select: the arrow keys change the value.
    const select = card('Select').locator('select').first();
    await select.focus();
    const first = await select.inputValue();
    await page.keyboard.press('ArrowDown');
    expect(await select.inputValue()).not.toBe(first);

    // A text field and a textarea: typing, with Serbian letters.
    const field = card('TextField').locator('input:not([disabled]):not([readonly])').first();
    await field.focus();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Živana Đorđević');
    await expect(field).toHaveValue('Živana Đorđević');

    // A password field: its "show" button is reached by Tab and answers to Enter.
    const password = card('PasswordField').locator('input').first();
    await password.focus();
    await expect(password).toHaveAttribute('type', 'password');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(password).toHaveAttribute('type', 'text');

    // An autocomplete: typing opens the list, the arrows choose, Enter takes the choice, Escape closes.
    const country = card('Autocomplete').getByRole('combobox', { name: 'Country' });
    await country.focus();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('s');
    await expect(page.getByRole('listbox', { name: 'Country' })).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox', { name: 'Country' })).toBeHidden();
    expect((await country.inputValue()).length).toBeGreaterThan(1);

    // A repeater: a row is added and removed with Enter.
    const repeater = card('Repeater');
    const rows = await repeater.locator('.ud-repeater__row').count();
    await repeater.getByRole('button', { name: 'Add author' }).focus();
    await page.keyboard.press('Enter');
    await expect(repeater.locator('.ud-repeater__row')).toHaveCount(rows + 1);
    await repeater.getByRole('button', { name: /^Remove author/ }).last().focus();
    await page.keyboard.press('Enter');
    await expect(repeater.locator('.ud-repeater__row')).toHaveCount(rows);

    expect(problems.messages).toEqual([]);
  });

  // WCAG 2.4.3 Focus Order (level A), NFR-A11Y-02 "focus is always visible": a keyboard user who
  // removes a row must not be thrown back to the start of the page (inside a frame: of the form).
  test('after a row of a repeater is removed with the keyboard, the focus stays in the repeater', async ({ page }) => {
    const focusAfterRemoving = async (repeater: ReturnType<Page['locator']>) => {
      await repeater.getByRole('button', { name: /^Add author|^Dodaj autora/ }).focus();
      await page.keyboard.press('Enter');
      const rows = await repeater.locator('.ud-repeater__row').count();
      await repeater.getByRole('button', { name: /^Remove author|^Ukloni autora/ }).last().focus();
      await page.keyboard.press('Enter');
      await expect(repeater.locator('.ud-repeater__row')).toHaveCount(rows - 1);
      return repeater.evaluate((root) => {
        const el = document.activeElement;
        return { onTheBody: el === document.body || el === null, inTheRepeater: el !== null && root.contains(el) };
      });
    };

    await openGallery(page);
    expect(await focusAfterRemoving(page.locator('[data-component="Repeater"] .ud-repeater').first()), 'the repeater of the gallery').toEqual({ onTheBody: false, inTheRepeater: true });

    // The same component as authors meet it, in the hosted form.
    await page.goto(`${PUBLIC_ORIGIN}/f/${SLUG}`);
    await page.locator('[data-confera-form][data-hydrated="true"]').waitFor();
    expect(await focusAfterRemoving(page.locator('.ud-repeater').first()), 'the authors of the hosted form').toEqual({ onTheBody: false, inTheRepeater: true });
  });

  // Second round, after design system 2.0.1: not only the last row. The focus goes to the row that
  // took the place of the removed one (the row before it when the last one went), the rows that
  // stay keep their text, and what is typed next lands in the field that has the focus.
  test('a middle row, the first row and the last row of the authors are removed with the keyboard: each time the focus lands on the right row', async ({ page }) => {
    await page.goto(`${PUBLIC_ORIGIN}/f/${SLUG}`);
    await page.locator('[data-confera-form][data-hydrated="true"]').waitFor();
    const repeater = page.locator('.ud-repeater').first();

    const add = repeater.getByRole('button', { name: 'Add author' });
    for (let row = 2; row <= 4; row += 1) {
      await add.focus();
      await page.keyboard.press('Enter');
      await expect(repeater.locator('.ud-repeater__row')).toHaveCount(row);
    }
    const people = ['Ana Anić', 'Božo Božić', 'Ćira Ćirić', 'Đorđe Đorđević'];
    for (const [index, name] of people.entries()) {
      await repeater.getByLabel(`Name of author ${index + 1}`).fill(name);
      await repeater.getByLabel(`Email of author ${index + 1}`).fill(`author${index + 1}@example.test`);
    }

    const names = () => repeater.getByLabel(/^Name of author \d+/).evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
    const emails = () => repeater.getByLabel(/^Email of author \d+/).evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
    const focus = () =>
      repeater.evaluate((root) => {
        const el = document.activeElement;
        return {
          inTheRepeater: el !== null && el !== document.body && root.contains(el),
          // The label of the field, without the mark of a required field.
          field: el instanceof HTMLInputElement ? (/(?:Name|Email) of author \d+/.exec(el.labels?.[0]?.textContent ?? '')?.[0] ?? '') : (el?.tagName ?? 'nothing'),
          value: el instanceof HTMLInputElement ? el.value : null,
        };
      });
    const removeWith = async (row: number, key: 'Enter' | 'Space') => {
      await repeater.getByRole('button', { name: `Remove author ${row}` }).focus();
      await page.keyboard.press(key);
    };

    // A row in the middle: the row after it moves up, and the focus is on its first field.
    await removeWith(2, 'Enter');
    await expect(repeater.locator('.ud-repeater__row')).toHaveCount(3);
    expect(await names()).toEqual(['Ana Anić', 'Ćira Ćirić', 'Đorđe Đorđević']);
    expect(await emails()).toEqual(['author1@example.test', 'author3@example.test', 'author4@example.test']);
    await expect.poll(focus).toEqual({ inTheRepeater: true, field: 'Name of author 2', value: 'Ćira Ćirić' });

    // The first row: the row that is first now.
    await removeWith(1, 'Space');
    await expect(repeater.locator('.ud-repeater__row')).toHaveCount(2);
    expect(await names()).toEqual(['Ćira Ćirić', 'Đorđe Đorđević']);
    await expect.poll(focus).toEqual({ inTheRepeater: true, field: 'Name of author 1', value: 'Ćira Ćirić' });

    // The last row: the row before it. One row is left, which cannot be removed (the form asks for one author).
    await removeWith(2, 'Enter');
    await expect(repeater.locator('.ud-repeater__row')).toHaveCount(1);
    expect(await names()).toEqual(['Ćira Ćirić']);
    expect(await emails()).toEqual(['author3@example.test']);
    await expect.poll(focus).toEqual({ inTheRepeater: true, field: 'Name of author 1', value: 'Ćira Ćirić' });
    await expect(repeater.getByRole('button', { name: /^Remove author/ })).toHaveCount(0);

    // The focus is a real one: the next key goes into that field, and Tab goes on from there.
    await page.keyboard.press('End');
    await page.keyboard.type(' ml.');
    expect(await names()).toEqual(['Ćira Ćirić ml.']);
    await page.keyboard.press('Tab');
    expect((await focus()).field).toBe('Email of author 1');
  });

  test('inside the frame of a conference site, removing a middle row leaves the focus in the form and on the right row', async ({ page }) => {
    await openSite(page);
    const frame = await formFrame(page);
    const repeater = frame.locator('.ud-repeater').first();
    for (let row = 2; row <= 3; row += 1) {
      await repeater.getByRole('button', { name: 'Add author' }).focus();
      await page.keyboard.press('Enter');
      await expect(repeater.locator('.ud-repeater__row')).toHaveCount(row);
    }
    for (const [index, name] of ['Ana Anić', 'Božo Božić', 'Ćira Ćirić'].entries()) await repeater.getByLabel(`Name of author ${index + 1}`).fill(name);

    await repeater.getByRole('button', { name: 'Remove author 2' }).focus();
    await page.keyboard.press('Enter');
    await expect(repeater.locator('.ud-repeater__row')).toHaveCount(2);
    // In the frame's own document the focus is on the row that moved up ...
    expect(
      await repeater.evaluate((root) => {
        const el = document.activeElement;
        return { inTheRepeater: el !== null && el !== document.body && root.contains(el), value: el instanceof HTMLInputElement ? el.value : null };
      }),
    ).toEqual({ inTheRepeater: true, value: 'Ćira Ćirić' });
    // ... and for the conference site the focus is still in the frame, not back on the site.
    expect(await page.evaluate((selector) => document.activeElement === document.querySelector(selector), FRAME)).toBe(true);
    await expectHeightFollows(page, frame);
  });
});

test.describe('a slow connection: the form is on the screen before its scripts arrive', () => {
  // The server sends the whole form as markup; the scripts that attach it can take seconds on a
  // phone. What an author types in that time must not be thrown away when they arrive.
  test('what is typed before the form is attached is still there afterwards', async ({ page }) => {
    let release: () => void = () => undefined;
    const scriptsMayLoad = new Promise<void>((resolve) => (release = resolve));
    await page.route(/\/_next\/static\/.*\.js(?:\?.*)?$/, async (route) => {
      await scriptsMayLoad;
      await route.continue();
    });

    await page.goto(`${PUBLIC_ORIGIN}/f/${SLUG}`, { waitUntil: 'commit' });
    const form = page.locator('[data-confera-form]');
    await form.waitFor();
    await expect(form, 'the control: the form is on the screen and not attached yet').toHaveAttribute('data-hydrated', 'false');

    const title = page.getByLabel('Title of the paper');
    // Focused, not clicked: one engine does not call a page settled while its scripts are held back.
    await title.focus();
    await page.keyboard.type('Održivi turizam na Balkanu');
    await expect(title).toHaveValue('Održivi turizam na Balkanu');

    release();
    await expect(form).toHaveAttribute('data-hydrated', 'true', { timeout: 30_000 });
    await expect(title, 'the text typed before the scripts arrived').toHaveValue('Održivi turizam na Balkanu');
  });

  /** Holds the scripts of the page back until `release` is called; the markup of the server arrives at once. */
  async function holdScripts(page: Page): Promise<() => void> {
    let release: () => void = () => undefined;
    const scriptsMayLoad = new Promise<void>((resolve) => (release = resolve));
    await page.route(/\/_next\/static\/.*\.js(?:\?.*)?$/, async (route) => {
      await scriptsMayLoad;
      await route.continue();
    });
    return release;
  }

  // Second round, after the form-value store: not only the title. Every kind of field the form has.
  test('every kind of field keeps what was entered before the form was attached, and the form can be sent with it', async ({ page }) => {
    const problems = watchPage(page);
    const release = await holdScripts(page);
    await page.goto(`${PUBLIC_ORIGIN}/f/${SLUG}`, { waitUntil: 'commit' });
    const form = page.locator('[data-confera-form]');
    await form.waitFor();
    await expect(form, 'the control: the form is on the screen and not attached yet').toHaveAttribute('data-hydrated', 'false');

    // Focused and typed, as with the keyboard: a text field, a long text, a name, an e-mail address, a box.
    const typeInto = async (label: string, text: string) => {
      await page.getByLabel(label).focus();
      await page.keyboard.type(text);
    };
    await typeInto('Title of the paper', 'Održivi turizam na Balkanu');
    await typeInto('Abstract', 'Prva druga treća četvrta peta');
    await typeInto('Name of author 1', 'Živana Đorđević');
    await typeInto('Email of author 1', 'zivana@example.test');
    const consent = page.getByLabel('I accept the terms of publication');
    await consent.focus();
    await page.keyboard.press('Space');
    await expect(consent, 'the control: the box is ticked before the scripts arrive').toBeChecked();

    release();
    await expect(form).toHaveAttribute('data-hydrated', 'true', { timeout: 30_000 });

    await expect(page.getByLabel('Title of the paper'), 'the text field').toHaveValue('Održivi turizam na Balkanu');
    await expect(page.getByLabel('Abstract'), 'the long text').toHaveValue('Prva druga treća četvrta peta');
    await expect(page.getByLabel('Name of author 1'), 'the name').toHaveValue('Živana Đorđević');
    await expect(page.getByLabel('Email of author 1'), 'the e-mail address').toHaveValue('zivana@example.test');
    await expect(consent, 'the ticked box').toBeChecked();
    // The page knows what the controls hold: the words are counted ...
    await expect(page.getByText('5 of 300 words')).toBeVisible();
    // ... the two long texts are kept as the draft of this tab ...
    await expect
      .poll(() => page.evaluate((key) => JSON.parse(window.sessionStorage.getItem(key) ?? '{}') as unknown, `confera:draft:${SLUG}`))
      .toEqual({ title: 'Održivi turizam na Balkanu', abstract: 'Prva druga treća četvrta peta' });
    // ... and the form is sent with what was entered, without touching a field again.
    await page.getByRole('button', { name: 'Send abstract' }).click();
    await expect(page.locator('.ud-alert--error')).toHaveCount(0);
    await expect(page.locator('.ud-alert--success')).toContainText('Thank you');
    expect(problems.messages).toEqual([]);
  });

  test('a draft of an earlier visit fills the fields that were left alone, and never replaces what was typed before the form was attached', async ({ page }) => {
    // The earlier visit: both long texts were written and kept in the tab.
    await page.goto(`${PUBLIC_ORIGIN}/f/${SLUG}`);
    await page.locator('[data-confera-form][data-hydrated="true"]').waitFor();
    await page.getByLabel('Title of the paper').fill('Stari naslov');
    await page.getByLabel('Abstract').fill('Stari apstrakt od pet reči');
    await expect
      .poll(() => page.evaluate((key) => window.sessionStorage.getItem(key), `confera:draft:${SLUG}`))
      .toContain('Stari apstrakt');

    // The address is opened again in the same tab, on a slow connection, and the author starts on the title at once.
    // (Opened, not reloaded: on a reload some engines put the old text back into the fields themselves.)
    const release = await holdScripts(page);
    await page.goto(`${PUBLIC_ORIGIN}/f/${SLUG}`, { waitUntil: 'commit' });
    const form = page.locator('[data-confera-form]');
    await form.waitFor();
    await expect(form).toHaveAttribute('data-hydrated', 'false');
    await page.getByLabel('Title of the paper').focus();
    await page.keyboard.type('Novi naslov');

    release();
    await expect(form).toHaveAttribute('data-hydrated', 'true', { timeout: 30_000 });
    await expect(page.getByLabel('Abstract'), 'the field that was left alone gets the draft').toHaveValue('Stari apstrakt od pet reči');
    await expect(page.getByLabel('Title of the paper'), 'what was typed wins over the draft').toHaveValue('Novi naslov');
    await expect(page.getByText('5 of 300 words')).toBeVisible();
    // The draft that is kept from now on is what the author sees.
    await expect
      .poll(() => page.evaluate((key) => JSON.parse(window.sessionStorage.getItem(key) ?? '{}') as unknown, `confera:draft:${SLUG}`))
      .toEqual({ title: 'Novi naslov', abstract: 'Stari apstrakt od pet reči' });
  });
});

test.describe('a visitor who asked for reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('the hosted form works, and the gallery slows what turns and what pulses', async ({ page }) => {
    const problems = watchPage(page);
    await page.goto(`${PUBLIC_ORIGIN}/f/${SLUG}`);
    await page.locator('[data-confera-form][data-hydrated="true"]').waitFor();
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
    await fillAndSend(page);

    await page.goto(`${PUBLIC_ORIGIN}/dev/gallery`);
    await expect(page.locator('[data-confera-dev="gallery"]')).toHaveAttribute('data-hydrated', 'true', { timeout: 60_000 });
    const durations = await page.evaluate(() => {
      const seconds = (value: string) => Math.max(...value.split(',').map((part) => (part.trim().endsWith('ms') ? Number.parseFloat(part) / 1000 : Number.parseFloat(part))));
      return [...document.querySelectorAll<HTMLElement>('.ud-spinner, .ud-skeleton')].map((el) => seconds(getComputedStyle(el).animationDuration));
    });
    expect(durations.length).toBeGreaterThan(1);
    // What the stylesheet of the design system promises under reduced motion: at least three seconds a turn.
    for (const duration of durations) expect(duration).toBeGreaterThanOrEqual(3);

    // The overlays still open and close.
    await page.locator('[data-component="Dialog"]').getByRole('button', { name: 'Open the dialog' }).click();
    await expect(page.getByRole('dialog', { name: 'Send the decision' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Send the decision' })).toBeHidden();
    expect(problems.messages).toEqual([]);
  });
});
