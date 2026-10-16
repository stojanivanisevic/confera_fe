// M2-QA-02: the flows of "To show" of 0.2.0, through the screens, against a REAL confera_be
// (README, "Against the real API"), with the mail they send read back from its mail catcher.
//
//   a mail server with a test message; invite a colleague, who sets a password with the
//   checklist ticking; reset a password; change the bank details (the password asked again,
//   the notice to the admins); the five draft conferences of the production seed, reached
//   through the first admin's invitation; the audit log.
//
// The file belongs to the project "real-api" (playwright.config.ts), which exists only when
// CONFERA_E2E_API_ORIGIN names a confera_be started by its documented commands (its README,
// section 9). What else it needs of that checkout, by environment, with the defaults of a
// fresh `.env`:
//   CONFERA_E2E_MAILPIT_ORIGIN     the web address of its mail catcher (http://127.0.0.1:8025)
//   CONFERA_E2E_MAILPIT_SMTP_PORT  the SMTP port of its mail catcher (1025)
//   CONFERA_E2E_BE_DIR             the checkout, for seed:production and first-admin (../confera_be)
// Every address is new in every run, so the file runs again on the same database.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import type { Browser, Page } from '@playwright/test';

import { ADMIN_ORIGIN } from './env';
import { answerPasswordAgain } from './support/admin';
import { expect, test } from './support/fixtures';
import { watchPage } from './support/page-problems';

test.describe.configure({ mode: 'serial' });

const MAILPIT = process.env.CONFERA_E2E_MAILPIT_ORIGIN ?? 'http://127.0.0.1:8025';
const MAILPIT_SMTP = process.env.CONFERA_E2E_MAILPIT_SMTP_PORT ?? '1025';
const BE_DIR = resolve(process.env.CONFERA_E2E_BE_DIR ?? '../confera_be');

/** The admin of organisation A of confera_be's seed:e2e (test/e2e/seed/e2e-seed.json). */
const SEED_ADMIN = { email: 'zivana.djordjevic@a.example.test', name: 'Živana Đorđević', password: 'invented-Jasen-Kula-Reka-42' };
const RUN = Date.now().toString(36);
const COLLEAGUE = { email: `kolega.${RUN}@a.example.test`, name: 'Kolega Probni' };
const COLLEAGUE_PASSWORD = 'invented-Breza-Most-Polje-7';
const RESET_PASSWORD = 'invented-Volim-te-Srbijo-1';
const FIRST_ADMIN = { email: 'prva.administratorka@udekom.example.test', name: 'Prva Administratorka' };
const FIRST_ADMIN_PASSWORD = 'invented-Lipa-Dunav-Zvono-5';
/** Two valid IBANs: each run changes the stored one to the other, so that there is a change to tell. */
const IBANS = ['RS35260005601001611379', 'RS70160000000000000222'] as const;

interface MailSummary { readonly ID: string; readonly Subject: string; readonly Created: string }

