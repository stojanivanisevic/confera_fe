// UX review of milestone 0.1.0 (task M1-REV-02). Not part of the suite: it lives on the scratch
// branch m1/ux-review only. It walks the flows as the real people would (the author on a
// conference site and on Confera's own page, by touch and by keyboard, in English and in Serbian;
// Nikolina on the admin home; the empty and failure states of the gallery), and records what they
// meet: what is on the screen after each step, where the focus is, what a screen reader is given,
// and the texts. It asserts only that the screens load; what it finds is written to
// .artifacts/ux-review/<engine>/data/*.json and to pictures, for the review report, not failed.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Browser, BrowserContext, Frame, Locator, Page } from '@playwright/test';

import { buildEmbedSnippet, frameId } from '../packages/embed-loader/src/index';
import { ADMIN_ORIGIN, HARNESS_ORIGIN, PUBLIC_ORIGIN, UNLISTED_ORIGIN } from './env';
import { expect, test } from './support/fixtures';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const SLUG = 'spike-abstract';
const FRAME = `#${frameId(SLUG)}`;
const SNIPPET = buildEmbedSnippet({ publicOrigin: PUBLIC_ORIGIN, slug: SLUG, title: 'Abstract submission', linkText: 'Open the form in a new page' });
const siteUrl = (origin: string, query: Record<string, string> = {}) => {
  const params = new URLSearchParams(query);
  params.set('paste', Buffer.from(SNIPPET, 'utf8').toString('base64url'));
  return `${origin}/hostile.html?${params.toString()}`;
};

interface Width {
  name: '375' | '1440';
  viewport: { width: number; height: number };
  dsf: number;
  touch: boolean;
}
const PHONE: Width = { name: '375', viewport: { width: 375, height: 812 }, dsf: 2, touch: true };
const LAPTOP: Width = { name: '1440', viewport: { width: 1440, height: 900 }, dsf: 1, touch: false };
const WIDTHS: readonly Width[] = [PHONE, LAPTOP];

// Invented people on example.test (NFR-PRIV-05).
const TITLE_EN = 'Sustainable tourism in the Balkans';
const TITLE_SR = 'Održivi turizam na Balkanu: šta đaci čitaju';
const ABSTRACT_40 = Array.from({ length: 4 }, () => 'Tourism in the region grows while the small towns lose their young people.').join(' ');
const ABSTRACT_350 = Array.from({ length: 35 }, () => 'Tourism in the region grows while the small towns lose people.').join(' ');

const out = (engine: string, ...parts: string[]) => {
  const file = join(root, '.artifacts', 'ux-review', engine, ...parts);
  mkdirSync(dirname(file), { recursive: true });
  return file;
};
const save = (engine: string, name: string, data: unknown) => writeFileSync(out(engine, 'data', `${name}.json`), `${JSON.stringify(data, null, 2)}\n`);

async function open(browser: Browser, browserName: string, w: Width): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: w.viewport,
    deviceScaleFactor: w.dsf,
    ...(w.touch ? { hasTouch: true, ...(browserName === 'firefox' ? {} : { isMobile: true }) } : {}),
  });
  const page = await context.newPage();
  return { context, page };
}

/** What the person sees: the window, not the whole page. */
const view = (page: Page, file: string) => page.screenshot({ path: file, animations: 'disabled' });
const full = (page: Page, file: string) => page.screenshot({ path: file, fullPage: true, animations: 'disabled' });

async function openForm(page: Page, path = `/f/${SLUG}`) {
  await page.goto(`${PUBLIC_ORIGIN}${path}`);
  await page.locator('[data-confera-form][data-hydrated="true"]').waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function formFrame(page: Page): Promise<Frame> {
  await page.locator(FRAME).waitFor({ state: 'attached' });
  const element = await page.locator(FRAME).elementHandle();
  let frame = await element?.contentFrame();
  for (let i = 0; !frame && i < 50; i += 1) {
    await page.waitForTimeout(100);
    frame = await (await page.locator(FRAME).elementHandle())?.contentFrame();
  }
  if (!frame) throw new Error('the frame of the form has no document');
  await frame.locator('[data-confera-form][data-hydrated="true"]').waitFor({ timeout: 30_000 });
  await frame.evaluate(() => document.fonts.ready);
  await expect
    .poll(async () => {
      const el = await page.locator(FRAME).evaluate((f) => f.getBoundingClientRect().height);
      const content = await frame.locator('[data-confera-embed-root]').evaluate((r) => Math.ceil(r.getBoundingClientRect().height));
      return Math.abs(el - content);
    })
    .toBeLessThanOrEqual(1);
  return frame;
}

/** The focused control as a screen reader would name it (role and accessible name), and whether it is in the window. */
async function focused(target: Page | Frame): Promise<string> {
  const active = await target.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement) return { none: true, tag: el?.tagName.toLowerCase() ?? 'null' };
    el.setAttribute('data-ux-focus', '1');
    return { none: false, tag: el.tagName.toLowerCase() };
  });
  if (active.none) return `(nothing: ${active.tag})`;
  const loc = target.locator('[data-ux-focus="1"]');
  let name = '';
  try {
    name = (await loc.ariaSnapshot({ timeout: 2_000 })).split('\n')[0]!.replace(/^- /, '');
  } catch {
    name = active.tag;
  }
  const where = await loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    el.removeAttribute('data-ux-focus');
    return r.bottom > 0 && r.top < innerHeight ? 'in the window' : `outside the window (top ${Math.round(r.top)}, window ${innerHeight})`;
  });
  return `${name} [${where}]`;
}

/** Where an element is, against the window of the page it is in. */
const place = (loc: Locator) =>
  loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), window: innerHeight, scrollY: Math.round(scrollY), visible: r.bottom > 0 && r.top < innerHeight };
  });

/** Where an element inside the form's frame is, against the window of the conference page. */
async function placeInSite(page: Page, loc: Locator) {
  const frameBox = await page.locator(FRAME).evaluate((f) => {
    const r = f.getBoundingClientRect();
    return { top: r.top, height: r.height, window: innerHeight, scrollY: scrollY };
  });
  const box = await loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom };
  });
  const top = Math.round(frameBox.top + box.top);
  const bottom = Math.round(frameBox.top + box.bottom);
  return { top, bottom, window: frameBox.window, siteScrollY: Math.round(frameBox.scrollY), frameTop: Math.round(frameBox.top), frameHeight: Math.round(frameBox.height), visible: bottom > 0 && top < frameBox.window };
}

/** The live regions and alerts in a document, with their text. */
const liveRegions = (target: Page | Frame) =>
  target.evaluate(() =>
    [...document.querySelectorAll('[role="alert"], [role="status"], [aria-live]')].map((el) => `${el.getAttribute('role') ?? ''}${el.getAttribute('aria-live') ? ` aria-live=${el.getAttribute('aria-live')}` : ''}: ${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 160)}`),
  );

