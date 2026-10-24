// The fix round of 0.4.0 in a browser, against the API stub: the findings of the UX and UI review
// (UX4), of the Security review (SEC-M4) and of the Test engineer (Q4) that a screen must show.
//   - UX4-01: an edited template asks before every way out (sidebar, breadcrumb, back, beforeunload);
//   - UX4-10, 11, 17, 18: the toolbar is one Tab stop, Save stays in view with its state and Ctrl+S,
//     conditions are named and can be taken off in the preview, the email's headings are no headings of
//     the page, the editor at 768 px;
//   - Q4-03, Q4-05: the organisation's template does not claim a conference with its own version, a 409
//     says so; an image being scanned appears in the preview once it is clean, without a reload;
//   - SEC-M4-03, UX4-02, 08, 14: a new submission is read without a change, "Start processing" shows its
//     email first, the dialog's heading takes the focus at each step;
//   - UX4-13, 15, 20: the mail log is searched by recipient; the table is sorted on a phone; the empty
//     result names the search.
// No listener for the browser's dialogs here: the beforeunload question is one this spec answers.
// The screens behind sign-in do not run in WebKit (NO_SESSION_IN_WEBKIT).
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { ADMIN_ORIGIN } from './env';
import { AGAINST_REAL_API, holdsSession, NO_SESSION_IN_WEBKIT, PART_C, resetStub, signIn, STUB_ONLY, templateId } from './support/admin';
import { expect, test } from './support/fixtures';

test.describe.configure({ mode: 'default' });
test.skip(AGAINST_REAL_API, STUB_ONLY);
test.skip(({ browserName }) => !holdsSession(browserName), NO_SESSION_IN_WEBKIT);
test.use({ timezoneId: 'Europe/Belgrade' });
test.beforeEach(async ({ page }) => {
  await resetStub(page);
});

const CONFERENCE = 'Konferencija za probe (KP 2026)';
const toast = (page: Page) => page.locator('.ud-toast').last();
const rows = (page: Page) => page.getByRole('table', { name: 'Submissions' }).locator('tbody tr');
const body = (page: Page) => page.locator('[data-confera-template-body] .ProseMirror');
const scan = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('iframe[sandbox]').analyze()).violations.map((v) => `${v.id}: ${v.help} — ${v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | ')}`);
const openTemplate = async (page: Page, type: string, language = 'English') => {
  await page.goto(`${ADMIN_ORIGIN}/templates`);
  await page.getByRole('table').locator('tbody tr').filter({ hasText: type }).filter({ hasText: language }).first().getByRole('button').click();
  await expect(page.getByRole('heading', { level: 1, name: type })).toBeVisible();
  await expect(page.locator('[data-confera-template-preview="ready"]')).toBeVisible();
};
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');

