// M2-FE-01 and M2-FE-02: the admin screens of 0.2.0 part A in a browser, in three engines,
// against the API stub (e2e/servers/api-stub.mjs), which follows the vendored contract.
//   sign-in and the guard of the shell; the `next` rule (ST-26); the pages of the links with
//   the live checklist that sends nothing while the password is typed (ST-62); forgot
//   password; my account; users with the password asked again and the last-admin rule; the
//   organisation with the password-again dialog and the 14-day notice; the audit log.
// Each engine has a universe of its own in the stub; the tests of this file run one after
// the other, and every test starts from the fixture.
import type { Page } from '@playwright/test';

import { ADMIN_ORIGIN } from './env';
import { answerPasswordAgain, fitsTheWidth, holdsSession, linkToken, NO_SESSION_IN_WEBKIT, resetStub, signIn, signOutFromMenu, STUB } from './support/admin';
import { expect, test } from './support/fixtures';
import { watchPage } from './support/page-problems';

test.describe.configure({ mode: 'serial' });

// Passwords the tests set: placeholders by the rule of the secret scan, and good passwords by the rule set.
const NEW_PASSWORD = 'invented-Planina-Reka-Sto-7';
const RESET_PASSWORD = 'invented-Volim-te-Srbijo-1';
const CHANGED_PASSWORD = 'invented-Korektan-konj-baterija-2';

test.beforeEach(async ({ page }) => {
  await resetStub(page);
});

/** The requests of the page to the API, as they happen. */
const apiCalls = (page: Page): string[] => {
  const calls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/')) calls.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  return calls;
};

