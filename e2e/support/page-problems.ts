import type { ConsoleMessage, Page, Request } from '@playwright/test';

import { isLocalSecuritySoftware } from './fixtures';

export interface PageProblems {
  /** console.error and console.warning messages, uncaught errors and failed requests. */
  readonly messages: string[];
  /** Every request of the page (what local security software adds is kept apart, see fixtures.ts). */
  readonly requests: string[];
  /** Content-security-policy violations the browser reported (report-only ones included). */
  readonly violations: string[];
}

// Notes a browser writes about its own behaviour. They say that third-party cookies and storage are
// blocked in this configuration, which is what the tests ask for; they are not errors of the page.
const BROWSER_NOTICES = [
  /has been rejected as third-party/, // Firefox, for every request of a third-party frame
  /Request to access cookie or storage on .* was blocked/, // Firefox, when a frame reaches for storage
  /Layout was forced before the page was fully loaded/, // Firefox, when a test measures early
  /Partitioned cookie or storage access was provided/, // Firefox
  // WebKit, on every page while the baseline policy is report-only and no report address exists yet
  // (an open point of 0.1.0: the address needs a route in the API).
  /was delivered in report-only mode, but does not specify a 'report-(?:uri|to)'/,
];

/** Starts recording what must not happen on a page. Call it before the page is loaded. */
export function watchPage(page: Page): PageProblems {
  const messages: string[] = [];
  const requests: string[] = [];
  const violations: string[] = [];
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() !== 'error' && message.type() !== 'warning') return;
    if (isLocalSecuritySoftware(message.location().url)) return;
    if (BROWSER_NOTICES.some((notice) => notice.test(message.text()))) return;
    messages.push(`console.${message.type()}: ${message.text()} (${message.location().url})`);
  });
  page.on('pageerror', (error) => messages.push(`pageerror: ${error.message}`));
  page.on('request', (request: Request) => {
    if (!isLocalSecuritySoftware(request.url())) requests.push(request.url());
  });
  page.on('requestfailed', (request: Request) => {
    const reason = request.failure()?.errorText ?? '';
    // A navigation that replaces the page aborts its pending requests; that is not a failure.
    if (/ERR_ABORTED|NS_BINDING_ABORTED|cancelled|Load request cancelled/i.test(reason)) return;
    if (isLocalSecuritySoftware(request.url())) return;
    messages.push(`requestfailed: ${request.url()} ${reason}`);
  });
  return { messages, requests, violations };
}

/** The origins a list of request URLs went to (data: and blob: URLs are not requests to an origin). */
export function originsOf(urls: readonly string[]): string[] {
  const origins = new Set<string>();
  for (const url of urls) {
    if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:')) continue;
    origins.add(new URL(url).origin);
  }
  return [...origins].sort();
}