/** The fields of the form: value, invalid state, required state, description. */
const fieldStates = (target: Page | Frame) =>
  target.evaluate(() =>
    [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-confera-form] input:not([type="radio"]), [data-confera-form] textarea')].map((el) => {
      const label = el.labels?.[0]?.textContent?.trim() ?? el.getAttribute('aria-label') ?? el.name;
      const described = (el.getAttribute('aria-describedby') ?? '')
        .split(' ')
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
        .join(' | ');
      return {
        name: el.name,
        label,
        type: el.type,
        value: el.type === 'checkbox' ? String((el as HTMLInputElement).checked) : el.value.slice(0, 60),
        required: el.required || el.getAttribute('aria-required') === 'true',
        invalid: el.getAttribute('aria-invalid'),
        described,
        autocomplete: el.getAttribute('autocomplete'),
        inputmode: el.getAttribute('inputmode'),
      };
    }),
  );

const formText = (target: Page | Frame) => target.locator('[data-confera-form]').evaluate((el) => (el as HTMLElement).innerText.replace(/\n{2,}/g, '\n'));

async function fillValid(target: Page | Frame, lang: 'en' | 'sr' = 'en') {
  const L = lang === 'en' ? { title: 'Title of the paper', abstract: 'Abstract', name: 'Name of author 1', email: 'Email of author 1', consent: 'I accept the terms of publication' } : { title: 'Naslov rada', abstract: 'Apstrakt', name: 'Ime autora 1', email: 'Imejl autora 1', consent: 'Prihvatam uslove objavljivanja' };
  await target.getByLabel(L.title).fill(lang === 'en' ? TITLE_EN : TITLE_SR);
  await target.getByLabel(L.abstract, { exact: true }).fill(ABSTRACT_40);
  await target.getByLabel(L.name).fill('Marta Kovač');
  await target.getByLabel(L.email).fill('marta@example.test');
  await target.getByText(L.consent).click();
}

