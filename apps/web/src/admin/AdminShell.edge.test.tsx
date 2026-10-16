// @vitest-environment jsdom
//
// E2-20 (ADR-03: a session ends after 24 hours without use, or after 7 days; M2-FE-01): the
// session ends while the person has a screen open - the tab was left over lunch, the other tab
// signed out everywhere, an admin ended the session.
//   - A CHANGE (save, invite, remove) that meets the end answers 401 `unauthenticated`. Only the
//     loading of a screen turns a 401 into "go to sign-in"; a change shows `explain()` of it,
//     which is "Something went wrong ... write to the contact and name this id". The person is
//     told to try again and to call for help, when all that is needed is to sign in.
//   - A screen that sends the person to sign-in does it without a word: the sign-in page has a
//     text for it ("Your session ended. Sign in again to continue.", `?reason=session-ended`),
//     and nothing in the application ever sets that reason.
import { afterEach, describe, expect, it, vi } from 'vitest';

import { button, click, FakeApi, field, forgetFake, mountBare, type Mounted, problem, typeInto, useFake } from '../../../../tests/support/admin-harness';
import { AdminShell } from './AdminShell';
import { Organisation } from './Organisation';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  usePathname: () => '/organisation',
}));

const organisation = {
  id: '0e2e0000-0000-4000-8000-0000000000b1',
  name: 'Udruženje (izmišljeno)',
  legalName: null,
  address: null,
  registrationNumber: null,
  taxNumber: null,
  contactEmail: 'ured@a.example.test',
  vatNoteSr: null,
  vatNoteEn: null,
  rsdAccount: null,
  eurIban: null,
  eurSwift: null,
  eurBankName: null,
  paypalPayee: null,
  paymentDetailsChangedAt: null,
  paymentDetailsChangedBy: null,
  mailLogContent: true,
  version: 1,
};

let screen: Mounted | undefined;
afterEach(async () => {
  forgetFake();
  replace.mockClear();
  await screen?.unmount();
  screen = undefined;
});

describe('a session that ends while a screen is open (E2-20)', () => {
  it('a save that meets the end tells the person to sign in, not that something went wrong', async () => {
    const fake = new FakeApi();
    fake.route = (request) => {
      if (request.path === '/api/v1/organisation' && request.method === 'GET') return { status: 200, body: organisation };
      if (request.path === '/api/v1/organisation' && request.method === 'PATCH') return problem(401, 'unauthenticated');
      return undefined;
    };
    useFake(fake);
    screen = await mountBare(
      <AdminShell>
        <Organisation />
      </AdminShell>,
    );

    await typeInto(field(screen.container, 'legalName'), 'Udruženje ekonomista');
    await click(button(screen.container, 'Save the issuer data'));

    const alert = screen.container.querySelector('[role="alert"]');
    const sentToSignIn = replace.mock.calls.some(([to]) => String(to).startsWith('/sign-in'));
    const toldSoOnTheScreen = /session|sign in|signed out/i.test(alert?.textContent ?? '');
    expect(sentToSignIn || toldSoOnTheScreen).toBe(true);
    expect(alert?.textContent ?? '').not.toContain('Something went wrong');
  });

  it('a screen that finds the session gone sends the person to sign-in and says why', async () => {
    const fake = new FakeApi();
    fake.route = (request) => {
      if (request.path === '/api/v1/organisation' && request.method === 'GET') return problem(401, 'unauthenticated');
      return undefined;
    };
    useFake(fake);
    screen = await mountBare(
      <AdminShell>
        <Organisation />
      </AdminShell>,
    );

    const targets = replace.mock.calls.map(([to]) => String(to));
    expect(targets.some((to) => to.startsWith('/sign-in'))).toBe(true);
    expect(targets.some((to) => to.includes('reason=session-ended'))).toBe(true);
  });
});