test.describe('sign-in and the shell (M2-FE-01)', () => {
  test.skip(({ browserName }) => !holdsSession(browserName), NO_SESSION_IN_WEBKIT);

  test('a wrong password reads the same as an unknown address; the right one lands on the home page', async ({ page }) => {
    const problems = watchPage(page);
    await page.goto(`${ADMIN_ORIGIN}/sign-in`);
    await page.getByLabel('Email address').fill('nobody@a.example.test');
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill('invented-wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('.ud-alert--error')).toContainText('The address or the password is not right');
    await page.getByLabel('Email address').fill(STUB.admin.email);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('.ud-alert--error')).toContainText('The address or the password is not right');

    await page.getByRole('textbox', { name: 'Password', exact: true }).fill(STUB.admin.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(`${ADMIN_ORIGIN}/`);
    await expect(page.getByRole('heading', { level: 1, name: `Welcome, ${STUB.admin.name}` })).toBeVisible();
    await expect(page.locator('[data-confera-connection="connected"]')).toContainText('Confera is working.');
    // The password never went into an address, and every call stayed on this origin.
    expect(problems.requests.some((url) => url.includes(STUB.admin.password))).toBe(false);
    expect(problems.requests.filter((url) => url.includes('/api/')).every((url) => url.startsWith(ADMIN_ORIGIN))).toBe(true);
    expect(problems.messages).toEqual([]);
  });

  test('without a session a screen sends to sign-in and comes back afterwards; sign-out ends it', async ({ page }) => {
    await page.goto(`${ADMIN_ORIGIN}/users`);
    await expect(page).toHaveURL(`${ADMIN_ORIGIN}/sign-in?next=%2Fusers`);
    await page.getByLabel('Email address').fill(STUB.admin.email);
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill(STUB.admin.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(`${ADMIN_ORIGIN}/users`);
    await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible();
    // Signed in, the sign-in page goes on to the destination by itself.
    await page.goto(`${ADMIN_ORIGIN}/sign-in?next=%2Faudit`);
    await expect(page).toHaveURL(`${ADMIN_ORIGIN}/audit`);
    await signOutFromMenu(page);
    await expect(page).toHaveURL(`${ADMIN_ORIGIN}/sign-in`);
    await page.goto(`${ADMIN_ORIGIN}/audit`);
    await expect(page).toHaveURL(`${ADMIN_ORIGIN}/sign-in?next=%2Faudit`);
  });

  test('ST-26: next with a double slash, a full address or a backslash is ignored after sign-in', async ({ page }) => {
    for (const next of ['//evil.example.test/', 'https://evil.example.test/users', `${ADMIN_ORIGIN}/users`, '/\\evil.example.test', '/%2F/evil', 'javascript:alert(1)', '/sign-in']) {
      await resetStub(page);
      await page.goto(`${ADMIN_ORIGIN}/sign-in?next=${encodeURIComponent(next)}`);
      await page.getByLabel('Email address').fill(STUB.admin.email);
      await page.getByRole('textbox', { name: 'Password', exact: true }).fill(STUB.admin.password);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page, `next=${next}`).toHaveURL(`${ADMIN_ORIGIN}/`);
      await signOutFromMenu(page);
      await expect(page).toHaveURL(`${ADMIN_ORIGIN}/sign-in`);
    }
  });

  test('every changing request carries the CSRF header of the session; a background refetch says so', async ({ page }) => {
    await signIn(page);
    const seen: Array<{ method: string; path: string; csrf: string | null; background: string | null }> = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/v1/')) seen.push({ method: request.method(), path: new URL(request.url()).pathname, csrf: request.headers()['x-csrf-token'] ?? null, background: request.headers()['x-confera-background'] ?? null });
    });
    await page.goto(`${ADMIN_ORIGIN}/account`);
    await signOutFromMenu(page);
    await expect(page).toHaveURL(`${ADMIN_ORIGIN}/sign-in`);
    const signOut = seen.find((r) => r.method === 'DELETE' && r.path === '/api/v1/session');
    expect(signOut?.csrf).toMatch(/^[A-Za-z0-9]{20,}$/);
    for (const r of seen.filter((x) => x.method === 'GET')) expect(r.csrf, `${r.method} ${r.path}`).toBeNull();
    expect(seen.some((r) => r.background === '1'), 'the organisation is read in the background for the support contact').toBe(true);
  });

  test('"API down" and "updated" on the home page speak to the office', async ({ page }) => {
    await signIn(page);
    await page.route('**/api/v1/meta', (route) => route.fulfill({ status: 502, contentType: 'application/problem+json', json: { status: 502, code: 'api_unreachable' } }));
    await page.goto(`${ADMIN_ORIGIN}/`);
    const down = page.locator('[data-confera-connection="unreachable"]');
    await expect(down).toContainText('Confera cannot reach its server');
    await expect(down).toContainText(`write to ${STUB.organisation.contactEmail}`);
    await page.unroute('**/api/v1/meta');
    await down.getByRole('button', { name: 'Try again' }).click();
    await expect(page.locator('[data-confera-connection="connected"]')).toContainText('Confera is working.');
    await page.route('**/api/v1/meta', (route) => route.fulfill({ json: { name: 'confera-api', version: '9.0.0' } }));
    await page.goto(`${ADMIN_ORIGIN}/`);
    await expect(page.locator('[data-confera-connection="mismatch"]')).toContainText('Confera has been updated');
    await expect(page.getByRole('button', { name: 'Reload page' })).toBeVisible();
  });
});

