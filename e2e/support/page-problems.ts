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

/** Starts recording what must not happen on a page. Call it before the page is loaded. */
export function watchPage(page: Page): PageProblems {
  const messages: string[] = [];
  const requests: string[] = [];
  const violations: string[] = [];
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() !== 'error' && message.type() !== 'warning') return;
    if (isLocalSecuritySoftware(message.location().url)) return;
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
