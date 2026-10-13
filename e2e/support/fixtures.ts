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
import { test as base, expect, type BrowserContext } from '@playwright/test';

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

export const test = base.extend<{ injectedByLocalSoftware: string[] }>({
  injectedByLocalSoftware: [
    async ({ context }, use) => {
      const seen: string[] = [];
      await neutralise(context, seen);
      await use(seen);
    },
    { auto: true },
  ],
});

/** For contexts a test creates itself (other viewport, other options). */
export async function neutraliseLocalSoftware(context: BrowserContext): Promise<string[]> {
  const seen: string[] = [];
  await neutralise(context, seen);
  return seen;
}

export { expect };
