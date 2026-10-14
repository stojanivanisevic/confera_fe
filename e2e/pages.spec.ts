// The pages of 0.1.0 outside the gallery: the admin home with its typed call to
// /api/v1/meta (M1-FE-05), sign-in, "not found" and the hosted form, each
// scanned for WCAG 2.1 A and AA (NFR-A11Y-01) at 1440 and 375 px.
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { ADMIN_ORIGIN, PUBLIC_ORIGIN } from './env';
import { expect, test } from './support/fixtures';
import { watchPage } from './support/page-problems';

const scan = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map(
    (v) => `${v.id}: ${v.help} — ${v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | ')}`,
  );

test.describe('the admin home and the API (M1-FE-05)', () => {
  test('shows name and version of the API, from the typed call through the forward', async ({ page }) => {
    const problems = watchPage(page);
    await page.goto(`${ADMIN_ORIGIN}/`);
    await expect(page.getByRole('heading', { level: 1, name: 'Confera' })).toBeVisible();
    await expect(page.getByText('Connected')).toBeVisible();
    const row = (label: string) => page.locator('.ud-dl__row', { has: page.locator('dt', { hasText: label }) }).locator('dd');
    await expect(row('Service')).toHaveText('confera-api');
    await expect(row('Version')).toHaveText(/^\d+\.\d+\.\d+/);
    await expect(row('Contract of this build')).toHaveText(await row('Version').innerText());
    // The call went to the page's own origin: there is no cross-origin API call (ADR-02).
    expect(problems.requests.filter((url) => url.includes('/api/'))).toEqual([`${ADMIN_ORIGIN}/api/v1/meta`]);
    expect(problems.messages).toEqual([]);
  });

  test('stops on another major version of the API', async ({ page }) => {
    await page.route('**/api/v1/meta', (route) => route.fulfill({ json: { name: 'confera-api', version: '9.0.0' } }));
    await page.goto(`${ADMIN_ORIGIN}/`);
    await expect(page.locator('.ud-alert--error')).toContainText('different versions');
    await expect(page.locator('.ud-alert--error')).toContainText('9.0.0');
    await expect(page.getByText('Connected')).toHaveCount(0);
  });

  test('says so when the API does not answer', async ({ page }) => {
    await page.route('**/api/v1/meta', (route) => route.fulfill({ status: 502, contentType: 'application/problem+json', json: { status: 502, code: 'api_unreachable' } }));
    await page.goto(`${ADMIN_ORIGIN}/`);
    await expect(page.locator('.ud-alert--warning')).toContainText('The API does not answer');
  });
});

for (const width of [1440, 375]) {
  test.describe(`accessibility of the pages, ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    // One page, or one state of the form, per test. A scan is the expensive step, most of all in
    // WebKit; a test that made three or four of them had no room left on a busy machine.
    test('admin home', async ({ page }) => {
      await page.goto(`${ADMIN_ORIGIN}/`);
      await expect(page.getByText('Connected')).toBeVisible();
      expect(await scan(page), 'admin home').toEqual([]);
    });

    test('sign-in', async ({ page }) => {
      await page.goto(`${ADMIN_ORIGIN}/sign-in`);
      await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
      expect(await scan(page), 'sign-in').toEqual([]);
    });

    test('"not found"', async ({ page }) => {
      await page.goto(`${PUBLIC_ORIGIN}/no-such-page`);
      await expect(page.getByText('This address does not exist')).toBeVisible();
      expect(await scan(page), 'not found').toEqual([]);
    });

    const openForm = async (page: Page) => {
      const problems = watchPage(page);
      await page.goto(`${PUBLIC_ORIGIN}/f/spike-abstract`);
      await page.locator('[data-confera-form][data-hydrated="true"]').waitFor(); // typing before the form is attached would not be seen
      await expect(page.getByRole('heading', { level: 1, name: 'Abstract submission' })).toBeVisible();
      return problems;
    };
    /** A second author, and a try to send the form as it is: the errors show. */
    const sendEmpty = async (page: Page) => {
      await page.getByRole('button', { name: 'Add author' }).click();
      await page.getByRole('button', { name: 'Send abstract' }).click();
      await expect(page.locator('.ud-alert--error')).toBeVisible();
    };
    const fitsTheWidth = async (page: Page) => (width === 375 ? await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth) : true);

    test('the hosted form: empty, and with errors', async ({ page }) => {
      const problems = await openForm(page);
      expect(await scan(page), 'empty form').toEqual([]);

      await sendEmpty(page);
      // Each error is tied to its field.
      await expect(page.getByLabel('Title of the paper')).toHaveAttribute('aria-invalid', 'true');
      await expect(page.getByLabel('Title of the paper')).toHaveAccessibleDescription('Enter the title of the paper');
      expect(await scan(page), 'form with errors').toEqual([]);
      expect(problems.messages).toEqual([]);
      expect(await fitsTheWidth(page)).toBe(true);
    });

    test('the hosted form: in Serbian with its errors, and after sending', async ({ page }) => {
      const problems = await openForm(page);
      await sendEmpty(page);

      await page.getByRole('radio', { name: 'Srpski' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Prijava apstrakta' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Ukloni autora 2' })).toBeVisible();
      expect(await scan(page), 'form in Serbian').toEqual([]);

      await page.getByLabel('Naslov rada').fill('Održivi turizam na Balkanu');
      await page.getByLabel('Ime i prezime autora 1').fill('Marta Kovač');
      await page.getByLabel('Imejl autora 1').fill('marta@example.test');
      await page.getByLabel('Ime i prezime autora 2').fill('Đorđe Šćepanović');
      await page.getByText('Prihvatam uslove objavljivanja').click();
      await page.getByRole('button', { name: 'Pošalji apstrakt' }).click();
      await expect(page.locator('.ud-alert--success')).toContainText('Hvala');
      expect(await scan(page), 'thank-you').toEqual([]);
      expect(problems.messages).toEqual([]);
      expect(await fitsTheWidth(page)).toBe(true);
    });

    test('the draft stays in the tab: what was typed is there after a reload', async ({ page }) => {
      await page.goto(`${PUBLIC_ORIGIN}/f/spike-abstract`);
      await page.locator('[data-confera-form][data-hydrated="true"]').waitFor(); // typing before the form is attached would not be seen
      await page.getByLabel('Title of the paper').fill('Šta đaci čitaju');
      await page.getByLabel('Abstract').fill('Prva druga treća');
      await expect(page.getByText('3 of 300 words')).toBeVisible();
      await page.reload();
      await page.locator('[data-confera-form][data-hydrated="true"]').waitFor();
      await expect(page.getByLabel('Title of the paper')).toHaveValue('Šta đaci čitaju');
      await expect(page.getByLabel('Abstract')).toHaveValue('Prva druga treća');
    });
  });
}
