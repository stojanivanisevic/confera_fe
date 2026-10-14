// Design system 2.3.0 in a browser, in Chromium, Firefox and WebKit: what the UI reviewer's
// re-check of 2.2.0 asked for (section 7 of the 0.1.0 UI review). The rules of the stylesheet and
// the behaviour in the DOM are held by tests/ds-2-3-0.test.tsx; here, what the engines draw and do.
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Browser, BrowserContext, Page } from '@playwright/test';

import { ADMIN_ORIGIN, PUBLIC_ORIGIN } from './env';
import { expect, test } from './support/fixtures';
import { watchPage } from './support/page-problems';

// Every test of this file loads the whole gallery, or a form, once. They run one after the other.
test.describe.configure({ mode: 'default' });

/** The system's blue, --focus (#0b76d7). */
const BLUE = 'rgb(11, 118, 215)';

async function openGallery(page: Page) {
  await page.goto(`${PUBLIC_ORIGIN}/dev/gallery`);
  await expect(page.locator('[data-confera-dev="gallery"]')).toHaveAttribute('data-hydrated', 'true', { timeout: 60_000 });
}
const card = (page: Page, name: string) => page.locator(`[data-component="${name}"]`);
/** Where the focus is: inside the element the locator names, or not. */
const holdsFocus = (page: Page, selector: string) => page.evaluate((s) => document.querySelector(s)?.contains(document.activeElement) ?? false, selector);

/** A phone with a finger as its pointer. Firefox has no mobile mode; it takes touch alone. */
async function phone(browser: Browser, browserName: string): Promise<BrowserContext> {
  return browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, ...(browserName === 'firefox' ? {} : { isMobile: true }) });
}

test.describe('item 1: one focus ring everywhere, and a text link', () => {
  test('every focusable part of the gallery shows the blue outline or ring, never the browser’s own', async ({ page }) => {
    const problems = watchPage(page);
    await openGallery(page);
    // A key press first: from then on a focus that a script moves shows the way a keyboard focus does.
    await page.locator('h1').first().click();
    await page.keyboard.press('Tab');
    const walk = await page.evaluate((blue) => {
      const root = document.querySelector('[data-confera-dev="gallery"]')!;
      const describe = (el: Element) => `${el.closest('[data-component]')?.getAttribute('data-component') ?? '?'} <${el.tagName.toLowerCase()}${el.getAttribute('type') ? ` type=${el.getAttribute('type')}` : ''}> ${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}`;
      /** 'blue' when the control, a part around it or the part drawn next to it shows the system's blue; else what it shows. */
      const signOf = (el: HTMLElement): string => {
        const parts: Element[] = [];
        for (let node: Element | null = el, depth = 0; node && depth < 4 && root.contains(node); node = node.parentElement, depth += 1) parts.push(node);
        if (el.nextElementSibling) parts.push(el.nextElementSibling);
        let seen = 'none';
        for (const part of parts) {
          const style = getComputedStyle(part);
          if (style.boxShadow.includes(blue)) return 'blue';
          if (style.outlineStyle === 'auto') seen = part === el ? 'the browser’s own ring' : seen;
          else if (style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0) {
            if (style.outlineColor === blue) return 'blue';
            if (seen === 'none') seen = `an outline of ${style.outlineColor}`;
          }
        }
        return seen;
      };
      const wrong: string[] = [];
      let checked = 0;
      for (const el of root.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]')) {
        if (el.tabIndex < 0 || el.closest('[inert]') || getComputedStyle(el).visibility === 'hidden') continue;
        el.focus({ preventScroll: true });
        if (document.activeElement !== el) continue; // a part that is not shown cannot take the focus
        checked += 1;
        const sign = signOf(el);
        if (sign !== 'blue') wrong.push(`${describe(el)}: ${sign}`);
      }
      return { checked, wrong };
    }, BLUE);
    expect(walk.checked, 'focusable parts walked').toBeGreaterThan(100);
    expect(walk.wrong, 'parts whose focus is not the system’s blue').toEqual([]);
    expect(problems.messages).toEqual([]);
  });

  test('the links of the form’s error summary are text links: underlined, in ink, with the blue outline', async ({ page }) => {
    await page.goto(`${PUBLIC_ORIGIN}/f/spike-abstract`);
    await expect(page.locator('[data-confera-form]')).toHaveAttribute('data-hydrated', 'true', { timeout: 60_000 });
    await page.getByRole('button', { name: 'Send abstract' }).click();
    const summary = page.locator('[data-confera-errors]');
    await expect(summary).toBeFocused();
    // A key first, so that a focus moved by a script shows as a keyboard focus does. Tab itself would
    // pass the link in WebKit, which leaves links out of the Tab order (Safari's default).
    await page.keyboard.press('Tab');
    const link = summary.getByRole('link').first();
    await link.focus();
    await expect(link).toBeFocused();
    const look = await link.evaluate((el) => {
      const style = getComputedStyle(el);
      return { color: style.color, decoration: style.textDecorationLine, outline: `${style.outlineStyle} ${style.outlineColor}` };
    });
    expect(look).toEqual({ color: 'rgb(55, 50, 50)', decoration: 'underline', outline: `solid ${BLUE}` });
  });
});