for (const w of WIDTHS) {
  test.describe(`${w.name} px`, () => {
    // ---------------------------------------------------------------------------------------------
    test('A1 hosted, English: first look and the happy path', async ({ browser, browserName }) => {
      test.setTimeout(120_000);
      const { context, page } = await open(browser, browserName, w);
      const dir = (f: string) => out(browserName, 'A1-hosted', w.name, f);
      const data: Record<string, unknown> = {};
      try {
        await openForm(page);
        await view(page, dir('01-first-look.png'));
        await full(page, dir('01-first-look-full.png'));
        data.documentTitle = await page.title();
        data.htmlLang = await page.evaluate(() => document.documentElement.lang);
        data.pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
        data.windowHeight = w.viewport.height;
        data.sendButton = await place(page.getByRole('button', { name: 'Send abstract' }));
        data.firstWindowShows = await page.evaluate(() =>
          [...document.querySelectorAll('h1, h2, label, legend, .ud-field__label, button, [role="radio"]')]
            .filter((el) => {
              const r = el.getBoundingClientRect();
              return r.height > 0 && r.top >= 0 && r.bottom <= innerHeight;
            })
            .map((el) => (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)),
        );
        data.fields = await fieldStates(page);
        data.textEmpty = await formText(page);
        data.ariaEmpty = await page.locator('[data-confera-form]').ariaSnapshot();

        await fillValid(page);
        await page.getByRole('button', { name: 'Send abstract' }).click();
        await expect(page.locator('.ud-alert--success')).toBeVisible();
        await view(page, dir('02-thank-you-window.png'));
        data.focusAfterSend = await focused(page);
        data.thankYou = await place(page.locator('.ud-alert--success'));
        data.liveAfterSend = await liveRegions(page);
        data.textThanks = await formText(page);
        data.ariaThanks = await page.locator('[data-confera-form]').ariaSnapshot();
        data.draftAfterSend = await page.evaluate((k) => sessionStorage.getItem(k), `confera:draft:${SLUG}`);
        await page.getByRole('button', { name: 'Fill in another one' }).click();
        data.focusAfterAgain = await focused(page);
        data.afterAgainFields = await fieldStates(page);
        save(browserName, `A1-hosted-${w.name}`, data);
      } finally {
        await context.close();
      }
    });

    // ---------------------------------------------------------------------------------------------
    test('A2 hosted, English: every mistake and the way back', async ({ browser, browserName }) => {
      test.setTimeout(150_000);
      const { context, page } = await open(browser, browserName, w);
      const dir = (f: string) => out(browserName, 'A2-mistakes', w.name, f);
      const data: Record<string, unknown> = {};
      const send = page.getByRole('button', { name: 'Send abstract' });
      try {
        // 1. Nothing filled in, Send.
        await openForm(page);
        await send.click();
        await expect(page.locator('.ud-alert--error')).toBeVisible();
        await view(page, dir('01-empty-send-window.png'));
        data.empty = {
          focus: await focused(page),
          summary: await place(page.locator('.ud-alert--error')),
          summaryText: await page.locator('.ud-alert--error').innerText(),
          fields: await fieldStates(page),
          live: await liveRegions(page),
          aria: await page.locator('[data-confera-form]').ariaSnapshot(),
        };
        // The same Send again: is anything new announced?
        await page.locator('.ud-alert--error').evaluate((el) => el.setAttribute('data-ux-first', '1'));
        await send.click();
        data.empty2 = { sameSummaryNode: await page.locator('.ud-alert--error[data-ux-first="1"]').count() };

        // 2. Everything right except the consent: what does the person see where she pressed Send?
        await openForm(page);
        await page.getByLabel('Title of the paper').fill(TITLE_EN);
        await page.getByLabel('Abstract', { exact: true }).fill(ABSTRACT_40);
        await page.getByLabel('Name of author 1').fill('Marta Kovač');
        await page.getByLabel('Email of author 1').fill('marta@example.test');
        await send.click();
        await expect(page.locator('.ud-alert--error')).toBeVisible();
        await view(page, dir('02-only-consent-missing-window.png'));
        data.onlyConsent = {
          focus: await focused(page),
          summary: await place(page.locator('.ud-alert--error')),
          summaryText: await page.locator('.ud-alert--error').innerText(),
          consent: await page.getByLabel('I accept the terms of publication').evaluate((el) => ({ invalid: el.getAttribute('aria-invalid'), describedBy: el.getAttribute('aria-describedby'), required: (el as HTMLInputElement).required })),
          errorsInWindow: await page.evaluate(() => [...document.querySelectorAll('.ud-alert--error, .ud-field__message.is-error, [aria-invalid="true"]')].filter((el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }).length),
        };
        // Recovery: tick the box and send.
        await page.getByText('I accept the terms of publication').click();
        data.onlyConsent2 = { summaryStillShown: await page.locator('.ud-alert--error').count() };
        await send.click();
        data.onlyConsent3 = { thanks: await page.locator('.ud-alert--success').count() };

        // 3. Too many words.
        await openForm(page);
        await page.getByLabel('Title of the paper').fill(TITLE_EN);
        await page.getByLabel('Abstract', { exact: true }).fill(ABSTRACT_350);
        await page.getByLabel('Name of author 1').fill('Marta Kovač');
        await page.getByText('I accept the terms of publication').click();
        await page.getByLabel('Abstract', { exact: true }).scrollIntoViewIfNeeded();
        await view(page, dir('03-too-many-words-window.png'));
        data.tooManyWords = {
          counter: await page.locator('textarea[name="abstract"]').evaluate((el) => document.getElementById((el.getAttribute('aria-describedby') ?? '').split(' ')[0] ?? '')?.textContent ?? ''),
          field: (await fieldStates(page)).find((f) => f.name === 'abstract'),
          classes: await page.locator('textarea[name="abstract"]').evaluate((el) => el.closest('.ud-field')?.className ?? ''),
        };
        await send.click();
        data.tooManyWordsSent = { thanks: await page.locator('.ud-alert--success').count(), errors: await page.locator('.ud-alert--error').count() };

        // 4. A wrong email address of the corresponding author.
        await openForm(page);
        await page.getByLabel('Title of the paper').fill(TITLE_EN);
        await page.getByLabel('Name of author 1').fill('Marta Kovač');
        await page.getByLabel('Email of author 1').fill('marta@example');
        await page.getByText('I accept the terms of publication').click();
        await send.click();
        data.wrongEmail = { thanks: await page.locator('.ud-alert--success').count(), errors: await page.locator('.ud-alert--error').count() };
        await openForm(page);
        await page.getByLabel('Title of the paper').fill(TITLE_EN);
        await page.getByLabel('Name of author 1').fill('Marta Kovač');
        await page.getByText('I accept the terms of publication').click();
        await send.click();
        data.noEmailAtAll = { thanks: await page.locator('.ud-alert--success').count(), errors: await page.locator('.ud-alert--error').count() };

        // 5. Three authors, the names of authors 2 and 3 missing: does the summary say which?
        await openForm(page);
        await page.getByRole('button', { name: 'Add author' }).click();
        await page.getByRole('button', { name: 'Add author' }).click();
        data.addAuthorFocus = await focused(page);
        await page.getByLabel('Title of the paper').fill(TITLE_EN);
        await page.getByLabel('Name of author 1').fill('Marta Kovač');
        await page.getByText('I accept the terms of publication').click();
        await send.click();
        await page.locator('.ud-alert--error').scrollIntoViewIfNeeded();
        await view(page, dir('05-two-names-missing-window.png'));
        data.namesMissing = { summaryText: await page.locator('.ud-alert--error').innerText(), fields: await fieldStates(page) };

        // 6. Remove author 1 when three are filled in: no question asked, no undo?
        await page.getByLabel('Name of author 2').fill('Đorđe Šćepanović');
        await page.getByLabel('Name of author 3').fill('Živana Čolić');
        await page.getByRole('button', { name: 'Remove author 1' }).click();
        data.removeFirst = { focus: await focused(page), names: (await fieldStates(page)).filter((f) => f.name.endsWith('.name')).map((f) => `${f.label}: ${f.value}`) };

        // 7. The most authors: what happens to "Add author", and to the focus, at the limit?
        await openForm(page);
        const add = page.getByRole('button', { name: 'Add author' });
        let rows = 1;
        while ((await add.count()) > 0 && rows < 20) {
          await add.focus();
          await page.keyboard.press('Enter');
          rows += 1;
        }
        data.limit = { rows, addStillThere: await add.count(), focusAfterLastAdd: await focused(page), textNearAdd: await page.locator('.ud-repeater').evaluate((el) => (el as HTMLElement).innerText.split('\n').slice(-3).join(' | ')) };
        await full(page, dir('07-most-authors-full.png'));
        save(browserName, `A2-mistakes-${w.name}`, data);
      } finally {
        await context.close();
      }
    });

    // ---------------------------------------------------------------------------------------------
    test('A3 hosted: Serbian, and switching language half-way', async ({ browser, browserName }) => {
      test.setTimeout(120_000);
      const { context, page } = await open(browser, browserName, w);
      const dir = (f: string) => out(browserName, 'A3-language', w.name, f);
      const data: Record<string, unknown> = {};
      try {
        await openForm(page);
        data.textEn = await formText(page);
        await page.getByLabel('Title of the paper').fill(TITLE_SR);
        await page.getByLabel('Name of author 1').fill('Đorđe Šćepanović');
        await page.getByRole('button', { name: 'Add author' }).click();
        await page.getByRole('button', { name: 'Send abstract' }).click();
        await expect(page.locator('.ud-alert--error')).toBeVisible();
        data.errorsEn = await page.locator('.ud-alert--error').innerText();
        // Half-way: the switch is at the top, the author is at the bottom.
        await page.getByRole('radio', { name: 'Srpski' }).click();
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Prijava apstrakta');
        await view(page, dir('01-switched-to-serbian-window.png'));
        await full(page, dir('01-switched-to-serbian-full.png'));
        data.afterSwitch = {
          documentTitle: await page.title(),
          htmlLang: await page.evaluate(() => document.documentElement.lang),
          formLang: await page.locator('[data-confera-form]').getAttribute('lang'),
          fields: await fieldStates(page),
          summary: await page.locator('.ud-alert--error').innerText(),
          text: await formText(page),
          aria: await page.locator('[data-confera-form]').ariaSnapshot(),
          focus: await focused(page),
        };
        // Finish in Serbian.
        await page.getByLabel('Ime autora 2').fill('Marta Kovač');
        await page.getByLabel('Imejl autora 1').fill('djordje@example.test');
        await page.getByText('Prihvatam uslove objavljivanja').click();
        await page.getByRole('button', { name: 'Pošalji apstrakt' }).click();
        await expect(page.locator('.ud-alert--success')).toBeVisible();
        await view(page, dir('02-thank-you-serbian-window.png'));
        data.thanksSr = await formText(page);
        // And the English thank-you, for the comparison.
        await page.getByRole('radio', { name: 'English' }).click();
        data.thanksEnAfterSwitchBack = await formText(page);
        // The Serbian labels the design system writes by itself (remove buttons, etc.).
        await page.getByRole('radio', { name: 'Srpski' }).click();
        await page.getByRole('button', { name: 'Popuni još jedan' }).click();
        await page.getByRole('button', { name: 'Dodaj autora' }).click();
        data.ariaSrTwoAuthors = await page.locator('[data-confera-form]').ariaSnapshot();
        save(browserName, `A3-language-${w.name}`, data);
      } finally {
        await context.close();
      }
    });

    // ---------------------------------------------------------------------------------------------
    test('A4 hosted: reload, open again, and after sending', async ({ browser, browserName }) => {
      test.setTimeout(120_000);
      const { context, page } = await open(browser, browserName, w);
      const dir = (f: string) => out(browserName, 'A4-reload', w.name, f);
      const data: Record<string, unknown> = {};
      try {
        await openForm(page);
        data.noteBefore = await page.locator('[data-confera-form] p').last().innerText();
        await page.getByRole('radio', { name: 'Srpski' }).click();
        await page.getByLabel('Naslov rada').fill(TITLE_SR);
        await page.getByLabel('Apstrakt', { exact: true }).fill(ABSTRACT_40);
        await page.getByRole('button', { name: 'Dodaj autora' }).click();
        await page.getByLabel('Ime autora 1').fill('Đorđe Šćepanović');
        await page.getByLabel('Imejl autora 1').fill('djordje@example.test');
        await page.getByLabel('Ime autora 2').fill('Marta Kovač');
        await page.getByText('Prihvatam uslove objavljivanja').click();
        data.beforeReload = await fieldStates(page);
        await page.reload();
        await page.locator('[data-confera-form][data-hydrated="true"]').waitFor();
        await page.waitForTimeout(300);
        await view(page, dir('01-after-reload-window.png'));
        data.afterReload = { heading: await page.getByRole('heading', { level: 1 }).innerText(), fields: await fieldStates(page), note: await page.locator('[data-confera-form] p').last().innerText() };
        // The address opened again in the same tab (a link followed back to the form).
        await page.goto('about:blank');
        await openForm(page);
        data.afterOpenAgain = { heading: await page.getByRole('heading', { level: 1 }).innerText(), fields: await fieldStates(page) };
        // After sending: reload, and what is left.
        await page.getByLabel('Name of author 1').fill('Marta Kovač');
        await page.getByText('I accept the terms of publication').click();
        if ((await page.getByLabel('Title of the paper').inputValue()) === '') await page.getByLabel('Title of the paper').fill(TITLE_EN);
        await page.getByRole('button', { name: 'Send abstract' }).click();
        await expect(page.locator('.ud-alert--success')).toBeVisible();
        await page.reload();
        await page.locator('[data-confera-form][data-hydrated="true"]').waitFor();
        data.afterSendReload = { text: (await formText(page)).slice(0, 200), fields: await fieldStates(page) };
        save(browserName, `A4-reload-${w.name}`, data);
      } finally {
        await context.close();
      }
    });

    // ---------------------------------------------------------------------------------------------
    test('A5 hosted: send twice', async ({ browser, browserName }) => {
      test.setTimeout(90_000);
      const { context, page } = await open(browser, browserName, w);
      const data: Record<string, unknown> = {};
      try {
        await openForm(page);
        await fillValid(page);
        await page.getByRole('button', { name: 'Send abstract' }).dblclick();
        data.doubleClick = { thanks: await page.locator('.ud-alert--success').count(), buttons: await page.getByRole('button', { name: 'Send abstract' }).count() };
        await openForm(page);
        await fillValid(page);
        await page.getByLabel('Title of the paper').focus();
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        data.enterTwiceInTitle = { thanks: await page.locator('.ud-alert--success').count(), focus: await focused(page) };
        // Enter in the title of an empty form: sent too early?
        await openForm(page);
        await page.getByLabel('Title of the paper').fill(TITLE_EN);
        await page.keyboard.press('Enter');
        data.enterInTitleOfEmptyForm = { errors: await page.locator('.ud-alert--error').count(), focus: await focused(page) };
        save(browserName, `A5-twice-${w.name}`, data);
      } finally {
        await context.close();
      }
    });

    // ---------------------------------------------------------------------------------------------
    test('B1 keyboard only, and what a screen reader is given', async ({ browser, browserName }) => {
      test.setTimeout(150_000);
      const { context, page } = await open(browser, browserName, w);
      const dir = (f: string) => out(browserName, 'B1-keyboard', w.name, f);
      const data: Record<string, unknown> = {};
      let keys = 0;
      const press = async (key: string) => {
        keys += 1;
        await page.keyboard.press(key);
      };
      const typeText = async (text: string) => {
        keys += 1; // one typing act counts as one step
        await page.keyboard.type(text);
      };
      try {
        await openForm(page);
        // The tab order from the top of the page to the end.
        const stops: string[] = [];
        for (let i = 0; i < 20; i += 1) {
          await page.keyboard.press('Tab');
          const f = await focused(page);
          stops.push(f);
          if (f.startsWith('(nothing')) break;
        }
        data.tabOrderEmpty = stops;

        // The whole form by keyboard, two authors, counting the keys.
        await openForm(page);
        await press('Tab'); // language
        await press('ArrowRight'); // Srpski
        data.afterArrowRight = await page.getByRole('heading', { level: 1 }).innerText();
        await press('ArrowLeft'); // back to English
        await press('Tab');
        data.title = await focused(page);
        await typeText(TITLE_EN);
        await press('Tab');
        await typeText('Tourism in the region grows while the small towns lose their young people.');
        await press('Tab');
        await typeText('Marta Kovač');
        await press('Tab');
        await typeText('marta@example.test');
        await press('Tab');
        data.beforeAdd = await focused(page);
        await press('Enter'); // Add author
        data.afterAdd = await focused(page);
        data.liveAfterAdd = await liveRegions(page);
        await press('Tab');
        data.tabAfterAdd = await focused(page);
        // Back to the new author's name.
        let back = 0;
        while (!(await focused(page)).includes('Name of author 2') && back < 10) {
          await press('Shift+Tab');
          back += 1;
        }
        data.shiftTabsToNewRow = back;
        await typeText('Đorđe Šćepanović');
        await press('Tab');
        await typeText('djordje@example.test');
        let forward = 0;
        while (!(await focused(page)).includes('I accept the terms') && forward < 10) {
          await press('Tab');
          forward += 1;
        }
        data.tabsToConsent = forward;
        await press('Space');
        await press('Tab');
        data.beforeSend = await focused(page);
        await press('Enter');
        await expect(page.locator('.ud-alert--success')).toBeVisible();
        data.focusAfterSend = await focused(page);
        data.liveAfterSend = await liveRegions(page);
        await press('Tab');
        data.firstTabAfterSend = await focused(page);
        data.keysHappyPath = keys;
        await view(page, dir('01-after-send-window.png'));

        // Errors by keyboard: Send at once, then find the first error.
        await openForm(page);
        let tabs = 0;
        while (!(await focused(page)).includes('Send abstract') && tabs < 20) {
          await page.keyboard.press('Tab');
          tabs += 1;
        }
        data.tabsToSendEmpty = tabs;
        await page.keyboard.press('Enter');
        await expect(page.locator('.ud-alert--error')).toBeVisible();
        data.focusAfterErrors = await focused(page);
        await page.keyboard.press('Tab');
        data.tabAfterErrors = await focused(page);
        let up = 0;
        await page.locator('button:has-text("Send abstract")').focus();
        while (!(await focused(page)).includes('Title of the paper') && up < 20) {
          await page.keyboard.press('Shift+Tab');
          up += 1;
        }
        data.shiftTabsFromSendToFirstError = up;
        data.titleWhenFocused = await focused(page);
        await view(page, dir('02-errors-keyboard-window.png'));

        // Remove an author by keyboard: where does the focus go?
        await openForm(page);
        await page.getByRole('button', { name: 'Add author' }).focus();
        await page.keyboard.press('Enter');
        await page.getByRole('button', { name: 'Remove author 2' }).focus();
        await page.keyboard.press('Enter');
        data.focusAfterRemove = await focused(page);
        save(browserName, `B1-keyboard-${w.name}`, data);
      } finally {
        await context.close();
      }
    });

    // ---------------------------------------------------------------------------------------------
    test('C1 conference site: while the form loads, and the first look', async ({ browser, browserName }) => {
      test.setTimeout(120_000);
      const { context, page } = await open(browser, browserName, w);
      const dir = (f: string) => out(browserName, 'C1-site', w.name, f);
      const data: Record<string, unknown> = {};
      try {
        // A slow frame: the page of the form answers after 6 s.
        let release: () => void = () => undefined;
        const mayLoad = new Promise<void>((r) => (release = r));
        await context.route(/127\.0\.0\.1:3000\/embed\//, async (route) => {
          await mayLoad;
          await route.continue();
        });
        await page.goto(siteUrl(HARNESS_ORIGIN), { waitUntil: 'domcontentloaded' });
        await page.locator(FRAME).scrollIntoViewIfNeeded();
        await page.waitForTimeout(1_500);
        await view(page, dir('01-while-loading-window.png'));
        data.whileLoading = {
          frame: await page.locator(FRAME).evaluate((f) => ({ height: Math.round(f.getBoundingClientRect().height), top: Math.round(f.getBoundingClientRect().top), title: f.getAttribute('title') })),
          linkBelow: await place(page.getByRole('link', { name: 'Open the form in a new page' })),
        };
        release();
        await context.unroute(/127\.0\.0\.1:3000\/embed\//);
        const frame = await formFrame(page);
        await page.evaluate(() => window.scrollTo(0, 0));
        await view(page, dir('02-site-top-window.png'));
        await full(page, dir('02-site-full.png'));
        data.loaded = {
          frameTop: await page.locator(FRAME).evaluate((f) => Math.round(f.getBoundingClientRect().top + scrollY)),
          frameHeight: await page.locator(FRAME).evaluate((f) => Math.round(f.getBoundingClientRect().height)),
          windowHeight: w.viewport.height,
          link: await page.getByRole('link', { name: 'Open the form in a new page' }).evaluate((a) => ({ text: a.textContent, target: a.getAttribute('target'), top: Math.round(a.getBoundingClientRect().top + scrollY) })),
          siteAria: await page.locator('#confera-slot').ariaSnapshot(),
          frameDocumentTitle: await frame.title(),
          frameHtmlLang: await frame.evaluate(() => document.documentElement.lang),
        };
        // Keyboard from the site into the form and out again.
        await page.locator('#host-input').focus();
        const seq: string[] = [];
        for (let i = 0; i < 14; i += 1) {
          await page.keyboard.press('Tab');
          const inFrame = await page.evaluate((sel) => document.activeElement === document.querySelector(sel), FRAME);
          seq.push(inFrame ? `frame: ${await focused(frame)}` : `site: ${await focused(page)}`);
        }
        data.keyboardAcross = seq;
        save(browserName, `C1-site-${w.name}`, data);
      } finally {
        await context.close();
      }
    });

    // ---------------------------------------------------------------------------------------------
    test('C2 conference site: errors, growth and the thank-you inside the frame', async ({ browser, browserName }) => {
      test.setTimeout(150_000);
      const { context, page } = await open(browser, browserName, w);
      const dir = (f: string) => out(browserName, 'C2-site-flow', w.name, f);
      const data: Record<string, unknown> = {};
      try {
        await page.goto(siteUrl(HARNESS_ORIGIN));
        let frame = await formFrame(page);
        // Empty Send, pressed where the author is: at the button.
        await frame.getByRole('button', { name: 'Send abstract' }).click();
        await expect(frame.locator('.ud-alert--error')).toBeVisible();
        await page.waitForTimeout(500);
        await view(page, dir('01-empty-send-window.png'));
        data.emptySend = { summary: await placeInSite(page, frame.locator('.ud-alert--error')), focusFrame: await focused(frame), focusSite: await page.evaluate((s) => (document.activeElement === document.querySelector(s) ? 'the frame' : document.activeElement?.tagName), FRAME) };

        // Only the consent missing.
        await page.goto(siteUrl(HARNESS_ORIGIN));
        frame = await formFrame(page);
        await frame.getByLabel('Title of the paper').fill(TITLE_EN);
        await frame.getByLabel('Abstract', { exact: true }).fill(ABSTRACT_40);
        await frame.getByLabel('Name of author 1').fill('Marta Kovač');
        await frame.getByLabel('Email of author 1').fill('marta@example.test');
        await frame.getByRole('button', { name: 'Send abstract' }).click();
        await expect(frame.locator('.ud-alert--error')).toBeVisible();
        await page.waitForTimeout(500);
        await view(page, dir('02-only-consent-missing-window.png'));
        data.onlyConsent = { summary: await placeInSite(page, frame.locator('.ud-alert--error')), sendButton: await placeInSite(page, frame.getByRole('button', { name: 'Send abstract' })) };

        // Growth: three more authors.
        const before = await page.locator(FRAME).evaluate((f) => Math.round(f.getBoundingClientRect().height));
        for (let i = 0; i < 3; i += 1) await frame.getByRole('button', { name: 'Add author' }).click();
        await page.waitForTimeout(500);
        const after = await page.locator(FRAME).evaluate((f) => Math.round(f.getBoundingClientRect().height));
        const content = await frame.locator('[data-confera-embed-root]').evaluate((r) => Math.ceil(r.getBoundingClientRect().height));
        data.growth = { before, after, content, innerScroll: await frame.evaluate(() => document.documentElement.scrollHeight - innerHeight) };
        for (const n of [2, 3, 4]) await frame.getByLabel(`Name of author ${n}`).fill(`Autor ${n}`);

        // The thank-you: where is it, against the window of the site?
        await frame.getByText('I accept the terms of publication').click();
        await frame.getByRole('button', { name: 'Send abstract' }).click();
        await expect(frame.locator('.ud-alert--success')).toBeVisible();
        await page.waitForTimeout(800);
        await view(page, dir('03-thank-you-window.png'));
        data.thankYou = {
          alert: await placeInSite(page, frame.locator('.ud-alert--success')),
          focusFrame: await focused(frame),
          siteText: await page.evaluate(() => [...document.querySelectorAll('#host-after, #host-title, #confera-slot a')].map((el) => { const r = el.getBoundingClientRect(); return `${(el.textContent ?? '').trim()} top ${Math.round(r.top)} ${r.bottom > 0 && r.top < innerHeight ? 'in the window' : 'outside'}`; })),
        };
        save(browserName, `C2-site-flow-${w.name}`, data);
      } finally {
        await context.close();
      }
    });

    // ---------------------------------------------------------------------------------------------
    test('C3 conference site: reload the site page with a draft in the frame', async ({ browser, browserName }) => {
      test.setTimeout(120_000);
      const { context, page } = await open(browser, browserName, w);
      const data: Record<string, unknown> = {};
      try {
        await page.goto(siteUrl(HARNESS_ORIGIN));
        let frame = await formFrame(page);
        data.note = await frame.locator('[data-confera-form] p').last().innerText();
        await frame.getByLabel('Title of the paper').fill(TITLE_EN);
        await frame.getByLabel('Abstract', { exact: true }).fill(ABSTRACT_40);
        await frame.getByLabel('Name of author 1').fill('Marta Kovač');
        await page.waitForTimeout(300);
        await page.reload();
        frame = await formFrame(page);
        await page.waitForTimeout(500);
        data.afterReload = await fieldStates(frame);
        save(browserName, `C3-site-reload-${w.name}`, data);
      } finally {
        await context.close();
      }
    });

    // ---------------------------------------------------------------------------------------------
    test('C4 conference site: an unlisted site, and a site that runs no pasted script', async ({ browser, browserName }) => {
      test.setTimeout(120_000);
      const { context, page } = await open(browser, browserName, w);
      const dir = (f: string) => out(browserName, 'C4-site-edge', w.name, f);
      const data: Record<string, unknown> = {};
      try {
        await page.goto(siteUrl(UNLISTED_ORIGIN));
        await page.locator(FRAME).scrollIntoViewIfNeeded();
        await page.waitForTimeout(2_000);
        await view(page, dir('01-unlisted-site-window.png'));
        data.unlisted = { frame: await page.locator(FRAME).evaluate((f) => Math.round(f.getBoundingClientRect().height)), link: await place(page.getByRole('link', { name: 'Open the form in a new page' })) };
        await page.goto(siteUrl(HARNESS_ORIGIN, { csp: 'no-inline' }));
        const frame = await page.locator(FRAME).elementHandle().then((e) => e?.contentFrame());
        await frame?.locator('[data-confera-form][data-hydrated="true"]').waitFor({ timeout: 30_000 });
        await page.locator(FRAME).scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        await view(page, dir('02-no-script-site-window.png'));
        data.noScript = { frame: await page.locator(FRAME).evaluate((f) => Math.round(f.getBoundingClientRect().height)), content: await frame?.locator('[data-confera-embed-root]').evaluate((r) => Math.ceil(r.getBoundingClientRect().height)) };
        save(browserName, `C4-site-edge-${w.name}`, data);
      } finally {
        await context.close();
      }
    });

    // ---------------------------------------------------------------------------------------------
    test('D1 Nikolina on the admin home: well, slow, down, another version; a page that is not there', async ({ browser, browserName }) => {
      test.setTimeout(120_000);
      const { context, page } = await open(browser, browserName, w);
      const dir = (f: string) => out(browserName, 'D1-admin', w.name, f);
      const data: Record<string, unknown> = {};
      const mainText = () => page.locator('main').innerText();
      try {
        await page.goto(`${ADMIN_ORIGIN}/`);
        await expect(page.getByText('Connected')).toBeVisible();
        await view(page, dir('01-well-window.png'));
        data.well = { title: await page.title(), text: await mainText(), aria: await page.locator('main').ariaSnapshot() };

        let release: () => void = () => undefined;
        const mayAnswer = new Promise<void>((r) => (release = r));
        await page.route('**/api/v1/meta', async (route) => {
          await mayAnswer;
          await route.fulfill({ status: 502, contentType: 'application/problem+json', json: { type: 'about:blank', status: 502, code: 'api_unreachable', title: 'The API did not answer' } });
        });
        await page.reload();
        await page.waitForTimeout(1_500);
        await view(page, dir('02-slow-window.png'));
        data.slow = { text: await mainText(), live: await liveRegions(page) };
        release();
        await expect(page.getByText('The API does not answer')).toBeVisible();
        await view(page, dir('03-down-window.png'));
        data.down = { text: await mainText(), live: await liveRegions(page), buttons: await page.getByRole('button').count(), links: await page.getByRole('link').count() };
        await page.unroute('**/api/v1/meta');
        await page.route('**/api/v1/meta', (route) => route.fulfill({ json: { name: 'confera-api', version: '2.0.0' } }));
        await page.reload();
        await expect(page.getByText('different versions')).toBeVisible();
        await view(page, dir('04-other-version-window.png'));
        data.otherVersion = { text: await mainText() };
        await page.unroute('**/api/v1/meta');

        await page.goto(`${PUBLIC_ORIGIN}/f/no-such-form`);
        await view(page, dir('05-form-not-found-window.png'));
        data.formNotFound = { title: await page.title(), text: await mainText(), links: await page.getByRole('link').count(), buttons: await page.getByRole('button').count(), lang: await page.evaluate(() => document.documentElement.lang) };
        await page.goto(`${ADMIN_ORIGIN}/sign-in`);
        data.signIn = { title: await page.title(), text: await mainText() };
        save(browserName, `D1-admin-${w.name}`, data);
      } finally {
        await context.close();
      }
    });

    // ---------------------------------------------------------------------------------------------
    test('E1 gallery: empty, no results, loading, error, toast, confirmation, files', async ({ browser, browserName }) => {
      test.setTimeout(150_000);
      const { context, page } = await open(browser, browserName, w);
      const dir = (f: string) => out(browserName, 'E1-gallery', w.name, f);
      const data: Record<string, unknown> = {};
      const card = (name: string) => page.locator(`[data-component="${name}"]`);
      try {
        await page.goto(`${PUBLIC_ORIGIN}/dev/gallery`);
        await expect(page.locator('[data-confera-dev="gallery"]')).toHaveAttribute('data-hydrated', 'true', { timeout: 60_000 });
        const texts: Record<string, string> = {};
        for (const name of ['EmptyState', 'DataTable', 'Spinner', 'Skeleton', 'Alert', 'ToastHost', 'ConfirmDialog', 'Dialog', 'FileDropzone', 'FileButton', 'Autocomplete', 'SearchField', 'FilterBar', 'Pagination', 'LabelsProvider', 'Repeater', 'TextField', 'Select', 'Textarea', 'CheckboxGroup', 'RadioGroup']) {
          texts[name] = (await card(name).innerText()).replace(/\n{2,}/g, '\n');
          if (['EmptyState', 'Alert', 'FileDropzone', 'FileButton', 'LabelsProvider', 'DataTable'].includes(name)) await card(name).screenshot({ path: dir(`card-${name}.png`), animations: 'disabled' });
        }
        data.texts = texts;
        data.ariaEmptyState = await card('EmptyState').ariaSnapshot();
        data.ariaSpinner = await card('Spinner').ariaSnapshot();
        data.ariaSkeleton = await card('Skeleton').ariaSnapshot();

        // Confirmation dialog: where is the focus, what is announced, does Escape bring it back?
        await card('ConfirmDialog').getByRole('button', { name: 'Delete the mail server' }).click();
        const dialog = page.getByRole('alertdialog');
        await expect(dialog).toBeVisible();
        await view(page, dir('01-confirm-window.png'));
        data.confirm = {
          focus: await focused(page),
          aria: await dialog.ariaSnapshot(),
          labelledBy: await dialog.getAttribute('aria-labelledby'),
          describedBy: await dialog.getAttribute('aria-describedby'),
        };
        await page.keyboard.press('Escape');
        (data.confirm as Record<string, unknown>).focusAfterEscape = await focused(page);

        // Toast: where it appears, how it is announced, what can be done with it.
        await card('ToastHost').getByRole('button', { name: 'Show a toast' }).click();
        const toastEl = page.locator('.ud-toast').first();
        await expect(toastEl).toBeVisible();
        await view(page, dir('02-toast-window.png'));
        data.toast = { place: await place(toastEl), focus: await focused(page), live: await liveRegions(page), aria: await page.locator('.ud-toasts').ariaSnapshot() };
        await page.keyboard.press('Shift+Tab');
        (data.toast as Record<string, unknown>).shiftTab = await focused(page);

        // Error alert: dismiss it by keyboard; where does the focus go?
        const dismiss = card('Alert').getByRole('button', { name: 'Dismiss' });
        await dismiss.focus();
        await page.keyboard.press('Enter');
        data.alertDismiss = { focus: await focused(page), errorAlertsLeft: await card('Alert').locator('.ud-alert--error').count() };

        // No results in a look-up.
        const country = card('Autocomplete').getByRole('combobox', { name: 'Country' });
        await country.click();
        await country.fill('Xyzland');
        await page.waitForTimeout(300);
        data.noMatches = { aria: await card('Autocomplete').ariaSnapshot(), text: await card('Autocomplete').innerText() };
        await card('Autocomplete').screenshot({ path: dir('03-no-matches.png'), animations: 'disabled' });
        await page.keyboard.press('Escape');

        // Search that finds nothing: the search field alone has no "no results" state.
        await card('SearchField').getByRole('searchbox').fill('nobody at all');
        data.searchNothing = await card('SearchField').innerText();

        // Files: the wrong type and too large.
        const big = Buffer.alloc(21 * 1024 * 1024, 1);
        await card('FileDropzone').locator('input[type="file"]').setInputFiles({ name: 'setup.exe', mimeType: 'application/x-msdownload', buffer: big });
        await page.waitForTimeout(300);
        await card('FileDropzone').screenshot({ path: dir('04-dropzone-wrong-file.png'), animations: 'disabled' });
        data.dropzoneWrongFile = { text: await card('FileDropzone').innerText(), aria: await card('FileDropzone').ariaSnapshot() };
        const photo = card('FileButton').locator('input[type="file"]').first();
        data.fileButtonAccept = await photo.getAttribute('accept');
        await photo.setInputFiles({ name: 'photo.gif', mimeType: 'image/gif', buffer: Buffer.alloc(22 * 1024 * 1024, 1) });
        await page.waitForTimeout(300);
        await card('FileButton').screenshot({ path: dir('05-filebutton-after-choosing.png'), animations: 'disabled' });
        data.fileButtonAfter = { text: await card('FileButton').innerText(), aria: await card('FileButton').ariaSnapshot() };
        save(browserName, `E1-gallery-${w.name}`, data);
      } finally {
        await context.close();
      }
    });
  });
}

