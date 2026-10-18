// M4-FE-01 to 04 in a browser, against the API stub (e2e/servers/api-stub-part-d.mjs, written in the
// direction of the plan until confera_be's contract of 0.4.0 has every route):
//   the submissions table searched without diacritics, filtered and sorted; a new submission taken
//   into processing when opened; a return for revision with the email shown first (FR-MAIL-08), the
//   edit on the author's behalf that takes it back into processing, and the email in the mail log;
//   the template editor that saves, has language tabs, a conference's own version, the switch of a
//   status email (FR-MAIL-07) and images; a stored document with hostile strings that runs nothing in
//   the editor, the preview or the mail log (ST-59, ST-28); resend and retention of the mail log;
//   a held email discarded (M3-ISS-14); the new screens and dialogs scanned with axe.
// The screens behind sign-in do not run in WebKit (NO_SESSION_IN_WEBKIT).
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { ADMIN_ORIGIN } from './env';
import { fitsTheWidth, holdsSession, NO_SESSION_IN_WEBKIT, PART_B, PART_C, resetStub, signIn } from './support/admin';
import { expect, test } from './support/fixtures';
import { watchPage } from './support/page-problems';

test.describe.configure({ mode: 'default' });
test.skip(({ browserName }) => !holdsSession(browserName), NO_SESSION_IN_WEBKIT);
test.use({ timezoneId: 'Europe/Belgrade' });

test.beforeEach(async ({ page }) => {
  await resetStub(page);
  // Nothing on these screens may open a dialog of the browser (a script of a stored text would).
  page.on('dialog', (dialog) => {
    throw new Error(`a dialog of the browser opened: ${dialog.message()}`);
  });
});