test.describe('item 2: targets of 44 px where the pointer is a finger', () => {
  /** Every control of a page that is smaller than 44 x 44, measured where a finger can press it. */
  const smallTargets = (page: Page, scope: string) =>
    page.evaluate((selector) => {
      const root = document.querySelector(selector)!;
      const size = (el: Element) => {
        const box = el.getBoundingClientRect();
        let width = box.width;
        let height = box.height;
        // An invisible layer over the part (::after) widens its target.
        const layer = getComputedStyle(el, '::after');
        if (layer.content !== 'none' && layer.position === 'absolute') {
          width = Math.max(width, Number.parseFloat(layer.width) || 0);
          height = Math.max(height, Number.parseFloat(layer.height) || 0);
        }
        return { width, height };
      };
      const small: string[] = [];
      let measured = 0;
      for (const el of root.querySelectorAll<HTMLElement>('a[href], button, input:not([type=hidden]), select, textarea, [role=button], [tabindex="0"]')) {
        if ((el as HTMLButtonElement).disabled || el.closest('[inert]') || getComputedStyle(el).visibility === 'hidden' || el.closest('[hidden]')) continue;
        // A tab panel takes the focus for the keyboard (to scroll it); it is no target for a finger.
        if (el.getAttribute('tabindex') === '-1' || el.getAttribute('role') === 'tabpanel') continue;
        // What a finger presses: the label of a drawn choice, the box of a field, the control itself.
        let target: Element = el;
        if (el instanceof HTMLInputElement && ['checkbox', 'radio', 'file'].includes(el.type)) target = el.closest('label') ?? (el.id ? root.querySelector(`label[for="${el.id}"]`) : null) ?? el;
        // A press on the box of a field or a search puts the focus in its control (the box is the target).
        else if (el.classList.contains('ud-field__control')) target = el.closest('.ud-field__box') ?? el;
        else if (el.classList.contains('ud-search__control')) target = el.closest('.ud-search') ?? el;
        const { width, height } = size(target);
        if (width === 0 && height === 0) continue;
        measured += 1;
        if (width < 43.5 || height < 43.5) small.push(`${el.closest('[data-component]')?.getAttribute('data-component') ?? ''} <${el.tagName.toLowerCase()} class="${el.className}"> ${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24)}: ${Math.round(width)} x ${Math.round(height)}`);
      }
      return { coarse: matchMedia('(pointer: coarse)').matches, measured, small };
    }, scope);

  test('on the gallery, every control is a target of 44 x 44 px at least', async ({ browser, browserName }) => {
    const context = await phone(browser, browserName);
    const page = await context.newPage();
    await openGallery(page);
    const result = await smallTargets(page, '[data-confera-dev="gallery"]');
    await context.close();
    expect(result.coarse, 'the engine reports a finger as the pointer').toBe(true);
    expect(result.measured).toBeGreaterThan(100);
    expect(result.small).toEqual([]);
  });

  test('on the hosted form, with its errors shown, every control is a target of 44 x 44 px at least', async ({ browser, browserName }) => {
    const context = await phone(browser, browserName);
    const page = await context.newPage();
    await page.goto(`${PUBLIC_ORIGIN}/f/spike-abstract`);
    await expect(page.locator('[data-confera-form]')).toHaveAttribute('data-hydrated', 'true', { timeout: 60_000 });
    await page.getByRole('button', { name: 'Add author' }).click();
    await page.getByRole('button', { name: 'Send abstract' }).click();
    await expect(page.locator('[data-confera-errors]')).toBeVisible();
    const result = await smallTargets(page, '[data-confera-form]');
    await context.close();
    expect(result.coarse).toBe(true);
    expect(result.measured).toBeGreaterThan(10);
    expect(result.small).toEqual([]);
  });
});

