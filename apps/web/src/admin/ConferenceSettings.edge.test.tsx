// @vitest-environment jsdom
//
// E2-18 (FR-CONF-01, FR-CONF-04, M2-FE-03): the settings of a conference.
//   - A change of state (open, close, archive) gives the record a new version, and the form
//     "follows the record": what was typed in the settings and not yet saved is replaced by the
//     record, without a word. The person who sets a venue, then opens the conference, loses the venue.
//   - The edition is a number typed in a field. `yearOf` makes it with `Number(text)`, which is NaN
//     for "2O27" (a letter O): JSON writes NaN as null, and the API reads null as "no edition" -
//     so a slip of the keyboard clears the edition of a conference, and the save says it went well.
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConferenceSettings } from './ConferenceSettings';
import { yearOf } from './Conferences';
import { button, click, FakeApi, field, forgetFake, mount, type Mounted, typeInto, useFake } from '../../../../tests/support/admin-harness';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/conferences/0e2e0000-0000-4000-8000-0000000000c1',
}));

const ID = '0e2e0000-0000-4000-8000-0000000000c1';
const conference = (overrides: Record<string, unknown> = {}) => ({
  id: ID,
  name: 'Konferencija (izmišljeno)',
  code: 'KI',
  editionYear: 2027,
  startsOn: null,
  endsOn: null,
  venue: null,
  listedSites: [],
  languages: ['en'],
  timeZone: 'Europe/Belgrade',
  state: 'draft',
  mailServerId: null,
  version: 1,
  ...overrides,
});

function api(): { fake: FakeApi; stored: () => ReturnType<typeof conference> } {
  const fake = new FakeApi();
  let stored = conference();
  fake.route = (request) => {
    if (request.path === `/api/v1/conferences/${ID}` && request.method === 'GET') return { status: 200, body: stored };
    if (request.path === `/api/v1/conferences/${ID}` && request.method === 'PATCH') {
      stored = conference({ ...stored, ...(request.body as object), version: stored.version + 1 });
      return { status: 200, body: stored };
    }
    if (request.path === `/api/v1/conferences/${ID}/state` && request.method === 'POST') {
      stored = conference({ ...stored, state: (request.body as { state: string }).state, version: stored.version + 1 });
      return { status: 200, body: stored };
    }
    if (request.path === '/api/v1/conferences' && request.method === 'GET') return { status: 200, body: { items: [stored] } };
    if (request.path === '/api/v1/mail-servers' && request.method === 'GET') return { status: 200, body: { items: [] } };
    return undefined;
  };
  return { fake, stored: () => stored };
}

let screen: Mounted | undefined;
afterEach(async () => {
  forgetFake();
  await screen?.unmount();
  screen = undefined;
});

describe('the settings of a conference (E2-18)', () => {
  it('a text that is not a year is not an empty edition', () => {
    expect(Number.isNaN(yearOf('2O27') ?? 0)).toBe(false);
  });

  it('does not clear the edition of a conference because of a slip of the keyboard', async () => {
    const { fake } = api();
    useFake(fake);
    screen = await mount(<ConferenceSettings id={ID} />);

    await typeInto(field(screen.container, 'editionYear'), '2O27');
    await click(button(screen.container, 'Save the settings'));

    const sent = fake.calls('PATCH', `/api/v1/conferences/${ID}`);
    // Either nothing is sent (the field is refused) or the edition is not null.
    for (const call of sent) {
      expect((call.body as { editionYear: number | null }).editionYear).not.toBeNull();
    }
  });

  it('keeps what was typed in the settings when the conference is opened', async () => {
    const { fake } = api();
    useFake(fake);
    screen = await mount(<ConferenceSettings id={ID} />);

    await typeInto(field(screen.container, 'venue'), 'Hotel Moskva (izmišljeno)');
    await click(button(screen.container, 'Open the conference'));
    // The question of the dialog: the second button of that name is its confirmation.
    const confirm = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).filter((candidate) => (candidate.textContent ?? '').trim() === 'Open the conference');
    await click(confirm[confirm.length - 1]!);

    expect(fake.calls('POST', `/api/v1/conferences/${ID}/state`)).toHaveLength(1);
    expect(field(screen.container, 'venue').value).toBe('Hotel Moskva (izmišljeno)');
  });
});
