// @vitest-environment jsdom
//
// The conference switch after a reload (M2-FE-03; confera-rename-congresa, the fix round of the
// blank-slate verification): a conference chosen in the tab is known by its id only until the list of
// conferences answers. The screens the switch narrows used to list every conference meanwhile and the
// chosen one a moment later, in its place: the rows moved under the person's click (a click that went
// down on one row and up on another opened nothing, in Firefox), and a click in that moment could open a
// row of the wrong list (the organisation's template where the conference has its own). Each screen now
// asks for nothing until the choice is known, and then asks for the chosen conference only.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

import { ADMIN_PERMISSIONS, FakeApi, forgetFake, mount, sessionOf, settle, useFake, type Mounted } from '../../../../tests/support/admin-harness';
import { Forms } from './Forms';
import { MailLog } from './MailLog';
import { Submissions } from './Submissions';
import { Templates } from './Templates';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/templates',
  useSearchParams: () => new URLSearchParams(),
}));

const CONFERENCE = '0e2ec000-0000-4000-8000-0000000000c1';
const conference = {
  id: CONFERENCE, name: 'Konferencija za probe', code: 'KP', editionYear: 2026, startsOn: null, endsOn: null, venue: null, listedSites: [], languages: ['en', 'sr'], timeZone: 'Europe/Belgrade', state: 'open', mailServerId: null,
  publicationTermsUrl: null, privacyNoticeUrl: null, version: 1,
};
const template = { id: '0e2e7000-0000-4000-8000-000000000019', conferenceId: null, type: 'submission_returned_for_revision', language: 'en', subject: {}, body: {}, enabled: true, updatedAt: '2026-10-01T08:00:00.000Z', version: 1 };
const PERMISSIONS = [...ADMIN_PERMISSIONS, 'forms.read', 'submissions.read'];

/** The four screens the switch narrows, the path of the list each asks for, and an empty answer of it. */
const SCREENS: ReadonlyArray<{ name: string; screen: () => ReactElement; list: string; empty: unknown }> = [
  { name: 'the templates', screen: () => <Templates />, list: '/api/v1/mail-templates', empty: { items: [template] } },
  { name: 'the mail log', screen: () => <MailLog />, list: '/api/v1/mail-log', empty: { items: [], total: 0, page: 1, pageSize: 25 } },
  { name: 'the forms', screen: () => <Forms />, list: '/api/v1/forms', empty: { items: [] } },
  { name: 'the submissions', screen: () => <Submissions />, list: '/api/v1/submissions', empty: { items: [], total: 0, page: 1, pageSize: 25 } },
];

// jsdom has no media queries; the mail log asks whether the window is wide (UX4-23).
const matchMedia = (query: string) => ({ matches: true, media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false });

let screen: Mounted | undefined;
beforeEach(() => {
  // Chosen before the reload, as the switch keeps it (conference-context.tsx).
  window.sessionStorage.setItem('congresa.conference', CONFERENCE);
  vi.stubGlobal('matchMedia', matchMedia);
});
afterEach(async () => {
  forgetFake();
  await screen?.unmount();
  screen = undefined;
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

/** A fake whose list of conferences answers only when the test lets it. */
function holdingConferences(list: string, empty: unknown): { fake: FakeApi; answer: () => void } {
  let answer = () => {};
  const held = new Promise<void>((resolve) => {
    answer = resolve;
  });
  const fake = new FakeApi();
  fake.session = sessionOf({ user: { ...sessionOf().user, permissions: PERMISSIONS } });
  fake.route = async (seen) => {
    if (seen.method === 'GET' && seen.path === '/api/v1/conferences') {
      await held;
      return { status: 200, body: { items: [conference] } };
    }
    // The conference has no template of its own: the organisation's is its fallback.
    if (seen.method === 'GET' && seen.path === '/api/v1/mail-templates' && seen.query.has('conferenceId')) return { status: 200, body: { items: [] } };
    if (seen.method === 'GET' && seen.path === list) return { status: 200, body: empty };
    return undefined;
  };
  return { fake, answer };
}

describe('a conference chosen before a reload: the screens it narrows wait for it', () => {
  for (const { name, screen: make, list, empty } of SCREENS) {
    it(`${name}: nothing is listed until the conference is known, then only the conference's`, async () => {
      const { fake, answer } = holdingConferences(list, empty);
      useFake(fake);
      screen = await mount(make());
      await settle();
      // The list of conferences is on its way; the screen has asked for nothing and shows no row.
      expect(fake.calls('GET', '/api/v1/conferences')).toHaveLength(1);
      expect(fake.calls('GET', list)).toEqual([]);
      expect(screen.container.querySelectorAll('tbody tr .ud-table__open')).toHaveLength(0);

      answer();
      await settle();
      const asked = fake.calls('GET', list);
      expect(asked.length).toBeGreaterThan(0);
      expect(asked.some((seen) => seen.query.get('conferenceId') === CONFERENCE)).toBe(true);
      if (list === '/api/v1/mail-templates') {
        // The organisation's template is listed as the conference's fallback, marked so, from its first row on.
        const rows = [...screen.container.querySelectorAll('tbody tr')];
        expect(rows).toHaveLength(1);
        expect(rows[0]!.textContent).toContain('Organisation’s');
      } else {
        // Every conference's list is never asked for: each request names the conference.
        expect(asked.every((seen) => seen.query.get('conferenceId') === CONFERENCE)).toBe(true);
      }
    });
  }

  it('without a conference chosen, a screen asks at once, without waiting for the list of conferences', async () => {
    window.sessionStorage.clear();
    const { fake, answer } = holdingConferences('/api/v1/mail-templates', { items: [template] });
    useFake(fake);
    screen = await mount(<Templates />);
    await settle();
    // The list of conferences is still on its way: the organisation's templates are there all the same.
    expect(fake.calls('GET', '/api/v1/mail-templates').length).toBeGreaterThan(0);
    expect(fake.calls('GET', '/api/v1/mail-templates').some((seen) => seen.query.has('conferenceId'))).toBe(false);
    expect(screen.container.querySelectorAll('tbody tr .ud-table__open')).toHaveLength(1);
    answer();
    await settle();
  });
});