test.describe('the template editor (UX4-01, 10, 11, 17, 18; Q4-03, Q4-05)', () => {
  test('an edited template asks before every way out: the sidebar, the breadcrumb, the back button, closing the tab', async ({ page }) => {
    await signIn(page, undefined, '/templates');
    await openTemplate(page, 'Submission accepted');
    const editing = page.url();
    await body(page).locator('p').last().click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type(' Izmena.');
    // The state stands beside Save (UX4-10), not in a bar above the editor.
    await expect(page.locator('[data-confera-template-actions] [data-confera-template-state="unsaved"]')).toContainText('The template has changes that are not saved.');
    const ask = page.getByRole('alertdialog', { name: 'Leave the template without saving?' });
    const stays = async () => {
      await expect(ask).toBeVisible();
      await ask.getByRole('button', { name: 'Cancel' }).click();
      await expect(ask).toBeHidden();
      expect(page.url()).toBe(editing);
      await expect(body(page)).toContainText('Izmena.');
    };

    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Mail log' }).click();
    await stays();
    await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Email templates' }).click();
    await stays();
    // The back button (history.back(): the guard's entry is a same-document one, which page.goBack would wait on for a load).
    await page.evaluate(() => window.history.back());
    await stays();
    // Closing the tab or reloading: the browser's own question.
    const question = page.waitForEvent('dialog');
    await page.close({ runBeforeUnload: true });
    const dialog = await question;
    expect(dialog.type()).toBe('beforeunload');
    await dialog.dismiss();
    await expect(body(page)).toContainText('Izmena.');

    // Leaving on purpose leaves, and the way back works again after it.
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Mail log' }).click();
    await ask.getByRole('button', { name: 'Leave without saving' }).click();
    await expect(page).toHaveURL(`${ADMIN_ORIGIN}/mail-log`);
    await expect(page.getByRole('heading', { level: 1, name: 'Mail log' })).toBeVisible();
  });

  test('the toolbar is one Tab stop with arrow keys; Save stays in view and Ctrl+S saves; the condition is named and can be taken off in the preview', async ({ page }) => {
    await signIn(page, undefined, '/templates');
    await openTemplate(page, 'Submission accepted');
    const toolbar = page.getByRole('toolbar', { name: 'Formatting' });
    expect(await toolbar.evaluate((el) => [...el.querySelectorAll<HTMLElement>('button, select')].filter((control) => control.tabIndex === 0).length)).toBe(1);
    await toolbar.getByRole('combobox', { name: 'Style in the email' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(toolbar.getByRole('button', { name: 'Bold' })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(toolbar.getByRole('button', { name: 'Italic' })).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(toolbar.getByRole('button', { name: 'Bold' })).toBeFocused();
    // Nothing that takes a block out of a condition while the cursor is in none.
    await body(page).locator('p').first().click();
    await expect(toolbar.getByRole('button', { name: 'Remove the condition (show always)' })).toHaveCount(0);

    // The block shown on a condition says which, and the preview shows the email without it.
    const condition = body(page).locator('section[data-condition="hasTitle"]');
    await expect(condition.locator('[data-condition-label]')).toHaveText('Only when the submission has a title');
    await condition.locator('p').first().click();
    await expect(toolbar.getByRole('button', { name: 'Remove the condition (show always)' })).toBeVisible();
    const frame = page.frameLocator('iframe[title="Preview of the message"]');
    await expect(frame.getByText('Održivi turizam u Čačku i Žabalju', { exact: false })).toBeVisible();
    await page.getByRole('group', { name: 'Show the email as when' }).getByText('the submission has a title').click();
    await expect(frame.getByText('Održivi turizam u Čačku i Žabalju', { exact: false })).toHaveCount(0);

    await body(page).locator('p').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Srdačno.');
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator('[data-confera-template-actions]')).toBeInViewport();
    await body(page).locator('p').first().click();
    await page.keyboard.press('ControlOrMeta+s');
    await expect(toast(page)).toContainText('Template saved');
    await expect(page.locator('[data-confera-template-state="saved"]')).toBeVisible();
    expect(await scan(page)).toEqual([]);
  });

  test('at 768 px the preview is under the editor and the subject is whole; a heading of the email is no heading of the page', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await signIn(page, undefined, '/templates');
    await openTemplate(page, 'Submission returned for revision');
    const editorCard = page.locator('[data-confera-template-body]');
    const previewCard = page.locator('[data-confera-template-preview]');
    const [editorBox, previewBox] = [await editorCard.boundingBox(), await previewCard.boundingBox()];
    expect(previewBox!.y).toBeGreaterThan(editorBox!.y + editorBox!.height);
    const subject = page.locator('[data-confera-template-subject] .ProseMirror');
    expect(await subject.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);

    await body(page).locator('p').first().click();
    await page.getByRole('combobox', { name: 'Style in the email' }).selectOption('heading1');
    await expect(body(page).locator('[role="heading"][aria-level="3"]')).toHaveCount(1);
    await expect(body(page).locator('h1, h2, h3')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    expect(await scan(page)).toEqual([]);
  });

  test('the organisation’s template does not claim a conference that has its own version; a 409 is said plainly (Q4-03)', async ({ page }) => {
    await signIn(page, undefined, '/templates');
    await page.locator('select[data-confera-conference-switch]').selectOption({ label: CONFERENCE });
    await openTemplate(page, 'Submission accepted');
    await expect(page.getByText(`${CONFERENCE} uses the organisation’s template`)).toBeVisible();

    // "Make a version" when the conference got one meanwhile (another admin): a 409, said in words.
    await page.route('**/api/v1/mail-templates', (route) => (route.request().method() === 'POST' ? route.fulfill({ status: 409, contentType: 'application/problem+json', json: { status: 409, code: 'template_exists', title: 'Conflict', traceId: 't-q4-03' } }) : route.fallback()));
    await page.getByRole('button', { name: `Make a version for ${CONFERENCE}` }).click();
    await expect(page.getByRole('alert').filter({ hasText: `${CONFERENCE} has its own version already` })).toBeVisible();
    await expect(page.getByText('Something went wrong')).toHaveCount(0);
    await page.unroute('**/api/v1/mail-templates');

    await page.getByRole('button', { name: `Make a version for ${CONFERENCE}` }).click();
    await expect(toast(page)).toContainText('has its own version now');
    // The organisation's template, by its address, with the conference still chosen.
    await page.goto(`${ADMIN_ORIGIN}/templates/${templateId('submission_accepted', 'en')}`);
    await expect(page.locator('[data-confera-template-preview="ready"]')).toBeVisible();
    await expect(page.getByText(`${CONFERENCE} sends its own version of this email`)).toBeVisible();
    await expect(page.getByText(`${CONFERENCE} uses the organisation’s template`)).toHaveCount(0);
    await expect(page.getByRole('button', { name: `Make a version for ${CONFERENCE}` })).toHaveCount(0);
    // The tab of the language says whose version it opens (UX4-22).
    await expect(page.getByRole('radiogroup', { name: 'Language of the template' }).getByRole('radio', { name: 'English (own)' })).toBeVisible();
    await page.getByRole('button', { name: `Open the version of ${CONFERENCE}` }).click();
    await expect(page.getByText(`Only ${CONFERENCE} sends this version.`)).toBeVisible();
  });

  test('the preview shows an uploaded image once it is clean, without a reload (Q4-05)', async ({ page }) => {
    await signIn(page, undefined, '/templates');
    await openTemplate(page, 'Submission accepted');
    await body(page).locator('p').last().click();
    await page.getByRole('toolbar', { name: 'Formatting' }).getByRole('button', { name: 'Image' }).click();
    const dialog = page.getByRole('dialog', { name: 'Insert an image' });
    await dialog.locator('input[type="file"]').setInputFiles({ name: 'scan-slow-logo.png', mimeType: 'image/png', buffer: PNG });
    await dialog.getByLabel('What the image shows').fill('Logo');
    await dialog.getByRole('button', { name: 'Upload and insert' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('An image is still being scanned', { exact: false })).toBeVisible();
    await expect.poll(async () => (await page.locator('iframe[title="Preview of the message"]').getAttribute('srcdoc')) ?? '', { timeout: 20_000, intervals: [1_000] }).toContain('src="data:image/png;base64,');
    await expect(page.getByText('An image is still being scanned', { exact: false })).toHaveCount(0);
    // The editor shows the picture too, now that it is served.
    await expect.poll(() => body(page).locator('figure[data-confera-image] img').evaluate((img: HTMLImageElement) => img.naturalWidth), { timeout: 10_000 }).toBe(2);
  });
});

test.describe('a submission (SEC-M4-03, UX4-02, 08, 14)', () => {
  test('a new submission is read without a change; Start processing shows its email first; the dialog’s heading takes the focus at each step', async ({ page }) => {
    await signIn(page, undefined, `/submissions/${PART_C.submissions[0]}`);
    await expect(page.locator('[data-confera-submission-status="new"]')).toBeVisible();
    await expect(page.getByText('Nobody has started processing this submission yet')).toBeVisible();
    await page.reload();
    await expect(page.locator('[data-confera-submission-status="new"]')).toBeVisible();
    await expect(page.getByRole('table', { name: 'History' }).locator('tbody tr')).toHaveCount(1);

    await page.getByRole('button', { name: 'Start processing' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'The email to the author' })).toBeFocused();
    await expect(dialog.getByRole('status')).toContainText('The email to the author is shown: to');
    await dialog.getByRole('button', { name: 'Send the email and change the status' }).click();
    await expect(page.locator('[data-confera-submission-status="open"]')).toBeVisible();
    await expect(page.locator('[data-confera-opened]')).toContainText('The author was emailed.');

    await page.getByRole('button', { name: 'Change the status' }).click();
    await page.getByRole('menuitem', { name: 'Return for revision' }).click();
    // The language of the email, before the message is written (UX4-14).
    await expect(dialog).toContainText('The author’s email is in Serbian. Write your message in Serbian.');
    await dialog.getByRole('button', { name: 'Show the email' }).click();
    await expect(dialog.getByLabel('Message for the author')).toBeFocused();
    await dialog.getByLabel('Message for the author').fill('Molimo skratite apstrakt.');
    await dialog.getByRole('button', { name: 'Show the email' }).click();
    // The button that had the focus is gone: the heading has it (UX4-02).
    await expect(dialog.getByRole('heading', { name: 'The email to the author' })).toBeFocused();
    await expect(dialog.getByRole('status')).toContainText('in Serbian');
    expect(await scan(page)).toEqual([]);
    await dialog.getByRole('button', { name: 'Back' }).click();
    await expect(dialog.getByRole('heading', { name: 'Return for revision' })).toBeFocused();
    await expect(dialog.getByLabel('Message for the author')).toHaveValue('Molimo skratite apstrakt.');
  });
});

test.describe('the lists (UX4-13, 15, 20)', () => {
  test('the mail log is searched by recipient; nothing found names the search', async ({ page }) => {
    await signIn(page, undefined, '/mail-log');
    const table = page.getByRole('table', { name: 'Mail log' });
    await expect(table.locator('tbody tr').first()).toBeVisible();
    const recipient = (await table.locator('tbody tr').first().locator('td').nth(1).innerText()).trim();
    await page.getByRole('searchbox', { name: 'Search' }).fill(recipient);
    await expect.poll(async () => (await table.locator('tbody tr').allInnerTexts()).every((row) => row.includes(recipient))).toBe(true);
    await page.getByRole('searchbox', { name: 'Search' }).fill('nobody-at-all');
    await expect(table).toContainText('No message matches “nobody-at-all”.');
  });

  test('on a phone the table is sorted with a list; an empty result names the search, with one way to clear it', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await signIn(page, undefined, '/submissions');
    await expect(rows(page)).toHaveCount(2);
    await page.getByRole('combobox', { name: 'Sort by' }).selectOption({ label: 'Reference, first to last' });
    await expect(page).toHaveURL(/sort=reference&direction=asc/);
    await expect(rows(page).first()).toContainText('KP26-0001');
    await page.getByRole('combobox', { name: 'Sort by' }).selectOption({ label: 'Reference, last to first' });
    await expect(rows(page).first()).toContainText('KP26-0002');
    await page.getByRole('searchbox', { name: 'Search' }).fill('zzzz');
    await expect(page.getByRole('table', { name: 'Submissions' })).toContainText('No submission matches “zzzz”.');
    await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(1);
    expect(await scan(page)).toEqual([]);

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByRole('combobox', { name: 'Sort by' })).toBeHidden();
  });
});
