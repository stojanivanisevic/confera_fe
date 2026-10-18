// M3-FE-02, M3-FE-04, M3-QA-01 parts the frontend owns: the seeded abstract form of confera_be
// (e2e/servers/public-forms.json, from the vendored contract) on Confera's own page and in a
// conference site's frame, in all three engines (no session is needed):
//  - in Serbian from the snippet's address (D2), with a file of exactly 20 MB, sent once although
//    Send is pressed twice (FR-FORM-14), the thank-you with the reference;
//  - one byte more is refused before any upload, with the limit in the form's language (FR-FILE-01);
//  - the API's refusal comes back to its field;
//  - a closed form says so, on its own page and in the frame (FR-DL-02);
//  - the page is titled in the form's language (UX-M1-19);
//  - axe finds nothing on the empty form, with its errors, and at 375 px nothing scrolls sideways.
import AxeBuilder from '@axe-core/playwright';
import type { Frame, Page } from '@playwright/test';

import { buildEmbedSnippet, frameId } from '../packages/embed-loader/src/index';
import { API_STUB_ORIGIN, HARNESS_ORIGIN, PUBLIC_ORIGIN } from './env';
import { expect, test } from './support/fixtures';
import { watchPage } from './support/page-problems';

const SLUG = 'itema-2026-abstract';
const MB20 = 20 * 1024 * 1024;

const scan = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map(
    (v) => `${v.id}: ${v.help} — ${v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | ')}`,
  );

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`${PUBLIC_ORIGIN}/f/${SLUG}${query}`);
  await page.locator('[data-confera-form][data-hydrated="true"]').waitFor();
}

/** What the API stub stored for a title (every run of every engine sends titles of its own). */
async function storedWith(page: Page, title: string): Promise<Array<{ reference: string; language: string; files: Array<{ field: string; name: string; size: number }> }>> {
  const answer = await page.request.get(`${API_STUB_ORIGIN}/__stub/public/submissions`);
  const { items } = (await answer.json()) as { items: Array<{ reference: string; language: string; answers: { title?: string }; files: Array<{ field: string; name: string; size: number }> }> };
  return items.filter((item) => item.answers.title === title);
}

/** The whole form in Serbian, as an author with a paper who pays herself. */
async function fillInSerbian(target: Page | Frame, title: string): Promise<void> {
  await target.getByRole('radio', { name: 'Sa apstraktom i radom' }).check({ force: true });
  await target.getByRole('textbox', { name: 'Ime', exact: true }).first().fill('Živana');
  await target.getByRole('textbox', { name: 'Prezime', exact: true }).first().fill('Đorđević');
  await target.getByRole('textbox', { name: 'Institucija', exact: true }).first().fill('Ekonomski fakultet, Univerzitet Primer');
  await target.getByLabel('Adresa e-pošte').first().fill('zivana.dordevic@example.test');
  await target.getByRole('textbox', { name: 'Naslov', exact: true }).fill(title);
  await target.getByRole('textbox', { name: 'Apstrakt', exact: true }).fill('Kratak apstrakt o održivom turizmu na Balkanu.');
  await target.getByLabel('Ključne reči').fill('turizam, održivost');
  await target.getByRole('radio', { name: 'Zbornik ili izabrani radovi' }).check({ force: true });
  await target.getByRole('radiogroup', { name: /Da li ste član UdEkoM Balkans/ }).getByRole('radio', { name: 'Ne' }).check({ force: true });
  await target.getByRole('radio', { name: 'Uživo', exact: true }).check({ force: true });
  await target.getByRole('radiogroup', { name: /popust/ }).getByRole('radio', { name: 'Ne' }).check({ force: true });
  await target.getByRole('radio', { name: 'Ja', exact: true }).check({ force: true });
  await target.getByLabel('Vaša adresa za račun').fill('Izmišljena 1, Beograd');
  await target.getByRole('radio', { name: 'Bankovni transfer (EUR)' }).check({ force: true });
  await target.getByRole('checkbox').check({ force: true });
}