/** The messages to an address since a moment (the mail catcher keeps every run's mail; a search answers 50 at most, newest first). */
async function mailTo(address: string, since: number): Promise<MailSummary[]> {
  const response = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`);
  return ((await response.json()) as { messages: MailSummary[] }).messages.filter((message) => Date.parse(message.Created) >= since - 1_000);
}

/** Waits for a message to an address, sent since a moment, whose subject matches (the outbox worker sends every few seconds). */
async function waitForMail(address: string, subject: RegExp, since: number): Promise<{ text: string; subject: string }> {
  let found: MailSummary | undefined;
  await expect.poll(async () => {
    found = (await mailTo(address, since)).find((message) => subject.test(message.Subject));
    return found !== undefined;
  }, { timeout: 45_000, intervals: [1_000] }).toBe(true);
  const message = (await (await fetch(`${MAILPIT}/api/v1/message/${found!.ID}`)).json()) as { Text: string; Subject: string };
  return { text: message.Text, subject: message.Subject };
}

/** The path of the link of a purpose in a mail's text. */
function linkIn(text: string, path: 'invitations' | 'password-resets'): string {
  const match = new RegExp(`${ADMIN_ORIGIN}/${path}/[A-Za-z0-9_-]{43}`).exec(text);
  expect(match, `a ${path} link in the mail`).not.toBeNull();
  return match![0];
}

async function signInAs(page: Page, person: { email: string; name: string }, password: string, next = '/'): Promise<void> {
  await page.goto(`${ADMIN_ORIGIN}/sign-in${next === '/' ? '' : `?next=${encodeURIComponent(next)}`}`);
  await expect(page.locator('[data-confera-sign-in]')).toBeVisible();
  await page.getByLabel('Email address').fill(person.email);
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(`${ADMIN_ORIGIN}${next}`);
  await expect(page.locator('[data-confera-user]')).toHaveText(person.name);
}

/** Sets a password on the page of a link, with the checklist ticking and nothing sent while it is typed. */
async function setPasswordWithChecklist(page: Page, password: string, button: string): Promise<void> {
  const calls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/')) calls.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  const line = (rule: string) => page.locator(`[data-rule="${rule}"]`);
  await expect(line('length')).toHaveAttribute('data-met', 'false');
  const field = page.getByRole('textbox', { name: 'Password', exact: true });
  await field.pressSequentially('Password2026!');
  await expect(line('not_common')).toHaveAttribute('data-met', 'false'); // a leaked one
  await field.fill('');
  await field.pressSequentially(password);
  for (const rule of ['length', 'not_common', 'not_personal']) await expect(line(rule)).toHaveAttribute('data-met', 'true');
  await expect(line('match')).toHaveAttribute('data-met', 'false');
  await page.getByLabel('Password, once more').pressSequentially(password);
  await expect(line('match')).toHaveAttribute('data-met', 'true');
  expect(calls, 'nothing is sent while the password is typed').toEqual([]);
  await page.getByRole('button', { name: button }).click();
}

async function freshPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ baseURL: ADMIN_ORIGIN });
  return context.newPage();
}

test.describe('the flows of 0.2.0 against the real API, with their mail (M2-QA-02)', () => {
  test('a mail server is added with the password asked again, its test message arrives, and the mail log shows it only in the sandboxed frame', async ({ page }) => {
    const problems = watchPage(page);
    await signInAs(page, SEED_ADMIN, SEED_ADMIN.password, '/mail-servers/new');
    const form = page.locator('[data-confera-mail-server]');
    await form.getByRole('textbox', { name: 'Name', exact: true }).fill(`Mailpit ${RUN}`);
    await form.getByLabel('Host').fill('127.0.0.1');
    await form.getByLabel('Port').fill(MAILPIT_SMTP);
    await form.getByLabel('Encryption').selectOption('none');
    await form.getByLabel('Sender address').fill('office@a.example.test');
    await form.getByLabel('Sender name').fill('Udruženje za probe A');
    await form.getByText('Default server', { exact: true }).click();
    await expect(form.getByRole('switch', { name: 'Default server' })).toBeChecked();
    await form.getByRole('button', { name: 'Add the server' }).click();
    await answerPasswordAgain(page, SEED_ADMIN.password);
    await expect(page.locator('.ud-toast').last()).toContainText(`Mailpit ${RUN} added`);

    const sent = Date.now();
    const tester = page.locator('[data-confera-test-message]');
    await expect(tester.getByLabel('Send to')).toHaveValue(SEED_ADMIN.email);
    await tester.getByRole('button', { name: 'Send a test message' }).click();
    await expect(page.locator('[data-confera-test-result="sent"]')).toContainText(`Test message sent to ${SEED_ADMIN.email}`);
    await waitForMail(SEED_ADMIN.email, new RegExp(`^Confera test message from Mailpit ${RUN}$`), sent);

    await page.goto(`${ADMIN_ORIGIN}/mail-log`);
    const entry = page.getByRole('table').locator('tbody tr').filter({ hasText: 'Test message' }).first();
    await expect(entry).toContainText(SEED_ADMIN.email);
    await entry.getByRole('button').first().click();
    const frame = page.locator('iframe[title="Email body"]');
    await expect(frame).toHaveAttribute('sandbox', '');
    expect(problems.messages).toEqual([]);
  });

  test('an invited colleague gets the mail, sets a password with the checklist ticking, and signs in; the admins are told', async ({ page, browser }) => {
    await signInAs(page, SEED_ADMIN, SEED_ADMIN.password, '/users');
    const since = Date.now();
    await page.getByRole('button', { name: 'Invite a user' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Invite a user' });
    await dialog.getByLabel('Name').fill(COLLEAGUE.name);
    await dialog.getByLabel('Email address').fill(COLLEAGUE.email);
    await dialog.getByLabel('Role').selectOption('reviewer');
    await dialog.getByRole('button', { name: 'Send the invitation' }).click();
    await answerPasswordAgain(page, SEED_ADMIN.password);
    // Saved, not yet sent: the delivery state is what the API says it is (UXUI-M2-42).
    await expect(page.locator('.ud-toast').last()).toContainText(`Invitation to ${COLLEAGUE.email} saved. It goes out in a moment.`);
    await expect(page).toHaveURL(/\/users\/[0-9a-f-]{36}$/);
    const userId = new URL(page.url()).pathname.split('/').pop()!;
    // The outbox worker sends within seconds; the page follows the API until it knows.
    await expect.poll(async () => ((await (await page.request.get(`${ADMIN_ORIGIN}/api/v1/users/${userId}`)).json()) as { invitationDelivery?: string }).invitationDelivery, { timeout: 45_000, intervals: [1_000] }).toBe('sent');
    await expect(page.getByText(`The invitation was sent to ${COLLEAGUE.email}.`)).toBeVisible({ timeout: 15_000 });

    const invitation = await waitForMail(COLLEAGUE.email, /^Your account at /, since);
    expect(invitation.text).toContain(COLLEAGUE.name);
    await waitForMail(SEED_ADMIN.email, /^Security notice: a user was invited/, since);

    const colleague = await freshPage(browser);
    await colleague.goto(linkIn(invitation.text, 'invitations'));
    await expect(colleague.getByText(`Set a password for ${COLLEAGUE.email}`)).toBeVisible();
    await setPasswordWithChecklist(colleague, COLLEAGUE_PASSWORD, 'Set the password and finish');
    await expect(colleague.locator('.ud-alert--success')).toContainText('Your account is ready');
    await signInAs(colleague, COLLEAGUE, COLLEAGUE_PASSWORD);
    // The link is used up.
    await colleague.goto(linkIn(invitation.text, 'invitations'));
    await expect(colleague.locator('.ud-alert--error')).toContainText('This link does not work any more');
    await colleague.context().close();
  });

  test('a password reset: the mail arrives, the new password is set with the checklist, and it signs in', async ({ page }) => {
    const since = Date.now();
    await page.goto(`${ADMIN_ORIGIN}/forgot-password`);
    await page.getByLabel('Email address').fill(COLLEAGUE.email);
    await page.getByRole('button', { name: 'Send the link' }).click();
    await expect(page.locator('.ud-alert--success')).toContainText(`If ${COLLEAGUE.email} has an active account, a link is on its way`);
    const reset = await waitForMail(COLLEAGUE.email, /^Reset your password at /, since);
    await page.goto(linkIn(reset.text, 'password-resets'));
    await expect(page.getByRole('heading', { level: 1, name: 'Set a new password' })).toBeVisible();
    await setPasswordWithChecklist(page, RESET_PASSWORD, 'Set the new password');
    await expect(page.locator('.ud-alert--success')).toContainText('Your password is set');
    await signInAs(page, COLLEAGUE, RESET_PASSWORD);
  });

  test('the bank details are changed with the password asked again, and every active admin is told by mail', async ({ page }) => {
    // A new session: the password was not given again in it.
    await signInAs(page, SEED_ADMIN, SEED_ADMIN.password, '/organisation');
    const since = Date.now();
    const payment = page.locator('[data-confera-payment]');
    const field = payment.getByLabel('IBAN for payments in EUR');
    await page.waitForLoadState('networkidle');
    const IBAN = (await field.inputValue()).replace(/\s/g, '') === IBANS[0] ? IBANS[1] : IBANS[0];
    await field.fill(IBAN);
    await payment.getByRole('button', { name: 'Save the payment details' }).click();
    await answerPasswordAgain(page, SEED_ADMIN.password);
    await expect(page.locator('.ud-toast').last()).toContainText('Payment details saved');
    await expect(page.locator('[data-confera-payment-notice]')).toContainText(`by ${SEED_ADMIN.name}`);
    const notice = await waitForMail(SEED_ADMIN.email, /^Security notice: the payment details/, since);
    expect(notice.text).not.toContain(IBAN);
  });

  test('the audit log shows the changes of these flows, newest first', async ({ page }) => {
    await signInAs(page, SEED_ADMIN, SEED_ADMIN.password, '/audit');
    const table = page.getByRole('table');
    for (const what of [/payment details/i, /invit/i, /mail server/i]) await expect(table).toContainText(what);
    // Newest first: this very sign-in heads the list.
    await expect(table.locator('tbody tr').first()).toContainText('Signed in');
  });

  test('the production seed and the first admin: the invitation is printed once, accepted with the checklist, and the five conferences are drafts', async ({ page }) => {
    const run = (args: string[]) => spawnSync('corepack', ['pnpm', ...args], { cwd: BE_DIR, encoding: 'utf8', shell: process.platform === 'win32', timeout: 120_000 });
    const seeded = run(['seed:production']);
    expect(seeded.status, seeded.stderr).toBe(0);
    const invited = run(['first-admin', '--email', FIRST_ADMIN.email, '--name', `"${FIRST_ADMIN.name}"`]);
    if (invited.status === 0) {
      const links = invited.stdout.match(/https?:\/\/[^\s]+\/invitations\/[A-Za-z0-9_-]{43}/g) ?? [];
      expect(links).toHaveLength(1);
      await page.goto(links[0]!);
      await expect(page.getByText(`Set a password for ${FIRST_ADMIN.email}`)).toBeVisible();
      await setPasswordWithChecklist(page, FIRST_ADMIN_PASSWORD, 'Set the password and finish');
      await expect(page.locator('.ud-alert--success')).toContainText('Your account is ready');
    } else {
      // A run before this one on the same database made the first admin already.
      expect(invited.stderr).toContain('has an active admin already');
    }
    await signInAs(page, FIRST_ADMIN, FIRST_ADMIN_PASSWORD, '/conferences');
    const rows = page.getByRole('table').locator('tbody tr');
    await expect(rows).toHaveCount(5);
    for (const row of await rows.all()) await expect(row).toContainText('Draft');
  });
});
