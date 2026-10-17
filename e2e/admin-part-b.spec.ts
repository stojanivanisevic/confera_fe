// M2-FE-03, M2-FE-04 and M2-FE-05: the admin screens of 0.2.0 part B in a browser, against the
// API stub (e2e/servers/api-stub-part-b.mjs), which follows the vendored contract.
//   the conference switch, kept across screens and a reload; conferences: create, settings with
//   listed sites and time zone, state, copy, a taken code; mail servers: the write-only password,
//   the password asked again, a new target clears the stored password, the test message, a
//   server in use, a refused target; the mail log with a stored body only in the sandboxed frame
//   (ST-28); the template editor (the spike of ADR-12): a seeded template loads, a placeholder is
//   one object, the toolbar formats, the check agrees with the server's rules, the preview renders.
// The screens behind sign-in do not run in WebKit (NO_SESSION_IN_WEBKIT).
import type { Page } from '@playwright/test';

import { ADMIN_ORIGIN } from './env';
import { answerPasswordAgain, fitsTheWidth, holdsSession, NO_SESSION_IN_WEBKIT, PART_B, resetStub, signIn, STUB, templateId } from './support/admin';
import { expect, test } from './support/fixtures';
import { watchPage } from './support/page-problems';

test.describe.configure({ mode: 'serial' });
test.skip(({ browserName }) => !holdsSession(browserName), NO_SESSION_IN_WEBKIT);

// A mail-server password the tests type: a placeholder by the rule of the secret scan.
const SERVER_SECRET = 'invented-Postar-Novi-Pecat-8';

test.beforeEach(async ({ page }) => {
  await resetStub(page);
});

const conferenceSwitch = (page: Page) => page.locator('select[data-confera-conference-switch]');
const toast = (page: Page) => page.locator('.ud-toast').last();

test.describe('the conference switch (M2-FE-03)', () => {
  test('a conference chosen once narrows the mail log and the templates, and stays chosen across screens and a reload', async ({ page }) => {
    await signIn(page);
    // The switch is shown only where it narrows what the screen shows (UXUI-M2-05).
    await expect(conferenceSwitch(page)).toHaveCount(0);
    await page.goto(`${ADMIN_ORIGIN}/mail-log`);
    await expect(conferenceSwitch(page).locator('option')).toHaveText(['All conferences', 'Konferencija za probe (KP 2026)', 'Simpozijum za probe (SP 2027)']);
    await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(2);

    await conferenceSwitch(page).selectOption({ label: 'Konferencija za probe (KP 2026)' });
    await expect(page.getByText('The messages of Konferencija za probe (KP 2026).')).toBeVisible();
    await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(1);
    await expect(page.getByRole('table')).toContainText('marta.kovac@a.example.test');

    await page.getByRole('link', { name: 'Email templates' }).click();
    await expect(page.getByText('The templates of Konferencija za probe (KP 2026).')).toBeVisible();
    await expect(conferenceSwitch(page)).toHaveValue(PART_B.ids.conference);
    // The conference has no templates of its own: the organisation's are listed, marked as such.
    await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(14);
    await expect(page.getByRole('table').getByText('Organisation’s')).toHaveCount(14);
    await page.reload();
    await expect(conferenceSwitch(page)).toHaveValue(PART_B.ids.conference);

    await conferenceSwitch(page).selectOption({ label: 'All conferences' });
    await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(14);
    await expect(page.getByRole('table').getByText('Organisation’s')).toHaveCount(0);

    // An empty log of one conference says which, and offers all conferences.
    await page.goto(`${ADMIN_ORIGIN}/mail-log`);
    await conferenceSwitch(page).selectOption({ label: 'Simpozijum za probe (SP 2027)' });
    await expect(page.getByText('No messages for Simpozijum za probe (SP 2027)')).toBeVisible();
    await page.getByRole('button', { name: 'Show all conferences' }).click();
    await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(2);
  });
});

