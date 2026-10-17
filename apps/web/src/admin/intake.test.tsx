// @vitest-environment jsdom
//
// The admin screens of 0.3.0 against a fake of the API (tests/support/admin-harness): what they
// SEND and what they show. The snippet in the language of the site (M3-FE-03, D2, D5); a field
// changed in its drawer and saved as the draft, on the version the screen holds (M3-FE-05); a
// deadline set on its version, and its history (M3-FE-06, FR-DL-03); the release of all held
// emails (M3-FE-08); the audit log never shows a bank account (D9, M2-ISS-16).
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Audit } from './Audit';
import { Deadlines } from './Deadlines';
import { FormSettings } from './FormSettings';
import { HeldMail } from './HeldMail';
import { ADMIN_PERMISSIONS, button, click, FakeApi, forgetFake, mount, sessionOf, settle, typeInto, useFake, type Mounted } from '../../../../tests/support/admin-harness';
import vectors from '../../../../packages/api-client/openapi/form-rule-vectors.json';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/forms',
}));

const FORM = '0e2ef000-0000-4000-8000-0000000000a1';
const CONFERENCE = '0e2ec000-0000-4000-8000-0000000000c1';
const PERMISSIONS = [...ADMIN_PERMISSIONS, 'forms.read', 'forms.manage', 'submissions.read', 'held_mail.manage'];

const conference = {
  id: CONFERENCE, name: 'Konferencija za probe', code: 'KP', editionYear: 2026, startsOn: null, endsOn: null, venue: null, listedSites: ['https://kp.example.test'], languages: ['en', 'sr'], timeZone: 'Europe/Belgrade', state: 'open', mailServerId: null,
  publicationTermsUrl: 'https://kp.example.test/terms', privacyNoticeUrl: null, version: 1,
};
const formRecord = (version = 1, configuration: Record<string, unknown> = {}) => ({
  type: 'abstract', state: 'open', closedReason: null, id: FORM, conferenceId: CONFERENCE, slug: 'kp-2026-abstract', configuration, draftDefinition: vectors.seededAbstractDefinition,
  currentVersion: { number: 1, publishedAt: '2026-10-15T09:00:00.000Z', publishedBy: { id: 'x', displayName: 'Ana Admin' } }, versions: [{ number: 1, publishedAt: '2026-10-15T09:00:00.000Z', publishedBy: { id: 'x', displayName: 'Ana Admin' } }],
  breakerPerHour: 30, breakerPerDay: 200, updatedAt: '2026-10-15T09:00:00.000Z', version,
});

let screen: Mounted | undefined;
afterEach(async () => {
  forgetFake();
  await screen?.unmount();
  screen = undefined;
});

/** A fake that answers these routes, for a person with the permissions of 0.3.0. */
function answering(route: FakeApi['route']): FakeApi {
  const fake = new FakeApi();
  fake.session = sessionOf({ user: { ...sessionOf().user, permissions: PERMISSIONS } });
  fake.route = route;
  return fake;
}
const select = async (element: HTMLSelectElement, value: string) => {
  await act(async () => {
    element.value = value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
  });
  await settle();
};

describe('a form (M3-FE-03, M3-FE-05)', () => {
  const route = (fake: { saved?: unknown }) => (seen: { method: string; path: string; body: unknown }) => {
    if (seen.method === 'GET' && seen.path === `/api/v1/forms/${FORM}`) return { status: 200, body: formRecord() };
    if (seen.method === 'GET' && seen.path === `/api/v1/conferences/${CONFERENCE}`) return { status: 200, body: conference };
    if (seen.method === 'GET' && seen.path === '/api/v1/conferences') return { status: 200, body: { items: [conference] } };
    if (seen.method === 'PUT' && seen.path === `/api/v1/forms/${FORM}/draft`) {
      fake.saved = seen.body;
      const body = seen.body as { configuration: Record<string, unknown> };
      return { status: 200, body: formRecord(2, body.configuration) };
    }
    return undefined;
  };

  it('the snippet follows the language of the site, with the link above the frame', async () => {
    useFake(answering(route({})));
    screen = await mount(<FormSettings id={FORM} publicOrigin="https://forms.example.test" />);
    const snippet = () => screen!.container.querySelector<HTMLTextAreaElement>('[name="snippet"]')!.value;
    expect(snippet().split('\n')[0]).toBe('<p lang="en"><a href="https://forms.example.test/f/kp-2026-abstract?lang=en">Form not showing? Open it on its own page.</a></p>');
    await select(screen.container.querySelector<HTMLSelectElement>('[name="embedLanguage"]')!, 'sr');
    expect(snippet()).toContain('<p lang="sr"><a href="https://forms.example.test/f/kp-2026-abstract?lang=sr">Obrazac se ne prikazuje? Otvorite ga na posebnoj stranici.</a></p>');
    expect(snippet()).toContain('title="Prijava apstrakta"');
    await select(screen.container.querySelector<HTMLSelectElement>('[name="embedLanguage"]')!, 'browser');
    expect(snippet()).not.toContain('lang=');
    expect(screen.container.textContent).toContain('Listed now: https://kp.example.test.');
  });

  it('a field changed in its drawer is saved as the draft, on the version the screen holds', async () => {
    const seen: { saved?: unknown } = {};
    useFake(answering(route(seen)));
    screen = await mount(<FormSettings id={FORM} publicOrigin="https://forms.example.test" />);
    const row = [...screen.container.querySelectorAll<HTMLButtonElement>('table button')].find((b) => b.textContent === 'Keywords')!;
    await click(row);
    const drawer = document.body.querySelector<HTMLElement>('[data-confera-field-editor="keywords"]')!;
    const labelEn = [...drawer.querySelectorAll<HTMLInputElement>('input')].find((input) => input.closest('.ud-field')?.textContent?.startsWith('Label (English)'))!;
    await typeInto(labelEn, 'Key words');
    await click(button(document.body, 'Apply'));
    expect(screen.container.textContent).toContain('The draft has changes that are not saved.');
    await click(button(screen.container, 'Save the draft'));
    expect(seen.saved).toMatchObject({ version: 1, configuration: { fields: { keywords: { label: { en: 'Key words', sr: 'Ključne reči' }, required: true, enabled: true } } } });
    expect(screen.container.textContent).not.toContain('The draft has changes that are not saved.');
  });
});