test.describe('the abstract form on its own page', () => {
  test('in Serbian from the address, with a file of exactly 20 MB, sent once although Send is pressed twice', async ({ page }) => {
    test.setTimeout(90_000);
    const problems = watchPage(page);
    await open(page, '?lang=sr');
    await expect(page.getByRole('heading', { level: 1, name: 'Prijava apstrakta' })).toBeVisible();
    await expect(page).toHaveTitle('Prijava apstrakta · ITEMA 2026');
    const title = `Održivi turizam ${test.info().project.name} ${Date.now().toString(36)}`;
    await fillInSerbian(page, title);
    await page.locator('[data-confera-file="biographies"] input[type="file"]').setInputFiles({ name: 'Biografije – Šćepanović.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(MB20, 0x25) });
    await expect(page.locator('[data-confera-file="biographies"]')).toHaveAttribute('data-confera-file-state', 'uploaded', { timeout: 60_000 });
    const send = page.getByRole('button', { name: 'Pošalji' });
    await send.dblclick();
    await expect(page.locator('[data-confera-thanks]')).toBeFocused();
    await expect(page.locator('[data-confera-thanks]')).toContainText('Apstrakt je poslat');
    await expect(page.locator('[data-confera-thanks]')).toContainText('Potvrda stiže na zivana.dordevic@example.test.');
    const reference = (await page.locator('[data-confera-reference]').innerText()).replace('Broj vaše prijave: ', '');
    expect(reference).toMatch(/^IT27-\d{4}$/);
    const stored = await storedWith(page, title);
    expect(stored.map((s) => s.reference), 'one submission for two presses').toEqual([reference]);
    expect(stored[0]!.language).toBe('sr');
    expect(stored[0]!.files.map(({ field, name, size }) => ({ field, name, size }))).toEqual([{ field: 'biographies', name: 'Biografije – Šćepanović.pdf', size: MB20 }]);
    expect(problems.messages).toEqual([]);
  });

  test('one byte more than 20 MB is refused before any upload, with the limit', async ({ page }) => {
    await open(page);
    const uploads: string[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/uploads')) uploads.push(request.url());
    });
    await page.locator('[data-confera-file="biographies"] input[type="file"]').setInputFiles({ name: 'too-large.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(MB20 + 1, 0x25) });
    await expect(page.locator('[data-confera-file="biographies"]')).toContainText('too-large.pdf is larger than 20 MB. Choose a smaller file.');
    await expect(page.locator('[data-confera-file="biographies"]')).toHaveAttribute('data-confera-file-state', 'refused');
    expect(uploads).toEqual([]);
  });

  test('choosing, refusing and uploading a file are said in the live region; a refusal is an alert (UX3-01)', async ({ page }) => {
    await open(page);
    const input = page.locator('[data-confera-file="biographies"] input[type="file"]');
    const announced = page.locator('[data-confera-announce]');
    await input.setInputFiles({ name: 'slika.png', mimeType: 'image/png', buffer: Buffer.from('png') });
    await expect(announced).toHaveText('slika.png is not one of these types: .pdf, .docx, .doc. Save it as one of them and add it again.');
    await expect(page.locator('[data-confera-file="biographies"]').getByRole('alert')).toHaveText('slika.png is not one of these types: .pdf, .docx, .doc. Save it as one of them and add it again.');
    await input.setInputFiles({ name: 'rad.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF\n') });
    await expect(page.locator('[data-confera-file="biographies"]')).toHaveAttribute('data-confera-file-state', 'uploaded');
    await expect(announced).toHaveText('rad.pdf is uploaded.');
    await expect(page.locator('[data-confera-file="biographies"]').getByRole('alert')).toHaveCount(0);
    // A one-file field asks for one file (UX3-18).
    await expect(page.locator('[data-confera-file="biographies"]')).toContainText('Drop a file here or click to choose');
  });

  test('a file of another type is refused before the upload, with the types', async ({ page }) => {
    await open(page);
    await page.locator('[data-confera-file="biographies"] input[type="file"]').setInputFiles({ name: 'slika.png', mimeType: 'image/png', buffer: Buffer.from('png') });
    await expect(page.locator('[data-confera-file="biographies"]')).toContainText('slika.png is not one of these types: .pdf, .docx, .doc.');
  });

  test('the API’s refusal comes back to its field, in the form’s words', async ({ page }) => {
    await open(page, '?lang=sr');
    await fillInSerbian(page, 'refused by the server');
    await page.getByRole('button', { name: 'Pošalji' }).click();
    const summary = page.locator('[data-confera-errors]');
    await expect(summary).toBeFocused();
    // The summary names the field first (UX3-04).
    await expect(summary.getByRole('link')).toHaveText(['Naslov: ne upisujte veb adrese']);
    await expect(page.getByRole('textbox', { name: 'Naslov', exact: true })).toHaveAttribute('aria-invalid', 'true');
  });

  test('the language switch keeps everything and the page title follows (FR-FORM-09, UX-M1-19)', async ({ page }) => {
    await open(page);
    await expect(page).toHaveTitle('Abstract submission · ITEMA 2026');
    await page.getByLabel('First name').first().fill('Živana');
    await page.getByRole('radio', { name: 'Srpski' }).click();
    await expect(page.getByRole('textbox', { name: 'Ime', exact: true }).first()).toHaveValue('Živana');
    await expect(page).toHaveTitle('Prijava apstrakta · ITEMA 2026');
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('sr');
  });

  test('the trap field (SEC-M3-07) is out of reach of the keyboard and of assistive technology', async ({ page }) => {
    await open(page);
    const trap = page.locator('input[name="confera_hp"]');
    await expect(trap).toHaveCount(1);
    await expect(page.locator('input[name="website"]')).toHaveCount(0);
    await expect(trap).toHaveAttribute('autocomplete', 'off');
    // Not in the accessibility tree: present only when hidden elements are included.
    await expect(page.getByRole('textbox', { name: 'Extra field' })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Extra field', includeHidden: true })).toHaveCount(1);
    // Inert: it cannot take the focus, not even from a script, and Tab passes it on the way to Send.
    expect(await trap.evaluate((el) => (el.focus(), document.activeElement === el))).toBe(false);
    await page.locator('body').focus();
    const send = page.locator('button[type="submit"]');
    for (let i = 0; i < 200 && !(await send.evaluate((el) => document.activeElement === el)); i++) {
      await page.keyboard.press('Tab');
      expect(await trap.evaluate((el) => document.activeElement === el)).toBe(false);
    }
    await expect(send).toBeFocused();
  });
});

test.describe('a closed form (FR-DL-02)', () => {
  test('says so on its own page, with its deadline, and has nothing to fill in', async ({ page }) => {
    await page.goto(`${PUBLIC_ORIGIN}/f/itema-2026-closed?lang=sr`);
    await expect(page.locator('[data-confera-state="closed"]')).toContainText('Ovaj obrazac je zatvoren');
    await expect(page.locator('[data-confera-state="closed"]')).toContainText('Rok je bio 15.03.2026.');
    await expect(page.locator('form')).toHaveCount(0);
  });

  test('and inside the frame of the conference site', async ({ page }) => {
    const snippet = buildEmbedSnippet({ publicOrigin: PUBLIC_ORIGIN, slug: 'itema-2026-closed', title: 'Abstract submission', linkText: 'Form not showing? Open it on its own page.' });
    await page.goto(`${HARNESS_ORIGIN}/hostile.html?paste=${Buffer.from(snippet, 'utf8').toString('base64url')}`);
    const frame = page.frameLocator(`#${frameId('itema-2026-closed')}`);
    await expect(frame.locator('[data-confera-state="closed"]')).toContainText('This form is closed');
    await expect(frame.locator('[data-confera-state="closed"]')).toContainText('The deadline was 15 March 2026.');
  });
});

for (const width of [1440, 375]) {
  test.describe(`the abstract form, ${width}px: accessibility and width`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('empty', async ({ page }) => {
      await open(page);
      await page.getByRole('radio', { name: 'With an abstract and a paper' }).check({ force: true });
      expect(await scan(page), 'the empty form').toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'no sideways scroll').toBe(true);
    });

    test('with its errors', async ({ page }) => {
      await open(page);
      await page.getByRole('button', { name: 'Add an author' }).click();
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await expect(page.locator('[data-confera-errors]')).toBeFocused();
      expect(await scan(page), 'the form with its errors').toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'no sideways scroll').toBe(true);
    });
  });
}
