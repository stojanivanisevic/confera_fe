// M3-FE-03, 05, 06, 08 in a browser, against the API stub (e2e/servers/api-stub-part-c.mjs, which
// follows the DTOs of confera_be's m3/be):
//   the forms of a conference; the snippet in the language of the site (D2) with the link above the
//   frame (D5); the configuration over the catalogue, the preview of the draft, Publish; a refused
//   draft says what is wrong; the deadlines with their history; the submissions table and one
//   submission with its files and their scan state; the held emails, their release and the alert of
//   the shell; the states of a conference as the office names them (D10) and its consent links (D6).
// The screens behind sign-in do not run in WebKit (NO_SESSION_IN_WEBKIT).
import type { Page } from '@playwright/test';

import { ADMIN_ORIGIN, PUBLIC_ORIGIN } from './env';
import { holdsSession, NO_SESSION_IN_WEBKIT, PART_B, PART_C, resetStub, signIn } from './support/admin';
import { expect, test } from './support/fixtures';
import { watchPage } from './support/page-problems';

test.describe.configure({ mode: 'serial' });
test.skip(({ browserName }) => !holdsSession(browserName), NO_SESSION_IN_WEBKIT);

// The office reads times in the zone of the conference; the screens show them in the browser's (Belgrade here).
test.use({ timezoneId: 'Europe/Belgrade' });

test.beforeEach(async ({ page }) => {
  await resetStub(page);
});

const toast = (page: Page) => page.locator('.ud-toast').last();
const conferenceSwitch = (page: Page) => page.locator('select[data-confera-conference-switch]');

test.describe('forms (M3-FE-03, M3-FE-05)', () => {
  test('the list narrows by the conference switch; a conference without a form gets one', async ({ page }) => {
    await signIn(page, undefined, '/forms');
    const table = page.getByRole('table', { name: 'Forms' });
    await expect(table.locator('tbody tr')).toHaveCount(1);
    await expect(table).toContainText('/f/kp-2026-abstract');
    await expect(table).toContainText('Version 1');
    await conferenceSwitch(page).selectOption({ label: 'Simpozijum za probe (SP 2027)' });
    await expect(page.getByText('No forms yet')).toBeVisible();
    await page.getByRole('button', { name: 'Create the abstract form' }).first().click();
    await expect(page).toHaveURL(/\/forms\/0e2ef000-/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Abstract submission · Simpozijum za probe (SP 2027)');
    await expect(page.getByText('The form is not published yet: the snippet shows it once it is.')).toBeVisible();
  });

  test('the snippet: in the language of the site, the link above the frame, the listed sites named', async ({ page }) => {
    await signIn(page, undefined, `/forms/${PART_C.form}`);
    const card = page.locator('[data-confera-embed-card]');
    const snippet = card.getByLabel('Snippet');
    // The visitor's browser decides until the site's language is chosen (UX3-12).
    await expect(card.getByLabel('Language of the site')).toHaveValue('browser');
    await card.getByLabel('Language of the site').selectOption('en');
    await expect(snippet).toHaveValue(new RegExp(`^<p lang="en"><a href="${PUBLIC_ORIGIN}/f/kp-2026-abstract\\?lang=en">Form not showing\\? Open it on its own page\\.</a></p>\\n<iframe id="confera-form-kp-2026-abstract" src="${PUBLIC_ORIGIN}/embed/kp-2026-abstract\\?lang=en"`));
    await card.getByLabel('Language of the site').selectOption('sr');
    await expect(snippet).toHaveValue(/Obrazac se ne prikazuje\? Otvorite ga na posebnoj stranici\./);
    await expect(snippet).toHaveValue(/embed\/kp-2026-abstract\?lang=sr/);
    await expect(snippet).toHaveValue(/title="Prijava apstrakta"/);
    await card.getByLabel('Language of the site').selectOption('browser');
    await expect(snippet).not.toHaveValue(/lang=/);
    await expect(card).toContainText('Listed now: https://kp.example.test.');
    await expect(card.getByRole('link', { name: 'The form on its own page' })).toHaveAttribute('href', `${PUBLIC_ORIGIN}/f/kp-2026-abstract`);
  });

  test('a field is changed in its drawer, saved as the draft, seen in the preview, and published as version 2', async ({ page }) => {
    const problems = watchPage(page);
    await signIn(page, undefined, `/forms/${PART_C.form}`);
    // Save and Publish together, with the state of the draft (UX3-09): nothing to publish yet.
    const actions = page.getByRole('region', { name: 'Save and publish' });
    await expect(actions).toContainText('Version 1 is published; the draft is the same');
    await expect(actions.getByRole('button', { name: 'Publish the draft' })).toBeDisabled();
    // A field asked on a condition says when it is required (UX3-10).
    await expect(page.getByRole('table', { name: 'Fields' }).locator('tbody tr').filter({ hasText: 'Tax number' })).toContainText('When “Who pays the fee?” is “My employer”');
    await page.getByRole('table', { name: 'Fields' }).getByRole('button', { name: 'Keywords' }).click();
    const drawer = page.getByRole('dialog', { name: 'Field: Keywords' });
    await drawer.getByLabel('Label (English)').fill('Key words');
    await drawer.getByLabel('Label (Serbian)').fill('Ključne reči rada');
    await drawer.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByText('The draft has changes that are not saved.')).toBeVisible();
    await expect(actions).toContainText('Unsaved changes');
    await expect(page.getByRole('button', { name: 'Publish the draft' })).toBeDisabled();
    await page.getByRole('button', { name: 'Save the draft' }).click();
    await expect(toast(page)).toContainText('Draft saved');
    await expect(actions).toContainText('Version 1 is published; the draft has changes that are not published');
    await expect(actions.getByRole('button', { name: 'Publish the draft' })).toBeEnabled();
    // The preview is the renderer of the sites, with the draft.
    const preview = page.locator('[data-confera-form-preview]');
    await preview.getByRole('radio', { name: 'With an abstract and a paper' }).check({ force: true });
    await expect(preview.getByLabel('Key words')).toBeVisible();
    await preview.getByRole('button', { name: 'Send' }).click();
    await expect(preview.locator('[data-confera-errors]')).toBeFocused();
    await page.getByRole('button', { name: 'Publish the draft' }).click();
    await page.getByRole('alertdialog', { name: 'Publish the draft as version 2?' }).getByRole('button', { name: 'Publish the draft' }).click();
    await expect(toast(page)).toContainText('Version 2 is published');
    await expect(page.getByRole('table', { name: 'Versions' }).locator('tbody tr')).toHaveCount(2);
    expect(problems.messages).toEqual([]);
  });

  test('a draft the server refuses says what is wrong, in words', async ({ page }) => {
    await signIn(page, undefined, `/forms/${PART_C.form}`);
    await page.getByLabel('Consent (English)').fill('I accept the [terms](http://example.test/terms).');
    await page.getByRole('button', { name: 'Save the draft' }).click();
    await expect(page.locator('.ud-alert--error')).toContainText('Consent: A link must be [words](https://…), [words](terms) or [words](privacy)');
  });

  test('the send breaker of the form is saved', async ({ page }) => {
    await signIn(page, undefined, `/forms/${PART_C.form}`);
    await page.getByLabel('Emails an hour').fill('60');
    await page.getByRole('button', { name: 'Save the send breaker' }).click();
    await expect(toast(page)).toContainText('Send breaker saved');
  });
});