const toast = (page: Page) => page.locator('.ud-toast').last();
const rows = (page: Page) => page.getByRole('table', { name: 'Submissions' }).locator('tbody tr');
const conferenceSwitch = (page: Page) => page.locator('select[data-confera-conference-switch]');
const pwned = (page: Page) => page.evaluate(() => document.body.dataset.pwned ?? null);
/** What sticks out to the right of a phone's window, by its tag and class, when the page scrolls sideways. */
const overflowing = (page: Page) =>
  page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth <= width) return [];
    return [...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().right > width + 1 && el.children.length === 0).slice(0, 8).map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} ${el.textContent?.slice(0, 30) ?? ''}`);
  });
const scan = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('iframe[sandbox]').analyze()).violations.map((v) => `${v.id}: ${v.help} — ${v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | ')}`);
const changeStatus = async (page: Page, action: string) => {
  await page.getByRole('button', { name: 'Change the status' }).click();
  await page.getByRole('menuitem', { name: action }).click();
  return page.getByRole('dialog');
};
const openTemplate = async (page: Page, type: string, language = 'English') => {
  await page.goto(`${ADMIN_ORIGIN}/templates`);
  await page.getByRole('table').locator('tbody tr').filter({ hasText: type }).filter({ hasText: language }).first().getByRole('button').click();
  await expect(page.getByRole('heading', { level: 1, name: type })).toBeVisible();
  await expect(page.locator('[data-confera-template-preview="ready"]')).toBeVisible();
};
// A PNG of 2 x 2 pixels, and an SVG, which an email never takes (ST-60).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

test.describe('submissions (M4-FE-01)', () => {
  test('the table: a search without diacritics, a withdrawn one only with the status filter, a sort by reference', async ({ page }) => {
    await signIn(page, undefined, '/submissions');
    await expect(rows(page)).toHaveCount(2);
    await expect(page.getByText('Withdrawn submissions are not shown')).toBeVisible();
    // The member and billing columns wait for their data (UX3-22).
    await expect(page.getByRole('columnheader', { name: 'Member' })).toHaveCount(0);
    const search = page.getByRole('searchbox', { name: 'Search' }).or(page.getByLabel('Search')).first();
    await search.fill('zivana dordevic');
    await expect(page).toHaveURL(/q=zivana\+dordevic/);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('KP26-0002');
    await search.fill('Šćepanović');
    // The status is chosen at once: the search that lands a moment later keeps it.
    await page.getByRole('combobox', { name: 'Status' }).selectOption('withdrawn');
    await expect(page).toHaveURL(/q=%C5%A0%C4%87epanovi%C4%87.*status=withdrawn|status=withdrawn.*q=%C5%A0%C4%87epanovi%C4%87/);
    await page.getByRole('combobox', { name: 'Status' }).selectOption('');
    await expect(rows(page)).toHaveCount(1);
    await page.getByRole('combobox', { name: 'Status' }).selectOption('withdrawn');
    await expect(page).toHaveURL(/status=withdrawn/);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('KP26-0003');
    await expect(rows(page).first()).toContainText('Withdrawn');
    await page.getByRole('button', { name: 'Clear filters' }).or(page.getByRole('button', { name: /Reset/ })).first().click();
    await expect(rows(page)).toHaveCount(2);
    await page.getByRole('columnheader', { name: 'Reference' }).getByRole('button').click();
    await expect(page).toHaveURL(/sort=reference&direction=asc/);
    await expect(rows(page).first()).toContainText('KP26-0001');
    // The query is in the address: a reload and the way back find the same rows.
    await page.reload();
    await expect(rows(page).first()).toContainText('KP26-0001');
  });

  test('a new one is taken into processing when opened; returned for revision with the email shown first; corrected and back in processing', async ({ page }) => {
    const problems = watchPage(page);
    await signIn(page, undefined, `/submissions/${PART_C.submissions[1]}`);
    await expect(page.locator('[data-confera-submission-status="open"]')).toBeVisible();
    await expect(toast(page)).toContainText('Taken into processing');

    // Cancel: nothing changes, nothing is sent.
    let dialog = await changeStatus(page, 'Return for revision');
    await dialog.getByLabel('Message for the author').fill('Please shorten the abstract to 250 words.');
    await dialog.getByRole('button', { name: 'Show the email' }).click();
    await expect(dialog.locator('[data-confera-status-step="email"]')).toBeVisible();
    await expect(dialog.locator('iframe[title="The email to the author"]')).toHaveAttribute('sandbox', '');
    await expect(dialog.frameLocator('iframe[title="The email to the author"]').getByText('Please shorten the abstract to 250 words.')).toBeVisible();
    await expect(dialog.locator('[data-confera-status-email-subject]')).toHaveText('Your submission KP26-0001 needs changes');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('[data-confera-submission-status="open"]')).toBeVisible();

    // Send: the status changes, the email is the text shown.
    dialog = await changeStatus(page, 'Return for revision');
    await dialog.getByLabel('Message for the author').fill('Please shorten the abstract to 250 words.');
    await dialog.getByRole('button', { name: 'Show the email' }).click();
    await dialog.getByRole('button', { name: 'Send the email and change the status' }).dblclick();
    await expect(page.locator('[data-confera-submission-status="returned_for_revision"]')).toBeVisible();
    await expect(page.getByRole('table', { name: 'History' })).toContainText('Message: Please shorten the abstract to 250 words.');
    // A double click is one change and one email (FR-MAIL-05).
    await expect(page.getByRole('table', { name: 'Emails' }).locator('tbody tr').filter({ hasText: 'Returned for revision' })).toHaveCount(1);

    // The corrections entered for the author take it back into processing (transition 5, FR-SUB-06).
    await page.getByRole('button', { name: 'Edit on the author’s behalf' }).click();
    const drawer = page.getByRole('dialog', { name: 'Edit on the author’s behalf' });
    await drawer.getByLabel('First name').first().fill('Marta Ana');
    await expect(drawer.getByRole('checkbox', { name: /These are the author’s corrections/ })).toBeChecked();
    await drawer.getByRole('button', { name: 'Save the changes' }).click();
    await expect(page.locator('[data-confera-submission-status="open"]')).toBeVisible();
    await expect(page.locator('[data-confera-revisions]')).toContainText('Authors: Marta Kovač became Marta Ana Kovač');

    // The emails are in the mail log.
    await page.goto(`${ADMIN_ORIGIN}/mail-log`);
    await expect(page.getByRole('table', { name: 'Mail log' })).toContainText('Submission returned for revision');
    await expect(page.getByRole('table', { name: 'Mail log' })).toContainText('Submission back in processing');
    expect(problems.messages).toEqual([]);
  });

  test('withdraw asks for an internal reason, which the email does not carry; a note is for admins', async ({ page }) => {
    await signIn(page, undefined, `/submissions/${PART_C.submissions[1]}`);
    await expect(page.locator('[data-confera-submission-status="open"]')).toBeVisible();
    const dialog = await changeStatus(page, 'Withdraw');
    await dialog.getByRole('button', { name: 'Change the status' }).click();
    await expect(dialog).toContainText('Give the reason.');
    await dialog.getByLabel('Internal reason').fill('Sent twice by mistake');
    await dialog.getByRole('button', { name: 'Change the status' }).click();
    await expect(page.locator('[data-confera-submission-status="withdrawn"]')).toBeVisible();
    await expect(page.getByRole('table', { name: 'History' })).toContainText('Internal reason: Sent twice by mistake');
    const notes = page.locator('[data-confera-notes]');
    await notes.getByLabel('A new note').fill('Called the author.');
    await notes.getByRole('button', { name: 'Add the note' }).click();
    await expect(notes).toContainText('Called the author.');
  });
});

