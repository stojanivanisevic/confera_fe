// The stand-in for confera_be's admin API of 0.4.0, for the browser tests (ADR-24), after the vendored
// contract of m4/be (796338e) where it has a route, and in the direction of the plan where it has none
// yet (the email images of M4-BE-06, the resend and the retention of M4-BE-05): the statuses of a
// submission with their emails, the preview before a status email goes out (FR-MAIL-08), notes, the
// edit on the author's behalf with its kept revisions, search, filters and sort without diacritics
// (FR-SUB-03); the templates saved, a conference's own version and its fallback, the switch of a
// status email per conference (FR-MAIL-07), the server's preview, email images (ADR-12); the mail log's
// resend (FR-SMTP-05) and its retention (FR-SMTP-06); discarding a held email (M3-ISS-14). When
// `pnpm api:sync` brings the backend's contract, this file follows it. Nothing of this is part of the
// application.
import { createHash, randomUUID } from 'node:crypto';

import { STUB_PART_B } from './stub-fixture.mjs';


// ---- statuses (Spec, section 5) ------------------------------------------------------------------
export const STATUSES = ['new', 'open', 'returned_for_revision', 'accepted', 'rejected', 'withdrawn'];
/** Each action: from which statuses, to which, its template, whether it carries a message for the author and an internal reason. */
export const ACTIONS = {
  open: { from: ['new'], to: 'open', type: 'submission_opened', message: 'none', reason: false, transition: 2 },
  return: { from: ['open'], to: 'returned_for_revision', type: 'submission_returned', message: 'required', reason: false, transition: 4 },
  resume: { from: ['returned_for_revision'], to: 'open', type: 'submission_resumed', message: 'none', reason: false, transition: 5 },
  accept: { from: ['open', 'returned_for_revision'], to: 'accepted', type: 'submission_accepted', message: 'none', reason: false, transition: 6 },
  reject: { from: ['open', 'returned_for_revision'], to: 'rejected', type: 'submission_rejected', message: 'optional', reason: false, transition: 7 },
  withdraw: { from: ['new', 'open', 'returned_for_revision', 'accepted'], to: 'withdrawn', type: 'submission_withdrawn', message: 'optional', reason: true, transition: 8 },
  reopen: { from: ['accepted', 'rejected'], to: 'open', type: 'submission_reopened', message: 'optional', reason: true, transition: 9 },
};
export const STATUS_TYPES = Object.values(ACTIONS).map((action) => action.type);

const text = (value) => ({ type: 'text', text: value });
const para = (...children) => ({ type: 'paragraph', children });
/** A stored document with hostile strings (ST-59): every one is text, and runs nothing in the editor, the preview or the mail log. */
const HOSTILE = '<script>parent.document.body.dataset.pwned="editor"</script><img src=x onerror="parent.document.body.dataset.pwned=1"> {{constructor}} javascript:alert(1)';

// ---- the state of part D, added to a universe on its first request --------------------------------
function ensure(state) {
  if (state.partD) return state.partD;
  // The seeded templates of the status emails are the API's (default-templates.json); one of them carries hostile strings.
  const rejected = state.templates.find((t) => t.conferenceId === null && t.type === 'submission_rejected' && t.language === 'en');
  if (rejected) rejected.body = { ...rejected.body, children: [...rejected.body.children, para(text(HOSTILE))] };
  for (const submission of state.submissions) {
    Object.assign(submission, { version: submission.version ?? 1, notes: [], revisions: [] });
    submission.statusHistory = submission.statusHistory.map((entry) => ({ fromStatus: null, transition: 1, reason: null, message: null, email: 'none', emailId: null, ...entry }));
  }
  // A third submission, withdrawn: out of the default view, found with the status filter (FR-SUB-08).
  const third = JSON.parse(JSON.stringify(state.submissions[1]));
  Object.assign(third, {
    id: '0e2e5000-0000-4000-8000-0000000000b3',
    reference: 'KP26-0003',
    title: 'Đački domovi u Čačku',
    firstAuthor: 'Đorđe Šćepanović',
    status: 'withdrawn',
    receivedAt: '2026-10-15T09:00:00.000Z',
    statusHistory: [
      { status: 'new', fromStatus: null, transition: 1, changedAt: '2026-10-15T09:00:00.000Z', actor: null, reason: null, message: null, email: 'none', emailId: null },
      { status: 'withdrawn', fromStatus: 'new', transition: 8, changedAt: '2026-10-15T12:00:00.000Z', actor: null, reason: 'Double submission', message: null, email: 'queued', emailId: null },
    ],
    authors: [{ ...third.authors[0], firstName: 'Đorđe', lastName: 'Šćepanović', email: 'djordje@a.example.test' }],
    emails: [],
  });
  state.submissions.push(third);
  state.partD = { switches: {}, switchVersions: {}, images: [] };
  return state.partD;
}