test.describe('deadlines (M3-FE-06; FR-DL-03)', () => {
  test('a later day is saved, the history keeps the old and the new day and who changed it', async ({ page }) => {
    await signIn(page, undefined, `/conferences/${PART_B.ids.conference}`);
    const card = page.locator('[data-confera-deadlines]');
    await expect(card).toContainText('A deadline ends at the end of its day in Europe/Belgrade.');
    const abstract = card.locator('[data-confera-deadline="abstract_submission"]');
    // The last day as set, inclusive (UX3-08); the Save of each deadline has a name of its own (UX3-11).
    await expect(abstract).toContainText('Open until the end of 15 Mar 2027 (Europe/Belgrade)');
    // Exact: the Save's name holds the field's name as part of what it does ("Save the abstract submission deadline").
    await abstract.getByLabel('Abstract submission', { exact: true }).fill('2027-03-31');
    await abstract.getByRole('button', { name: 'Save the abstract submission deadline' }).click();
    await expect(toast(page)).toContainText('Abstract submission: the last day is now 31 Mar 2027');
    await expect(card.getByRole('table', { name: 'Changes' })).toContainText('Abstract submission: 15 Mar 2027 → 31 Mar 2027');
    await expect(card.getByRole('table', { name: 'Changes' })).toContainText('Živana Đorđević');
  });

  test('the states as the office names them (D10), and the consent links of the forms (D6)', async ({ page }) => {
    await signIn(page, undefined, `/conferences/${PART_B.ids.conference}`);
    await expect(page.locator('.ud-badge').first()).toHaveText('Open for submissions');
    await expect(page.getByRole('button', { name: 'Close submissions' })).toBeVisible();
    await page.getByLabel('Terms of publication (address)').fill('https://kp.example.test/terms');
    await page.getByRole('button', { name: 'Save the settings' }).click();
    await expect(toast(page)).toContainText('Settings of Konferencija za probe saved');
  });
});

