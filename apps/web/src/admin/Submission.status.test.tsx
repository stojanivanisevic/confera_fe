// @vitest-environment jsdom
// M4-FE-01: a submission's status, changed from its screen (FR-SUB-05, FR-SUB-07, FR-MAIL-05, FR-MAIL-08).
//   - reading a new submission is a GET only; "Start processing" is an act of its own, its email shown first
//     (SEC-M4-03, UX4-08), and the page keeps saying who took it and that the author was emailed;
//   - "Return for revision" shows the server's email first, in the sandboxed frame; Cancel sends nothing;
//     Send changes the status with the text shown, its digest and the version the screen holds;
//   - every change whose email is on shows it and sends its digest (Accept too, SEC-M4-05);
//   - a withdrawal asks for its internal reason and says it is final (UX4-07); focus and words at each
//     step of the dialog (UX4-02), the language of the email at the message (UX4-14), another admin who
//     was first in plain words (UX4-09), revisions without lines that changed nothing (UX4-16); a note is added.
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Submission } from './Submission';
import { ADMIN_PERMISSIONS, button, click, FakeApi, forgetFake, mount, sessionOf, settle, typeInto, useFake, type Mounted, type Seen } from '../../../../tests/support/admin-harness';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/submissions',
}));

const ID = '0e2e5000-0000-4000-8000-0000000000b1';
const PERMISSIONS = [...ADMIN_PERMISSIONS, 'submissions.read', 'submissions.manage'];

const ACTIONS: Record<string, string[]> = { new: ['open', 'withdraw'], open: ['return', 'accept', 'reject', 'withdraw'], returned_for_revision: ['resume', 'accept', 'reject', 'withdraw'], accepted: ['withdraw', 'reopen'], withdrawn: [] };
const TRANSITION: Record<string, number> = { open: 2, return: 4, resume: 5, accept: 6, reject: 7, withdraw: 8, reopen: 9 };
const record = (status: string, version: number, extra: Record<string, unknown> = {}) => ({
  id: ID,
  reference: 'KP26-0002',
  conference: { id: 'c1', code: 'KP', name: 'Konferencija za probe', editionYear: 2026 },
  title: 'Održivi turizam',
  firstAuthor: 'Živana Đorđević',
  institution: null,
  participationType: 'with_paper',
  status,
  actions: ACTIONS[status] ?? [],
  memberMatch: null,
  billingStatus: null,
  language: 'sr',
  authorCount: 1,
  receivedAt: '2026-10-16T14:56:00.000Z',
  form: { id: 'f1', slug: 'kp-2026-abstract', versionNumber: 1 },
  answers: { title: 'Održivi turizam' },
  authors: [{ position: 1, firstName: 'Živana', lastName: 'Đorđević', institution: null, institutionAddress: null, orcid: null, email: 'zivana@a.example.test', phone: null, isCorresponding: true }],
  files: [],
  consent: { text: 'I agree.', links: {}, version: 'v1', consentedAt: '2026-10-16T14:56:00.000Z' },
  statusHistory: [{ status: 'new', fromStatus: null, transition: 1, changedAt: '2026-10-16T14:56:00.000Z', actor: null, reason: null, message: null, email: 'none', emailId: null }],
  emails: [],
  notes: [],
  revisions: [],
  version,
  ...extra,
});

let screen: Mounted | undefined;
afterEach(async () => {
  forgetFake();
  await screen?.unmount();
  screen = undefined;
});

