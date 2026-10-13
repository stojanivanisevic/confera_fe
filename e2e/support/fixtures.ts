// The `test` every browser spec uses.
//
// Security software on a developer's machine can change pages on their way to
// the browser. On the machine these tests were written on, the antivirus adds
// a <script> from its own host to every page that is loaded over plain HTTP in
// Chromium and Firefox. That script is not sent by the application (the test
// "what local security software adds is not sent by the application" proves
// it from the server's own bytes), but it would run foreign code inside the
// pages under test and show up as a request to another origin.
//
// This fixture answers such requests with an empty script, so that no foreign
// code runs in a page under test, and records them apart from the requests of
// the application. The list is short and explicit on purpose: every other
// request to another origin still fails the tests.
//
// It is also the only way a spec gets a browser. Chromium is never started
// with the profile the test runner would make for it: on Windows the full
// Chromium build tries to log on to the developer's account when its profile
// is empty (./os-isolation.ts tells the story). The `browser` fixture below
// starts Chromium on an isolated profile of our own and checks, before and
// after, that the account was left alone. A spec must take `test` from this
// file, never from '@playwright/test' (tests/os-isolation.test.ts holds that).
import { test as base, expect, type BrowserContext } from '@playwright/test';

import {
  assertWindowsAccountUntouched,
  attachVirtualAuthenticator,
  createIsolatedChromiumProfile,
  removeIsolatedChromiumProfile,
} from './os-isolation';

/** Hosts that local security software injects into pages. Not part of the application. */
export const LOCAL_SECURITY_SOFTWARE_HOSTS: readonly RegExp[] = [/^[a-z0-9.-]+\.kaspersky-labs\.com$/i];

export function isLocalSecuritySoftware(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return LOCAL_SECURITY_SOFTWARE_HOSTS.some((pattern) => pattern.test(host));
  } catch {
    return false;
  }
}

async function neutralise(context: BrowserContext, seen: string[]): Promise<void> {
  await context.route(
    (url) => isLocalSecuritySoftware(url.href),
    async (route) => {
      seen.push(route.request().url());
      await route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
    },
  );
}

export const test = base.extend<{ injectedByLocalSoftware: string[]; virtualAuthenticator: void }>({
  // Replaces the runner's own `browser`. Firefox and WebKit start as the runner starts them.
  // Chromium starts on an isolated profile (launchPersistentContext is the only call that
  // accepts a profile directory); the contexts of the tests are created in that browser as before.
  browser: [
    async ({ playwright, browserName, channel, headless, launchOptions }, use) => {
      if (browserName !== 'chromium') {
        const other = await playwright[browserName].launch();
        await use(other);
        await other.close({ reason: 'Test ended.' });
        return;
      }
      assertWindowsAccountUntouched('before starting Chromium');
      const profile = createIsolatedChromiumProfile();
      const persistent = await playwright.chromium
        .launchPersistentContext(profile, {
          ...launchOptions,
          ...(channel === undefined ? {} : { channel }),
          ...(headless === undefined ? {} : { headless }),
        })
        .catch((error: unknown) => {
          removeIsolatedChromiumProfile(profile);
          throw error;
        });
      const chromium = persistent.browser();
      if (chromium) await use(chromium);
      // What follows runs when the worker is done with the browser, whatever its tests did.
      await persistent.close();
      removeIsolatedChromiumProfile(profile);
      assertWindowsAccountUntouched('after a Chromium worker finished');
      if (!chromium) throw new Error('Chromium started on the isolated profile did not expose its browser.');
    },
    { scope: 'worker', timeout: 0 },
  ],
  injectedByLocalSoftware: [
    async ({ context }, use) => {
      const seen: string[] = [];
      await neutralise(context, seen);
      await use(seen);
    },
    { auto: true },
  ],
  // A WebAuthn request in a page under test is answered by a virtual authenticator, never by the operating system.
  virtualAuthenticator: [
    async ({ context }, use) => {
      const problems = await attachVirtualAuthenticator(context);
      await use();
      expect(problems, 'every page got its virtual authenticator').toEqual([]);
    },
    { auto: true },
  ],
});

/** For contexts a test creates itself (other viewport, other options): the same two protections as the `context` fixture. */
export async function neutraliseLocalSoftware(context: BrowserContext): Promise<string[]> {
  const seen: string[] = [];
  await neutralise(context, seen);
  await attachVirtualAuthenticator(context);
  return seen;
}

export { expect };
