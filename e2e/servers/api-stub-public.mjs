// The stand-in for confera_be's public form API of 0.3.0 (ADR-08; openapi.public.json), for the
// browser tests. It follows the rules the web application depends on: the surface from the Host
// header (only "127.0.0.1"), an exact Origin (Confera's public origin) on every POST, the single-use
// form token in `X-Form-Token`, JSON only for a token and a submit and multipart only for an upload
// (the part `field` before the part `file`), an Idempotency-Key whose repeat answers with the first
// result, a trap field answered with a fake success, a closed form refused with 409 `form_closed`, and
// a file refused above its field's limit with 413 `file_too_large`. The forms and their site lists
// are e2e/servers/public-forms.json. Nothing of it is part of the application.
// GET /__stub/public/submissions lists what was stored, for the tests that count ("one submission
// per double click").
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(readFileSync(join(here, 'public-forms.json'), 'utf8'));
const FORMS = FIXTURE.forms;
/** Confera's public origins in the browser tests: the test build and `next dev`. */
const PUBLIC_ORIGINS = new Set(['http://127.0.0.1:3000', 'http://127.0.0.1:3100']);
const MAX_BODY = 25 * 1024 * 1024;
/** The extensions of the file types, for the stub's own check (the API reads the content). */
const EXTENSIONS = { pdf: ['pdf'], docx: ['docx'], doc: ['doc'], jpeg: ['jpg', 'jpeg'], png: ['png'] };

const tokens = new Map(); // token -> { slug, used }
const uploads = new Map(); // id -> { token, field, name, size }
const byKey = new Map(); // idempotency key -> the first answer
const submissions = [];
let references = 0;

const send = (res, status, body) =>
  res.writeHead(status, { 'content-type': status >= 400 ? 'application/problem+json' : 'application/json', 'cache-control': 'no-store' }).end(body === null ? undefined : JSON.stringify(body));
const problem = (res, status, code, extra = {}) => send(res, status, { type: 'about:blank', status, code, traceId: `stub-${randomUUID().slice(0, 8)}`, ...extra });

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('too large'), { tooLarge: true }));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** The parts of a multipart body: name, file name and bytes, in order. */
function multipart(body, contentType) {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType ?? '');
  if (!boundary) return null;
  const marker = Buffer.from(`--${boundary[1] ?? boundary[2]}`);
  const parts = [];
  let at = body.indexOf(marker);
  while (at >= 0) {
    const next = body.indexOf(marker, at + marker.length);
    if (next < 0) break;
    const part = body.subarray(at + marker.length + 2, next - 2); // after CRLF, before CRLF
    const split = part.indexOf('\r\n\r\n');
    if (split >= 0) {
      const head = part.subarray(0, split).toString('utf8');
      parts.push({ name: /name="([^"]*)"/.exec(head)?.[1], filename: /filename="([^"]*)"/.exec(head)?.[1], data: part.subarray(split + 4) });
    }
    at = next;
  }
  return parts;
}

const fileFieldOf = (form, key) => form.definition.sections.flatMap((section) => (section.repeat ? [] : section.fields)).find((field) => field.key === key && field.kind === 'file');