test.describe('conferences (M2-FE-03)', () => {
  test('a new conference starts as a draft; its listed sites are checked line by line; it opens, closes and is archived for good', async ({ page }) => {
    await signIn(page, STUB.admin, '/conferences');
    await expect(page.getByRole('table')).toContainText('Konferencija za probe');
    await page.getByRole('button', { name: 'New conference' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'New conference' });
    await dialog.getByLabel('Name').fill('Konferencija tri');
    await dialog.getByLabel('Code').fill('kt');
    await expect(dialog.getByLabel('Code')).toHaveValue('KT');
    await dialog.getByLabel('Time zone').selectOption('Europe/Belgrade');
    await dialog.getByRole('button', { name: 'Create the conference' }).click();
    await expect(toast(page)).toContainText('Konferencija tri created');
    await expect(page.getByRole('heading', { level: 1, name: 'Konferencija tri' })).toBeVisible();
    await expect(page.locator('.ud-badge').first()).toHaveText('Draft');

    const settings = page.locator('[data-confera-conference-settings]');
    await settings.getByLabel('Listed sites').fill('https://kt.example.test\nhttps://kt.example.test/forms\nhttps://other.example.test');
    await settings.getByRole('button', { name: 'Save the settings' }).click();
    await expect(settings).toContainText('Line 2: Only the site: no path after the address');
    await settings.getByLabel('Listed sites').fill('https://kt.example.test\nhttps://other.example.test');
    await settings.getByLabel('Time zone').selectOption('UTC');
    await settings.getByRole('button', { name: 'Save the settings' }).click();
    await expect(toast(page)).toContainText('Settings of Konferencija tri saved');
    // A new conference does not change what the mail log shows (UXUI-M2-05).
    await page.goto(`${ADMIN_ORIGIN}/mail-log`);
    await expect(conferenceSwitch(page)).toHaveValue('');
    await page.goBack();

    // The states and their actions as the office names them (D10); the final archive is in the menu of the conference (UXUI-M2-20, 39).
    await page.getByRole('button', { name: 'Open for submissions' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Open for submissions' }).click();
    await expect(page.locator('.ud-badge').first()).toHaveText('Open for submissions');
    await page.getByRole('button', { name: 'Close submissions' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Close submissions' }).click();
    await expect(page.locator('.ud-badge').first()).toHaveText('Submissions closed');
    await page.getByRole('button', { name: 'Conference actions' }).click();
    await page.getByRole('menuitem', { name: 'Archive' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Archive' }).click();
    await expect(page.getByText('This conference is archived')).toBeVisible();
    await expect(settings.getByLabel('Name')).toBeDisabled();
    await expect(settings.getByRole('button', { name: 'Save the settings' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /submissions|Conference actions/ })).toHaveCount(0);
  });

  test('a copy is a new draft without dates; a code and edition that are taken are refused', async ({ page }) => {
    await signIn(page, STUB.admin, `/conferences/${PART_B.ids.conference}`);
    await page.getByRole('button', { name: 'Conference actions' }).click();
    await page.getByRole('menuitem', { name: 'Make a copy' }).click();
    const dialog = page.getByRole('dialog', { name: 'Copy Konferencija za probe' });
    await expect(dialog.getByLabel('Edition (year)')).toHaveValue('2027');
    await dialog.getByLabel('Name').fill('Konferencija za probe 2027');
    await dialog.getByRole('button', { name: 'Make the copy' }).click();
    await expect(toast(page)).toContainText('Konferencija za probe 2027 (KP 2027) created as a copy');
    await expect(page.locator('.ud-badge').first()).toHaveText('Draft');
    const settings = page.locator('[data-confera-conference-settings]');
    await expect(settings.getByLabel('First day')).toHaveValue('');
    await expect(settings.getByLabel('Listed sites')).toHaveValue('https://kp.example.test');

    await settings.getByLabel('Edition (year)').fill('2026');
    await settings.getByRole('button', { name: 'Save the settings' }).click();
    await expect(page.locator('.ud-alert--error')).toContainText('This code and edition are taken');
  });
});

test.describe('mail servers (M2-FE-04)', () => {
  test('the password is write-only: a new target without a new password clears it, a new one is stored and never shown', async ({ page }) => {
    const problems = watchPage(page);
    await signIn(page, STUB.admin, '/mail-servers');
    await expect(page.getByRole('table')).toContainText('Kancelarija');
    await expect(page.getByRole('table')).toContainText('Default');
    await page.getByRole('button', { name: 'Kancelarija', exact: true }).click();
    const form = page.locator('[data-confera-mail-server]');
    await expect(form.getByRole('textbox', { name: 'Password', exact: true })).toHaveValue('');
    await expect(form).toContainText('A password is stored since');

    await form.getByLabel('Host').fill('smtp2.a.example.test');
    await expect(form).toContainText('A new host, port, user name or encryption without a new password removes the stored password');
    await form.getByRole('button', { name: 'Save the server' }).click();
    await answerPasswordAgain(page, STUB.admin.password);
    await expect(toast(page)).toContainText('Kancelarija saved');
    await expect(form).toContainText('No password is stored.');

    await form.getByRole('textbox', { name: 'Password', exact: true }).fill(SERVER_SECRET);
    await form.getByRole('button', { name: 'Save the server' }).click();
    await expect(toast(page).last()).toContainText('Kancelarija saved');
    await expect(form).toContainText('A password is stored since');
    await expect(form.getByRole('textbox', { name: 'Password', exact: true })).toHaveValue('');
    // The password went to the API once, in the body of the change, and is nowhere on the page.
    expect(await page.content()).not.toContain(SERVER_SECRET);
    expect(problems.requests.some((url) => url.includes(SERVER_SECRET))).toBe(false);
    expect(problems.messages).toEqual([]);
  });

  test('a test message is sent and logged; a server in use is not deleted; a target on this network is refused', async ({ page }) => {
    await signIn(page, STUB.admin, `/mail-servers/${PART_B.ids.server}`);
    const test = page.locator('[data-confera-test-message]');
    await expect(test.getByLabel('Send to')).toHaveValue(STUB.admin.email);
    await test.getByRole('button', { name: 'Send a test message' }).click();
    await expect(page.locator('[data-confera-test-result="sent"]')).toContainText(`Test message sent to ${STUB.admin.email}`);

    await page.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    await answerPasswordAgain(page, STUB.admin.password);
    await expect(page.locator('.ud-alert--error')).toContainText('This server is in use');

    await page.goto(`${ADMIN_ORIGIN}/mail-log`);
    await expect(page.getByRole('table').locator('tbody tr').first()).toContainText('Test message');

    await page.goto(`${ADMIN_ORIGIN}/mail-servers/new`);
    const form = page.locator('[data-confera-mail-server]');
    await form.getByRole('textbox', { name: 'Name', exact: true }).fill('Interni');
    await form.getByLabel('Host').fill('10.0.0.5');
    await form.getByLabel('Sender address').fill('office@a.example.test');
    await form.getByLabel('Sender name').fill('Udruženje');
    await form.getByRole('button', { name: 'Add the server' }).click();
    await expect(form).toContainText('This host is an address of a private network');
    await form.getByLabel('Host').fill('smtp.new.example.test');
    await form.getByRole('button', { name: 'Add the server' }).click();
    await expect(toast(page)).toContainText('Interni added');
    await expect(page.getByRole('heading', { level: 1, name: 'Interni' })).toBeVisible();
  });
});

test.describe('the mail log (M2-FE-04, ST-28)', () => {
  test('a stored body is shown only inside the sandboxed frame, where its script and its image handler do nothing', async ({ page }) => {
    await signIn(page, STUB.admin, `/mail-log/${PART_B.ids.hostileEntry}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Invitation' })).toBeVisible();
    await expect(page.getByText('To lazar.primeric@a.example.test')).toBeVisible();
    const frame = page.locator('iframe[title="Email body"]');
    await expect(frame).toHaveAttribute('sandbox', '');
    await expect(page.frameLocator('iframe[title="Email body"]').getByText('Dear Lazar Primerić,')).toBeVisible();
    await expect(page.locator('[data-confera-plain-body]')).toContainText('Set your password <[link]>');
    // Nothing of the stored markup is in the page itself, and nothing of it ran.
    await expect(page.locator('main script, main img[src="x"]')).toHaveCount(0);
    expect(await page.evaluate(() => document.body.dataset.pwned ?? null)).toBeNull();

    await page.goto(`${ADMIN_ORIGIN}/mail-log`);
    await page.getByRole('table').locator('tbody tr').filter({ hasText: 'marta.kovac' }).getByRole('button').click();
    await expect(page.getByText('The content of this message is not kept')).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0);
  });
});

test.describe('the template editor (M2-FE-05, the spike of ADR-12)', () => {
  const body = (page: Page) => page.locator('[data-confera-template-body] .ProseMirror');
  const chips = (page: Page) => body(page).locator('[data-placeholder]');

  test('a seeded template loads; a placeholder is one object; the toolbar formats; the check and the preview agree with the server', async ({ page }) => {
    const problems = watchPage(page);
    await signIn(page, STUB.admin, '/templates');
    await page.getByRole('table').locator('tbody tr').filter({ hasText: 'Invitation' }).filter({ hasText: 'English' }).getByRole('button').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Invitation (English)' })).toBeVisible();
    await expect(page.locator('[data-confera-template-subject] [data-placeholder="organisationName"]')).toHaveText('Organisation name');
    await expect(body(page).locator('[data-placeholder="recipientName"]')).toHaveText('Recipient’s name');
    await expect(body(page).locator('a[data-secure-link="true"]')).toHaveText('Set your password');
    const before = await chips(page).count();

    // A placeholder from the catalogue at the end of the first paragraph, then removed with one Backspace.
    await body(page).locator('p').first().click();
    await page.keyboard.press('End');
    await page.locator('[data-confera-insert-placeholder]').selectOption({ label: 'Inviter’s name' });
    await expect(chips(page)).toHaveCount(before + 1);
    await expect(body(page).locator('p').first().locator('[data-placeholder]').last()).toHaveText('Inviter’s name');
    await body(page).locator('p').first().click();
    await page.keyboard.press('End');
    await page.keyboard.press('Backspace');
    await expect(chips(page)).toHaveCount(before);
    await expect(body(page).locator('p').first()).toContainText('Dear Recipient’s name,');

    // A typed brace stays text; bold goes on the selection and not on a placeholder.
    await page.keyboard.type(' {{recipientName}}');
    await page.keyboard.down('Shift');
    for (let i = 0; i < 18; i++) await page.keyboard.press('ArrowLeft');
    await page.keyboard.up('Shift');
    await page.getByRole('toolbar', { name: 'Formatting' }).getByRole('button', { name: 'Bold' }).click();
    await expect(body(page).locator('strong')).toHaveText(' {{recipientName}}');
    await expect(page.getByRole('toolbar', { name: 'Formatting' }).getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');

    // The check passes, and the preview renders the made-up values in the sandboxed frame.
    await page.getByRole('button', { name: 'Check the template' }).click();
    await expect(page.locator('[data-confera-template-check="valid"]')).toContainText('The template is valid');
    await expect(page.locator('[data-confera-preview-subject]')).toHaveText('Your account at Udruženje za probe');
    const preview = page.frameLocator('iframe[title="Preview of the message"]');
    await expect(preview.getByText('Dear Mila Primer, {{recipientName}}')).toBeVisible();
    await expect(preview.locator('strong')).toHaveText(' {{recipientName}}');
    await expect(preview.getByRole('link', { name: 'Set your password' })).toHaveAttribute('href', 'https://admin.confera.example/invitations/sample');
    expect(problems.messages).toEqual([]);
  });

  test('a link takes https: and mailto: only; lists and headings; Enter in an empty item leaves the list', async ({ page }) => {
    await signIn(page, STUB.admin, `/templates/${templateId('sign_in_brake', 'en')}`);
    await body(page).locator('p').last().click();
    // The end of the document: End alone stops at the end of a wrapped line.
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Help');
    await page.keyboard.down('Shift');
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft');
    await page.keyboard.up('Shift');
    await page.getByRole('toolbar', { name: 'Formatting' }).getByRole('button', { name: 'Link' }).click();
    const dialog = page.getByRole('dialog', { name: 'Link' });
    await dialog.getByLabel('Address').fill('javascript:alert(1)');
    await dialog.getByRole('button', { name: 'Set the link' }).click();
    await expect(dialog).toContainText('Enter an address that starts with https:// or mailto:');
    await dialog.getByLabel('Address').fill('mailto:office@a.example.test');
    await dialog.getByRole('button', { name: 'Set the link' }).click();
    await expect(body(page).locator('a[href="mailto:office@a.example.test"]')).toHaveText('Help');

    await page.getByRole('toolbar', { name: 'Formatting' }).getByRole('button', { name: 'Bulleted list' }).click();
    await expect(body(page).locator('ul li')).toHaveText(['Help']);
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Second');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('After the list');
    await expect(body(page).locator('ul li')).toHaveText(['Help', 'Second']);
    await expect(body(page).locator('ul + p')).toHaveText('After the list');
    await page.getByRole('toolbar', { name: 'Formatting' }).getByLabel('Paragraph style').selectOption('heading2');
    await expect(body(page).locator('h2')).toHaveText('After the list');
    await page.getByRole('button', { name: 'Check the template' }).click();
    await expect(page.locator('[data-confera-template-check="valid"]')).toBeVisible();
    const preview = page.frameLocator('iframe[title="Preview of the message"]');
    await expect(preview.locator('ul li')).toHaveText(['Help', 'Second']);
    await expect(preview.locator('h2')).toHaveText('After the list');
  });
});

for (const width of [1440, 375]) {
  test.describe(`the screens of part B at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('every screen fits the width and is reached', async ({ page }) => {
      await signIn(page);
      for (const path of ['/conferences', `/conferences/${PART_B.ids.conference}`, '/mail-servers', `/mail-servers/${PART_B.ids.server}`, '/mail-servers/new', '/mail-log', `/mail-log/${PART_B.ids.hostileEntry}`, '/templates', `/templates/${templateId('security_notice', 'en')}`]) {
        await page.goto(`${ADMIN_ORIGIN}${path}`);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expect.poll(() => fitsTheWidth(page), `${path} at ${width}px`).toBe(true);
      }
    });
  });
}
