// M2-FE-01 to M2-FE-05 (NFR-A11Y-01): every admin screen scanned for WCAG 2.1 A and AA at 1440 and
// 375 px, signed in through the stub; the pages outside the shell too. One page per test: a scan
// is the expensive step, most of all in WebKit.
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { ADMIN_ORIGIN } from './env';
import { holdsSession, linkToken, NO_SESSION_IN_WEBKIT, PART_B, resetStub, signIn, STUB, templateId } from './support/admin';
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
  ['conferences', '/conferences'],
  ['a conference', `/conferences/${PART_B.ids.conference}`],
  ['mail servers', '/mail-servers'],
  ['a mail server', `/mail-servers/${PART_B.ids.server}`],
  ['a new mail server', '/mail-servers/new'],
  ['mail log', '/mail-log'],
  ['a mail log entry', `/mail-log/${PART_B.ids.hostileEntry}`],
  ['email templates', '/templates'],
  ['the template editor', `/templates/${templateId('security_notice', 'en')}`],
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
      test(name, async ({ page, browserName }) => {
        test.skip(!holdsSession(browserName), NO_SESSION_IN_WEBKIT);
        await resetStub(page);
        await signIn(page, STUB.admin, path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        if (['/users', '/audit', '/conferences', '/mail-servers', '/mail-log', '/templates'].includes(path)) await expect(page.getByRole('table').locator('tbody tr').first()).toBeVisible();
        if (path.startsWith('/templates/')) await expect(page.locator('[data-confera-template-body] [data-placeholder]').first()).toBeVisible();
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

    test('the password-again dialog, and the invitation dialog', async ({ page, browserName }) => {
      test.skip(!holdsSession(browserName), NO_SESSION_IN_WEBKIT);
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
