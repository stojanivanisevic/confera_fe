// The stand-in for confera_be's admin API of 0.3.0, for the browser tests (ADR-24): the forms of a
// conference with their draft configuration, the definition the draft makes, the versions and
// Publish, the send breaker of a form; the deadlines of a conference with their history; the
// submissions, a page at a time, and one in full; the held emails and their release, and the breaker
// of the organisation. It follows the DTOs of confera_be's m3/be (forms.dto.ts, deadlines.ts,
// submissions.dto.ts, held-mail.ts): versions on every change, `version_conflict` on a stale one, the
// permissions forms.read and forms.manage, submissions.read and held_mail.manage. The definition is
// the seeded abstract form of the vendored contract, with the draft's texts and field labels laid
// over it. Nothing of this is part of the application.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { STUB, STUB_PART_B } from './stub-fixture.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SEEDED = JSON.parse(readFileSync(join(here, '..', '..', 'packages', 'api-client', 'openapi', 'form-rule-vectors.json'), 'utf8')).seededAbstractDefinition;
const KP = STUB_PART_B.ids.conference;
const ADMIN = { id: STUB.users.find((user) => user.role === 'admin').id, displayName: STUB.users.find((user) => user.role === 'admin').displayName };

export const PART_C = {
  form: '0e2ef000-0000-4000-8000-0000000000a1',
  submissions: ['0e2e5000-0000-4000-8000-0000000000b1', '0e2e5000-0000-4000-8000-0000000000b2'],
  files: { clean: '0e2e5f00-0000-4000-8000-0000000000c1', pending: '0e2e5f00-0000-4000-8000-0000000000c2' },
  held: ['0e2e6000-0000-4000-8000-0000000000d1', '0e2e6000-0000-4000-8000-0000000000d2'],
};

const clone = (value) => JSON.parse(JSON.stringify(value));

/** The definition a configuration makes: the seeded one with the draft's texts, labels, switches and limits over it. */
function definitionOf(configuration) {
  const definition = clone(SEEDED);
  for (const [key, text] of Object.entries(configuration.texts ?? {})) definition.texts[key] = text;
  for (const section of definition.sections) {
    if (section.repeat && configuration.maxAuthors) section.repeat.max = configuration.maxAuthors;
    section.fields = section.fields
      .map((field) => {
        const own = configuration.fields?.[field.key];
        if (!own) return field;
        if (own.enabled === false) return null;
        return {
          ...field,
          required: own.required ?? field.required,
          label: own.label ?? field.label,
          help: own.help === undefined ? field.help : own.help,
          rules: { ...field.rules, ...(own.maxLength ? { maxLength: own.maxLength } : {}), ...(own.maxWords ? { maxWords: own.maxWords } : {}), ...(own.file ? { file: { ...field.rules.file, ...own.file } } : {}) },
        };
      })
      .filter(Boolean);
  }
  return definition;
}

const now = () => new Date().toISOString();

