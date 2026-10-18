// Design system 2.4.0 in a browser (UXUI-M2-03, 04, 22): what jsdom cannot draw. A table on a phone
// is a card per row and does not scroll sideways; the phone menu closes when a link in it is chosen;
// a toggle that is on is seen. The admin screens behind sign-in, so not in WebKit (NO_SESSION_IN_WEBKIT).
import { ADMIN_ORIGIN } from './env';
import { AGAINST_REAL_API, holdsSession, NO_SESSION_IN_WEBKIT, resetStub, signIn, STUB_ONLY, templateId } from './support/admin';
import { expect, test } from './support/fixtures';

test.beforeEach(async ({ page, browserName }) => {
  test.skip(!holdsSession(browserName), NO_SESSION_IN_WEBKIT);
  await resetStub(page);
});

test.describe('at 375 px', () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test('every table is a card per row: each value with its label, nothing cut off at the side', async ({ page }) => {
    // Five screens after one sign-in: 43 s in Firefox against the real API on a quiet machine, past 60 s in a full run.
    test.setTimeout(150_000);
    await signIn(page, undefined, '/users');
    for (const path of ['/users', '/audit', '/mail-log', '/mail-servers', '/conferences']) {
      await page.goto(`${ADMIN_ORIGIN}${path}`);
      const row = page.locator('.ud-table tbody tr').first();
      await expect(row).toBeVisible();
      const area = page.locator('.ud-table__scroll');
      expect(await area.evaluate((el) => el.scrollWidth - el.clientWidth), `${path}: sideways`).toBeLessThanOrEqual(1);
      // A cell after the first carries its header before its value.
      const second = row.locator('td').nth(1);
      expect(await second.evaluate((el) => getComputedStyle(el, '::before').content), path).not.toBe('none');
      expect(await page.locator('.ud-table thead').evaluate((el) => el.getBoundingClientRect().height), path).toBeLessThanOrEqual(1);
    }
  });

  test('the menu closes when a link in it is chosen, and the page it led to has the focus', async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: 'Open navigation' }).click();
    const menu = page.getByRole('dialog', { name: 'Navigation' });
    await expect(menu).toBeVisible();
    await menu.getByRole('link', { name: 'Users' }).click();
    await expect(page).toHaveURL(`${ADMIN_ORIGIN}/users`);
    await expect(page.getByRole('dialog', { name: 'Navigation' })).toHaveCount(0);
    await expect(page.locator('main')).toBeFocused();
  });
});

test('a toggle of the editor that is on draws the ring of a chosen pill (UXUI-M2-22)', async ({ page }) => {
  test.skip(AGAINST_REAL_API, STUB_ONLY);
  await signIn(page, undefined, `/templates/${templateId('invitation', 'en')}`);
  await page.locator('[data-confera-template-body] .ProseMirror p').first().click();
  const bold = page.getByRole('toolbar', { name: 'Formatting' }).getByRole('button', { name: 'Bold' });
  const off = await bold.evaluate((el) => getComputedStyle(el).boxShadow);
  await bold.click();
  await expect(bold).toHaveAttribute('aria-pressed', 'true');
  const on = await bold.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(on).not.toBe(off);
  expect(on).toContain('inset');
});

test('the first Tab stop skips to the content (UXUI-M2-35)', async ({ page }) => {
  await signIn(page);
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
});
