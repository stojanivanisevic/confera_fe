/**
 * The public form API as the form's own page calls it (ADR-08; `openapi.public.json` of
 * confera_be). Calls under /public/v1, on the page's own origin (the web application forwards them
 * with the Host header kept):
 *   POST /public/v1/forms/{slug}/tokens        a single-use form token, fetched by the page (never
 *                                              rendered into its markup, SEC-A-51), with the
 *                                              challenge of the proof-of-work when it is switched on
 *   POST /public/v1/forms/{slug}/uploads       one file, multipart with the parts `field` and `file`,
 *                                              bound to the token and a file field
 *   POST /public/v1/forms/{slug}/submissions   the answers as JSON, with an Idempotency-Key
 * Every POST carries the token in a custom header, so a request from another site needs a
 * preflight that gets no grant; no cookie is ever sent (`credentials: 'omit'`); nothing is cached.
 */
// The shapes of openapi.public.json, written out: tests/form-public-api-types.test.ts holds them to the
// generated types of the vendored contract, so a change of the contract fails the typecheck.
export interface FormTokenDto {
  formToken: string;
  expiresAt: string;
  proofOfWork: { challenge: string; difficulty: number } | null;
}
export interface UploadedFileDto {
  type: 'pdf' | 'docx' | 'doc' | 'jpeg' | 'png';
  fileId: string;
  name: string;
  sizeBytes: number;
}
export interface SubmittedDto {
  language: 'en' | 'sr';
  reference: string;
  receivedAt: string;
}
export interface SubmitBody {
  language: 'en' | 'sr';
  answers: Record<string, unknown>;
  /** The trap: a field no person sees. It must be empty. */
  website?: string;
  /** The counter that answers the token's challenge, a decimal number as text. */
  proofOfWork?: string;
}

export const TOKEN_HEADER = 'X-Form-Token';
export const IDEMPOTENCY_HEADER = 'Idempotency-Key';

export interface FormToken {
  readonly token: string;
  readonly expiresAt: string | null;
  /** Switched on by the API under load (ADR-08, control 2). */
  readonly proofOfWork: { readonly challenge: string; readonly difficulty: number } | null;
}

export interface Uploaded {
  readonly id: string;
  readonly name: string;
  readonly size: number;
}

export interface Submitted {
  readonly reference: string;
}

/** A refusal of the API (problem details), or no answer at all (`status` 0, `code` `network`). */
export class PublicApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly errors: readonly { path: string; code: string }[] = [],
    readonly traceId: string | null = null,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(`The form API answered ${status} (${code})`);
    this.name = 'PublicApiError';
  }
}

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A problem document of the API. The paths of refused answers are the rules' paths (`answers.title` → `title`). */
function problemOf(status: number, body: unknown, retryAfter: string | null): PublicApiError {
  const problem = isObject(body) ? body : {};
  const errors = Array.isArray(problem.errors)
    ? problem.errors
        .filter((e): e is { path: string; code: string } => isObject(e) && typeof e.path === 'string' && typeof e.code === 'string')
        .map((e) => ({ path: e.path.replace(/^answers\./, ''), code: e.code }))
    : [];
  const seconds = retryAfter !== null && /^\d{1,6}$/.test(retryAfter.trim()) ? Number(retryAfter) : null;
  return new PublicApiError(status, typeof problem.code === 'string' ? problem.code : 'unknown', errors, typeof problem.traceId === 'string' ? problem.traceId : null, seconds);
}

/**
 * The fill time of ADR-08 (item 7; MINIMUM_FILL_MS of confera_be's intake.service.ts): a submit that
 * comes sooner than 3 s after its token was issued is answered with a success that stores nothing.
 * The page never sends sooner after it received the token (Q3-01): the token was issued before it
 * arrived, so the API always counts at least this much. A restored draft sent at once, or a Send
 * whose token was refused and replaced, waits out the rest; the author sees "Sending…".
 */
export const MINIMUM_FILL_MS = 3_000;

export interface PublicApi {
  /**
   * A new token. `refused`: the token the API refused or that expired, for the renewal of
   * confera_be (the new token keeps the issue time of the first; Q3-01).
   */
  token(slug: string, refused?: string): Promise<FormToken>;
  upload(slug: string, token: string, field: string, file: File, onProgress: (percent: number) => void, signal: AbortSignal): Promise<Uploaded>;
  submit(slug: string, token: string, idempotencyKey: string, body: SubmitBody): Promise<Submitted>;
  /** How long after a token the API takes a submit as a person's (default MINIMUM_FILL_MS). */
  readonly minimumFillMs?: number;
}

const base = (slug: string) => `/public/v1/forms/${encodeURIComponent(slug)}`;

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers }, body: JSON.stringify(body), credentials: 'omit', cache: 'no-store', redirect: 'error' });
  } catch {
    throw new PublicApiError(0, 'network');
  }
  const parsed: unknown = await response.json().catch(() => null);
  if (!response.ok) throw problemOf(response.status, parsed, response.headers.get('Retry-After'));
  return parsed;
}