/** Answers a request under /public/v1/forms or /__stub/public. Returns false when the path is not one of them. */
export async function answerPublic(req, res, url) {
  if (url.pathname === '/__stub/public/submissions' && req.method === 'GET') {
    send(res, 200, { items: submissions });
    return true;
  }
  const match = /^\/public\/v1\/forms\/([a-z0-9-]+)(?:\/(tokens|uploads|submissions|frame-sites))?$/.exec(url.pathname);
  if (!match) return false;
  const [, slug, action] = match;
  const form = Object.hasOwn(FORMS, slug) ? FORMS[slug] : null;
  if (!form) return problem(res, 404, 'not_found'), true;

  if (!action || action === 'frame-sites') {
    if (req.method !== 'GET') return problem(res, 405, 'method_not_allowed'), true;
    send(res, 200, action ? { sites: FIXTURE.frameSites[slug] ?? [] } : form);
    return true;
  }
  if (req.method !== 'POST') return problem(res, 405, 'method_not_allowed'), true;
  // Only Confera's own page may call: an exact Origin (ADR-08).
  if (!PUBLIC_ORIGINS.has(req.headers.origin ?? '')) return problem(res, 403, 'origin_refused'), true;

  if (action === 'tokens') {
    if (!/^application\/json/i.test(req.headers['content-type'] ?? '')) return problem(res, 415, 'unsupported_media_type'), true;
    await readBody(req).catch(() => Buffer.alloc(0));
    if (form.state !== 'open') return problem(res, 409, 'form_closed'), true;
    const token = `invented-form-token-${randomUUID()}`;
    tokens.set(token, { slug, used: false });
    send(res, 201, { formToken: token, expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), proofOfWork: null });
    return true;
  }

  const tokenValue = String(req.headers['x-form-token'] ?? '');
  const token = tokens.get(tokenValue);
  if (!token || token.slug !== slug) {
    await readBody(req).catch(() => undefined);
    return problem(res, 403, 'form_token_invalid'), true;
  }

  if (action === 'uploads') {
    if (!/^multipart\/form-data/i.test(req.headers['content-type'] ?? '')) return problem(res, 415, 'unsupported_media_type'), true;
    let body;
    try {
      body = await readBody(req);
    } catch {
      return problem(res, 413, 'file_too_large'), true;
    }
    const parts = multipart(body, req.headers['content-type']) ?? [];
    const key = parts[0]?.name === 'field' ? parts[0].data.toString('utf8') : undefined;
    const file = parts[1]?.name === 'file' && parts[1].filename !== undefined ? parts[1] : undefined;
    const field = key ? fileFieldOf(form, key) : undefined;
    if (!field) return problem(res, 400, 'upload_field_unknown'), true;
    if (!file || file.data.length === 0) return problem(res, 400, 'upload_file_missing'), true;
    const rule = field.rules.file;
    const ext = (/\.([a-z0-9]{1,8})$/i.exec(file.filename)?.[1] ?? '').toLowerCase();
    const type = rule.accept.find((t) => EXTENSIONS[t]?.includes(ext));
    if (!type) return problem(res, 415, 'file_type_refused'), true;
    if (file.data.length > rule.maxBytes) return problem(res, 413, 'file_too_large'), true;
    if (type === 'docx' && file.data.includes(Buffer.from('vbaProject.bin'))) return problem(res, 422, 'docx_macros'), true;
    const fileId = randomUUID();
    uploads.set(fileId, { token: tokenValue, field: key, name: file.filename, size: file.data.length });
    send(res, 201, { type, fileId, name: file.filename, sizeBytes: file.data.length });
    return true;
  }

  // Submissions: JSON only, with an Idempotency-Key.
  if (!/^application\/json/i.test(req.headers['content-type'] ?? '')) return problem(res, 415, 'unsupported_media_type'), true;
  const key = String(req.headers['idempotency-key'] ?? '').toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(key)) return problem(res, 400, 'idempotency_key_missing'), true;
  let body;
  try {
    body = JSON.parse((await readBody(req)).toString('utf8'));
  } catch {
    return problem(res, 400, 'bad_request'), true;
  }
  if (byKey.has(key)) return send(res, 201, byKey.get(key)), true; // a repeat answers with the first result
  if (form.state !== 'open') return problem(res, 409, 'form_closed'), true;
  if (token.used) return problem(res, 409, 'form_token_used'), true;
  const answers = body.answers ?? {};
  // The trap field of ADR-08: a fake success, nothing stored. Filled under either name, as confera_be reads it (SEC-M3-07).
  if (`${body.confera_hp ?? ''}${body.website ?? ''}` !== '') return send(res, 201, { language: body.language, reference: 'IT27-0000', receivedAt: new Date().toISOString() }), true;
  // The server checks again; the tests ask for a refusal by the title.
  if (answers.title === 'refused by the server') return problem(res, 400, 'validation_failed', { errors: [{ path: 'answers.title', code: 'noUrl' }] }), true;
  token.used = true;
  const result = { language: body.language, reference: `${form.conference.code}27-${String(++references).padStart(4, '0')}`, receivedAt: new Date().toISOString() };
  byKey.set(key, result);
  submissions.push({ slug, reference: result.reference, key, language: body.language, answers, files: Object.values(answers).filter((v) => typeof v === 'string' && uploads.has(v)).map((v) => uploads.get(v)), receivedAt: result.receivedAt });
  // A slow answer, so that a second click arrives while the first is on its way.
  await new Promise((resolve) => setTimeout(resolve, 300));
  send(res, 201, result);
  return true;
}
