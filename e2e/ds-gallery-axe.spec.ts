// M1-FE-03 and M1-FE-06: the automated accessibility scan of the gallery
// (NFR-A11Y-01): WCAG 2.1 level A and AA, zero violations, at 1440 and 375 px,
// in the resting state and with every overlay open. Contrast is part of it:
// the scan computes the contrast of every text it finds in the real page.
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { COMPONENT_NAMES } from '../packages/ui/src/generated/manifest';
import { expect, test } from './support/fixtures';
import { watchPage } from './support/page-problems';

const WCAG_21_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// A scan of the whole gallery (53 components) takes a while, more so when three engines run at once.
test.describe.configure({ timeout: 240_000 });

async function scan(page: Page, include?: string) {
  let builder = new AxeBuilder({ page }).withTags(WCAG_21_AA);
  if (include) builder = builder.include(include);
  const results = await builder.analyze();
  return {
    violations: results.violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.slice(0, 6).map((n) => `${n.target.join(' ')} — ${n.failureSummary?.split('\n').slice(1, 3).join(' ').trim() ?? ''}`).join('\n    ')}`),
    passes: results.passes.map((p) => p.id),
  };
}

async function openGallery(page: Page) {
  await page.goto('/dev/gallery');
  await expect(page.locator('[data-confera-dev="gallery"]')).toHaveAttribute('data-hydrated', 'true', { timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
}
const card = (page: Page, name: string) => page.locator(`[data-component="${name}"]`);

for (const width of [1440, 375]) {
  test.describe(`gallery at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('no WCAG 2.1 A or AA violation in any component', async ({ page }) => {
      const problems = watchPage(page);
      await openGallery(page);
      await expect(page.locator('[data-confera-dev="gallery-card"]')).toHaveCount(COMPONENT_NAMES.length);

      const { violations, passes } = await scan(page);
      expect(violations).toEqual([]);
      // The scan really looked at contrast, names, labels and ARIA wiring.
      for (const rule of ['color-contrast', 'label', 'button-name', 'aria-valid-attr-value', 'aria-required-children', 'aria-allowed-attr']) {
        expect(passes, `the rule ${rule} did not run`).toContain(rule);
      }
      expect(problems.messages).toEqual([]);
    });

    test('no violation with a dialog, a confirm dialog and a drawer open', async ({ page }) => {
      await openGallery(page);
      for (const [name, opener, role] of [
        ['Dialog', 'Open the dialog', 'dialog'],
        ['ConfirmDialog', 'Delete the mail server', 'alertdialog'],
        ['Drawer', 'Open the drawer', 'dialog'],
      ] as const) {
        await card(page, name).getByRole('button', { name: opener }).click();
        const overlay = page.getByRole(role);
        await expect(overlay).toBeVisible();
        // The page under the overlay is scanned by the test above; here the overlay itself.
        const { violations, passes } = await scan(page, '.ud-overlay');
        expect(violations, `${name} open`).toEqual([]);
        for (const rule of ['color-contrast', 'button-name', 'aria-valid-attr-value']) expect(passes, `${name}: the rule ${rule} did not run`).toContain(rule);
        await page.keyboard.press('Escape');
        await expect(overlay).toBeHidden();
      }
    });

    test('no violation with a menu, a listbox and a toast showing', async ({ page }) => {
      await openGallery(page);

      await card(page, 'Menu').getByRole('button', { name: 'Row actions' }).click();
      await expect(page.getByRole('menu')).toBeVisible();
      expect((await scan(page, '[data-component="Menu"]')).violations, 'menu open').toEqual([]);
      await page.keyboard.press('Escape');

      const country = card(page, 'Autocomplete').getByRole('combobox', { name: 'Country' });
      await country.click();
      await expect(page.getByRole('listbox', { name: 'Country' })).toBeVisible();
      expect((await scan(page, '[data-component="Autocomplete"]')).violations, 'listbox open').toEqual([]);
      await country.fill('zzz');
      await expect(page.getByRole('option', { name: 'No matches' })).toBeVisible();
      expect((await scan(page, '[data-component="Autocomplete"]')).violations, 'listbox without matches').toEqual([]);
      await page.keyboard.press('Escape');

      await card(page, 'ToastHost').getByRole('button', { name: 'Show a toast' }).click();
      await expect(page.locator('.ud-toast')).toBeVisible();
      expect((await scan(page, '.ud-toasts')).violations, 'toast').toEqual([]);
    });
  });
}

test.describe('16px controls on touch devices (no zoom on focus in iOS)', () => {
  test('with a finger as the pointer every control one types in is 16px; with a mouse it stays 14px', async ({ browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'pointer emulation is a Chromium feature; the stylesheet rule itself is checked in tests/ds-a11y-wiring.test.tsx');
    const sizes = async (touch: boolean) => {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: touch, isMobile: touch });
      const page = await context.newPage();
      await openGallery(page);
      const result = await page.evaluate(() => ({
        coarse: matchMedia('(pointer: coarse)').matches,
        sizes: [...document.querySelectorAll<HTMLElement>('.ud-field__control, .ud-search__control, .ud-pagination__size select')].map((el) => getComputedStyle(el).fontSize),
      }));
      await context.close();
      return result;
    };

    const finger = await sizes(true);
    expect(finger.coarse).toBe(true);
    expect(finger.sizes.length).toBeGreaterThan(20);
    expect([...new Set(finger.sizes)]).toEqual(['16px']);

    const mouse = await sizes(false);
    expect(mouse.coarse).toBe(false);
    expect([...new Set(mouse.sizes)]).toEqual(['14px']);
  });
});