test.describe('the template editor (M4-FE-02, M4-FE-03)', () => {
  test('a stored document with hostile strings runs nothing in the editor, the preview or the mail log (ST-59, ST-28)', async ({ page }) => {
    await signIn(page, undefined, '/templates');
    await openTemplate(page, 'Submission rejected');
    const body = page.locator('[data-confera-template-body] .ProseMirror');
    await expect(body).toContainText('<script>parent.document.body.dataset.pwned="editor"</script>');
    // ProseMirror's own separator after an inline object is the only image there; nothing is made of the text.
    expect(await body.locator('script, img:not(.ProseMirror-separator), svg, iframe, [onerror], [onload]').count()).toBe(0);
    await expect(page.frameLocator('iframe[title="Preview of the message"]').getByText('{{constructor}}', { exact: false })).toBeVisible();
    expect(await page.locator('iframe[title="Preview of the message"]').getAttribute('srcdoc')).toContain('&lt;script&gt;');
    expect(await pwned(page)).toBeNull();

    // The same text goes out in a rejection, and the mail log shows it inside its frame only.
    await page.goto(`${ADMIN_ORIGIN}/submissions/${PART_C.submissions[1]}`);
    await expect(page.locator('[data-confera-submission-status="open"]')).toBeVisible();
    const dialog = await changeStatus(page, 'Reject');
    await dialog.getByRole('button', { name: 'Change the status' }).click();
    await expect(page.locator('[data-confera-submission-status="rejected"]')).toBeVisible();
    await page.goto(`${ADMIN_ORIGIN}/mail-log`);
    await page.getByRole('table', { name: 'Mail log' }).locator('tbody tr').filter({ hasText: 'Submission rejected' }).first().getByRole('button').click();
    await expect(page.locator('iframe[title="Email body"]')).toHaveAttribute('sandbox', '');
    await expect(page.frameLocator('iframe[title="Email body"]').getByText('{{constructor}}', { exact: false })).toBeVisible();
    await expect(page.locator('[data-confera-plain-body]')).toContainText('<script>');
    expect(await pwned(page)).toBeNull();
  });

  test('saved, in two languages, with a version of its own for a conference that it can give up again', async ({ page }) => {
    const problems = watchPage(page);
    await signIn(page, undefined, '/templates');
    await openTemplate(page, 'Submission accepted');
    const body = page.locator('[data-confera-template-body] .ProseMirror');
    await body.locator('p').last().click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type(' Srdačno.');
    await expect(page.getByText('The template has changes that are not saved.')).toBeVisible();
    await page.getByRole('button', { name: 'Save the template' }).click();
    await expect(toast(page)).toContainText('Template saved');
    await page.reload();
    await expect(body).toContainText('Srdačno.');

    await page.getByRole('radiogroup', { name: 'Language of the template' }).getByRole('radio', { name: 'Serbian' }).click();
    await expect(page.locator('[data-confera-template="submission_accepted:sr"]')).toBeVisible();
    await expect(body).toContainText('Sa zadovoljstvom');

    await conferenceSwitch(page).selectOption({ label: 'Konferencija za probe (KP 2026)' });
    await page.getByRole('button', { name: 'Make a version for Konferencija za probe (KP 2026)' }).click();
    await expect(toast(page)).toContainText('has its own version now');
    await expect(page.getByText('Only Konferencija za probe (KP 2026) sends this version.')).toBeVisible();
    await page.getByRole('button', { name: 'Use the organisation’s template again' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Use the organisation’s template again' }).click();
    await expect(toast(page)).toContainText('uses the organisation’s template again');
    await expect(page.getByText('uses the organisation’s template', { exact: false }).first()).toBeVisible();
    expect(problems.messages).toEqual([]);
  });

  test('a status email switched off for a conference sends nothing there, and the history says so (FR-MAIL-07)', async ({ page }) => {
    await signIn(page, undefined, '/templates');
    await conferenceSwitch(page).selectOption({ label: 'Konferencija za probe (KP 2026)' });
    await openTemplate(page, 'Submission accepted');
    const toggle = page.getByRole('switch', { name: 'Send this email for Konferencija za probe (KP 2026)' });
    await expect(toggle).toBeChecked();
    // The design system's track lies over the input: the person clicks the switch's words.
    await page.locator('[data-confera-template-switch] .ud-switch__label').click();
    await expect(toggle).not.toBeChecked();
    await expect(toast(page)).toContainText('The email is off for Konferencija za probe (KP 2026)');
    await page.goto(`${ADMIN_ORIGIN}/submissions/${PART_C.submissions[1]}`);
    await expect(page.locator('[data-confera-submission-status="open"]')).toBeVisible();
    const dialog = await changeStatus(page, 'Accept');
    await dialog.getByRole('button', { name: 'Change the status' }).click();
    await expect(page.locator('[data-confera-submission-status="accepted"]')).toBeVisible();
    await expect(page.getByRole('table', { name: 'History' })).toContainText('No email: template off');
    await expect(page.getByRole('table', { name: 'Emails' }).locator('tbody tr').filter({ hasText: 'Accepted' })).toHaveCount(0);
  });

  test('an image is uploaded and inserted, and travels inside the preview; an SVG is refused (ST-60)', async ({ page }) => {
    await signIn(page, undefined, '/templates');
    await openTemplate(page, 'Submission accepted');
    await page.locator('[data-confera-template-body] .ProseMirror p').first().click();
    await page.getByRole('toolbar', { name: 'Formatting' }).getByRole('button', { name: 'Image' }).click();
    const dialog = page.getByRole('dialog', { name: 'Insert an image' });
    expect(await scan(page)).toEqual([]);
    await dialog.locator('input[type="file"]').setInputFiles({ name: 'logo.svg', mimeType: 'image/png', buffer: SVG });
    await dialog.getByLabel('What the image shows').fill('Logo');
    await dialog.getByRole('button', { name: 'Upload and insert' }).click();
    await expect(dialog).toContainText('The file is not a PNG, JPEG or GIF image.');
    await dialog.locator('input[type="file"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
    await dialog.getByRole('button', { name: 'Upload and insert' }).click();
    await expect(dialog).toBeHidden();
    const image = page.locator('[data-confera-template-body] figure[data-confera-image] img');
    await expect(image).toHaveAttribute('alt', 'Logo');
    await expect(image).toHaveAttribute('src', /^\/api\/v1\/mail-images\/[0-9a-f-]{36}$/);
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(2);
    // The preview holds the image itself, never an address to load.
    await expect.poll(async () => (await page.locator('iframe[title="Preview of the message"]').getAttribute('srcdoc')) ?? '').toContain('src="data:image/png;base64,');
    await page.getByRole('button', { name: 'Save the template' }).click();
    await expect(toast(page)).toContainText('Template saved');
  });

  test('a paste keeps the format and drops the images of a web page', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the clipboard of the page is written through the permissions of Chromium');
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ADMIN_ORIGIN });
    await signIn(page, undefined, '/templates');
    await openTemplate(page, 'Submission accepted');
    const body = page.locator('[data-confera-template-body] .ProseMirror');
    await body.locator('p').first().click();
    await page.evaluate(async () => {
      const html = '<p><b>Podebljano</b> <img src="https://tracker.example.test/pixel.gif"> <a href="javascript:alert(1)">veza</a> <img src="data:image/png;base64,iVBORw0KGgo="></p>';
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob(['Podebljano veza'], { type: 'text/plain' }) })]);
    });
    await page.keyboard.press('ControlOrMeta+V');
    await expect(body.locator('strong').filter({ hasText: 'Podebljano' })).toBeVisible();
    await expect(toast(page)).toContainText('Images from a web page are not taken over');
    expect(await body.locator('img:not(.ProseMirror-separator)').count()).toBe(0);
    expect(await body.locator('a[href^="javascript:"]').count()).toBe(0);
  });
});