// -------------------------------------------------------------------------------------------------
// A real conference page goes on after the form: news, sponsors, a footer. The harness page ends
// right after it, so the window cannot stay where it was when the frame gets shorter. Here the page
// is given a footer of 1,400 px, as WordPress themes have, before the author starts.
test('C5 conference site with a footer: where the thank-you and the errors are after Send', async ({ browser, browserName }) => {
  test.setTimeout(120_000);
  const { context, page } = await open(browser, browserName, PHONE);
  const dir = (f: string) => out(browserName, 'C5-site-footer', '375', f);
  const data: Record<string, unknown> = {};
  const addFooter = () =>
    page.evaluate(() => {
      const footer = document.createElement('footer');
      footer.id = 'site-footer';
      footer.textContent = 'Sponsors, news and the footer of the conference site';
      footer.setAttribute('style', 'display:block;height:1400px;background:#603;color:#fff;padding:20px');
      document.querySelector('main')!.after(footer);
    });
  try {
    await page.goto(siteUrl(HARNESS_ORIGIN));
    await addFooter();
    let frame = await formFrame(page);
    await frame.getByRole('button', { name: 'Add author' }).click();
    await frame.getByRole('button', { name: 'Add author' }).click();
    await frame.getByLabel('Title of the paper').fill(TITLE_EN);
    await frame.getByLabel('Abstract', { exact: true }).fill(ABSTRACT_40);
    await frame.getByLabel('Name of author 1').fill('Marta Kovač');
    await frame.getByLabel('Email of author 1').fill('marta@example.test');
    await frame.getByLabel('Name of author 2').fill('Đorđe Šćepanović');
    await frame.getByLabel('Name of author 3').fill('Živana Čolić');
    await frame.getByText('I accept the terms of publication').click();
    data.beforeSend = await placeInSite(page, frame.getByRole('button', { name: 'Send abstract' }));
    await frame.getByRole('button', { name: 'Send abstract' }).click();
    await expect(frame.locator('.ud-alert--success')).toBeVisible();
    await page.waitForTimeout(800);
    await view(page, dir('01-after-send-window.png'));
    data.thankYou = await placeInSite(page, frame.locator('.ud-alert--success'));
    data.whatTheWindowShows = await page.evaluate(() => {
      const f = document.querySelector('footer#site-footer')!.getBoundingClientRect();
      return { footerTop: Math.round(f.top), footerFillsWindow: f.top <= 0 && f.bottom >= innerHeight };
    });

    // Errors: the author presses Send at the bottom of a long form, with three names missing.
    await page.goto(siteUrl(HARNESS_ORIGIN));
    await addFooter();
    frame = await formFrame(page);
    for (let i = 0; i < 3; i += 1) await frame.getByRole('button', { name: 'Add author' }).click();
    await frame.getByLabel('Title of the paper').fill(TITLE_EN);
    await frame.getByLabel('Name of author 1').fill('Marta Kovač');
    await frame.getByText('I accept the terms of publication').click();
    await frame.getByRole('button', { name: 'Send abstract' }).click();
    await expect(frame.locator('.ud-alert--error')).toBeVisible();
    await page.waitForTimeout(500);
    await view(page, dir('02-errors-window.png'));
    data.errors = { summary: await placeInSite(page, frame.locator('.ud-alert--error')), firstFieldInError: await placeInSite(page, frame.locator('[aria-invalid="true"]').first()), errorsInWindow: await frame.evaluate((top) => [...document.querySelectorAll('.ud-alert--error, .ud-field__message.is-error')].filter((el) => { const r = el.getBoundingClientRect(); return top + r.bottom > 0 && top + r.top < 812; }).length, (await page.locator(FRAME).evaluate((f) => f.getBoundingClientRect().top))) };
    save(browserName, 'C5-site-footer-375', data);
  } finally {
    await context.close();
  }
});

