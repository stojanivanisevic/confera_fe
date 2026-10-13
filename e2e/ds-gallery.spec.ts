// M1-FE-02 (spike): the adapter under real server rendering and hydration.
// The gallery page renders every component of the design-system manifest
// through Next's server rendering; the browser hydrates it. Nothing may be
// logged, nothing may be requested from another origin, and the components
// must be alive afterwards.
import { expect, test } from './support/fixtures';

import { COMPONENT_NAMES } from '../packages/ui/src/generated/manifest';
import { PUBLIC_ORIGIN } from './env';
import { originsOf, watchPage } from './support/page-problems';

test.describe('design-system gallery: server rendering and hydration', () => {
  test('the server sends every component as markup, before any script runs', async ({ request }) => {
    const response = await request.get(`${PUBLIC_ORIGIN}/dev/gallery`);
    expect(response.status()).toBe(200);
    const html = await response.text();
    for (const name of COMPONENT_NAMES) {
      expect(html, `${name} is missing from the server markup`).toContain(`data-component="${name}"`);
    }
    expect(html).toContain('data-hydrated="false"');
    // Spot checks that real component markup is there, not placeholders.
    expect(html).toContain('ud-btn ud-btn--primary');
    expect(html).toContain('ud-table');
    expect(html).toContain('Đorđe Šćepanović');
  });

  test('what local security software adds is not sent by the application', async ({ request }) => {
    // The bytes the server sends, read without a browser: no reference to another origin at all.
    const html = await (await request.get(`${PUBLIC_ORIGIN}/dev/gallery`)).text();
    const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]!).filter((u) => /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(u));
    expect(references).toEqual([]);
    expect(html).not.toMatch(/kaspersky|googleapis|gstatic/i);
  });

  test('all components hydrate without a console message or an error', async ({ page }) => {
    const problems = watchPage(page);
    await page.goto('/dev/gallery');
    await expect(page.locator('[data-confera-dev="gallery"]')).toHaveAttribute('data-hydrated', 'true', { timeout: 60_000 });

    const cards = page.locator('[data-confera-dev="gallery-card"]');
    await expect(cards).toHaveCount(COMPONENT_NAMES.length);
    for (const name of COMPONENT_NAMES) {
      const card = page.locator(`[data-component="${name}"]`);
      await expect(card.locator('[class*="ud-"]').first(), `${name} rendered no design-system markup`).toBeAttached();
    }
    expect(COMPONENT_NAMES.length).toBe(53);
    expect(problems.messages).toEqual([]);
  });

  test('no request goes to Google or to any other origin; the fonts are self-hosted', async ({ page }) => {
    const problems = watchPage(page);
    await page.goto('/dev/gallery');
    await expect(page.locator('[data-confera-dev="gallery"]')).toHaveAttribute('data-hydrated', 'true', { timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);

    expect(originsOf(problems.requests)).toEqual([PUBLIC_ORIGIN]);
    const fonts = problems.requests.filter((url) => url.endsWith('.woff2'));
    expect(fonts.length).toBeGreaterThanOrEqual(2);
    for (const url of fonts) expect(url.startsWith(`${PUBLIC_ORIGIN}/_next/static/`)).toBe(true);

    // The two families are really the ones in use.
    const families = await page.evaluate(() => ({
      manrope: document.fonts.check('600 14px "Manrope"'),
      inter: document.fonts.check('700 14px "Inter"'),
      button: getComputedStyle(document.querySelector('.ud-btn')!).fontFamily,
      label: getComputedStyle(document.querySelector('.ud-field__label')!).fontFamily,
    }));
    expect(families.manrope).toBe(true);
    expect(families.inter).toBe(true);
    expect(families.button).toMatch(/^"?Manrope"?/);
    expect(families.label).toMatch(/^"?Inter"?/);
    expect(problems.messages).toEqual([]);
  });

  test('Serbian letters are drawn with the self-hosted fonts (Latin Extended)', async ({ page }) => {
    await page.goto('/dev/gallery');
    await page.evaluate(() => document.fonts.ready);
    const loaded = await page.evaluate(async () => {
      await document.fonts.load('600 14px "Manrope"', 'šđčćž ŠĐČĆŽ');
      await document.fonts.load('700 14px "Inter"', 'šđčćž ŠĐČĆŽ');
      return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family.replaceAll('"', '')} ${f.unicodeRange.toUpperCase().slice(0, 11)}`);
    });
    // Both subsets of both families: U+0000-00FF (Latin) and U+0100-02BA (Latin Extended).
    for (const family of ['Manrope', 'Inter']) {
      expect(loaded.some((f) => f.startsWith(`${family} U+0-FF`) || f.startsWith(`${family} U+0000-00FF`)), `${family} Latin: ${loaded.join(' | ')}`).toBe(true);
      expect(loaded.some((f) => f.startsWith(`${family} U+100-2BA`) || f.startsWith(`${family} U+0100-02BA`)), `${family} Latin Extended: ${loaded.join(' | ')}`).toBe(true);
    }
  });

  test('the hydrated components are alive', async ({ page }) => {
    const problems = watchPage(page);
    await page.goto('/dev/gallery');
    await expect(page.locator('[data-confera-dev="gallery"]')).toHaveAttribute('data-hydrated', 'true', { timeout: 60_000 });
    const card = (name: string) => page.locator(`[data-component="${name}"]`);

    // Checkbox: controlled state changes.
    const checkbox = card('Checkbox').getByRole('checkbox', { name: 'I am the corresponding author' });
    await expect(checkbox).toBeChecked();
    await card('Checkbox').getByText('I am the corresponding author').click();
    await expect(checkbox).not.toBeChecked();

    // Underline tabs: arrow keys move the selection and the panel follows.
    const tabs = card('Tabs');
    await tabs.getByRole('tab', { name: 'Data' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.getByRole('tab', { name: /Files/ })).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.getByRole('tabpanel')).toHaveText('Two files.');

    // Table: sorting reorders rows and announces it.
    const table = card('DataTable');
    await expect(table.locator('tbody tr').first()).toContainText('Đorđe');
    await table.getByRole('button', { name: 'Author' }).click();
    await expect(table.getByRole('columnheader', { name: 'Author' })).toHaveAttribute('aria-sort', 'descending');
    await expect(table.locator('tbody tr').first()).toContainText('Živana');

    // Dialog: opens, takes focus, closes on Escape and gives focus back.
    const opener = card('Dialog').getByRole('button', { name: 'Open the dialog' });
    // Opened from the keyboard: one engine does not focus a button that is clicked with the mouse,
    // and the focus must come back to where a keyboard user was.
    await opener.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Send the decision' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Subject')).toBeFocused(); // the label is tied to the field without an id
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();

    // Segmented pills without panels are a radio group that the arrow keys move.
    const language = card('SegmentedTabs').getByRole('radiogroup', { name: 'Language' });
    await language.getByRole('radio', { name: 'English' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(language.getByRole('radio', { name: 'Srpski' })).toBeChecked();
    await expect(language.getByRole('radio', { name: 'Srpski' })).toBeFocused();
    // With panels they are tabs.
    await card('SegmentedTabs').getByRole('tab', { name: 'Companies' }).click();
    await expect(card('SegmentedTabs').getByRole('tabpanel', { name: 'Companies' })).toHaveText('Membership for an institution.');

    // Built-in texts follow the labels: the Serbian subtree of the gallery.
    await expect(card('LabelsProvider').getByRole('navigation', { name: 'Stranice' })).toContainText('11–20 od 48');
    await expect(card('LabelsProvider').getByRole('button', { name: 'Zatvori poruku' })).toBeVisible();

    // Toast: the module-level function reaches the mounted host.
    await card('ToastHost').getByRole('button', { name: 'Show a toast' }).click();
    await expect(page.locator('.ud-toast')).toContainText('Email sent');

    // Menu: opens and closes on Escape.
    await card('Menu').getByRole('button', { name: 'Row actions' }).click();
    await expect(page.getByRole('menuitem', { name: 'Resend the email' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toBeHidden();

    // Repeater: adds a row.
    const repeater = card('Repeater');
    await repeater.getByRole('button', { name: 'Add author' }).click();
    await expect(repeater.locator('.ud-repeater__row')).toHaveCount(3);

    expect(problems.messages).toEqual([]);
  });
});