/** The universe's part C, as the fixture has it at the start and after a reset. */
export function freshPartC() {
  const version = { number: 1, publishedAt: '2026-10-15T09:00:00.000Z', publishedBy: ADMIN };
  return {
    forms: [
      {
        type: 'abstract',
        state: 'open',
        closedReason: null,
        id: PART_C.form,
        conferenceId: KP,
        slug: 'kp-2026-abstract',
        configuration: {},
        currentVersion: version,
        versions: [version],
        definitions: { 1: SEEDED },
        breakerPerHour: 30,
        breakerPerDay: 200,
        updatedAt: '2026-10-15T09:00:00.000Z',
        version: 1,
      },
    ],
    deadlines: {
      [KP]: {
        items: [{ kind: 'abstract_submission', endsOn: '2027-03-15', version: 1 }],
        history: [{ kind: 'abstract_submission', oldEndsOn: null, newEndsOn: '2027-03-15', changedAt: '2026-10-15T09:05:00.000Z', changedBy: ADMIN }],
      },
    },
    submissions: [
      {
        id: PART_C.submissions[0],
        reference: 'KP26-0002',
        conference: { id: KP, code: 'KP', name: 'Konferencija za probe', editionYear: 2026 },
        title: 'Održivi turizam na Balkanu',
        firstAuthor: 'Živana Đorđević',
        institution: 'Univerzitet za probe',
        participationType: 'with_paper',
        status: 'new',
        memberMatch: null,
        billingStatus: null,
        language: 'sr',
        authorCount: 2,
        receivedAt: '2026-10-16T14:56:00.000Z',
        form: { id: PART_C.form, slug: 'kp-2026-abstract', versionNumber: 1 },
        answers: { participationType: 'with_paper', title: 'Održivi turizam na Balkanu', abstract: 'Kratak apstrakt.', keywords: 'turizam', publication: 'proceedings', membership: 'no', attendance: 'in_person', discountClaim: 'no', payer: 'individual', billingAddress: 'Izmišljena 1, Beograd', paymentMethod: 'bank_wire', consent: true },
        authors: [
          { position: 1, firstName: 'Živana', lastName: 'Đorđević', institution: 'Univerzitet za probe', institutionAddress: null, orcid: '0000-0002-1825-0097', email: 'zivana.dordevic@a.example.test', phone: '+381 11 123 4567', isCorresponding: true },
          { position: 2, firstName: 'Đorđe', lastName: 'Šćepanović', institution: 'Institut za probe', institutionAddress: null, orcid: null, email: 'djordje@a.example.test', phone: null, isCorresponding: false },
        ],
        files: [
          { id: PART_C.files.clean, field: 'biographies', name: 'Biografije – Šćepanović.pdf', type: 'pdf', sizeBytes: 1048576, scanState: 'clean', scanFlag: null, scannedAt: '2026-10-16T14:57:00.000Z', pendingSince: null, sha256: 'a'.repeat(64) },
          { id: PART_C.files.pending, field: 'biographies', name: 'Stari rad.doc', type: 'doc', sizeBytes: 52000, scanState: 'pending', scanFlag: 'macros', scannedAt: null, pendingSince: '2026-10-16T14:57:00.000Z', sha256: 'b'.repeat(64) },
        ],
        consent: { text: SEEDED.texts.consent.sr, links: { terms: 'https://kp.example.test/terms', privacy: null }, version: 'v1', consentedAt: '2026-10-16T14:56:00.000Z' },
        statusHistory: [{ status: 'new', changedAt: '2026-10-16T14:56:00.000Z', actor: null }],
        emails: [{ id: PART_C.held[0], kind: 'submission_confirmation', recipient: 'zivana.dordevic@a.example.test', status: 'held', heldReason: 'send_breaker_form', lastErrorCode: null, createdAt: '2026-10-16T14:56:01.000Z', sentAt: null }],
      },
      {
        id: PART_C.submissions[1],
        reference: 'KP26-0001',
        conference: { id: KP, code: 'KP', name: 'Konferencija za probe', editionYear: 2026 },
        title: 'Učenje na daljinu',
        firstAuthor: 'Marta Kovač',
        institution: null,
        participationType: 'without_paper',
        status: 'new',
        memberMatch: null,
        billingStatus: null,
        language: 'en',
        authorCount: 1,
        receivedAt: '2026-10-16T10:00:00.000Z',
        form: { id: PART_C.form, slug: 'kp-2026-abstract', versionNumber: 1 },
        answers: { participationType: 'without_paper', consent: true },
        authors: [{ position: 1, firstName: 'Marta', lastName: 'Kovač', institution: null, institutionAddress: null, orcid: null, email: 'marta.kovac@a.example.test', phone: null, isCorresponding: true }],
        files: [],
        consent: { text: SEEDED.texts.consent.en, links: { terms: null, privacy: null }, version: 'v1', consentedAt: '2026-10-16T10:00:00.000Z' },
        statusHistory: [{ status: 'new', changedAt: '2026-10-16T10:00:00.000Z', actor: null }],
        emails: [{ id: '0e2e6000-0000-4000-8000-0000000000e1', kind: 'submission_confirmation', recipient: 'marta.kovac@a.example.test', status: 'sent', heldReason: null, lastErrorCode: null, createdAt: '2026-10-16T10:00:01.000Z', sentAt: '2026-10-16T10:00:03.000Z' }],
      },
    ],
    held: [
      { id: PART_C.held[0], kind: 'submission_confirmation', recipient: 'zivana.dordevic@a.example.test', heldReason: 'send_breaker_form', conference: { id: KP, code: 'KP', name: 'Konferencija za probe' }, formId: PART_C.form, submission: { id: PART_C.submissions[0], reference: 'KP26-0002' }, createdAt: '2026-10-16T14:56:01.000Z' },
      { id: PART_C.held[1], kind: 'submission_confirmation', recipient: 'ana.anic@b.example.test', heldReason: 'send_breaker_organisation', conference: { id: KP, code: 'KP', name: 'Konferencija za probe' }, formId: PART_C.form, submission: null, createdAt: '2026-10-16T14:58:00.000Z' },
    ],
    breaker: { perHour: 100, perDay: 1000, version: 1 },
  };
}

const formDto = (form) => {
  const rest = { ...form };
  delete rest.definitions;
  return { ...rest, draftDefinition: definitionOf(form.configuration) };
};
const summaryDto = (form) => ({ type: form.type, state: form.state, closedReason: form.closedReason, id: form.id, conferenceId: form.conferenceId, slug: form.slug, currentVersionNumber: form.currentVersion?.number ?? null, version: form.version });