// A probe for the fix, not a walk: can the frame itself bring its message into the site's window?
// After the thank-you replaced the form, the frame asks its own document (1) to focus the message,
// (2) to scroll it into view. Nothing in the application does this; the probe only measures what the
// engines allow a cross-site frame to do with the page around it.
test('C6 probe: can the frame bring the thank-you into the window of the site?', async ({ browser, browserName }) => {
  test.setTimeout(120_000);
  const { context, page } = await open(browser, browserName, PHONE);
  const data: Record<string, unknown> = {};
  try {
    for (const how of ['focus', 'scrollIntoView'] as const) {
      await page.goto(siteUrl(HARNESS_ORIGIN));
      await page.evaluate(() => {
        const footer = document.createElement('footer');
        footer.setAttribute('style', 'display:block;height:1400px;background:#603');
        document.querySelector('main')!.after(footer);
      });
      const frame = await formFrame(page);
      for (let i = 0; i < 2; i += 1) await frame.getByRole('button', { name: 'Add author' }).click();
      await frame.getByLabel('Title of the paper').fill(TITLE_EN);
      for (const n of [1, 2, 3]) await frame.getByLabel(`Name of author ${n}`).fill(`Autor ${n}`);
      await frame.getByText('I accept the terms of publication').click();
      await frame.getByRole('button', { name: 'Send abstract' }).click();
      await expect(frame.locator('.ud-alert--success')).toBeVisible();
      await page.waitForTimeout(500);
      const before = await placeInSite(page, frame.locator('.ud-alert--success'));
      await frame.locator('.ud-alert--success').evaluate((el, h) => {
        if (h === 'focus') {
          el.setAttribute('tabindex', '-1');
          (el as HTMLElement).focus();
        } else el.scrollIntoView({ block: 'center' });
      }, how);
      await page.waitForTimeout(800);
      data[how] = { before, after: await placeInSite(page, frame.locator('.ud-alert--success')) };
    }
    save(browserName, 'C6-probe-scroll', data);
  } finally {
    await context.close();
  }
});