// ---- search without diacritics (FR-SUB-03) --------------------------------------------------------
export const fold = (value) =>
  String(value ?? '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
const haystack = (s) => fold([s.reference, s.title, s.firstAuthor, s.institution, ...(s.authors ?? []).flatMap((a) => [a.firstName, a.lastName, a.email, a.institution])].join(' '));
const SORTS = { receivedAt: (s) => s.receivedAt, reference: (s) => s.reference, title: (s) => fold(s.title), firstAuthor: (s) => fold(s.firstAuthor), status: (s) => STATUSES.indexOf(s.status) };

// ---- rendering, as the server renders (ADR-12) ----------------------------------------------------
const escape = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const TAGS = { bold: 'strong', italic: 'em', underline: 'u' };
function inlineHtml(node, input) {
  if (node.type === 'text') return (node.marks ?? []).reduce((html, mark) => `<${TAGS[mark]}>${html}</${TAGS[mark]}>`, escape(node.text));
  if (node.type === 'hardBreak') return '<br>';
  if (node.type === 'placeholder') return escape(input.values[node.key] ?? '');
  if (node.type === 'link') return `<a href="${escape(typeof node.href === 'string' ? node.href : (input.link ?? '[link]'))}">${node.children.map((c) => inlineHtml(c, input)).join('')}</a>`;
  return '';
}
function blockHtml(node, input) {
  const inline = (children) => children.map((c) => inlineHtml(c, input)).join('');
  if (node.type === 'paragraph') return `<p>${inline(node.children)}</p>`;
  if (node.type === 'heading') return `<h${node.level}>${inline(node.children)}</h${node.level}>`;
  if (node.type === 'bulletList' || node.type === 'numberedList') {
    const tag = node.type === 'bulletList' ? 'ul' : 'ol';
    return `<${tag}>${node.items.map((item) => `<li>${inline(item.children)}</li>`).join('')}</${tag}>`;
  }
  if (node.type === 'conditional') return input.conditions.has(node.key) ? node.children.map((c) => blockHtml(c, input)).join('') : '';
  if (node.type === 'image') {
    const image = input.images.find((i) => i.id === node.fileId);
    return image ? `<p><img src="${input.inline ? `data:${image.type};base64,${image.bytes}` : `cid:${image.id}`}" alt="${escape(node.alt ?? '')}" width="${image.width}"></p>` : '';
  }
  return '';
}
const inlineText = (node, input) => (node.type === 'text' ? node.text : node.type === 'placeholder' ? (input.values[node.key] ?? '') : node.type === 'hardBreak' ? '\n' : node.type === 'link' ? node.children.map((c) => c.text).join('') : '');
function blockText(node, input) {
  if (node.type === 'paragraph' || node.type === 'heading') return node.children.map((c) => inlineText(c, input)).join('');
  if (node.type === 'bulletList' || node.type === 'numberedList') return node.items.map((item, i) => `${node.type === 'bulletList' ? '-' : `${i + 1}.`} ${item.children.map((c) => inlineText(c, input)).join('')}`).join('\n');
  if (node.type === 'conditional') return input.conditions.has(node.key) ? node.children.map((c) => blockText(c, input)).join('\n\n') : '';
  if (node.type === 'image') return node.alt ? `[${node.alt}]` : '';
  return '';
}
function render(template, input) {
  const subject = template.subject.children.map((c) => (c.type === 'text' ? c.text : (input.values[c.key] ?? ''))).join('').replace(/\s+/g, ' ').trim();
  const html = template.body.children.map((b) => blockHtml(b, input)).join('\n');
  const plain = template.body.children.map((b) => blockText(b, input)).filter(Boolean).join('\n\n');
  return { subject, html, text: `${plain}\n` };
}

// ---- the checks of a saved template (ST-58), as far as the screens need them ----------------------
const BLOCKS = new Set(['paragraph', 'heading', 'bulletList', 'numberedList', 'conditional', 'image']);
const INLINES = new Set(['text', 'hardBreak', 'placeholder', 'link']);
function checkTemplate(subject, body, entry, images, refuse) {
  const fail = (path, code) => refuse(400, 'validation_failed', [{ path, code }]);
  if (typeof body !== 'object' || body === null || body.type !== 'doc' || !Array.isArray(body.children)) fail('body', 'not_a_document');
  if (typeof subject !== 'object' || subject === null || subject.type !== 'subject' || !Array.isArray(subject.children)) fail('subject', 'not_a_document');
  if (JSON.stringify(body).length > 200 * 1024) fail('body', 'too_large');
  const inline = (node, path) => {
    if (!INLINES.has(node?.type)) fail(path, 'unknown_node');
    if (node.type === 'placeholder' && (!entry.placeholders.includes(node.key) || node.key === 'link')) fail(`${path}.key`, 'unknown_placeholder');
    if (node.type === 'link' && typeof node.href === 'string' && !/^(https:\/\/|mailto:)\S+$/.test(node.href)) fail(`${path}.href`, 'link_scheme');
  };
  const block = (node, path) => {
    if (!BLOCKS.has(node?.type)) fail(path, 'unknown_node');
    if (node.type === 'conditional') {
      if (!entry.conditions.includes(node.key)) fail(`${path}.key`, 'unknown_condition');
      node.children.forEach((c, i) => block(c, `${path}.children[${i}]`));
    } else if (node.type === 'image') {
      if (!images.some((image) => image.id === node.fileId)) fail(`${path}.fileId`, 'unknown_image');
    } else if (node.type === 'bulletList' || node.type === 'numberedList') {
      node.items.forEach((item, i) => item.children.forEach((c, j) => inline(c, `${path}.items[${i}].children[${j}]`)));
    } else node.children.forEach((c, i) => inline(c, `${path}.children[${i}]`));
  };
  body.children.forEach((b, i) => block(b, `body.children[${i}]`));
  subject.children.forEach((c, i) => {
    if (c.type !== 'text' && c.type !== 'placeholder') fail(`subject.children[${i}]`, 'unknown_node');
    inline(c, `subject.children[${i}]`);
  });
  if (body.children.filter((b) => b.type === 'image').length > 5) fail('body', 'too_many_images');
}

// ---- images: PNG, JPEG and GIF by their content, never SVG (ADR-12, ADR-10) ------------------------
function imageOf(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { type: 'image/png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { type: 'image/jpeg', width: 600, height: 400 };
  if (bytes.length >= 10 && bytes.subarray(0, 6).toString('latin1').startsWith('GIF8')) return { type: 'image/gif', width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  return null;
}
/** The file of a multipart body: its name and bytes (the stub reads the one part a browser sends). */
function filePart(raw, contentType) {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType ?? '');
  if (!boundary) return null;
  const marker = Buffer.from(`--${boundary[1] ?? boundary[2]}`);
  const start = raw.indexOf(marker);
  const headEnd = raw.indexOf(Buffer.from('\r\n\r\n'), start);
  const end = raw.indexOf(marker, headEnd);
  if (start < 0 || headEnd < 0 || end < 0) return null;
  const head = raw.subarray(start, headEnd).toString('utf8');
  const name = /filename\*?=(?:UTF-8'')?"?([^";\r\n]+)"?/i.exec(head)?.[1] ?? 'image';
  return { name: decodeURIComponent(name), bytes: raw.subarray(headEnd + 4, end - 2) };
}
/** Re-encoded on the server to at most 600 px wide (ADR-12): the stub only says so in the numbers. */
const MAX_WIDTH = 600;