const deadlinesDto = (state, conference) => {
  const own = state.deadlines[conference.id] ?? { items: [], history: [] };
  const endsAt = (day) => new Date(Date.parse(`${day}T00:00:00Z`) + 24 * 3600e3 - 3600e3).toISOString(); // Belgrade in winter: the next day starts an hour earlier in UTC
  return { timeZone: conference.timeZone, items: own.items.map((item) => ({ ...item, endsAt: endsAt(item.endsOn), passed: Date.parse(endsAt(item.endsOn)) <= Date.now() })), history: own.history };
};

export function handlePartC(ctx) {
  const { state, me, method, path, url, body, need, versionOf, refuse, record } = ctx;

  // ---- forms --------------------------------------------------------------------------------
  if (path === '/api/v1/forms' && method === 'GET') {
    need('forms.read');
    const conferenceId = url.searchParams.get('conferenceId');
    return { status: 200, body: { items: state.forms.filter((form) => !conferenceId || form.conferenceId === conferenceId).map(summaryDto) } };
  }
  const create = /^\/api\/v1\/conferences\/([^/]+)\/forms$/.exec(path);
  if (create && method === 'POST') {
    need('forms.manage');
    const conference = state.conferences.find((c) => c.id === create[1]);
    if (!conference) refuse(404, 'not_found');
    if (state.forms.some((form) => form.conferenceId === conference.id && form.type === 'abstract')) refuse(409, 'form_exists');
    const form = { type: 'abstract', state: 'closed', closedReason: 'not_published', id: `0e2ef000-0000-4000-8000-${String(state.forms.length + 1).padStart(12, '0')}`, conferenceId: conference.id, slug: `${conference.code.toLowerCase()}-${conference.editionYear ?? 'x'}-abstract`, configuration: {}, currentVersion: null, versions: [], definitions: {}, breakerPerHour: 30, breakerPerDay: 200, updatedAt: now(), version: 1 };
    state.forms.push(form);
    record(me.id, 'form.created', 'form', form.id);
    return { status: 201, body: formDto(form) };
  }
  const formRoute = /^\/api\/v1\/forms\/([^/]+)(?:\/(draft|publish|breaker|versions\/(\d+)))?$/.exec(path);
  if (formRoute) {
    need('forms.read');
    const form = state.forms.find((f) => f.id === formRoute[1]);
    if (!form) refuse(404, 'not_found');
    const sub = formRoute[2];
    if (!sub && method === 'GET') return { status: 200, body: formDto(form) };
    if (formRoute[3] && method === 'GET') {
      const number = Number(formRoute[3]);
      const version = form.versions.find((v) => v.number === number);
      if (!version) refuse(404, 'not_found');
      return { status: 200, body: { ...version, definition: form.definitions[number] } };
    }
    need('forms.manage');
    versionOf(body.version, form);
    if (sub === 'draft' && method === 'PUT') {
      const configuration = body.configuration ?? {};
      // The server's refusals the screen must show: a mandatory field switched off, a text with a bad link.
      if (configuration.fields?.title?.enabled === false) refuse(400, 'validation_failed', [{ path: 'configuration.fields.title.enabled', code: 'mandatoryField' }]);
      for (const [key, text] of Object.entries(configuration.texts ?? {})) if (/\]\((?!https:\/\/|terms\)|privacy\))/.test(`${text.en} ${text.sr}`)) refuse(400, 'validation_failed', [{ path: `configuration.texts.${key}.en`, code: 'badLink' }]);
      form.configuration = configuration;
      form.version += 1;
      form.updatedAt = now();
      record(me.id, 'form.draft_saved', 'form', form.id);
      return { status: 200, body: formDto(form) };
    }
    if (sub === 'publish' && method === 'POST') {
      const number = (form.versions.at(-1)?.number ?? 0) + 1;
      const version = { number, publishedAt: now(), publishedBy: { id: me.id, displayName: me.displayName } };
      form.definitions[number] = definitionOf(form.configuration);
      form.versions.push(version);
      form.currentVersion = version;
      form.state = 'open';
      form.closedReason = null;
      form.version += 1;
      record(me.id, 'form.published', 'form', form.id);
      return { status: 200, body: formDto(form) };
    }
    if (sub === 'breaker' && method === 'PATCH') {
      form.breakerPerHour = body.breakerPerHour;
      form.breakerPerDay = body.breakerPerDay;
      form.version += 1;
      return { status: 200, body: formDto(form) };
    }
    refuse(405, 'method_not_allowed');
  }

  // ---- deadlines ----------------------------------------------------------------------------
  const deadlineRoute = /^\/api\/v1\/conferences\/([^/]+)\/deadlines(?:\/([a-z_]+))?$/.exec(path);
  if (deadlineRoute) {
    need('conferences.read');
    const conference = state.conferences.find((c) => c.id === deadlineRoute[1]);
    if (!conference) refuse(404, 'not_found');
    if (!deadlineRoute[2] && method === 'GET') return { status: 200, body: deadlinesDto(state, conference) };
    if (deadlineRoute[2] && method === 'PUT') {
      need('conferences.manage');
      const kind = deadlineRoute[2];
      if (!['abstract_submission', 'fee_payment', 'full_paper'].includes(kind)) refuse(404, 'not_found');
      if (conference.state === 'archived') refuse(409, 'conference_archived');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.endsOn ?? ''))) refuse(400, 'validation_failed', [{ path: 'endsOn', code: 'isISO8601' }]);
      const own = (state.deadlines[conference.id] ??= { items: [], history: [] });
      const before = own.items.find((item) => item.kind === kind);
      if (before) {
        if (body.version !== before.version) refuse(409, 'version_conflict');
        if (before.endsOn !== body.endsOn) own.history.unshift({ kind, oldEndsOn: before.endsOn, newEndsOn: body.endsOn, changedAt: now(), changedBy: { id: me.id, displayName: me.displayName } });
        before.endsOn = body.endsOn;
        before.version += 1;
      } else {
        own.items.push({ kind, endsOn: body.endsOn, version: 1 });
        own.history.unshift({ kind, oldEndsOn: null, newEndsOn: body.endsOn, changedAt: now(), changedBy: { id: me.id, displayName: me.displayName } });
      }
      record(me.id, 'deadline.set', 'conference', conference.id);
      return { status: 200, body: deadlinesDto(state, conference) };
    }
  }

  // ---- submissions --------------------------------------------------------------------------
  if (path === '/api/v1/submissions' && method === 'GET') {
    need('submissions.read');
    const conferenceId = url.searchParams.get('conferenceId');
    const page = Number(url.searchParams.get('page') ?? 1);
    const pageSize = Math.min(100, Number(url.searchParams.get('pageSize') ?? 25));
    const all = state.submissions.filter((s) => !conferenceId || s.conference.id === conferenceId);
    const DETAIL_ONLY = ['form', 'answers', 'authors', 'files', 'consent', 'statusHistory', 'emails'];
    const summary = (submission) => Object.fromEntries(Object.entries(submission).filter(([key]) => !DETAIL_ONLY.includes(key)));
    return { status: 200, body: { items: all.slice((page - 1) * pageSize, page * pageSize).map(summary), total: all.length, page, pageSize } };
  }
  const submissionRoute = /^\/api\/v1\/submissions\/([^/]+)(?:\/files\/([^/]+))?$/.exec(path);
  if (submissionRoute && method === 'GET') {
    need('submissions.read');
    const submission = state.submissions.find((s) => s.id === submissionRoute[1]);
    if (!submission) refuse(404, 'not_found');
    if (!submissionRoute[2]) return { status: 200, body: submission };
    const file = submission.files.find((f) => f.id === submissionRoute[2]);
    if (!file) refuse(404, 'not_found');
    if (file.scanState !== 'clean') refuse(409, `file_${file.scanState}`);
    return { status: 200, raw: { type: 'application/pdf', name: file.name, bytes: Buffer.from('%PDF-1.4 invented\n') } };
  }

  // ---- held emails --------------------------------------------------------------------------
  if (path === '/api/v1/held-mail' && method === 'GET') {
    need('held_mail.manage');
    const page = Number(url.searchParams.get('page') ?? 1);
    const pageSize = Number(url.searchParams.get('pageSize') ?? 50);
    return { status: 200, body: { items: state.held.slice((page - 1) * pageSize, page * pageSize), total: state.held.length, page, pageSize, breaker: state.breaker } };
  }
  if (path === '/api/v1/held-mail/release' && method === 'POST') {
    need('held_mail.manage');
    const ids = Array.isArray(body.ids) ? body.ids : null;
    if (!ids && body.all !== true) refuse(400, 'validation_failed', [{ path: 'ids', code: 'idsOrAll' }]);
    const released = state.held.filter((mail) => body.all === true || ids.includes(mail.id));
    state.held = state.held.filter((mail) => !released.includes(mail));
    for (const submission of state.submissions) for (const email of submission.emails) if (released.some((mail) => mail.id === email.id)) Object.assign(email, { status: 'queued', heldReason: null });
    record(me.id, 'held_mail.released', 'organisation', state.organisation.id);
    return { status: 200, body: { released: released.length } };
  }
  if (path === '/api/v1/held-mail/breaker' && method === 'PATCH') {
    need('held_mail.manage');
    if (body.version !== state.breaker.version) refuse(409, 'version_conflict');
    state.breaker = { perHour: body.perHour, perDay: body.perDay, version: state.breaker.version + 1 };
    return { status: 200, body: state.breaker };
  }
  return null;
}
