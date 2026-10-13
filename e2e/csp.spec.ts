// ADR-28: "the normal flows run without a policy violation on three engines".
// The baseline policy is report-only in 0.1.0, so a violation breaks nothing
// yet; this test makes sure there is none to fix when it is enforced.
import type { Page } from '@playwright/test';

import { ADMIN_ORIGIN, HARNESS_ORIGIN, PUBLIC_ORIGIN } from './env';
import { buildEmbedSnippet, frameId } from '../packages/embed-loader/src/index';
import { expect, isLocalSecuritySoftware, test } from './support/fixtures';

interface Violation {
  page: string;
  directive: string;
  blocked: string;
  sample: string;
  disposition: string;
}

/** Records every violation the browser reports in every document of the page, frames included. */
async function recordViolations(page: Page): Promise<() => Promise<Violation[]>> {
  await page.addInitScript(() => {
    const store = ((window as unknown as { __violations?: unknown[] }).__violations ??= []);
    document.addEventListener('securitypolicyviolation', (e) => {
      store.push({ page: location.pathname, directive: e.effectiveDirective, blocked: e.blockedURI, sample: e.sample, disposition: e.disposition });
    });
  });
  return async () => {
    const all: Violation[] = [];
    for (const frame of page.frames()) {
      all.push(...(await frame.evaluate(() => (window as unknown as { __violations?: Violation[] }).__violations ?? []).catch(() => [])));
    }
    // What local security software injects into pages is not the application's (support/fixtures.ts).
    return all.filter((v) => !isLocalSecuritySoftware(v.blocked));
  };
}

const PAGES: Array<[string, string, (page: Page) => Promise<void>]> = [
  ['the admin home', `${ADMIN_ORIGIN}/`, async (page) => void (await page.getByRole('heading', { level: 1 }).waitFor())],
  ['the sign-in page', `${ADMIN_ORIGIN}/sign-in`, async (page) => void (await page.getByRole('heading', { level: 1 }).waitFor())],
  ['a page that is not found', `${PUBLIC_ORIGIN}/no-such-page`, async (page) => void (await page.getByRole('heading', { level: 1 }).waitFor())],
  [
    'the hosted form, filled in and sent',
    `${PUBLIC_ORIGIN}/f/spike-abstract`,
    async (page) => {
      await page.getByRole('radio', { name: 'Srpski' }).click();
      await page.getByLabel('Naslov rada').fill('Održivi turizam');
      await page.getByRole('button', { name: 'Dodaj autora' }).click();
      await page.getByRole('button', { name: 'Pošalji apstrakt' }).click();
      await page.locator('.ud-alert--error').waitFor();
    },
  ],
  [
    'the gallery with a dialog, a menu and a toast',
    `${PUBLIC_ORIGIN}/dev/gallery`,
    async (page) => {
      await page.locator('[data-hydrated="true"]').waitFor({ timeout: 60_000 });
      await page.getByRole('button', { name: 'Open the dialog' }).click();
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Row actions' }).click();
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Show a toast' }).click();
      await page.locator('.ud-toast').waitFor();
    },
  ],
];

for (const [name, url, use] of PAGES) {
  test(`no policy violation: ${name}`, async ({ page }) => {
    const violations = await recordViolations(page);
    await page.goto(url);
    await use(page);
    await page.waitForTimeout(300);
    expect(await violations()).toEqual([]);
  });
}

test('no policy violation: the form inside the frame of a conference site', async ({ page }) => {
  const violations = await recordViolations(page);
  const snippet = buildEmbedSnippet({ publicOrigin: PUBLIC_ORIGIN, slug: 'spike-abstract', title: 'Abstract submission', linkText: 'Open the form' });
  await page.goto(`${HARNESS_ORIGIN}/hostile.html?paste=${Buffer.from(snippet, 'utf8').toString('base64url')}`);
  await page.locator(`#${frameId('spike-abstract')}`).scrollIntoViewIfNeeded();
  const frame = page.frameLocator(`#${frameId('spike-abstract')}`);
  await frame.getByRole('button', { name: 'Add author' }).click();
  await frame.getByRole('button', { name: 'Send abstract' }).click();
  await frame.locator('.ud-alert--error').waitFor();
  expect((await violations()).filter((v) => v.page.startsWith('/embed/'))).toEqual([]);
});

test('the recorder does see a violation when there is one', async ({ page }) => {
  const violations = await recordViolations(page);
  await page.goto(`${ADMIN_ORIGIN}/sign-in`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  // An inline script without the nonce: exactly what the policy is there to stop.
  await page.evaluate(() => {
    const script = document.createElement('script');
    script.textContent = 'window.__planted = 1';
    document.head.append(script);
  });
  await expect.poll(async () => (await violations()).map((v) => `${v.directive} ${v.blocked} ${v.disposition}`)).toContain('script-src-elem inline report');
});
