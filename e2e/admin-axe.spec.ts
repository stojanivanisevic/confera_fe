// M2-FE-01 to M2-FE-05 (NFR-A11Y-01): every admin screen scanned for WCAG 2.1 A and AA at 1440 and
// 375 px, signed in through the stub; the pages outside the shell too. One page per test: a scan
// is the expensive step, most of all in WebKit.
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { ADMIN_ORIGIN } from './env';
import { ADMIN, AGAINST_REAL_API, holdsSession, linkToken, NO_SESSION_IN_WEBKIT, PART_B, resetStub, signIn, STUB, STUB_ONLY, templateId } from './support/admin';
import { expect, test } from './support/fixtures';

test.describe.configure({ mode: 'default' });

// The sandboxed frame of stored markup (a mail-log body, a template preview; ST-28) runs no script,
// so axe cannot run inside it (Chromium waits for it until the test times out): it is left out.
// What is inside is the message as it was sent, not the page; the spec of part B checks that the
// frame has its title and its empty sandbox.
const scan = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('iframe[sandbox]').analyze()).violations.map(
    (v) => `${v.id}: ${v.help} — ${v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | ')}`,
  );

// A screen of one record of the stub's fixture (third entry true) has no such record behind a real API: there it is skipped (STUB_ONLY).
const SCREENS: Array<[string, string, boolean?]> = [
  ['home', '/'],
  ['users', '/users'],
  ['a user', `/users/${STUB.invited.id}`, true],
  ['organisation', '/organisation'],
  ['audit log', '/audit'],
  ['my account', '/account'],
  ['conferences', '/conferences'],
  ['a conference', `/conferences/${PART_B.ids.conference}`, true],
  ['mail servers', '/mail-servers'],
  ['a mail server', `/mail-servers/${PART_B.ids.server}`, true],
  ['a new mail server', '/mail-servers/new'],
  ['mail log', '/mail-log'],
  ['a mail log entry', `/mail-log/${PART_B.ids.hostileEntry}`, true],
  ['email templates', '/templates'],
  ['the template editor', `/templates/${templateId('security_notice', 'en')}`, true],
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

    for (const [name, path, stubOnly] of SCREENS) {
      test(name, async ({ page, browserName }) => {
        test.skip(!holdsSession(browserName), NO_SESSION_IN_WEBKIT);
        test.skip(AGAINST_REAL_API && stubOnly === true, STUB_ONLY);
        await resetStub(page);
        await signIn(page, ADMIN, path);
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
      await signIn(page, ADMIN, '/users');
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
