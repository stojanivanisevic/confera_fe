// M1-FE-02 (spike), the strict variant: the gallery served by `next dev`.
// In development mode React compares the server markup with the first client
// render in full, attributes included, and reports every difference in the
// console. A production build would stay silent about most of them.
import { expect, test } from './support/fixtures';

import { COMPONENT_NAMES } from '../packages/ui/src/generated/manifest';
import { watchPage } from './support/page-problems';

test('development mode: all components hydrate under React 19 without a warning', async ({ page }) => {
  test.setTimeout(180_000); // the first request compiles the page
  const problems = watchPage(page);
  await page.goto('/dev/gallery', { timeout: 150_000 });
  await expect(page.locator('[data-confera-dev="gallery"]')).toHaveAttribute('data-hydrated', 'true', { timeout: 60_000 });
  await expect(page.locator('[data-confera-dev="gallery-card"]')).toHaveCount(COMPONENT_NAMES.length);

  // This really is React's development build.
  const reactMode = await page.evaluate(() => {
    const hook = (window as unknown as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown }).__REACT_DEVTOOLS_GLOBAL_HOOK__;
    return { nextDev: Boolean(document.querySelector('script[src*="/_next/static/chunks/"]')), hook: typeof hook };
  });
  expect(reactMode.nextDev).toBe(true);

  // Give late effects and the development overlay a moment to report.
  await page.waitForTimeout(1500);
  const hydration = problems.messages.filter((m) => /hydrat|did not match|server rendered|Warning:/i.test(m));
  expect(hydration, 'hydration warnings').toEqual([]);
  expect(problems.messages.filter((m) => !/\[HMR\]|Fast Refresh|webpack-hmr|turbopack-hmr/i.test(m))).toEqual([]);
});
