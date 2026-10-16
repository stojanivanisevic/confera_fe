// Edge cases of the admin application (M2-FE-01 to M2-FE-05) found by the edge-case hunter: what
// only a real browser can answer. The screens are served by the test build, the API by the stub.
//
//   E2-10  the time zones the screens offer are the zones the API accepts
//   E2-22  a 375 px screen holds the longest values the API accepts
import { ADMIN_ORIGIN } from './env';
import { ADMIN, AGAINST_REAL_API, holdsSession, NO_SESSION_IN_WEBKIT, resetStub, signIn, STUB_ONLY } from './support/admin';
import { expect, test } from './support/fixtures';

test.describe.configure({ mode: 'default' });

test.describe('the admin in a browser, edge cases', () => {
  test.beforeEach(async ({ page, browserName }) => {
    test.skip(!holdsSession(browserName), NO_SESSION_IN_WEBKIT);
    await resetStub(page);
  });

  // E2-10. The conference form offers `Intl.supportedValuesOf('timeZone')` of the BROWSER ("the API
  // checks the same IANA names", Conferences.tsx); the API accepts the zones that the same call lists
  // in ITS Node 22 and nothing else (`isTimeZone`, 400). Two ICU versions are two lists, and the gap
  // grows with every browser: today Chromium offers "America/Coyhaique", which the API refuses.
  test('every time zone the new-conference form offers is a time zone the API accepts', async ({ page }) => {
    await signIn(page, ADMIN, '/conferences');
    await page.getByRole('button', { name: 'New conference' }).first().click();
    const offered = await page.locator('select[name="timeZone"] option').evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
    expect(offered.length).toBeGreaterThan(100);
    const accepted = new Set(['UTC', ...Intl.supportedValuesOf('timeZone')]);
    expect(offered.filter((zone) => !accepted.has(zone))).toEqual([]);
  });

  // E2-22 (NFR-RESP-02): no sideways scroll at 375 px. The API takes a name of 200 letters without
  // a space and an address of 254 characters; the lists, the details and the headings must hold them.
  test.describe('375 px', () => {
    test.use({ viewport: { width: 375, height: 800 } });

    test('the longest names and addresses the API accepts fit the width', async ({ page }) => {
      test.skip(AGAINST_REAL_API, STUB_ONLY);
      await signIn(page, ADMIN, '/users');
      const name = 'Đ'.repeat(200);
      const email = `${'a'.repeat(64)}@${'b'.repeat(60)}.${'c'.repeat(60)}.${'d'.repeat(60)}.test`;
      const made = await page.evaluate(
        async ({ name: displayName, email: address, password: secret }) => {
          const session = (await (await fetch('/api/v1/session')).json()) as { csrf: string };
          const headers = { 'content-type': 'application/json', 'x-csrf-token': session.csrf };
          // The change of users asks for the password again.
          await fetch('/api/v1/session/password-confirmation', { method: 'POST', headers, body: JSON.stringify({ password: secret }) });
          const user = await fetch('/api/v1/users', { method: 'POST', headers, body: JSON.stringify({ email: address, displayName, role: 'reviewer' }) });
          const conference = await fetch('/api/v1/conferences', { method: 'POST', headers, body: JSON.stringify({ name: displayName, code: 'ZZ', editionYear: 2044, languages: ['en'] }) });
          return { user: (await user.json()) as { id: string }, conference: (await conference.json()) as { id: string } };
        },
        { name, email, password: ADMIN.password },
      );
      expect(made.user.id, 'the user was made').toBeTruthy();
      expect(made.conference.id, 'the conference was made').toBeTruthy();
      const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const seen: Record<string, number> = {};
      for (const path of ['/users', `/users/${made.user.id}`, '/conferences', `/conferences/${made.conference.id}`]) {
        await page.goto(`${ADMIN_ORIGIN}${path}`);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await page.waitForTimeout(300);
        seen[path.replace(/[0-9a-f-]{20,}/, ':id')] = Math.max(0, await overflow());
      }
      expect(seen).toEqual({ '/users': 0, '/users/:id': 0, '/conferences': 0, '/conferences/:id': 0 });
    });
  });
});