test.describe('submissions (M3-FE-06; FR-SUB-02, FR-SUB-04)', () => {
  test('the table, by keyboard, and one submission with its files, consent, history and emails', async ({ page }) => {
    await signIn(page, undefined, '/submissions');
    const table = page.getByRole('table', { name: 'Submissions' });
    await expect(table.locator('tbody tr')).toHaveCount(2);
    await expect(table).toContainText('KP26-0002');
    await expect(table).toContainText('Živana Đorđević');
    // A flagged or waiting file shows in the list (UX3-07).
    await expect(table.locator('tbody tr').filter({ hasText: 'KP26-0002' })).toContainText('Flagged file');
    await expect(table.locator('tbody tr').filter({ hasText: 'KP26-0002' })).toContainText('Scan pending');
    // A row is reached by Tab and opened by Enter (M1-ISS-10).
    await table.getByRole('button', { name: 'KP26-0002' }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(`${ADMIN_ORIGIN}/submissions/${PART_C.submissions[0]}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Održivi turizam na Balkanu');
    // The data under the labels of the form version, the options in words.
    await expect(page.getByText('How do you take part?')).toBeVisible();
    await expect(page.getByText('With an abstract and a paper')).toBeVisible();
    // A clean file is downloaded under its own name; a pending one is not served, and an old .doc with macros is flagged.
    const download = page.getByRole('link', { name: 'Download Biografije – Šćepanović.pdf' });
    await expect(download).toHaveAttribute('href', `/api/v1/submissions/${PART_C.submissions[0]}/files/${PART_C.files.clean}`);
    const [file] = await Promise.all([page.waitForEvent('download'), download.click()]);
    expect(file.suggestedFilename()).toBe('Biografije – Šćepanović.pdf');
    await expect(page.locator('[data-confera-file-scan="pending"]')).toContainText('Scan pending since');
    await expect(page.locator('[data-confera-file-scan="pending"]')).toContainText('An old .doc with macros: open it with care');
    await expect(page.locator('[data-confera-file-scan="pending"]').getByRole('link')).toHaveCount(0);
    // A .docx with an external relationship (a remote template) is kept, served once clean, and flagged (SEC-M3-06).
    const linked = page.locator('[data-confera-file-scan="clean"]', { has: page.getByRole('link', { name: 'Download Rad.docx' }) });
    await expect(linked).toContainText('Links to content outside the file, such as a remote template: open it with care');
    await expect(page.locator('[data-confera-file-scan="clean"]', { has: page.getByRole('link', { name: 'Download Biografije – Šćepanović.pdf' }) })).not.toContainText('open it with care');
    // A pending file says when it can be opened (UX3-07).
    await expect(page.locator('[data-confera-file-scan="pending"]')).toContainText('The file can be downloaded when the scan is done.');
    // The abstract has a row of its own, the width of the card, with its paragraphs (UX3-02).
    const abstract = page.locator('[data-confera-long-answer="abstract"]');
    await expect(abstract.getByRole('heading')).toHaveText(/^Abstract, \d+ words$/);
    await expect(abstract.locator('p')).toHaveCSS('white-space', 'pre-wrap');
    expect(await abstract.evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(500);
    // The consent as read, its links as words, and the version short (UX3-05).
    const consent = page.locator('section', { has: page.getByRole('heading', { name: 'Consent', level: 2 }) });
    await expect(consent).not.toContainText('](');
    await expect(page.getByText('Given 16 Oct 2026, 16:56, text version c51e7625')).toBeVisible();
    await expect(page.getByRole('table', { name: 'Emails' })).toContainText('Held by the send breaker');
    // The numbers that held it (UX3-06).
    await expect(page.getByRole('table', { name: 'Emails' })).toContainText('31 confirmations in the last hour, above the limit of 30');
  });
});

test.describe('held emails (M3-FE-08)', () => {
  test('the shell says they are held; the screen says why and that one click releases them; all are released', async ({ page }) => {
    await signIn(page);
    const alert = page.locator('[data-confera-held-mail-alert]');
    await expect(alert).toContainText('2 confirmation emails are held');
    await alert.getByRole('button', { name: 'Review held emails' }).click();
    await expect(page).toHaveURL(`${ADMIN_ORIGIN}/held-mail`);
    await expect(page.getByText('A deadline day can trip the breaker by itself: then the emails are real, and one click releases them.')).toBeVisible();
    await expect(page.getByRole('table', { name: 'Held emails' })).toContainText('The breaker of the form: 31 confirmations in the last hour, above the limit of 30');
    // One held before the numbers were kept says only why.
    await expect(page.getByRole('table', { name: 'Held emails' })).toContainText('The breaker of the organisation');
    await page.getByRole('button', { name: 'Release all 2' }).click();
    await page.getByRole('alertdialog', { name: 'Release 2 emails?' }).getByRole('button', { name: 'Release all 2' }).click();
    await expect(toast(page)).toContainText('2 emails released');
    await expect(page.getByText('No email is held')).toBeVisible();
    await page.goto(`${ADMIN_ORIGIN}/`);
    await expect(page.locator('[data-confera-held-mail-alert]')).toHaveCount(0);
  });

  test('a selected one is released alone', async ({ page }) => {
    await signIn(page, undefined, '/held-mail');
    const table = page.getByRole('table', { name: 'Held emails' });
    await table.locator('tbody tr').first().getByRole('checkbox').check({ force: true });
    await page.getByRole('button', { name: 'Release the selected' }).click();
    await page.getByRole('alertdialog', { name: 'Release 1 email?' }).getByRole('button', { name: 'Release the selected' }).click();
    await expect(toast(page)).toContainText('1 email released');
    await expect(table.locator('tbody tr')).toHaveCount(1);
  });
});
