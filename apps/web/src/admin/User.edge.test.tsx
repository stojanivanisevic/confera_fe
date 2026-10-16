// @vitest-environment jsdom
//
// E2-16 (FR-USR-04, M2-FE-02): removing a user. `DELETE /api/v1/users/{id}` takes the version the
// removal is made on as a query parameter (confera_be: `RemoveUserQueryDto`, 400 `validation_failed`
// without it), but the vendored contract does not list it - the API's document leaves out a query
// class that is declared in a controller file - so the generated client does not send it, and the
// button "Remove" can never succeed against the real API. The stub of the browser tests does not
// ask for the version, which is why no test of this repository has seen it.
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buttonsNamed, click, FakeApi, forgetFake, mount, type Mounted, useFake } from '../../../../tests/support/admin-harness';
import { User } from './User';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/users/0e2e0000-0000-4000-8000-0000000000d1',
}));

const ID = '0e2e0000-0000-4000-8000-0000000000d1';

let screen: Mounted | undefined;
afterEach(async () => {
  forgetFake();
  await screen?.unmount();
  screen = undefined;
});

describe('removing a user (E2-16)', () => {
  it('names the version the removal is made on', async () => {
    const fake = new FakeApi();
    fake.session = { ...fake.session, confirmationValidUntil: new Date(Date.now() + 240_000).toISOString() };
    fake.route = (request) => {
      if (request.path === `/api/v1/users/${ID}` && request.method === 'GET') {
        return { status: 200, body: { id: ID, email: 'mila.probna@a.example.test', displayName: 'Mila Probna', role: 'reviewer', status: 'active', createdAt: '2026-10-01T10:00:00.000Z', version: 3 } };
      }
      if (request.path === `/api/v1/users/${ID}` && request.method === 'DELETE') return { status: 204 };
      return undefined;
    };
    useFake(fake);
    screen = await mount(<User id={ID} />);

    await click(buttonsNamed('Remove')[0]!);
    const confirm = buttonsNamed('Remove');
    await click(confirm[confirm.length - 1]!);

    const calls = fake.calls('DELETE', `/api/v1/users/${ID}`);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.query.get('version')).toBe('3');
  });
});