/** The API of the page's own origin. */
export const browserApi: PublicApi = {
  // `refused` is not sent yet: the renewal of confera_be (m3/be-fixes) names its field. Until then
  // the page waits out the fill time of the new token (MINIMUM_FILL_MS).
  async token(slug) {
    const body = (await post(`${base(slug)}/tokens`, {}, {})) as Partial<FormTokenDto> | null;
    if (!isObject(body) || typeof body.formToken !== 'string') throw new PublicApiError(502, 'unreadable');
    const pow = isObject(body.proofOfWork) && typeof body.proofOfWork.challenge === 'string' && typeof body.proofOfWork.difficulty === 'number' ? { challenge: body.proofOfWork.challenge, difficulty: body.proofOfWork.difficulty } : null;
    return { token: body.formToken, expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : null, proofOfWork: pow };
  },

  upload(slug, token, field, file, onProgress, signal) {
    // XMLHttpRequest, because it tells the progress of an upload and fetch does not.
    return new Promise<Uploaded>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open('POST', `${base(slug)}/uploads`);
      request.setRequestHeader(TOKEN_HEADER, token);
      request.setRequestHeader('Accept', 'application/json');
      request.withCredentials = false;
      request.responseType = 'json';
      request.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) onProgress(Math.min(99, Math.floor((event.loaded / event.total) * 100)));
      };
      request.onload = () => {
        const body = request.response as Partial<UploadedFileDto> | null;
        if (request.status >= 200 && request.status < 300 && isObject(body) && typeof body.fileId === 'string') {
          onProgress(100);
          resolve({ id: body.fileId, name: typeof body.name === 'string' ? body.name : file.name, size: typeof body.sizeBytes === 'number' ? body.sizeBytes : file.size });
        } else {
          reject(problemOf(request.status, body, request.getResponseHeader('Retry-After')));
        }
      };
      request.onerror = () => reject(new PublicApiError(0, 'network'));
      request.onabort = () => reject(new PublicApiError(0, 'aborted'));
      signal.addEventListener('abort', () => request.abort(), { once: true });
      // The API reads the parts in this order: the field first, then the file.
      const data = new FormData();
      data.append('field', field);
      data.append('file', file, file.name);
      request.send(data);
    });
  },

  async submit(slug, token, idempotencyKey, body) {
    const answer = (await post(`${base(slug)}/submissions`, { [TOKEN_HEADER]: token, [IDEMPOTENCY_HEADER]: idempotencyKey }, body)) as Partial<SubmittedDto> | null;
    if (!isObject(answer) || typeof answer.reference !== 'string') throw new PublicApiError(502, 'unreadable');
    return { reference: answer.reference };
  },
};

/** The token codes after which a new token is fetched and the request sent once more (the same idempotency key). */
export const TOKEN_CODES = new Set(['form_token_invalid', 'form_token_used']);

const COUNTER = /^(?:0|[1-9][0-9]{0,11})$/;

/** Leading zero bits of a hash. */
function leadingZeroBits(hash: Uint8Array): number {
  let bits = 0;
  for (const byte of hash) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    return bits + Math.clz32(byte) - 24;
  }
  return bits;
}

const sha256 = async (text: string): Promise<Uint8Array> => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));

/** Does a counter answer a challenge: SHA-256 of `challenge:counter` begins with `difficulty` zero bits (ADR-08, item 2)? */
export async function proofOfWorkHolds(challenge: string, difficulty: number, counter: string): Promise<boolean> {
  return COUNTER.test(counter) && leadingZeroBits(await sha256(`${challenge}:${counter}`)) >= difficulty;
}

/**
 * The proof-of-work (ADR-08, item 2): the smallest counter that answers the challenge, and gives up
 * above a difficulty no phone could meet. The hashes of a round are asked for together (an engine
 * computes them off the page's thread: WebKit took 12 s one by one, Q3-08), and the page gets its
 * turn whenever a frame's time has passed, so typing and the spinner stay alive.
 */
const POW_ROUND = 32;
const POW_SLICE_MS = 12;
export async function solveProofOfWork(challenge: string, difficulty: number, signal?: AbortSignal): Promise<string> {
  if (!Number.isInteger(difficulty) || difficulty < 0 || difficulty > 26) throw new PublicApiError(0, 'proof_of_work_unsolvable');
  let slice = performance.now();
  for (let first = 0; first < 2 ** 30; first += POW_ROUND) {
    if (performance.now() - slice >= POW_SLICE_MS) {
      if (signal?.aborted) throw new PublicApiError(0, 'aborted');
      await new Promise((resolve) => setTimeout(resolve, 0));
      slice = performance.now();
    }
    const hashes = await Promise.all(Array.from({ length: POW_ROUND }, (_, i) => sha256(`${challenge}:${String(first + i)}`)));
    const found = hashes.findIndex((hash) => leadingZeroBits(hash) >= difficulty);
    if (found >= 0) return String(first + found);
  }
  throw new PublicApiError(0, 'proof_of_work_unsolvable');
}

/**
 * The API of the admin's preview of a draft (M3-FE-05): a token and an upload that go nowhere, and
 * a Send that is refused with `preview`, which the form says in its own words. Nothing is sent.
 */
export const previewApi: PublicApi = {
  minimumFillMs: 0,
  token: () => Promise.resolve({ token: 'local-only-preview', expiresAt: null, proofOfWork: null }),
  upload: (_slug, _token, _field, file, onProgress) => {
    onProgress(100);
    return Promise.resolve({ id: '00000000-0000-4000-8000-0000000000aa', name: file.name, size: file.size });
  },
  submit: () => Promise.reject(new PublicApiError(0, 'preview')),
};