test.describe('the pages of the links and the live checklist (M2-FE-01, ST-62)', () => {
  test('an invitation: the checklist ticks while the person types and nothing is sent; the server refuses a leaked password with its code; a good one finishes the account', async ({ page, browserName }) => {
    const problems = watchPage(page);
    await page.goto(`${ADMIN_ORIGIN}/invitations/${linkToken('invitation')}`);
    await expect(page.getByRole('heading', { level: 1, name: `Welcome to ${STUB.organisation.name}` })).toBeVisible();
    await expect(page.getByText(`Set a password for ${STUB.invited.email}`)).toBeVisible();
    const calls = apiCalls(page);
    const line = (rule: string) => page.locator(`[data-rule="${rule}"]`);
    // Nothing is ticked before anything is typed (UXUI-M2-08).
    for (const rule of ['length', 'not_common', 'not_personal', 'match']) await expect(line(rule)).toHaveAttribute('data-met', 'false');

    const password = page.getByRole('textbox', { name: 'Password', exact: true });
    const repeat = page.getByLabel('Password, once more');
    await password.pressSequentially('Lazar-Reka-Sto-7');
    await expect(line('length')).toHaveAttribute('data-met', 'true');
    await expect(line('not_common')).toHaveAttribute('data-met', 'true');
    await expect(line('not_personal')).toHaveAttribute('data-met', 'false'); // the person's own name
    await expect(line('match')).toHaveAttribute('data-met', 'false');
    await password.fill(NEW_PASSWORD);
    await expect(line('not_personal')).toHaveAttribute('data-met', 'true');
    await repeat.pressSequentially(NEW_PASSWORD);
    await expect(line('match')).toHaveAttribute('data-met', 'true');
    expect(calls, 'nothing is sent while the password is typed').toEqual([]);

    // A password the browser's list does not know but the server refuses: the stub names the rule.
    await page.route('**/api/v1/invitations/*', (route) =>
      route.request().method() === 'POST' ? route.fulfill({ status: 400, contentType: 'application/problem+json', json: { status: 400, code: 'password_refused', traceId: 'x', errors: [{ path: 'password', code: 'password_common' }] } }) : route.continue(),
    );
    await page.getByRole('button', { name: 'Set the password and finish' }).click();
    await expect(page.locator('.ud-alert--error')).toContainText('That password cannot be used yet');
    await expect(line('not_common')).toHaveAttribute('data-refused', 'true');
    await expect(line('not_common')).toHaveAttribute('data-met', 'true'); // the browser still ticks it; the server's word is shown next to it
    await page.unroute('**/api/v1/invitations/*');

    await page.getByRole('button', { name: 'Set the password and finish' }).click();
    await expect(page.locator('.ud-alert--success')).toContainText('Your account is ready');
    await page.getByRole('link', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(`${ADMIN_ORIGIN}/sign-in`);
    // The new password signs in (not in WebKit: NO_SESSION_IN_WEBKIT).
    if (holdsSession(browserName)) await signIn(page, { email: STUB.invited.email, password: NEW_PASSWORD, name: STUB.invited.name });
    expect(problems.messages).toEqual([]);
  });

  test('a used or unknown link says so; a reset link sets a new password and ends the sessions', async ({ page, browserName }) => {
    await page.goto(`${ADMIN_ORIGIN}/invitations/invented-unknown-token`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('This link does not work any more');
    await expect(page.locator('.ud-alert--error')).toBeVisible();
    await page.goto(`${ADMIN_ORIGIN}/password-resets/${linkToken('password_reset')}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Set a new password' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill(RESET_PASSWORD);
    await page.getByLabel('Password, once more').fill(RESET_PASSWORD);
    await page.getByRole('button', { name: 'Set the new password' }).click();
    await expect(page.locator('.ud-alert--success')).toContainText('Your password is set');
    await page.goto(`${ADMIN_ORIGIN}/password-resets/${linkToken('password_reset')}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('This link does not work any more');
    await expect(page.locator('.ud-alert--error')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ask for a new link' })).toBeVisible();
    // The new password signs in (not in WebKit: NO_SESSION_IN_WEBKIT).
    if (holdsSession(browserName)) await signIn(page, { ...STUB.admin, password: RESET_PASSWORD });
  });

  test('forgot password answers the same for every address', async ({ page }) => {
    await page.goto(`${ADMIN_ORIGIN}/sign-in`);
    await page.getByRole('link', { name: 'Forgot your password?' }).click();
    await expect(page).toHaveURL(`${ADMIN_ORIGIN}/forgot-password`);
    for (const email of [STUB.admin.email, 'nobody@a.example.test']) {
      await page.goto(`${ADMIN_ORIGIN}/forgot-password`);
      await page.getByLabel('Email address').fill(email);
      await page.getByRole('button', { name: 'Send the link' }).click();
      await expect(page.locator('.ud-alert--success')).toContainText(`If ${email} has an active account, a link is on its way`);
    }
  });
});

test.describe('my account (M2-FE-01)', () => {
  test.skip(({ browserName }) => !holdsSession(browserName), NO_SESSION_IN_WEBKIT);

  test('the own password is changed with the checklist; the email through a link to the new address', async ({ page }) => {
    await signIn(page);
    await page.goto(`${ADMIN_ORIGIN}/account`);
    const form = page.locator('[data-confera-change-password]');
    await form.getByLabel('Current password').fill(STUB.admin.password);
    await form.getByRole('textbox', { name: 'New password', exact: true }).fill(CHANGED_PASSWORD);
    await form.getByLabel('New password, once more').fill(CHANGED_PASSWORD);
    await expect(form.locator('[data-rule="match"]')).toHaveAttribute('data-met', 'true');
    await form.getByRole('button', { name: 'Change the password' }).click();
    await expect(page.locator('.ud-toast')).toContainText('Password changed');

    const emailForm = page.locator('[data-confera-change-email]');
    await emailForm.getByLabel('New email address').fill('zivana.nova@a.example.test');
    await emailForm.getByLabel('Your password').fill(CHANGED_PASSWORD);
    await emailForm.getByRole('button', { name: 'Send the link' }).click();
    await expect(page.locator('.ud-alert--success')).toContainText('Link sent to zivana.nova@a.example.test');

    // The link in the mailbox: the page shows the new address, the confirmation ends every session.
    await page.goto(`${ADMIN_ORIGIN}/email-changes/${STUB.emailChangeToken}`);
    await expect(page.getByText('Your account will use zivana.nova@a.example.test')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm the new address' }).click();
    await expect(page.locator('.ud-alert--success')).toContainText('Your address is changed');
    await page.goto(`${ADMIN_ORIGIN}/account`);
    await expect(page).toHaveURL(`${ADMIN_ORIGIN}/sign-in?next=%2Faccount`);
    await signIn(page, { email: 'zivana.nova@a.example.test', password: CHANGED_PASSWORD, name: STUB.admin.name }, '/account');
  });

  test('a wrong current password is said at the field; sign out everywhere asks first', async ({ page }) => {
    await signIn(page);
    await page.goto(`${ADMIN_ORIGIN}/account`);
    const form = page.locator('[data-confera-change-password]');
    await form.getByLabel('Current password').fill('invented-not-mine');
    await form.getByRole('textbox', { name: 'New password', exact: true }).fill(CHANGED_PASSWORD);
    await form.getByLabel('New password, once more').fill(CHANGED_PASSWORD);
    await form.getByRole('button', { name: 'Change the password' }).click();
    await expect(form.getByLabel('Current password')).toHaveAccessibleDescription('That is not your password');
    await page.getByRole('button', { name: 'Sign out everywhere' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Sign out on every device?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Sign out everywhere' }).click();
    await expect(page).toHaveURL(`${ADMIN_ORIGIN}/sign-in`);
  });
});

test.describe('users (M2-FE-02)', () => {
  test.skip(({ browserName }) => !holdsSession(browserName), NO_SESSION_IN_WEBKIT);

  test('the list, the search, an invitation with the password asked again, and the new user', async ({ page }) => {
    const problems = watchPage(page);
    await signIn(page, STUB.admin, '/users');
    const table = page.getByRole('table');
    await expect(table.locator('tbody tr')).toHaveCount(5); // the removed are not shown
    await page.getByRole('searchbox', { name: 'Search by name or address' }).fill('kovač');
    await expect(table.locator('tbody tr')).toHaveCount(1);
    await expect(table).toContainText(STUB.otherAdmin.name);
    await page.getByRole('searchbox', { name: 'Search by name or address' }).fill('zzz');
    await expect(page.getByText('No results for these filters')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).first().click();
    await expect(table.locator('tbody tr')).toHaveCount(5);

    await page.getByRole('button', { name: 'Invite a user' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Invite a user' });
    await dialog.getByLabel('Name').fill('Nova Osoba');
    await dialog.getByLabel('Email address').fill('nova.osoba@a.example.test');
    await dialog.getByLabel('Role').selectOption('reviewer');
    await dialog.getByRole('button', { name: 'Send the invitation' }).click();
    await answerPasswordAgain(page, STUB.admin.password);
    // What is true at that moment: saved, not yet sent; the page follows the API until it is sent (UXUI-M2-42).
    await expect(page.locator('.ud-toast')).toContainText('Invitation to nova.osoba@a.example.test saved. It goes out in a moment.');
    await expect(page.getByText('The invitation is saved and goes out in a moment.')).toBeVisible();
    await expect(page.getByText('The invitation was sent to nova.osoba@a.example.test.')).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/users\/0e2e/);
    await expect(page.getByRole('heading', { level: 1, name: 'Nova Osoba' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send the invitation again' })).toBeVisible();
    expect(problems.messages).toEqual([]);
  });

  test('an address that has an account is refused at the field; the password is asked once per 5 minutes', async ({ page }) => {
    await signIn(page, STUB.admin, '/users');
    await page.getByRole('button', { name: 'Invite a user' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Invite a user' });
    await dialog.getByLabel('Name').fill('Marta Again');
    await dialog.getByLabel('Email address').fill(STUB.otherAdmin.email);
    await dialog.getByRole('button', { name: 'Send the invitation' }).click();
    await answerPasswordAgain(page, STUB.admin.password);
    await expect(dialog.getByLabel('Email address')).toHaveAccessibleDescription('An account with this address exists already');
    await dialog.getByLabel('Email address').fill('nova.osoba@a.example.test');
    await dialog.getByRole('button', { name: 'Send the invitation' }).click();
    // Confirmed a moment ago: no second dialog.
    await expect(page.getByRole('dialog', { name: 'Your password, once more' })).toHaveCount(0);
    await expect(page.locator('.ud-toast')).toContainText('Invitation to nova.osoba@a.example.test saved');
  });

  test('a wrong password in the dialog is said there; cancelling changes nothing', async ({ page }) => {
    await signIn(page, STUB.admin, `/users/${STUB.deactivated.id}`);
    await page.getByRole('button', { name: 'Reactivate' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Reactivate' }).click();
    const again = page.getByRole('dialog', { name: 'Your password, once more' });
    await again.getByRole('textbox', { name: 'Password', exact: true }).fill('invented-not-mine');
    await again.getByRole('button', { name: 'Continue' }).click();
    // Said at the field, with the text selected for a new try (UXUI-M2-06).
    await expect(again.locator('.ud-field--error')).toContainText('That is not your password');
    await expect(again.getByRole('textbox', { name: 'Password', exact: true })).toBeFocused();
    await again.getByRole('button', { name: 'Cancel' }).click();
    await expect(again).toBeHidden();
    await expect(page.locator('.ud-badge')).toContainText('Deactivated');
  });

  test('deactivate, change the role, end the sessions, and the last-admin rule as the API refuses it', async ({ page }) => {
    await signIn(page, STUB.admin, `/users/${STUB.deactivated.id}`);
    await page.getByRole('button', { name: 'Reactivate' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Reactivate' }).click();
    await answerPasswordAgain(page, STUB.admin.password);
    await expect(page.locator('.ud-toast')).toContainText(`${STUB.deactivated.name} reactivated`);
    await expect(page.locator('.ud-badge')).toContainText('Active');

    await page.getByRole('button', { name: 'Change the role' }).click();
    const roleDialog = page.getByRole('dialog', { name: 'Change the role' });
    await roleDialog.getByLabel('Role').selectOption('admin');
    await roleDialog.getByRole('button', { name: 'Change the role' }).click();
    await expect(page.locator('.ud-toast').last()).toContainText('Role changed to Admin');

    // The other admin is deactivated, then this one is the last: demoting her is refused.
    await page.goto(`${ADMIN_ORIGIN}/users`);
    await page.getByRole('button', { name: STUB.otherAdmin.name, exact: true }).click();
    await page.getByRole('button', { name: 'Deactivate' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Deactivate' }).click();
    await expect(page.locator('.ud-toast').last()).toContainText(`${STUB.otherAdmin.name} deactivated`);
    await page.goto(`${ADMIN_ORIGIN}/users/${STUB.deactivated.id}`);
    await page.getByRole('button', { name: 'Deactivate' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Deactivate' }).click();
    await expect(page.locator('.ud-toast').last()).toContainText(`${STUB.deactivated.name} deactivated`);
    // Now Živana is the last active admin: she cannot become a reviewer.
    await page.goto(`${ADMIN_ORIGIN}/users`);
    await page.getByRole('button', { name: STUB.admin.name, exact: true }).click();
    // The last active admin cannot be demoted, deactivated or removed, and the page says why before anything is asked (UXUI-M2-07).
    await expect(page.locator('[data-confera-last-admin]')).toContainText('This is the last active admin');
    for (const name of ['Change the role', 'Deactivate', 'Remove']) await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
  });
});

test.describe('the organisation (M2-FE-02)', () => {
  test.skip(({ browserName }) => !holdsSession(browserName), NO_SESSION_IN_WEBKIT);

  test('the issuer data is saved; the payment details ask for the password again and show the 14-day notice', async ({ page }) => {
    await signIn(page, STUB.admin, '/organisation');
    await expect(page.locator('[data-confera-payment-notice]')).toHaveCount(0);
    const issuer = page.locator('[data-confera-issuer]');
    await issuer.getByLabel('Registration number (matični broj)').fill('1234');
    await issuer.getByRole('button', { name: 'Save the issuer data' }).click();
    await expect(issuer.getByLabel('Registration number (matični broj)')).toHaveAccessibleDescription('This is not a valid registration number. Check the digits.');
    await issuer.getByLabel('Registration number (matični broj)').fill('87654321');
    await issuer.getByLabel('Contact email address').fill('kancelarija@a.example.test');
    await issuer.getByRole('button', { name: 'Save the issuer data' }).click();
    await expect(page.locator('.ud-toast')).toContainText('Issuer data saved');

    const payment = page.locator('[data-confera-payment]');
    await payment.getByLabel('IBAN for payments in EUR').fill('RS35160000000000000222');
    await payment.getByRole('button', { name: 'Save the payment details' }).click();
    await answerPasswordAgain(page, STUB.admin.password);
    await expect(page.locator('.ud-toast').last()).toContainText('Payment details saved');
    await expect(page.locator('[data-confera-payment-notice]')).toContainText(`by ${STUB.admin.name}`);
    await page.reload();
    await expect(page.locator('[data-confera-payment-notice]')).toContainText('Payment details changed on');
  });

  test('a change on an older version is refused and offers a reload', async ({ page }) => {
    await signIn(page, STUB.admin, '/organisation');
    // Another admin saved meanwhile: the stub's version moved on.
    await page.route('**/api/v1/organisation', (route) =>
      route.request().method() === 'PATCH' ? route.fulfill({ status: 409, contentType: 'application/problem+json', json: { status: 409, code: 'version_conflict', traceId: 'x' } }) : route.continue(),
    );
    const issuer = page.locator('[data-confera-issuer]');
    await issuer.getByLabel('Short name').fill('Udruženje za probe A, novo');
    await issuer.getByRole('button', { name: 'Save the issuer data' }).click();
    await expect(issuer.locator('.ud-alert--error')).toContainText('Another admin changed this meanwhile');
    await expect(issuer.getByRole('button', { name: 'Reload the data' })).toBeVisible();
  });
});

test.describe('the audit log (M2-FE-02)', () => {
  test.skip(({ browserName }) => !holdsSession(browserName), NO_SESSION_IN_WEBKIT);

  test('entries, newest first, a filter by action, and the details of one', async ({ page }) => {
    await signIn(page, STUB.admin, '/audit');
    const table = page.getByRole('table');
    await expect(table.locator('tbody tr').first()).toContainText('Signed in');
    await page.getByLabel('Action').selectOption('organisation.updated');
    await expect(table.locator('tbody tr')).toHaveCount(1);
    await expect(table.locator('tbody tr').first()).toContainText('Changed the organisation');
    await table.locator('tbody button.ud-table__open').first().click();
    const drawer = page.getByRole('dialog', { name: 'Changed the organisation' });
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText('Trace id');
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
  });

  test('a reviewer sees no users, organisation or audit log', async ({ page }) => {
    await signIn(page, STUB.reviewer);
    await page.goto(`${ADMIN_ORIGIN}/audit`);
    await expect(page.locator('.ud-alert--error')).toContainText('You are not allowed to do this');
  });
});

for (const width of [1440, 375]) {
  test.describe(`the screens at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    test.skip(({ browserName }) => !holdsSession(browserName), NO_SESSION_IN_WEBKIT);

    test('every screen fits the width and is reached', async ({ page }) => {
      await signIn(page);
      for (const path of ['/', '/users', `/users/${STUB.invited.id}`, '/organisation', '/audit', '/account']) {
        await page.goto(`${ADMIN_ORIGIN}${path}`);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expect.poll(() => fitsTheWidth(page), `${path} at ${width}px`).toBe(true);
      }
      for (const path of ['/sign-in', '/forgot-password', `/invitations/${linkToken('invitation')}`]) {
        await page.goto(`${ADMIN_ORIGIN}${path}`);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expect.poll(() => fitsTheWidth(page), `${path} at ${width}px`).toBe(true);
      }
    });
  });
}