describe('deadlines (M3-FE-06; FR-DL-03)', () => {
  it('a later day is sent with the version of the deadline, and the history shows the change', async () => {
    const sent: unknown[] = [];
    let endsOn = '2027-03-15';
    const answer = () => ({
      timeZone: 'Europe/Belgrade',
      items: [{ kind: 'abstract_submission', endsOn, endsAt: `${endsOn}T23:00:00.000Z`, passed: false, version: endsOn === '2027-03-15' ? 1 : 2 }],
      history: endsOn === '2027-03-15' ? [] : [{ kind: 'abstract_submission', oldEndsOn: '2027-03-15', newEndsOn: endsOn, changedAt: '2026-10-17T10:00:00.000Z', changedBy: { id: 'x', displayName: 'Ana Admin' } }],
    });
    useFake(answering((seen) => {
      if (seen.method === 'GET' && seen.path === `/api/v1/conferences/${CONFERENCE}/deadlines`) return { status: 200, body: answer() };
      if (seen.method === 'PUT' && seen.path === `/api/v1/conferences/${CONFERENCE}/deadlines/abstract_submission`) {
        sent.push(seen.body);
        endsOn = (seen.body as { endsOn: string }).endsOn;
        return { status: 200, body: answer() };
      }
      return undefined;
    }));
    screen = await mount(<Deadlines conferenceId={CONFERENCE} readOnly={false} archived={false} />);
    expect(screen.container.textContent).toContain('A deadline ends at the end of its day in Europe/Belgrade.');
    expect(screen.container.textContent).toContain('Ends 16 Mar 2027, 00:00');
    await typeInto(screen.container.querySelector<HTMLInputElement>('[name="abstract_submission"]')!, '2027-03-31');
    await click(button(screen.container, 'Save', '[data-confera-deadline="abstract_submission"]'));
    expect(sent).toEqual([{ endsOn: '2027-03-31', version: 1 }]);
    expect(screen.container.textContent).toContain('Abstract submission: 15 Mar 2027 → 31 Mar 2027');
  });
});

describe('held emails (M3-FE-08)', () => {
  it('says why they wait and that a deadline day can trip the breaker; "release all" sends all', async () => {
    const sent: unknown[] = [];
    let held = 2;
    useFake(answering((seen) => {
      if (seen.method === 'GET' && seen.path === '/api/v1/held-mail') {
        return {
          status: 200,
          body: { items: Array.from({ length: held }, (_, i) => ({ id: `0e2e6000-0000-4000-8000-00000000000${i}`, kind: 'submission_confirmation', recipient: `a${i}@example.test`, heldReason: 'send_breaker_form', conference: null, formId: null, submission: null, createdAt: '2026-10-16T14:56:00.000Z' })), total: held, page: 1, pageSize: 50, breaker: { perHour: 100, perDay: 1000, version: 1 } },
        };
      }
      if (seen.method === 'POST' && seen.path === '/api/v1/held-mail/release') {
        sent.push(seen.body);
        held = 0;
        return { status: 200, body: { released: 2 } };
      }
      return undefined;
    }));
    screen = await mount(<HeldMail />);
    expect(screen.container.textContent).toContain('A deadline day can trip the breaker by itself');
    expect(screen.container.textContent).toContain('The breaker of the form');
    await click(button(screen.container, 'Release all 2'));
    const confirm = [...document.body.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')].find((b) => b.textContent === 'Release all 2')!;
    await click(confirm);
    expect(sent).toEqual([{ all: true }]);
    expect(screen.container.textContent).toContain('No email is held');
  });
});

describe('the audit log never shows a bank account (D9, M2-ISS-16)', () => {
  it('names the payment details as changed, with no value, even when one would arrive', async () => {
    useFake(answering((seen) => {
      if (seen.method === 'GET' && seen.path === '/api/v1/audit') {
        return {
          status: 200,
          body: {
            items: [{ id: 'e1', occurredAt: '2026-10-16T10:00:00.000Z', actor: { id: 'x', displayName: 'Ana Admin' }, action: 'organisation.payment_details_changed', subjectType: 'organisation', subjectId: 'o1', fields: ['eurIban', 'eurBankName'], changes: { eurIban: { old: null, new: 'RS35160000000000000222' } }, detail: {}, traceId: 't' }],
            total: 1, page: 1, pageSize: 25,
          },
        };
      }
      return undefined;
    }));
    screen = await mount(<Audit />);
    await click(screen.container.querySelector<HTMLButtonElement>('tbody button')!);
    expect(document.body.textContent).not.toContain('RS35160000000000000222');
    expect(document.body.textContent).toContain('The log keeps no values for these fields.');
  });
});
