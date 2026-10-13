// The fixtures themselves (e2e/support/fixtures.ts): what local security software adds to a
// page is answered with nothing, in the kind that was asked for, in every context — the one
// a test is handed and the ones it makes itself. A page compared with another page must have
// been treated alike, or the comparison measures the security software and not the application.
import type { BrowserContext, Page } from '@playwright/test';

import { emptyAnswer, expect, isLocalSecuritySoftware, neutraliseLocalSoftware, test } from './support/fixtures';
import { watchPage } from './support/page-problems';

// A name under the host the fixture knows; nothing is ever sent to it: the fixture answers first.
const ADDED = 'http://confera-fixture-test.kaspersky-labs.com';
const PAGE_WITH_ADDITIONS = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>a page the security software changed</title>
<link rel="stylesheet" href="${ADDED}/added.css">
<script src="${ADDED}/added.js"></script>
</head><body><p id="own">text of the page</p><img id="added-picture" alt="" src="${ADDED}/added.gif">
</body></html>`;

async function loadAndInspect(page: Page) {
  const problems = watchPage(page);
  // The page itself comes from a local address of the test, so that its additions are requests like any other.
  await page.route('http://fixture-page.test/', (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGE_WITH_ADDITIONS }));
  await page.goto('http://fixture-page.test/');
  await page.waitForLoadState('load');
  const state = await page.evaluate(() => ({
    sheets: [...document.styleSheets].map((sheet) => {
      try {
        return sheet.cssRules.length;
      } catch {
        return 'unreadable';
      }
    }),
    picture: (document.querySelector('#added-picture') as HTMLImageElement).naturalWidth,
    text: document.querySelector('#own')?.textContent,
  }));
  return { problems, state };
}

function expectNeutralised(result: Awaited<ReturnType<typeof loadAndInspect>>, seen: string[]): void {
  // No engine complains about an answer: not about its kind, not about its content.
  expect(result.problems.messages).toEqual([]);
  // The page is whole, and what was added is empty: a stylesheet without a rule, a picture of one pixel.
  expect(result.state.text).toBe('text of the page');
  expect(result.state.sheets).toHaveLength(1);
  expect([0, 'unreadable']).toContain(result.state.sheets[0]);
  expect(result.state.picture).toBe(1);
  // Each addition was seen and kept apart from the requests of the application.
  expect(seen.map((url) => new URL(url).pathname).sort()).toEqual(['/added.css', '/added.gif', '/added.js']);
  expect(result.problems.requests.filter((url) => isLocalSecuritySoftware(url))).toEqual([]);
}

test.describe('what local security software adds to a page', () => {
  test('is answered with nothing, in the kind that was asked for, in the context a test is handed', async ({ page, injectedByLocalSoftware }) => {
    expectNeutralised(await loadAndInspect(page), injectedByLocalSoftware);
  });

  test('and just the same in a context a test makes itself', async ({ browser }) => {
    const contexts: BrowserContext[] = [];
    try {
      for (const options of [{}, { viewport: { width: 375, height: 700 } }]) {
        const context = await browser.newContext(options);
        contexts.push(context);
        const page = await context.newPage();
        // Nothing is asked of the test: the context was protected when it was made.
        expectNeutralised(await loadAndInspect(page), await neutraliseLocalSoftware(context));
      }
    } finally {
      for (const context of contexts) await context.close();
    }
  });

  test('a request to any other origin is still a request of the page, and is not answered by the fixture', async ({ page }) => {
    const problems = watchPage(page);
    await page.route('http://fixture-page.test/', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>x</title><img alt="" src="http://kaspersky-labs.com.example.test/x.gif"><img alt="" src="http://example.test/kaspersky-labs.com/y.gif">' }),
    );
    // Both look like the known host and are not: they stay requests of the page, to be judged like any other.
    await page.route(/example\.test/, (route) => route.abort('blockedbyclient'));
    await page.goto('http://fixture-page.test/');
    await expect.poll(() => problems.requests.filter((url) => url.includes('example.test')).length).toBe(2);
    expect(problems.requests.filter((url) => url.includes('example.test')).map((url) => isLocalSecuritySoftware(url))).toEqual([false, false]);
  });

  test('the answers by kind', () => {
    expect(emptyAnswer('script')).toMatchObject({ status: 200, contentType: 'text/javascript', body: '' });
    expect(emptyAnswer('stylesheet')).toMatchObject({ status: 200, contentType: 'text/css', body: '' });
    expect(emptyAnswer('image')).toMatchObject({ status: 200, contentType: 'image/gif' });
    expect(emptyAnswer('document')).toMatchObject({ status: 200, contentType: 'text/html' });
    for (const kind of ['fetch', 'xhr', 'font', 'media', 'websocket', 'other']) expect(emptyAnswer(kind)).toEqual({ status: 204, body: '' });
  });
});
