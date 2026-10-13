// @confera/api-client: typed calls to the API of confera_be (ADR-19).
//
// The types are generated from the vendored OpenAPI documents
// (`pnpm api:sync`); there is no generated runtime code. Calls go to the
// application's own origin and are forwarded to the API with the Host header
// kept; there is no cross-origin call anywhere (ADR-02).
import createClient, { type Client } from 'openapi-fetch';

import lock from '../openapi/openapi.lock.json';
import type { components, paths as AdminPaths } from './generated/admin';
import type { paths as PublicPaths } from './generated/public';

export type { AdminPaths, PublicPaths };
export type Meta = components['schemas']['Meta'];
export type Problem = components['schemas']['Problem'];
export type FieldError = components['schemas']['FieldError'];
export type AdminClient = Client<AdminPaths>;
export type PublicClient = Client<PublicPaths>;

/** Version of the admin contract this build was generated from (`info.version` of openapi.json). */
export const CONTRACT_VERSION: string = lock.files['openapi.json'].version;
/** The commit of confera_be the contract comes from. */
export const CONTRACT_COMMIT: string = lock.source.commit;

export interface ClientOptions {
  /** Origin to call. Empty in a browser: the application's own origin. */
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

/** A client for /api/v1 (the admin surface). Responses are never cached (ADR-20). */
export function createAdminClient(options: ClientOptions = {}): AdminClient {
  return createClient<AdminPaths>({ baseUrl: options.baseUrl ?? '', fetch: options.fetch, credentials: 'same-origin', cache: 'no-store' });
}

/** A client for /public/v1 (the public surface). It never sends a cookie (ADR-02). */
export function createPublicClient(options: ClientOptions = {}): PublicClient {
  return createClient<PublicPaths>({ baseUrl: options.baseUrl ?? '', fetch: options.fetch, credentials: 'omit', cache: 'no-store' });
}

/** An answer of the API that is not a success, in its one error format (problem details). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly traceId: string | null;
  readonly problem: Partial<Problem> | null;

  constructor(status: number, problem: unknown) {
    const details = typeof problem === 'object' && problem !== null ? (problem as Partial<Problem>) : null;
    const code = typeof details?.code === 'string' ? details.code : 'unknown';
    super(`The API answered ${status} (${code})`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.traceId = typeof details?.traceId === 'string' ? details.traceId : null;
    this.problem = details;
  }
}

/** GET /api/v1/meta: name and version of the API. */
export async function getMeta(client: AdminClient): Promise<Meta> {
  const { data, error, response } = await client.GET('/api/v1/meta');
  if (error !== undefined || data === undefined) throw new ApiError(response.status, error);
  return data;
}

export type Compatibility = 'compatible' | 'major-mismatch' | 'unreadable';

/**
 * Compares the version the API reports with the version of the contract this
 * build was generated from. Another major version means the page and the API
 * no longer fit: the admin shell stops and asks for a reload (ADR-19).
 */
export function compatibility(apiVersion: unknown, contractVersion: string = CONTRACT_VERSION): Compatibility {
  const major = (version: unknown) => (typeof version === 'string' ? /^(\d+)\.\d+\.\d+(?:[-+].*)?$/.exec(version)?.[1] : undefined);
  const api = major(apiVersion);
  const contract = major(contractVersion);
  if (api === undefined || contract === undefined) return 'unreadable';
  return api === contract ? 'compatible' : 'major-mismatch';
}
