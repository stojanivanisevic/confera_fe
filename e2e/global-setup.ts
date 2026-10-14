// Runs once before any browser test (both Playwright configurations).
//
// On Windows it proves, with one Chromium and before any worker starts, that
// a browser started the way the tests start it does not touch the account
// (e2e/support/os-isolation.ts). If the proof fails, the run stops here: at
// most one bad password, and no later run until a person has looked.
import { chromium } from '@playwright/test';

import {
  assertWindowsAccountUntouched,
  createIsolatedChromiumProfile,
  recordBadPasswordBaseline,
  refuseIfGuardTripped,
  removeIsolatedChromiumProfile,
} from './support/os-isolation';
import { assertRealApiReady } from './support/real-api';

// The kinds of field that make Chromium's password manager and autofill look at a page.
const CANARY_PAGE = `<!doctype html><meta charset="utf-8"><title>canary</title>
<form action="about:blank" method="post">
  <input id="user" name="username" autocomplete="username">
  <input id="pass" name="password" type="password" autocomplete="current-password">
  <input id="card" name="cardnumber" autocomplete="cc-number">
  <button>Sign in</button>
</form>`;

const CANARY_WAIT_MS = 5_000;

export default async function globalSetup(): Promise<void> {
  refuseIfGuardTripped();
  // The cross-repo smoke test: a real API that was named must be there before a browser is started.
  await assertRealApiReady();
  if (process.platform !== 'win32') return;

  const baseline = recordBadPasswordBaseline();
  if (baseline === null) {
    console.warn(
      'The bad-password count of the Windows account could not be read, so the guard is off for this run. The isolated Chromium profile is still used.',
    );
    return;
  }

  const profile = createIsolatedChromiumProfile();
  try {
    const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true });
    try {
      const page = context.pages()[0] ?? (await context.newPage());
      await page.setContent(CANARY_PAGE);
      await page.locator('#user').fill('author@example.test');
      await page.locator('#pass').fill('not-a-real-password');
      await page.locator('#card').fill('4111 1111 1111 1111');
      await page.locator('#pass').focus();
      await page.waitForTimeout(CANARY_WAIT_MS);
    } finally {
      await context.close();
    }
  } finally {
    removeIsolatedChromiumProfile(profile);
  }
  assertWindowsAccountUntouched('after the canary launch of Chromium, before any test');
  console.log(`Account guard: the canary Chromium ran on an isolated profile; the bad-password count of the Windows account did not rise (${String(baseline)} before).`);
}