/** A fake of the API of one submission, whose status follows what the page posts. */
function fakeOf(start: string) {
  let current = record(start, 1);
  const fake = new FakeApi();
  fake.session = sessionOf({ user: { ...sessionOf().user, permissions: PERMISSIONS } });
  fake.route = (seen: Seen) => {
    if (seen.method === 'GET' && seen.path === `/api/v1/submissions/${ID}`) return { status: 200, body: current };
    if (seen.method === 'GET' && seen.path.startsWith('/api/v1/forms/')) return { status: 404, body: { code: 'not_found' } };
    if (seen.method === 'POST' && seen.path === `/api/v1/submissions/${ID}/status/preview`) {
      const message = (seen.body as { message?: string }).message ?? '';
      return { status: 200, body: { sends: true, to: 'zivana@a.example.test', language: 'sr', subject: 'Prijava KP26-0002 je vraćena na doradu', html: `<p>${message}</p><script>parent.document.body.dataset.pwned = 1</script>`, text: `${message}\n`, previewDigest: 'd1' } };
    }
    if (seen.method === 'POST' && seen.path === `/api/v1/submissions/${ID}/status`) {
      const body = seen.body as { action: string; reason?: string; message?: string };
      const to = { open: 'open', return: 'returned_for_revision', accept: 'accepted', withdraw: 'withdrawn' }[body.action] ?? current.status;
      current = record(to, current.version + 1, { statusHistory: [...current.statusHistory, { status: to, fromStatus: current.status, transition: TRANSITION[body.action] ?? 0, changedAt: '2026-10-18T10:00:00.000Z', actor: null, reason: body.reason ?? null, message: body.message ?? null, email: 'queued', emailId: null }] });
      return { status: 200, body: current };
    }
    if (seen.method === 'POST' && seen.path === `/api/v1/submissions/${ID}/notes`) {
      return { status: 201, body: { id: 'n1', body: (seen.body as { body: string }).body, createdAt: '2026-10-18T10:00:00.000Z', author: { id: 'u', displayName: 'Ana Admin' } } };
    }
    return undefined;
  };
  return fake;
}