test.describe('item 3: Toast, Alert and DataTable', () => {
  test('a toast stays while the pointer is on it and goes once it has left; an error toast stays', async ({ page }) => {
    await openGallery(page);
    await card(page, 'ToastHost').getByRole('button', { name: 'Show a short toast' }).click();
    const short = page.locator('.ud-toast', { hasText: 'Draft saved' });
    await expect(short).toBeVisible();
    await short.hover();
    await page.waitForTimeout(5_000); // its time is 4 s
    await expect(short).toBeVisible();
    await page.mouse.move(1, 1);
    await expect(short).toBeHidden({ timeout: 8_000 });

    await card(page, 'ToastHost').getByRole('button', { name: 'Show an error toast' }).click();
    const error = page.locator('.ud-toast', { hasText: 'The server did not answer' });
    await page.mouse.move(1, 1);
    await page.waitForTimeout(2_500);
    await expect(error).toBeVisible();
    await expect(error).toHaveAttribute('role', 'alert');
  });

  test('a toast stays while the focus is in it', async ({ page }) => {
    await openGallery(page);
    await card(page, 'ToastHost').getByRole('button', { name: 'Show a short toast' }).click();
    const short = page.locator('.ud-toast', { hasText: 'Draft saved' });
    await short.getByRole('button', { name: 'Dismiss' }).focus();
    await page.mouse.move(1, 1);
    await page.waitForTimeout(5_000); // its time is 4 s
    await expect(short).toBeVisible();
    await card(page, 'ToastHost').getByRole('button', { name: 'Show a toast', exact: true }).focus();
    await expect(short).toBeHidden({ timeout: 8_000 });
  });

  test('a dismissed alert hands the focus on; the table tells no results from no data and opens a row by keyboard', async ({ page }) => {
    await openGallery(page);
    const alert = card(page, 'Alert').locator('.ud-alert--error');
    await alert.getByRole('button', { name: 'Dismiss' }).focus();
    await page.keyboard.press('Enter');
    await expect(alert).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement !== document.body && document.activeElement !== null)).toBe(true);

    const table = card(page, 'DataTable');
    await table.getByRole('searchbox', { name: 'Search authors' }).fill('zzz');
    await expect(table.getByText('No results for these filters')).toBeVisible();
    await table.getByRole('button', { name: 'Clear filters' }).click();
    await expect(table.locator('tbody tr')).toHaveCount(3);

    // Item 5: the row is reached by Tab and opened by Enter.
    const open = table.locator('tbody button.ud-table__open').first();
    const name = (await open.textContent())!;
    await open.focus();
    await page.keyboard.press('Enter');
    await expect(table.getByRole('status').last()).toHaveText(`Opened the submission of ${name}`);
  });
});

test.describe('item 4: the admin home', () => {
  test('a card under the page’s h1 is an h2', async ({ page }) => {
    await page.goto(`${ADMIN_ORIGIN}/`);
    await expect(page.getByRole('heading', { level: 1, name: 'Confera' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'API' })).toBeVisible();
    expect(await page.getByRole('heading', { level: 3 }).count()).toBe(0);
  });
});