// -------------------------------------------------------------------------------------------------
// FR-FORM-18: "Where the browser blocks storage the form warns before the tab is closed."
test('A7 storage refused: closing the tab after typing', async ({ browser, browserName }) => {
  test.setTimeout(60_000);
  const { context, page } = await open(browser, browserName, LAPTOP);
  const data: Record<string, unknown> = {};
  try {
    await context.addInitScript(() => {
      const refuse = () => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      };
      for (const name of ['sessionStorage', 'localStorage'] as const) Object.defineProperty(window, name, { configurable: true, get: refuse });
    });
    await openForm(page);
    data.note = await page.locator('[data-confera-form] p').last().innerText();
    await page.getByLabel('Title of the paper').click();
    await page.keyboard.type(TITLE_EN);
    let dialog: string | null = null;
    page.on('dialog', async (d) => {
      dialog = `${d.type()}: ${d.message()}`;
      await d.dismiss();
    });
    await page.close({ runBeforeUnload: true });
    await new Promise((r) => setTimeout(r, 1_500));
    data.dialogOnClose = dialog;
    data.pageClosed = page.isClosed();
    save(browserName, 'A7-storage-refused', data);
  } finally {
    await context.close();
  }
});

// -------------------------------------------------------------------------------------------------
test('A6 the scripts never arrive: what Send does with what was typed', async ({ browser, browserName }) => {
  test.setTimeout(120_000);
  const { context, page } = await open(browser, browserName, PHONE);
  const dir = (f: string) => out(browserName, 'A6-no-scripts', '375', f);
  const data: Record<string, unknown> = {};
  try {
    await context.route(/\/_next\/static\/.*\.js(?:\?.*)?$/, (route) => route.abort());
    await page.goto(`${PUBLIC_ORIGIN}/f/${SLUG}`);
    await page.locator('[data-confera-form]').waitFor();
    data.hydrated = await page.locator('[data-confera-form]').getAttribute('data-hydrated');
    await page.getByLabel('Title of the paper').fill(TITLE_EN);
    await page.getByLabel('Abstract', { exact: true }).fill(ABSTRACT_40);
    await page.getByLabel('Name of author 1').fill('Marta Kovač');
    await page.getByLabel('Email of author 1').fill('marta@example.test');
    await page.getByText('I accept the terms of publication').click();
    data.consentTicked = await page.getByLabel('I accept the terms of publication').isChecked();
    await view(page, dir('01-filled-no-scripts.png'));
    const urlBefore = page.url();
    await page.getByRole('button', { name: 'Send abstract' }).click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1_000);
    data.urlBefore = urlBefore;
    data.urlAfter = page.url();
    data.formMethod = await page.locator('[data-confera-form] form').evaluate((f) => ({ method: f.getAttribute('method'), action: f.getAttribute('action') })).catch(() => null);
    data.fieldsAfter = await fieldStates(page).catch(() => 'no form');
    await view(page, dir('02-after-send-no-scripts.png'));
    // The language switch without scripts.
    await page.getByRole('radio', { name: 'Srpski' }).click({ force: true }).catch(() => undefined);
    data.headingAfterSrpski = await page.getByRole('heading', { level: 1 }).innerText();
    save(browserName, 'A6-no-scripts-375', data);
  } finally {
    await context.close();
  }
});
