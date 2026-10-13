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
// This fixture answers such requests with nothing, in the kind that was asked
// for (an empty script for a script, an empty stylesheet for a stylesheet: the
// software adds both), so that no foreign code runs in a page under test and no
// engine complains about the answer; and it records them apart from the requests
// of the application. The list of hosts is short and explicit on purpose: every
// other request to another origin still fails the tests.
//
// Every context is protected, also one a spec creates itself with
// `browser.newContext()`: the browser the specs get makes its contexts through
// `protect` below. A page compared with another page must have been treated
// alike, or the comparison measures the security software and not the application.
//
// It is also the only way a spec gets a browser. Chromium is never started
// with the profile the test runner would make for it: on Windows the full
// Chromium build tries to log on to the developer's account when its profile
// is empty (./os-isolation.ts tells the story). The `browser` fixture below
// starts Chromium on an isolated profile of our own and checks, before and
// after, that the account was left alone; and it starts no browser at all once
// the guard has tripped, also in a run that is already under way. A spec must
// take `test` from this file, never from '@playwright/test'
// (tests/os-isolation.test.ts holds that).
import { test as base, expect, type Browser, type BrowserContext, type PlaywrightWorkerArgs, type PlaywrightWorkerOptions } from '@playwright/test';

import {
  assertWindowsAccountUntouched,
  attachVirtualAuthenticator,
  createIsolatedChromiumProfile,
  refuseIfGuardTripped,
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

/** The smallest picture there is: one transparent pixel. */
const EMPTY_GIF = Buffer.from('R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==', 'base64');

/**
 * What a request of the security software is answered with: nothing, in the kind that was
 * asked for. An empty script served as a stylesheet (or the other way round) makes an engine
 * write an error to the console, which the tests would read as an error of the application.
 */
export function emptyAnswer(resourceType: string): { status: number; contentType?: string; body: string | Buffer } {
  switch (resourceType) {
    case 'script':
      return { status: 200, contentType: 'text/javascript', body: '' };
    case 'stylesheet':
      return { status: 200, contentType: 'text/css', body: '' };
    case 'image':
      return { status: 200, contentType: 'image/gif', body: EMPTY_GIF };
    case 'document':
      return { status: 200, contentType: 'text/html', body: '<!doctype html><title></title>' };
    default:
      // A call from a script, a font, anything else: "no content".
      return { status: 204, body: '' };
  }
}

async function neutralise(context: BrowserContext, seen: string[]): Promise<void> {
  await context.route(
    (url) => isLocalSecuritySoftware(url.href),
    async (route) => {
      seen.push(route.request().url());
      await route.fulfill(emptyAnswer(route.request().resourceType()));
    },
  );
}

interface Protection {
  /** Requests of local security software that were answered with nothing. */
  readonly seen: string[];
  /** Pages that did not get their virtual authenticator. Must stay empty. */
  readonly authenticatorProblems: string[];
}
const protections = new WeakMap<BrowserContext, Promise<Protection>>();

/** The two protections of a context: local security software neutralised, WebAuthn kept away from the operating system. Once per context, whoever asks. */
function protect(context: BrowserContext): Promise<Protection> {
  let protection = protections.get(context);
  if (!protection) {
    const seen: string[] = [];
    protection = (async () => {
      await neutralise(context, seen);
      // The list the authenticator keeps for the life of the context: a page opened later is added to it.
      return { seen, authenticatorProblems: await attachVirtualAuthenticator(context) };
    })();
    protections.set(context, protection);
  }
  return protection;
}

/** Makes every context of this browser a protected one, whoever creates it: the `context` fixture or a spec. */
function protectEveryContext(browser: Browser): Browser {
  const create = browser.newContext.bind(browser);
  browser.newContext = async (options) => {
    const context = await create(options);
    await protect(context);
    return context;
  };
  return browser;
}

/** What the runner gives the `browser` fixture. */
export type BrowserStart = Pick<PlaywrightWorkerArgs & PlaywrightWorkerOptions, 'playwright' | 'browserName' | 'channel' | 'headless' | 'launchOptions'>;

/**
 * The `browser` of a worker. Replaces the runner's own. Firefox and WebKit start as the runner
 * starts them. Chromium starts on an isolated profile (launchPersistentContext is the only call
 * that accepts a profile directory); the contexts of the tests are created in that browser as before.
 *
 * It is a function of its own so that tests/os-isolation-fixture.test.ts can hold, without a
 * browser, what it does before it starts one.
 */
export async function startBrowser({ playwright, browserName, channel, headless, launchOptions }: BrowserStart, provide: (browser: Browser) => Promise<void>): Promise<void> {
  // Global setup reads the "switched off" marker once, before the first worker. A run that is
  // already under way has many more browsers to start (a new worker after every failed test):
  // each of them looks again, so that nothing is started any more once the guard has tripped,
  // also after the count has gone back to zero because the developer unlocked the screen.
  refuseIfGuardTripped();
  if (browserName !== 'chromium') {
    const other = await playwright[browserName].launch();
    await provide(protectEveryContext(other));
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
  if (chromium) await provide(protectEveryContext(chromium));
  // What follows runs when the worker is done with the browser, whatever its tests did.
  await persistent.close();
  removeIsolatedChromiumProfile(profile);
  assertWindowsAccountUntouched('after a Chromium worker finished');
  if (!chromium) throw new Error('Chromium started on the isolated profile did not expose its browser.');
}

export const test = base.extend<{ injectedByLocalSoftware: string[]; virtualAuthenticator: void }>({
  browser: [startBrowser, { scope: 'worker', timeout: 0 }],
  injectedByLocalSoftware: [
    async ({ context }, use) => {
      await use((await protect(context)).seen);
    },
    { auto: true },
  ],
  // A WebAuthn request in a page under test is answered by a virtual authenticator, never by the operating system.
  virtualAuthenticator: [
    async ({ context }, use) => {
      const { authenticatorProblems } = await protect(context);
      await use();
      expect(authenticatorProblems, 'every page got its virtual authenticator').toEqual([]);
    },
    { auto: true },
  ],
});

/**
 * The requests of local security software in a context a test created itself. Such a context
 * is protected already (see `protectEveryContext`); calling this is harmless and gives the list.
 */
export async function neutraliseLocalSoftware(context: BrowserContext): Promise<string[]> {
  return (await protect(context)).seen;
}

export { expect };