// ---- the handler -----------------------------------------------------------------------------------
const nowIso = () => new Date().toISOString();
const sha = (value) => createHash('sha256').update(value).digest('hex');

export function handlePartD(ctx) {
  const { state, me, req, method, path, url, body, raw, need, versionOf, refuse, record } = ctx;
  const d = ensure(state);
  const actor = { id: me.id, displayName: me.displayName };
  const catalogue = () => ({
    types: STUB_PART_B.catalogue.types.map((entry) => ({ ...entry, statusEmail: STATUS_TYPES.includes(entry.type) })),
    languages: STUB_PART_B.catalogue.languages,
  });
  const entryOf = (type) => catalogue().types.find((t) => t.type === type) ?? refuse(400, 'validation_failed', [{ path: 'type', code: 'unknown_type' }]);
  const enabled = (conferenceId, type) => d.switches[conferenceId]?.[type] !== false;
  /** The template a message uses: the conference's in its language, the conference's in English, the organisation's in its language, in English (ADR-12). */
  const templateFor = (conferenceId, type, language) =>
    state.templates.find((t) => t.conferenceId === conferenceId && t.type === type && t.language === language) ??
    state.templates.find((t) => t.conferenceId === conferenceId && t.type === type && t.language === 'en') ??
    state.templates.find((t) => t.conferenceId === null && t.type === type && t.language === language) ??
    state.templates.find((t) => t.conferenceId === null && t.type === type && t.language === 'en');

  // ---- the catalogue, with the status emails ---------------------------------------------------------
  if (path === '/api/v1/mail-templates/catalogue' && method === 'GET') {
    need('templates.read');
    return { status: 200, body: catalogue() };
  }

  // ---- submissions: the table ------------------------------------------------------------------------
  if (path === '/api/v1/submissions' && method === 'GET') {
    need('submissions.read');
    const q = url.searchParams;
    const page = Math.max(1, Number(q.get('page') ?? 1));
    const pageSize = Math.min(100, Number(q.get('pageSize') ?? 25));
    const statuses = (q.get('status') ?? '').split(',').filter(Boolean);
    const search = fold(q.get('q') ?? '').trim();
    const sortKey = Object.hasOwn(SORTS, q.get('sort') ?? '') ? q.get('sort') : 'receivedAt';
    const direction = (q.get('order') ?? (sortKey === 'receivedAt' ? 'desc' : 'asc')) === 'asc' ? 1 : -1;
    const all = state.submissions
      .filter((s) => !q.get('conferenceId') || s.conference.id === q.get('conferenceId'))
      // A withdrawn submission leaves the default view and is found with the status filter (FR-SUB-08).
      .filter((s) => (statuses.length > 0 ? statuses.includes(s.status) : s.status !== 'withdrawn'))
      .filter((s) => !q.get('participationType') || s.participationType === q.get('participationType'))
      .filter((s) => search === '' || search.split(/\s+/).every((word) => haystack(s).includes(word)))
      .sort((a, b) => {
        const x = SORTS[sortKey](a);
        const y = SORTS[sortKey](b);
        return (x < y ? -1 : x > y ? 1 : 0) * direction || (a.receivedAt < b.receivedAt ? 1 : -1);
      });
    const DETAIL_ONLY = ['form', 'answers', 'authors', 'files', 'consent', 'statusHistory', 'emails', 'notes', 'revisions'];
    const summary = (s) => Object.fromEntries(Object.entries(s).filter(([key]) => !DETAIL_ONLY.includes(key)));
    return { status: 200, body: { items: all.slice((page - 1) * pageSize, page * pageSize).map(summary), total: all.length, page, pageSize } };
  }

  const sub = /^\/api\/v1\/submissions\/([^/]+)(?:\/(status|status\/preview|notes))?$/.exec(path);
  if (sub) {
    const submission = state.submissions.find((s) => s.id === sub[1]);
    const detail = () => ({ ...submission, actions: Object.entries(ACTIONS).filter(([, a]) => a.from.includes(submission.status)).map(([name]) => name) });
    if (!sub[2] && method === 'GET') {
      need('submissions.read');
      if (!submission) refuse(404, 'not_found');
      // Reading a submission changes nothing (M4-BE-01): taking it into processing is a POST.
      return { status: 200, body: detail() };
    }
    if (!submission) refuse(404, 'not_found');
    need('submissions.manage');
    const language = submission.language === 'sr' ? 'sr' : 'en';
    const values = (message) => ({ organisationName: state.organisation.name, conferenceName: submission.conference.name, reference: submission.reference, title: submission.title ?? '', authorName: `${submission.authors[0].firstName} ${submission.authors[0].lastName}`, message: message ?? '' });
    const emailOf = (action, message) => {
      const template = templateFor(submission.conference.id, action.type, language);
      const conditions = new Set([...(submission.title ? ['hasTitle'] : []), ...(message ? ['hasMessage'] : [])]);
      return { template, rendered: render(template, { values: values(message), conditions, images: d.images, inline: true }) };
    };
    const asked = () => {
      const action = ACTIONS[body.action];
      if (!action) refuse(400, 'validation_failed', [{ path: 'action', code: 'isIn' }]);
      if (!action.from.includes(submission.status)) refuse(409, 'transition_refused');
      const message = typeof body.message === 'string' && body.message.trim() !== '' ? body.message.trim() : null;
      if (action.message === 'required' && !message) refuse(400, 'validation_failed', [{ path: 'message', code: 'isNotEmpty' }]);
      if (action.message === 'none' && message) refuse(400, 'validation_failed', [{ path: 'message', code: 'notAllowed' }]);
      if (message && message.length > 5000) refuse(400, 'validation_failed', [{ path: 'message', code: 'maxLength' }]);
      const reason = typeof body.reason === 'string' && body.reason.trim() !== '' ? body.reason.trim() : null;
      if (action.reason && !reason) refuse(400, 'validation_failed', [{ path: 'reason', code: 'isNotEmpty' }]);
      return { action, message, reason };
    };

    // The email as it will go out (FR-MAIL-08): its subject and body for this submission, or that none goes.
    if (sub[2] === 'status/preview' && method === 'POST') {
      const { action, message } = asked();
      if (!enabled(submission.conference.id, action.type)) return { status: 200, body: { sends: false, to: null, language: null, subject: null, html: null, text: null, previewDigest: null } };
      const { rendered } = emailOf(action, message);
      return { status: 200, body: { sends: true, to: submission.authors.find((a) => a.isCorresponding)?.email ?? submission.authors[0].email, language, subject: rendered.subject, html: rendered.html, text: rendered.text, previewDigest: sha(rendered.html + rendered.subject) } };
    }

    // A change of status: one row of history, one email, exactly once for one key (FR-MAIL-05).
    if (sub[2] === 'status' && method === 'POST') {
      // A repeated request carries a version that is no longer the submission's: 409, and no second email.
      versionOf(body.version, submission);
      const { action, message, reason } = asked();
      const off = !enabled(submission.conference.id, action.type);
      const recipient = submission.authors.find((a) => a.isCorresponding)?.email ?? submission.authors[0].email;
      if (!off) {
        const { rendered } = emailOf(action, message);
        // What was shown is what goes (FR-MAIL-08): a preview of another text is refused.
        if (body.previewDigest !== undefined && body.previewDigest !== sha(rendered.html + rendered.subject)) refuse(409, 'preview_outdated');
        const messageId = randomUUID();
        submission.emails.push({ id: messageId, kind: action.type, recipient, status: 'sent', heldReason: null, lastErrorCode: null, createdAt: nowIso(), sentAt: nowIso() });
        state.mailLog.unshift({ id: randomUUID(), messageId, recipient, kind: action.type, language, conferenceId: submission.conference.id, mailServerId: STUB_PART_B.ids.server, serverName: 'Kancelarija', attempt: 1, result: 'sent', errorCode: null, sentAt: nowIso(), subject: rendered.subject, bodyHtml: render(emailOf(action, message).template, { values: values(message), conditions: new Set([...(submission.title ? ['hasTitle'] : []), ...(message ? ['hasMessage'] : [])]), images: d.images, inline: false }).html, bodyText: rendered.text, diverted: false, resentFrom: null });
      }
      submission.statusHistory.push({ status: action.to, fromStatus: submission.status, transition: action.transition, changedAt: nowIso(), actor, reason, message, email: off ? 'template_off' : 'queued', emailId: off ? null : (submission.emails.at(-1)?.id ?? null) });
      submission.status = action.to;
      submission.version += 1;
      record(me.id, 'submission.status_changed', 'submission', submission.id);
      return { status: 200, body: detail() };
    }

    if (sub[2] === 'notes' && method === 'POST') {
      const note = String(body.body ?? '').trim();
      if (note === '') refuse(400, 'validation_failed', [{ path: 'body', code: 'isNotEmpty' }]);
      if (note.length > 5000) refuse(400, 'validation_failed', [{ path: 'body', code: 'maxLength' }]);
      const added = { id: randomUUID(), body: note, createdAt: nowIso(), author: actor };
      submission.notes.push(added);
      record(me.id, 'submission.note_added', 'submission', submission.id);
      return { status: 201, body: added };
    }

    // The data corrected on the author's behalf (FR-SUB-06): the answers that change, the authors among them; the old values are kept as a revision.
    if (!sub[2] && method === 'PUT') {
      versionOf(body.version, submission);
      const given = body.answers;
      if (typeof given !== 'object' || given === null) refuse(400, 'validation_failed', [{ path: 'answers', code: 'isObject' }]);
      const errors = [];
      const current = { ...submission.answers, authors: submission.answers.authors ?? submission.authors.map((a) => ({ firstName: a.firstName, lastName: a.lastName, institution: a.institution, email: a.email })) };
      for (const [key, value] of Object.entries(given)) {
        if (submission.files.some((file) => file.field === key)) errors.push({ path: `answers.${key}`, code: 'fileNotEditable' });
        if (key === 'title' && (typeof value !== 'string' || value.trim() === '')) errors.push({ path: 'answers.title', code: 'required' });
        if (key === 'authors') {
          if (!Array.isArray(value) || value.length === 0) errors.push({ path: 'answers.authors', code: 'required' });
          else
            value.forEach((author, i) => {
              if (!String(author.firstName ?? '').trim()) errors.push({ path: `answers.authors[${i}].firstName`, code: 'required' });
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(author.email ?? ''))) errors.push({ path: `answers.authors[${i}].email`, code: 'isMailAddress' });
            });
        }
      }
      if (errors.length > 0) refuse(400, 'validation_failed', errors);
      const fields = Object.keys(given).filter((key) => JSON.stringify(given[key]) !== JSON.stringify(current[key]));
      if (fields.length === 0) return { status: 200, body: detail() };
      const before = Object.fromEntries(fields.map((key) => [key, current[key] ?? null]));
      const after = Object.fromEntries(fields.map((key) => [key, given[key]]));
      submission.answers = { ...current, ...after };
      if (fields.includes('title')) submission.title = given.title;
      if (fields.includes('authors')) {
        submission.authors = given.authors.map((a, i) => ({ position: i + 1, firstName: a.firstName, lastName: a.lastName, institution: a.institution ?? null, institutionAddress: null, orcid: null, email: a.email, phone: null, isCorresponding: i === 0 }));
        submission.firstAuthor = `${given.authors[0].firstName} ${given.authors[0].lastName}`;
      }
      submission.revisions.push({ number: submission.revisions.length + 1, changedAt: nowIso(), changedBy: actor, fields, before, after });
      submission.version += 1;
      record(me.id, 'submission.edited', 'submission', submission.id);
      return { status: 200, body: detail() };
    }
  }

  // ---- templates: save, a conference's own version, back to the organisation's -----------------------
  if (path === '/api/v1/mail-templates' && method === 'POST') {
    need('templates.manage');
    const entry = entryOf(body.type);
    if (!['en', 'sr'].includes(body.language)) refuse(400, 'validation_failed', [{ path: 'language', code: 'isIn' }]);
    if (!state.conferences.some((c) => c.id === body.conferenceId)) refuse(400, 'validation_failed', [{ path: 'conferenceId', code: 'unknown_conference' }]);
    if (state.templates.some((t) => t.conferenceId === body.conferenceId && t.type === body.type && t.language === body.language)) refuse(409, 'template_exists');
    checkTemplate(body.subject, body.body, entry, d.images, refuse);
    const template = { id: randomUUID(), conferenceId: body.conferenceId, type: body.type, language: body.language, subject: body.subject, body: body.body, mailServerId: null, updatedAt: nowIso(), version: 1 };
    state.templates.push(template);
    record(me.id, 'template.created', 'template', template.id);
    return { status: 201, body: template };
  }
  if (path === '/api/v1/mail-templates/preview' && method === 'POST') {
    need('templates.read');
    const entry = entryOf(body.type);
    checkTemplate(body.subject, body.body, entry, d.images, refuse);
    const SAMPLE = { recipientName: 'Đorđe Šćepanović', authorName: 'Đorđe Šćepanović', organisationName: state.organisation.name, conferenceName: 'Konferencija za probe', reference: 'KP26-0042', title: 'Održivi turizam u Čačku i Žabalju', message: 'Please shorten the abstract to 250 words.', inviterName: 'Živana Đorđević', expiresIn: '7 days', newEmail: 'novi@a.example.test', change: 'role', actorName: 'Živana Đorđević', subjectName: 'Marta Kovač', serverName: 'Kancelarija' };
    return { status: 200, body: { ...render({ subject: body.subject, body: body.body }, { values: SAMPLE, conditions: new Set(entry.conditions), images: d.images, inline: true, link: 'https://admin.confera.example/invitations/sample' }), imagesPending: [] } };
  }
  const templateRoute = /^\/api\/v1\/mail-templates\/([^/]+)$/.exec(path);
  if (templateRoute && (method === 'PUT' || method === 'DELETE')) {
    need('templates.manage');
    const template = state.templates.find((t) => t.id === templateRoute[1]);
    if (!template) refuse(404, 'not_found');
    if (method === 'PUT') versionOf(body.version, template);
    if (method === 'DELETE') {
      // Only a conference's own version goes; the conference then uses the organisation's again.
      if (template.conferenceId === null) refuse(409, 'organisation_template');
      state.templates = state.templates.filter((t) => t !== template);
      record(me.id, 'template.deleted', 'template', template.id);
      return { status: 204 };
    }
    checkTemplate(body.subject, body.body, entryOf(template.type), d.images, refuse);
    Object.assign(template, { subject: body.subject, body: body.body, updatedAt: nowIso(), version: template.version + 1 });
    record(me.id, 'template.updated', 'template', template.id);
    return { status: 200, body: template };
  }

  // ---- the status emails of a conference, each on or off (FR-MAIL-07) ---------------------------------
  const switches = /^\/api\/v1\/conferences\/([^/]+)\/status-emails$/.exec(path);
  if (switches) {
    const conference = state.conferences.find((c) => c.id === switches[1]);
    if (!conference) refuse(404, 'not_found');
    const list = () => ({ conferenceId: conference.id, types: STATUS_TYPES.map((type) => ({ type, enabled: enabled(conference.id, type) })), version: d.switchVersions[conference.id] ?? 1 });
    if (method === 'GET') {
      need('templates.read');
      return { status: 200, body: list() };
    }
    if (method === 'PUT') {
      need('templates.manage');
      if (body.version !== (d.switchVersions[conference.id] ?? 1)) refuse(409, 'version_conflict');
      if (!Array.isArray(body.types) || body.types.some((item) => !STATUS_TYPES.includes(item.type) || typeof item.enabled !== 'boolean')) refuse(400, 'validation_failed', [{ path: 'types', code: 'isIn' }]);
      for (const item of body.types) (d.switches[conference.id] ??= {})[item.type] = item.enabled;
      d.switchVersions[conference.id] = (d.switchVersions[conference.id] ?? 1) + 1;
      record(me.id, 'conference.status_emails_changed', 'conference', conference.id);
      return { status: 200, body: list() };
    }
  }

  // ---- email images ----------------------------------------------------------------------------------
  if (path === '/api/v1/mail-images' && method === 'POST') {
    need('templates.manage');
    const part = filePart(raw, req.headers['content-type']);
    if (!part || part.bytes.length === 0) refuse(400, 'validation_failed', [{ path: 'file', code: 'isNotEmpty' }]);
    const kind = imageOf(part.bytes);
    // By content, never by name or label: an SVG, or anything else, is refused (ST-60).
    if (!kind) refuse(415, 'image_type');
    if (part.bytes.length > 5 * 1024 * 1024) refuse(413, 'image_too_large');
    const scale = Math.min(1, MAX_WIDTH / kind.width);
    const image = { id: randomUUID(), name: part.name, type: kind.type, width: Math.round(kind.width * scale), height: Math.round(kind.height * scale), sizeBytes: Math.min(part.bytes.length, 200 * 1024), bytes: part.bytes.toString('base64'), createdAt: nowIso() };
    d.images.push(image);
    record(me.id, 'mail_image.uploaded', 'mail_image', image.id);
    const dto = { ...image };
    delete dto.bytes;
    return { status: 201, body: dto };
  }
  const imageRoute = /^\/api\/v1\/mail-images\/([^/]+)$/.exec(path);
  if (imageRoute && method === 'GET') {
    need('templates.read');
    const image = d.images.find((i) => i.id === imageRoute[1]);
    if (!image) refuse(404, 'not_found');
    return { status: 200, raw: { type: image.type, name: image.name, bytes: Buffer.from(image.bytes, 'base64') } };
  }

  // ---- the mail log: resend (FR-SMTP-05) ---------------------------------------------------------------
  const resend = /^\/api\/v1\/mail-log\/([^/]+)\/resend$/.exec(path);
  if (resend && method === 'POST') {
    need('mail_log.resend');
    const entry = state.mailLog.find((e) => e.id === resend[1]);
    if (!entry) refuse(404, 'not_found');
    // A stored content goes again with a fresh link; without one the template renders it again.
    const mode = entry.bodyHtml !== null || entry.bodyText !== null ? 'stored' : 'rendered';
    const copy = { ...entry, id: randomUUID(), messageId: randomUUID(), attempt: 1, result: 'sent', errorCode: null, sentAt: nowIso(), resentFrom: entry.id, resendMode: mode };
    state.mailLog.unshift(copy);
    record(me.id, 'mail.resent', 'mail_log', entry.id);
    return { status: 202, body: { messageId: copy.messageId, mode } };
  }

  // ---- held emails: discard (M3-ISS-14) -----------------------------------------------------------------
  if (path === '/api/v1/held-mail/discard' && method === 'POST') {
    need('held_mail.manage');
    const ids = Array.isArray(body.ids) ? body.ids : null;
    if (!ids && body.all !== true) refuse(400, 'validation_failed', [{ path: 'ids', code: 'idsOrAll' }]);
    const gone = state.held.filter((mail) => body.all === true || ids.includes(mail.id));
    state.held = state.held.filter((mail) => !gone.includes(mail));
    for (const submission of state.submissions) for (const email of submission.emails) if (gone.some((mail) => mail.id === email.id)) Object.assign(email, { status: 'discarded', heldReason: null });
    record(me.id, 'held_mail.discarded', 'organisation', state.organisation.id);
    return { status: 200, body: { discarded: gone.length } };
  }
  return null;
}
