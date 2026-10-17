/**
 * The public form API as the form's own page calls it (ADR-08). Three calls under /public/v1, on
 * the page's own origin (the web application forwards them with the Host header kept):
 *   POST /public/v1/forms/{slug}/tokens        a single-use form token, fetched by the page (never
 *                                              rendered into its markup, SEC-A-51), with the
 *                                              challenge of the proof-of-work when it is switched on
 *   POST /public/v1/forms/{slug}/uploads       one file, multipart, bound to the token and a file field
 *   POST /public/v1/forms/{slug}/submissions   the answers as JSON, with an Idempotency-Key
 * Every POST carries the token in a custom header, so a request from another site needs a
 * preflight that gets no grant; no cookie is ever sent (`credentials: 'omit'`); nothing is cached.
 */
export const TOKEN_HEADER = 'X-Confera-Form-Token';
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
    readonly errors: readonly { path: string; code: string; params?: Record<string, string | number> }[] = [],
    readonly traceId: string | null = null,
    readonly retryAfterSeconds: number | null = null,
    readonly params: Readonly<Record<string, unknown>> = {},
  ) {
    super(`The form API answered ${status} (${code})`);
    this.name = 'PublicApiError';
  }
}

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

function problemOf(status: number, body: unknown, retryAfter: string | null): PublicApiError {
  const problem = isObject(body) ? body : {};
  const errors = Array.isArray(problem.errors)
    ? problem.errors.filter((e): e is { path: string; code: string; params?: Record<string, string | number> } => isObject(e) && typeof e.path === 'string' && typeof e.code === 'string')
    : [];
  const seconds = retryAfter !== null && /^\d{1,6}$/.test(retryAfter.trim()) ? Number(retryAfter) : null;
  return new PublicApiError(status, typeof problem.code === 'string' ? problem.code : 'unknown', errors, typeof problem.traceId === 'string' ? problem.traceId : null, seconds, isObject(problem.params) ? problem.params : {});
}

export interface PublicApi {
  token(slug: string): Promise<FormToken>;
  upload(slug: string, token: string, field: string, file: File, onProgress: (percent: number) => void, signal: AbortSignal): Promise<Uploaded>;
  submit(slug: string, token: string, idempotencyKey: string, body: unknown): Promise<Submitted>;
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
  async token(slug) {
    const body = await post(`${base(slug)}/tokens`, {}, {});
    if (!isObject(body) || typeof body.token !== 'string') throw new PublicApiError(502, 'unreadable');
    const pow = isObject(body.proofOfWork) && typeof body.proofOfWork.challenge === 'string' && typeof body.proofOfWork.difficulty === 'number' ? { challenge: body.proofOfWork.challenge, difficulty: body.proofOfWork.difficulty } : null;
    return { token: body.token, expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : null, proofOfWork: pow };
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
        const body: unknown = request.response;
        if (request.status >= 200 && request.status < 300 && isObject(body) && typeof body.id === 'string') {
          onProgress(100);
          resolve({ id: body.id, name: typeof body.name === 'string' ? body.name : file.name, size: typeof body.size === 'number' ? body.size : file.size });
        } else {
          reject(problemOf(request.status, body, request.getResponseHeader('Retry-After')));
        }
      };
      request.onerror = () => reject(new PublicApiError(0, 'network'));
      request.onabort = () => reject(new PublicApiError(0, 'aborted'));
      signal.addEventListener('abort', () => request.abort(), { once: true });
      const data = new FormData();
      data.append('field', field);
      data.append('file', file, file.name);
      request.send(data);
    });
  },

  async submit(slug, token, idempotencyKey, body) {
    const answer = await post(`${base(slug)}/submissions`, { [TOKEN_HEADER]: token, [IDEMPOTENCY_HEADER]: idempotencyKey }, body);
    if (!isObject(answer) || typeof answer.reference !== 'string') throw new PublicApiError(502, 'unreadable');
    return { reference: answer.reference };
  },
};

/** The token codes after which a new token is fetched and the request sent once more. */
export const TOKEN_CODES = new Set(['form_token_invalid', 'form_token_expired', 'form_token_used', 'token_invalid', 'token_expired', 'token_used']);

/**
 * The proof-of-work (ADR-08, control 2): a number that, written after the challenge, gives a
 * SHA-256 starting with `difficulty` zero bits. It yields to the page between rounds, so typing and
 * the spinner stay alive, and gives up above a difficulty no phone could meet.
 */
export async function solveProofOfWork(challenge: string, difficulty: number, signal?: AbortSignal): Promise<string> {
  if (!Number.isInteger(difficulty) || difficulty < 0 || difficulty > 26) throw new PublicApiError(0, 'proof_of_work_unsolvable');
  const encoder = new TextEncoder();
  const full = Math.floor(difficulty / 8);
  const mask = 0xff << (8 - (difficulty % 8)) & 0xff;
  for (let nonce = 0; nonce < 2 ** 28; nonce += 1) {
    if (nonce % 2000 === 0) {
      if (signal?.aborted) throw new PublicApiError(0, 'aborted');
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(`${challenge}:${nonce}`)));
    let ok = true;
    for (let i = 0; i < full; i += 1) if (digest[i] !== 0) ok = false;
    if (ok && (difficulty % 8 === 0 || ((digest[full] ?? 0xff) & mask) === 0)) return String(nonce);
  }
  throw new PublicApiError(0, 'proof_of_work_unsolvable');
}
