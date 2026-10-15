// M2-FE-01, M2-FE-02 (NFR-A11Y-01): every admin screen scanned for WCAG 2.1 A and AA at 1440 and
// 375 px, signed in through the stub; the pages outside the shell too. One page per test: a scan
// is the expensive step, most of all in WebKit.
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { ADMIN_ORIGIN } from './env';
import { linkToken, resetStub, signIn, STUB } from './support/admin';
import { expect, test } from './support/fixtures';

test.describe.configure({ mode: 'default' });

const scan = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map(
    (v) => `${v.id}: ${v.help} — ${v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | ')}`,
  );

const SCREENS: Array<[string, string]> = [
  ['home', '/'],
  ['users', '/users'],
  ['a user', `/users/${STUB.invited.id}`],
  ['organisation', '/organisation'],
  ['audit log', '/audit'],
  ['my account', '/account'],
];
const OUTSIDE: Array<[string, string]> = [
  ['sign-in', '/sign-in'],
  ['forgot password', '/forgot-password'],
  ['an invitation', `/invitations/${linkToken('invitation')}`],
  ['a reset', `/password-resets/${linkToken('password_reset')}`],
];

for (const width of [1440, 375]) {
  test.describe(`accessibility of the admin, ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const [name, path] of SCREENS) {
      test(name, async ({ page }) => {
        await resetStub(page);
        await signIn(page, STUB.admin, path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        if (path === '/users' || path === '/audit') await expect(page.getByRole('table').locator('tbody tr').first()).toBeVisible();
        expect(await scan(page), `${name} at ${width}px`).toEqual([]);
      });
    }

    for (const [name, path] of OUTSIDE) {
      test(name, async ({ page }) => {
        await resetStub(page);
        await page.goto(`${ADMIN_ORIGIN}${path}`);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        expect(await scan(page), `${name} at ${width}px`).toEqual([]);
      });
    }

    test('the password-again dialog, and the invitation dialog', async ({ page }) => {
      await resetStub(page);
      await signIn(page, STUB.admin, '/users');
      await page.getByRole('button', { name: 'Invite a user' }).first().click();
      await expect(page.getByRole('dialog', { name: 'Invite a user' })).toBeVisible();
      expect(await scan(page), `invite dialog at ${width}px`).toEqual([]);
      await page.getByRole('dialog', { name: 'Invite a user' }).getByLabel('Name').fill('Nova Osoba');
      await page.getByRole('dialog', { name: 'Invite a user' }).getByLabel('Email address').fill('nova.osoba@a.example.test');
      await page.getByRole('dialog', { name: 'Invite a user' }).getByRole('button', { name: 'Send the invitation' }).click();
      await expect(page.getByRole('dialog', { name: 'Your password, once more' })).toBeVisible();
      expect(await scan(page), `password-again dialog at ${width}px`).toEqual([]);
    });
  });
}
