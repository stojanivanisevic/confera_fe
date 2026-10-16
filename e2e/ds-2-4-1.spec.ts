// Design system 2.4.1 in a browser (UXUI-M2-41): an Alert with an action does not squeeze its text. At
// 375 px the action goes on a line of its own under the text; at 1440 px it stays beside it. In the
// gallery (no session needed), so in all three engines; and the notices of an invitation (UXUI-M2-42).
import type { Page } from '@playwright/test';

import { PUBLIC_ORIGIN } from './env';
import { AGAINST_REAL_API, answerPasswordAgain, holdsSession, NO_SESSION_IN_WEBKIT, resetStub, signIn, STUB, STUB_ONLY } from './support/admin';
import { expect, test } from './support/fixtures';

async function sendLimitAlert(page: Page) {
  await page.goto(`${PUBLIC_ORIGIN}/dev/gallery`);
  await expect(page.locator('[data-confera-dev="gallery"]')).toHaveAttribute('data-hydrated', 'true', { timeout: 60_000 });
  const alert = page.locator('.ud-alert', { hasText: 'The send limit is close' }).first();
  await alert.scrollIntoViewIfNeeded();
  return alert;
}

const boxes = (page: Page, alert: ReturnType<Page['locator']>) =>
  alert.evaluate((el) => {
    const body = el.querySelector('.ud-alert__body')!.getBoundingClientRect();
    const action = el.querySelector('.ud-alert__action')!.getBoundingClientRect();
    return { bodyWidth: body.width, bodyTop: body.top, bodyBottom: body.bottom, actionTop: action.top, alertWidth: el.getBoundingClientRect().width };
  });

test.describe('at 375 px', () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test('the text keeps a readable width: beside a short action, or above a long one', async ({ page }) => {
    const alert = await sendLimitAlert(page);
    const at = await boxes(page, alert);
    // Before 2.4.1 the text was a column of about 90 px.
    expect(at.bodyWidth).toBeGreaterThanOrEqual(200);
  });

  test('a long action goes on a line of its own under the text', async ({ page, browserName }) => {
    test.skip(!holdsSession(browserName), NO_SESSION_IN_WEBKIT);
    test.skip(AGAINST_REAL_API, STUB_ONLY);
    await resetStub(page);
    await signIn(page, undefined, '/account');
    // The banner of a session that ended has a link and a button beside its text.
    await page.evaluate(() => window.dispatchEvent(new Event('confera:session-ended')));
    const banner = page.locator('[data-confera-session-ended] .ud-alert');
    await expect(banner).toBeVisible();
    const at = await boxes(page, banner);
    expect(at.actionTop).toBeGreaterThanOrEqual(at.bodyBottom - 1);
    expect(at.bodyWidth).toBeGreaterThanOrEqual(200);
  });
});

test.describe('at 1440 px', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('a wide Alert keeps the action beside the text', async ({ page }) => {
    const alert = await sendLimitAlert(page);
    const at = await boxes(page, alert);
    if (at.alertWidth >= 480) expect(at.actionTop).toBeLessThan(at.bodyBottom);
  });
});

// UXUI-M2-42 at a phone's width: right after an invitation the toast and the page say "saved", and the page
// says "sent" once the API does; the notices on the page keep their text readable (UXUI-M2-41).
test.describe('an invitation at 375 px', () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test('saved first, sent once the API says so, each notice readable', async ({ page, browserName }) => {
    test.skip(!holdsSession(browserName), NO_SESSION_IN_WEBKIT);
    test.skip(AGAINST_REAL_API, STUB_ONLY);
    await resetStub(page);
    await signIn(page, undefined, '/users');
    await page.getByRole('button', { name: 'Invite a user' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Invite a user' });
    await dialog.getByLabel('Name').fill('Mobilna Osoba');
    await dialog.getByLabel('Email address').fill('mobilna.osoba@a.example.test');
    await dialog.getByRole('button', { name: 'Send the invitation' }).click();
    await answerPasswordAgain(page, STUB.admin.password);
    await expect(page.locator('.ud-toast')).toContainText('Invitation to mobilna.osoba@a.example.test saved. It goes out in a moment.');
    const saved = page.locator('.ud-alert', { hasText: 'The invitation is saved and goes out in a moment.' });
    await expect(saved).toBeVisible();
    await expect(page.locator('.ud-alert', { hasText: 'The invitation was sent to mobilna.osoba@a.example.test.' })).toBeVisible({ timeout: 15_000 });
    for (const notice of await page.locator('main .ud-alert').all()) {
      const width = await notice.evaluate((el) => el.querySelector('.ud-alert__body')!.getBoundingClientRect().width);
      expect(width).toBeGreaterThan(200);
    }
  });
});