test.describe('the mail log and held emails (M4-FE-04, M3-ISS-14)', () => {
  test('a message is sent again; the log keeps entries for a set number of days', async ({ page }) => {
    await signIn(page, undefined, `/mail-log/${PART_B.ids.hostileEntry}`);
    await page.getByRole('button', { name: 'Send again' }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toContainText('with fresh secure links');
    await confirm.getByRole('button', { name: 'Send again' }).click();
    await expect(toast(page)).toContainText('The message is queued again');
    expect(await pwned(page)).toBeNull();

    await page.goto(`${ADMIN_ORIGIN}/mail-log`);
    const settings = page.locator('[data-confera-mail-log-settings]');
    await expect(settings).toContainText('Entries are kept for 730 days');
    await settings.getByLabel('Keep entries for').fill('10');
    await settings.getByRole('button', { name: 'Save' }).click();
    await expect(settings).toContainText('From 30 to 3650 days');
    await settings.getByLabel('Keep entries for').fill('365');
    await settings.getByRole('button', { name: 'Save' }).click();
    await expect(toast(page)).toContainText('The mail log keeps entries for 365 days');
    await page.reload();
    await expect(page.locator('[data-confera-mail-log-settings]')).toContainText('Entries are kept for 365 days');
  });

  test('a held email is discarded: never sent, gone from the list', async ({ page }) => {
    await signIn(page, undefined, '/held-mail');
    const table = page.getByRole('table', { name: 'Held emails' });
    await expect(table.locator('tbody tr')).toHaveCount(2);
    await table.locator('tbody tr').filter({ hasText: 'ana.anic@b.example.test' }).getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Discard the selected' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Discard the selected' }).click();
    await expect(toast(page)).toContainText('1 email discarded');
    await expect(table.locator('tbody tr')).toHaveCount(1);
  });
});