const statusPosts = (fake: FakeApi) => fake.calls('POST', `/api/v1/submissions/${ID}/status`);
const dialog = () => document.body.querySelector<HTMLElement>('[role="dialog"]');
const choose = async (label: string) => {
  await click(button(screen!.container, 'Change the status'));
  const item = [...document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((b) => b.textContent === label)!;
  await click(item);
};

describe('the status of a submission (M4-FE-01)', () => {
  it('reading a new submission sends nothing; "Start processing" shows the email first, then takes it into processing (SEC-M4-03, UX4-08)', async () => {
    const fake = fakeOf('new');
    useFake(fake);
    screen = await mount(<Submission id={ID} />);
    await settle();
    await screen.rerender(<Submission id={ID} />);
    await settle();
    // Looking at it is a GET: no change, no email.
    expect(statusPosts(fake)).toHaveLength(0);
    expect(fake.calls('POST', `/api/v1/submissions/${ID}/status/preview`)).toHaveLength(0);
    expect(screen.container.textContent).toContain('Nobody has started processing this submission yet');
    await click(button(screen.container, 'Start processing'));
    await settle();
    // The email of transition 2, as the server renders it, before anything changes.
    expect(fake.calls('POST', `/api/v1/submissions/${ID}/status/preview`)[0]!.body).toEqual({ action: 'open' });
    expect(dialog()!.querySelector('iframe')!.getAttribute('sandbox')).toBe('');
    expect(statusPosts(fake)).toHaveLength(0);
    await click([...dialog()!.querySelectorAll('button')].find((b) => b.textContent === 'Send the email and change the status')!);
    expect(statusPosts(fake)).toHaveLength(1);
    expect(statusPosts(fake)[0]!.body).toEqual({ action: 'open', version: 1, previewDigest: 'd1' });
    expect(screen.container.querySelector('[data-congresa-submission-status]')?.getAttribute('data-congresa-submission-status')).toBe('open');
    // It stays said who took it and that the author was emailed.
    expect(screen.container.querySelector('[data-congresa-opened]')!.textContent).toMatch(/^Taken into processing by .+\. The author was emailed\.$/);
  });

  it('return for revision: the email is shown first, Cancel sends nothing, Send sends what was shown, once', async () => {
    const fake = fakeOf('open');
    useFake(fake);
    screen = await mount(<Submission id={ID} />);
    await choose('Return for revision');
    // The message is required: without it there is no preview.
    await click([...dialog()!.querySelectorAll('button')].find((b) => b.textContent === 'Show the email')!);
    expect(dialog()!.textContent).toContain('Write what the author should correct.');
    expect(fake.calls('POST', `/api/v1/submissions/${ID}/status/preview`)).toHaveLength(0);
    await typeInto(dialog()!.querySelector('textarea[name="message"]')!, 'Skratite apstrakt na 250 reči.');
    await click([...dialog()!.querySelectorAll('button')].find((b) => b.textContent === 'Show the email')!);
    expect(fake.calls('POST', `/api/v1/submissions/${ID}/status/preview`)[0]!.body).toEqual({ action: 'return', message: 'Skratite apstrakt na 250 reči.' });
    // The server's rendering, only in the frame without any sandbox token (ST-28).
    const frame = dialog()!.querySelector<HTMLIFrameElement>('iframe')!;
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.getAttribute('srcdoc')).toContain('Skratite apstrakt na 250 reči.');
    expect(document.body.dataset.pwned).toBeUndefined();
    expect(dialog()!.querySelector('[data-congresa-status-email-subject]')!.textContent).toBe('Prijava KP26-0002 je vraćena na doradu');
    // Cancel: nothing changes, nothing is sent.
    await click([...dialog()!.querySelectorAll('button')].find((b) => b.textContent === 'Cancel')!);
    expect(statusPosts(fake)).toHaveLength(0);

    await choose('Return for revision');
    await typeInto(dialog()!.querySelector('textarea[name="message"]')!, 'Skratite apstrakt.');
    await click([...dialog()!.querySelectorAll('button')].find((b) => b.textContent === 'Show the email')!);
    const send = [...dialog()!.querySelectorAll('button')].find((b) => b.textContent === 'Send the email and change the status')!;
    await click(send);
    expect(statusPosts(fake)).toHaveLength(1);
    expect(statusPosts(fake)[0]!.body).toEqual({ action: 'return', version: 1, message: 'Skratite apstrakt.', previewDigest: 'd1' });
    expect(screen.container.querySelector('[data-congresa-submission-status]')?.getAttribute('data-congresa-submission-status')).toBe('returned_for_revision');
    expect(screen.container.textContent).toContain('Message: Skratite apstrakt.');
  });

  it('accept shows its email and goes with its digest (SEC-M4-05); withdraw asks for its reason and says it is final (UX4-07)', async () => {
    const fake = fakeOf('open');
    useFake(fake);
    screen = await mount(<Submission id={ID} />);
    await choose('Accept');
    await settle();
    expect(dialog()!.querySelector('textarea')).toBeNull();
    expect(fake.calls('POST', `/api/v1/submissions/${ID}/status/preview`)[0]!.body).toEqual({ action: 'accept' });
    await click([...dialog()!.querySelectorAll('button')].find((b) => b.textContent === 'Send the email and change the status')!);
    expect(statusPosts(fake)[0]!.body).toEqual({ action: 'accept', version: 1, previewDigest: 'd1' });

    await choose('Withdraw');
    expect(dialog()!.textContent).toContain('A withdrawn submission cannot be reopened.');
    await click([...dialog()!.querySelectorAll('button')].find((b) => b.textContent === 'Show the email')!);
    expect(dialog()!.textContent).toContain('Give the reason.');
    // The field that is wrong takes the focus (UX4-02).
    expect(document.activeElement).toBe(dialog()!.querySelector('textarea[name="reason"]'));
    await typeInto(dialog()!.querySelector('textarea[name="reason"]')!, 'Double submission');
    await click([...dialog()!.querySelectorAll('button')].find((b) => b.textContent === 'Show the email')!);
    await click([...dialog()!.querySelectorAll('button')].find((b) => b.textContent === 'Withdraw for good and email the author')!);
    expect(statusPosts(fake)[1]!.body).toEqual({ action: 'withdraw', version: 2, reason: 'Double submission', previewDigest: 'd1' });
    expect(screen.container.textContent).toContain('Internal reason: Double submission');
  });

  it('at the email the focus is on the dialog’s heading and the step is said; the message step names the email’s language (UX4-02, UX4-14)', async () => {
    const fake = fakeOf('open');
    useFake(fake);
    screen = await mount(<Submission id={ID} />);
    await choose('Reject');
    expect(dialog()!.textContent).toContain('The author’s email is in Serbian. Write your message in Serbian.');
    await typeInto(dialog()!.querySelector('textarea[name="message"]')!, 'Hvala na prijavi.');
    await click([...dialog()!.querySelectorAll('button')].find((b) => b.textContent === 'Show the email')!);
    await settle();
    const heading = dialog()!.querySelector('.ud-dialog__title')!;
    expect(heading.textContent).toBe('The email to the author');
    expect(document.activeElement).toBe(heading);
    expect(dialog()!.querySelector('[role="status"]')!.textContent).toBe('The email to the author is shown: to zivana@a.example.test, in Serbian, subject “Prijava KP26-0002 je vraćena na doradu”.');
    expect([...dialog()!.querySelectorAll('button')].some((b) => b.textContent === 'Reject and email the author')).toBe(true);
    await click([...dialog()!.querySelectorAll('button')].find((b) => b.textContent === 'Back')!);
    expect(document.activeElement).toBe(dialog()!.querySelector('.ud-dialog__title'));
    expect(dialog()!.querySelector('[role="status"]')!.textContent).toBe('Reject: the message for the author.');
  });

  it('another admin was first: the dialog closes, nothing was sent, the page names the new status (UX4-09)', async () => {
    const fake = fakeOf('open');
    const route = fake.route;
    let rejectedElsewhere = false;
    fake.route = (seen: Seen) => {
      if (seen.method === 'POST' && seen.path === `/api/v1/submissions/${ID}/status`) {
        rejectedElsewhere = true;
        return { status: 409, body: { code: 'version_conflict', title: 'Conflict', traceId: 't1' } };
      }
      if (rejectedElsewhere && seen.method === 'GET' && seen.path === `/api/v1/submissions/${ID}`) return { status: 200, body: record('rejected', 2) };
      return route(seen);
    };
    useFake(fake);
    screen = await mount(<Submission id={ID} />);
    await choose('Accept');
    await settle();
    await click([...dialog()!.querySelectorAll('button')].find((b) => b.textContent === 'Send the email and change the status')!);
    await settle();
    expect(dialog()).toBeNull();
    expect(screen.container.textContent).toContain('Another admin has just changed this submission to Rejected. Nothing was sent.');
    expect(screen.container.textContent).not.toMatch(/name this id/);
    expect(screen.container.querySelector('[data-congresa-submission-status]')?.getAttribute('data-congresa-submission-status')).toBe('rejected');
  });

  it('a revision shows no author line that changed nothing, and names the field of an author that did (UX4-16)', async () => {
    const fake = fakeOf('open');
    const route = fake.route;
    const authors = [{ firstName: 'Đorđe', lastName: 'Đorđević', institution: 'EF', email: 'djordje@a.example.test', orcid: '0000-0002-1825-0097' }];
    fake.route = (seen: Seen) => {
      if (seen.method === 'GET' && seen.path === `/api/v1/submissions/${ID}`) {
        return {
          status: 200,
          body: record('open', 1, {
            answers: { title: 'Održivi turizam', authors },
            revisions: [
              { number: 1, changedAt: '2026-10-18T10:00:00.000Z', changedBy: { id: 'u', displayName: 'Ana Admin' }, fields: ['title', 'authors'], before: { title: 'Turizam', authors }, after: { title: 'Održivi turizam', authors: [{ ...authors[0], orcid: null }] } },
            ],
          }),
        };
      }
      return route(seen);
    };
    useFake(fake);
    screen = await mount(<Submission id={ID} />);
    const revisions = screen.container.querySelector('[data-congresa-revisions]')!.textContent ?? '';
    expect(revisions).toContain('Title: “Turizam” became “Održivi turizam”');
    expect(revisions).not.toContain('Authors: Đorđe Đorđević became Đorđe Đorđević');
    expect(revisions).toContain('Author 1, ORCID iD: “0000-0002-1825-0097” became “—”');
  });

  it('a note is added and shown, for admins only', async () => {
    const fake = fakeOf('open');
    useFake(fake);
    screen = await mount(<Submission id={ID} />);
    const notes = screen.container.querySelector<HTMLElement>('[data-congresa-notes]')!;
    expect(notes.textContent).toContain('Only admins see notes');
    await typeInto(notes.querySelector('textarea')!, 'Pozvati autora telefonom.');
    await click(button(notes, 'Add the note'));
    expect(fake.calls('POST', `/api/v1/submissions/${ID}/notes`)[0]!.body).toEqual({ body: 'Pozvati autora telefonom.' });
    expect(screen.container.querySelector('[data-congresa-notes]')!.textContent).toContain('Pozvati autora telefonom.');
  });
});