test.describe('item 6: AppShell, the modal layer and Menu, at 375 px', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('the AppShell drawer is a named modal dialog, Tab stays in it (also in WebKit), and it closes when the view grows past 900 px', async ({ page }) => {
    const problems = watchPage(page);
    await openGallery(page);
    const shell = card(page, 'AppShell');
    const menu = shell.getByRole('button', { name: 'Open navigation' });
    await menu.focus();
    await page.keyboard.press('Enter');
    const drawer = page.getByRole('dialog', { name: 'Navigation' });
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute('aria-modal', 'true');
    await expect(shell.locator('.ud-shell__main')).toHaveAttribute('inert', '');
    // R-07: every Tab keeps the focus in the drawer.
    for (let step = 0; step < 8; step += 1) {
      await page.keyboard.press('Tab');
      // An engine that found no further part leaves the focus nowhere for a moment; the layer then moves it.
      await expect.poll(() => holdsFocus(page, '[data-component="AppShell"] .ud-shell__side'), `Tab ${step + 1} left the drawer`).toBe(true);
    }
    // R-03: a visible close button.
    await drawer.getByRole('button', { name: 'Close navigation' }).click();
    await expect(drawer).toBeHidden();
    await expect(menu).toBeFocused();

    // R-06: open, then the view grows past 900 px.
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeVisible();
    await page.setViewportSize({ width: 1200, height: 812 });
    await expect(shell.locator('.ud-shell__side')).not.toHaveAttribute('role', 'dialog');
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('');
    await expect(shell.locator('.ud-shell__main')).not.toHaveAttribute('inert', '');
    // Tab reaches the content again.
    let reached = false;
    for (let step = 0; step < 12 && !reached; step += 1) {
      await page.keyboard.press('Tab');
      reached = await holdsFocus(page, '[data-component="AppShell"] .ud-shell__main');
    }
    expect(reached, 'Tab reaches the content of the shell').toBe(true);
    expect(problems.messages).toEqual([]);
  });

  test('a drawer whose first part is a link keeps the focus in every engine; Escape gives it back', async ({ page }) => {
    await openGallery(page);
    const opener = card(page, 'Drawer').getByRole('button', { name: 'Open the drawer' });
    await opener.focus();
    await page.keyboard.press('Enter');
    const drawer = page.getByRole('dialog', { name: 'Submission ITEMA-2026-0042' });
    await expect(drawer).toBeVisible();
    for (const shift of [false, true]) {
      for (let step = 0; step < 6; step += 1) {
        await page.keyboard.press(shift ? 'Shift+Tab' : 'Tab');
        await expect.poll(() => holdsFocus(page, '.ud-drawer'), `${shift ? 'Shift+Tab' : 'Tab'} ${step + 1} left the drawer`).toBe(true);
      }
    }
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('a tooltip near the edge of a phone stays inside the view (item 10)', async ({ page }) => {
    await openGallery(page);
    for (const name of ['Copy snippet', 'Help']) {
      const trigger = card(page, 'Tooltip').getByRole('button', { name });
      await trigger.focus();
      const bubble = page.locator(`#${await trigger.getAttribute('aria-describedby')}`);
      await expect.poll(() => bubble.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
      const box = (await bubble.boundingBox())!;
      expect(box.x, `${name}: the bubble starts inside the view`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${name}: the bubble ends inside the view`).toBeLessThanOrEqual(375);
      expect(box.y, `${name}: the bubble is not above the page`).toBeGreaterThanOrEqual(0);
    }
  });

  test('Tab closes an open menu and goes on (R-01)', async ({ page }) => {
    await openGallery(page);
    const trigger = card(page, 'Menu').getByRole('button', { name: 'Row actions' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('menu')).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement !== document.body && !document.activeElement?.closest('[role=menu]'))).toBe(true);
    await expect(trigger).not.toBeFocused();
  });
});

test.describe('items 8, 9, 11 and 12: DateField, PermissionMatrix, FileDropzone, Autocomplete, Switch', () => {
  test('DateField draws one calendar icon: the browser’s own, none of its own', async ({ page, browserName }) => {
    await openGallery(page);
    const field = card(page, 'DateField').locator('.ud-field').first();
    await expect(field.locator('.ud-field__icon')).toHaveCount(0);
    if (browserName === 'chromium') {
      // Chromium's picker button is the one icon; it is shown.
      const shown = await field.locator('input').evaluate((el) => getComputedStyle(el, '::-webkit-calendar-picker-indicator').display);
      expect(shown).not.toBe('none');
    }
  });

  test('the last row of PermissionMatrix has no line under it; a file row keeps its remove button at the right of its line', async ({ page }) => {
    await openGallery(page);
    const lastHeader = card(page, 'PermissionMatrix').locator('tbody tr').last().locator('th');
    expect(await lastHeader.evaluate((el) => getComputedStyle(el).borderBottomWidth)).toBe('0px');

    const row = card(page, 'FileDropzone').locator('.ud-filelist__item', { has: page.locator('.ud-progress') });
    const [box, bar, remove] = await Promise.all([row.boundingBox(), row.locator('.ud-progress').boundingBox(), row.getByRole('button').boundingBox()]);
    expect(remove!.y + remove!.height, 'the button is on the line of the file, above the bar').toBeLessThanOrEqual(bar!.y + 1);
    expect(box!.x + box!.width - (remove!.x + remove!.width), 'the button is at the right of the row').toBeLessThanOrEqual(16);
    // A refused file says why.
    await expect(card(page, 'FileDropzone').locator('.ud-filelist__item.is-error .ud-filelist__error')).toHaveText('Larger than 20 MB: choose a smaller file');
  });

  test('Autocomplete keeps its chosen value on focus; the chevron of the multiple one stays at the right', async ({ page }) => {
    await openGallery(page);
    const country = card(page, 'Autocomplete').getByRole('combobox', { name: 'Country' });
    await country.focus();
    await expect(page.getByRole('listbox', { name: 'Country' })).toBeVisible();
    await expect(country).toHaveValue('Serbia');
    await expect(page.getByRole('listbox', { name: 'Country' }).getByRole('option')).toHaveCount(5);
    await page.keyboard.press('Escape');

    const multi = card(page, 'Autocomplete').locator('.ud-field--multi .ud-field__box');
    const [box, chevron] = await Promise.all([multi.boundingBox(), multi.locator('.ud-field__chevron').boundingBox()]);
    expect(box!.x + box!.width - (chevron!.x + chevron!.width), 'the chevron is at the right of the box').toBeLessThanOrEqual(12);
    expect(chevron!.y).toBeGreaterThanOrEqual(box!.y);
    expect(chevron!.y + chevron!.height).toBeLessThanOrEqual(box!.y + box!.height);
  });

  test('the tracks of a switch differ: white off, brand-orange-strong on', async ({ page }) => {
    await openGallery(page);
    const tracks = card(page, 'Switch').locator('.ud-switch__track');
    const colours = await tracks.evaluateAll((els) => els.map((el) => ({ fill: getComputedStyle(el).backgroundColor, border: getComputedStyle(el).borderTopColor })));
    // The first switch is on, the second off (the gallery's scenario).
    expect(colours[0]).toEqual({ fill: 'rgb(168, 83, 0)', border: 'rgb(168, 83, 0)' });
    expect(colours[1]).toEqual({ fill: 'rgb(255, 255, 255)', border: 'rgb(120, 127, 136)' });
  });
});

// Pictures of the parts 2.3.0 changes, in each engine and on a phone, for the owner and the UI reviewer:
// .artifacts/ds-2-3-0/<engine>/<Component>.png. They are not compared (pnpm ds:visual compares releases).
test('pictures of the changed parts on a phone, for review', async ({ browser, browserName }) => {
  const context = await phone(browser, browserName);
  const page = await context.newPage();
  await openGallery(page);
  const out = join(resolve(fileURLToPath(new URL('..', import.meta.url))), '.artifacts', 'ds-2-3-0', browserName);
  for (const name of ['DateField', 'Switch', 'FileDropzone', 'PermissionMatrix', 'Autocomplete', 'DataTable', 'Alert', 'Breadcrumbs', 'Pagination', 'Stepper', 'Tag', 'Checkbox']) {
    await card(page, name).screenshot({ path: join(out, `${name}.png`), animations: 'disabled' });
  }
  const shell = card(page, 'AppShell');
  await shell.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeVisible();
  await page.screenshot({ path: join(out, 'AppShell-drawer.png'), animations: 'disabled' });
  await context.close();
});