for (const width of [1440, 375]) {
  test.describe(`the screens of 0.4.0 at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('a submission, its status dialog with the email and its edit pass axe and fit the width', async ({ page }) => {
      await signIn(page, undefined, `/submissions/${PART_C.submissions[0]}`);
      await expect(page.locator('[data-confera-submission-status="open"]')).toBeVisible();
      expect(await scan(page)).toEqual([]);
      expect(await overflowing(page)).toEqual([]);
      const dialog = await changeStatus(page, 'Return for revision');
      await dialog.getByLabel('Message for the author').fill('Molimo skratite apstrakt.');
      await dialog.getByRole('button', { name: 'Show the email' }).click();
      await expect(dialog.locator('[data-confera-status-step="email"]')).toBeVisible();
      expect(await scan(page)).toEqual([]);
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await page.getByRole('button', { name: 'Edit on the author’s behalf' }).click();
      await expect(page.getByRole('dialog', { name: 'Edit on the author’s behalf' })).toBeVisible();
      expect(await scan(page)).toEqual([]);
    });

    test('the template editor and the mail log pass axe and fit the width', async ({ page }) => {
      await signIn(page, undefined, '/templates');
      await conferenceSwitch(page).selectOption({ label: 'Konferencija za probe (KP 2026)' });
      await openTemplate(page, 'Submission returned for revision');
      expect(await scan(page)).toEqual([]);
      expect(await fitsTheWidth(page)).toBe(true);
      await page.goto(`${ADMIN_ORIGIN}/mail-log`);
      await expect(page.locator('[data-confera-mail-log-settings]')).toBeVisible();
      expect(await scan(page)).toEqual([]);
      expect(await fitsTheWidth(page)).toBe(true);
      await page.goto(`${ADMIN_ORIGIN}/submissions`);
      await expect(rows(page)).toHaveCount(2);
      expect(await scan(page)).toEqual([]);
      expect(await fitsTheWidth(page)).toBe(true);
    });
  });
}
