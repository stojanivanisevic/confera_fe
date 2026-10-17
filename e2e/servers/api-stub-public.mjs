// The stand-in for confera_be's public form API of 0.3.0 (ADR-08), for the browser tests. It
// follows the rules the web application depends on: the surface from the Host header (only
// "127.0.0.1"), an exact Origin (Confera's public origin) on every POST, the single-use form token
// in its own header, JSON only for a submit and multipart only for an upload, an Idempotency-Key
// whose repeat answers with the first result, a trap field answered with a fake success, a closed
// form refused with 409, and a file refused above its field's limit with 413. Nothing of it is part
// of the application. GET /__stub/public/submissions lists what was stored, for the tests that
// count ("one submission per double click").
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const FORMS = JSON.parse(readFileSync(join(here, 'public-forms.json'), 'utf8')).forms;
/** Confera's public origins in the browser tests: the test build and `next dev`. */
const PUBLIC_ORIGINS = new Set(['http://127.0.0.1:3000', 'http://127.0.0.1:3100']);
const MAX_BODY = 25 * 1024 * 1024;

const tokens = new Map(); // token -> { slug, issuedAt, uploads, used }
const uploads = new Map(); // id -> { token, field, name, size }
const byKey = new Map(); // idempotency key -> { reference }
const submissions = [];
let references = 0;

const send = (res, status, body, headers = {}) =>
  res.writeHead(status, { 'content-type': status >= 400 ? 'application/problem+json' : 'application/json', 'cache-control': 'no-store', ...headers }).end(body === null ? undefined : JSON.stringify(body));
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

/** The parts of a multipart body: name, file name and bytes. */
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
      const name = /name="([^"]*)"/.exec(head)?.[1];
      const filename = /filename="([^"]*)"/.exec(head)?.[1];
      parts.push({ name, filename, data: part.subarray(split + 4) });
    }
    at = next;
  }
  return parts;
}

const fieldOf = (form, key) => form.definition.sections.flatMap((section) => (section.repeat ? [] : section.fields)).find((field) => field.key === key);

/** Answers a request under /public/v1/forms or /__stub/public. Returns false when the path is not one of them. */
export async function answerPublic(req, res, url) {
  if (url.pathname === '/__stub/public/submissions' && req.method === 'GET') {
    send(res, 200, { items: submissions });
    return true;
  }
  const match = /^\/public\/v1\/forms\/([a-z0-9-]+)(?:\/(tokens|uploads|submissions))?$/.exec(url.pathname);
  if (!match) return false;
  const [, slug, action] = match;
  const form = Object.hasOwn(FORMS, slug) ? FORMS[slug] : null;
  if (!form) return problem(res, 404, 'not_found'), true;

  if (!action) {
    if (req.method !== 'GET') return problem(res, 405, 'method_not_allowed'), true;
    send(res, 200, form);
    return true;
  }
  if (req.method !== 'POST') return problem(res, 405, 'method_not_allowed'), true;
  // Only Confera's own page may call: an exact Origin (ADR-08).
  if (!PUBLIC_ORIGINS.has(req.headers.origin ?? '')) return problem(res, 403, 'origin_refused'), true;

  if (action === 'tokens') {
    await readBody(req).catch(() => Buffer.alloc(0));
    if (form.state !== 'open') return problem(res, 409, 'form_closed'), true;
    const token = `invented-form-token-${randomUUID()}`;
    tokens.set(token, { slug, issuedAt: Date.now(), uploads: 0, used: false });
    send(res, 201, { token, expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), proofOfWork: null });
    return true;
  }

  const token = tokens.get(String(req.headers['x-confera-form-token'] ?? ''));
  if (!token || token.slug !== slug) {
    await readBody(req).catch(() => undefined);
    return problem(res, 401, 'form_token_invalid'), true;
  }

  if (action === 'uploads') {
    if (!/^multipart\/form-data/i.test(req.headers['content-type'] ?? '')) return problem(res, 415, 'unsupported_media_type'), true;
    let body;
    try {
      body = await readBody(req);
    } catch {
      return problem(res, 413, 'file_too_large', { params: { maxBytes: 20971520 } }), true;
    }
    const parts = multipart(body, req.headers['content-type']);
    const key = parts?.find((p) => p.name === 'field')?.data.toString('utf8');
    const file = parts?.find((p) => p.name === 'file' && p.filename !== undefined);
    const field = key ? fieldOf(form, key) : undefined;
    if (!field || field.kind !== 'file' || !file) return problem(res, 422, 'validation_failed', { errors: [{ path: 'field', code: 'not_a_file_field' }] }), true;
    const rule = field.rules.file;
    const ext = (/\.([a-z0-9]{1,8})$/i.exec(file.filename)?.[1] ?? '').toLowerCase();
    if (file.data.length === 0) return problem(res, 422, 'file_empty'), true;
    if (!rule.accept.includes(ext)) return problem(res, 415, 'file_type_not_allowed', { params: { accept: rule.accept } }), true;
    if (file.data.length > rule.maxBytes) return problem(res, 413, 'file_too_large', { params: { maxBytes: rule.maxBytes } }), true;
    if (ext === 'docx' && file.data.includes(Buffer.from('vbaProject.bin'))) return problem(res, 422, 'docx_macros'), true;
    const id = randomUUID();
    uploads.set(id, { token: req.headers['x-confera-form-token'], field: key, name: file.filename, size: file.data.length });
    send(res, 201, { id, name: file.filename, size: file.data.length });
    return true;
  }

  // Submissions: JSON only, with an Idempotency-Key.
  if (!/^application\/json/i.test(req.headers['content-type'] ?? '')) return problem(res, 415, 'unsupported_media_type'), true;
  const key = String(req.headers['idempotency-key'] ?? '');
  if (!/^[0-9a-f-]{36}$/.test(key)) return problem(res, 400, 'idempotency_key_required'), true;
  let answers;
  try {
    answers = JSON.parse((await readBody(req)).toString('utf8'));
  } catch {
    return problem(res, 400, 'bad_request'), true;
  }
  if (byKey.has(key)) return send(res, 201, byKey.get(key)), true; // a repeat answers with the first result
  if (form.state !== 'open') return problem(res, 409, 'form_closed'), true;
  if (token.used) return problem(res, 401, 'form_token_used'), true;
  // The trap field of ADR-08: a fake success, nothing stored.
  if (typeof answers.website === 'string' && answers.website !== '') return send(res, 201, { reference: 'IT-2026-0000' }), true;
  // The server checks again; the tests ask for a refusal by the title.
  if (answers.answers?.title === 'refused by the server') return problem(res, 422, 'validation_failed', { errors: [{ path: 'title', code: 'no_url' }] }), true;
  token.used = true;
  const reference = `${form.conference.code}-2026-${String(++references).padStart(4, '0')}`;
  const result = { reference };
  byKey.set(key, result);
  submissions.push({ slug, reference, key, language: answers.language, answers: answers.answers, blocks: answers.blocks, consent: answers.consent, files: Object.values(answers.answers ?? {}).filter((v) => uploads.has(v)).map((v) => uploads.get(v)), receivedAt: new Date().toISOString() });
  // A slow answer, so that a second click arrives while the first is on its way.
  await new Promise((resolve) => setTimeout(resolve, 300));
  send(res, 201, result);
  return true;
}
