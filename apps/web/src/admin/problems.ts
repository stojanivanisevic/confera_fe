/**
 * What an answer of the API that is not a success means to the person (ADR-20: the API decides;
 * the page explains). One place turns a problem document into a title, a text and, for refused
 * input, a message per field, so every screen says the same thing in the same words.
 */
import { ApiError, type FieldError } from '@confera/api-client';

import { fill, TEXTS } from './texts';

export { ApiError };

/** A call that got no answer at all (the network, a timeout): the same as "the API does not answer". */
export const UNREACHABLE = 'api_unreachable';

export interface Explained {
  readonly title: string;
  readonly text: string;
  /** Refused input: the message of each field, by its path in the request. */
  readonly fields: Readonly<Record<string, string>>;
  readonly code: string;
  readonly status: number;
}

/** The result of an openapi-fetch call. */
interface Answer<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

/**
 * Unwraps an openapi-fetch call: the data, or an ApiError. A call that threw (no connection,
 * a timeout) becomes an ApiError with the status 0 and the code `api_unreachable`.
 */
export async function call<T>(promise: Promise<Answer<T>>): Promise<T> {
  let answer: Answer<T>;
  try {
    answer = await promise;
  } catch {
    throw new ApiError(0, { code: UNREACHABLE });
  }
  if (answer.error !== undefined || (answer.data === undefined && !answer.response.ok)) throw new ApiError(answer.response.status, answer.error);
  return answer.data as T;
}

/** Same, for a call that answers with no body (204, 202). */
export async function callEmpty(promise: Promise<Answer<unknown>>): Promise<void> {
  let answer: Answer<unknown>;
  try {
    answer = await promise;
  } catch {
    throw new ApiError(0, { code: UNREACHABLE });
  }
  if (!answer.response.ok) throw new ApiError(answer.response.status, answer.error);
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError;
export const isUnreachable = (error: unknown): boolean => isApiError(error) && (error.code === UNREACHABLE || error.status === 502 || error.status === 503 || error.status === 504);
export const isUnauthenticated = (error: unknown): boolean => isApiError(error) && error.status === 401 && error.code !== 'sign_in_failed';
export const needsFreshPassword = (error: unknown): boolean => isApiError(error) && error.code === 'password_confirmation_required';

/** The message of one refused field, by the code of the rule that failed. */
export function fieldMessage(error: FieldError): string {
  return TEXTS.problems.fields[error.code] ?? TEXTS.problems.fieldFallback;
}

/** The refused fields of a problem, by path. */
export function fieldMessages(error: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isApiError(error)) return out;
  for (const field of error.problem?.errors ?? []) {
    if (typeof field.path === 'string' && !(field.path in out)) out[field.path] = fieldMessage(field);
  }
  return out;
}

/** A problem explained for the person. `contact` is the support contact of the organisation, when known. */
export function explain(error: unknown, contact: string | null = null): Explained {
  const base = { fields: fieldMessages(error), code: isApiError(error) ? error.code : 'unknown', status: isApiError(error) ? error.status : 0 };
  if (isUnreachable(error)) {
    return { ...base, title: TEXTS.connection.down, text: contact ? fill(TEXTS.connection.downText, { contact }) : TEXTS.connection.downTextNoContact };
  }
  if (!isApiError(error)) return { ...base, title: TEXTS.problems.unknown, text: contact ? fill(TEXTS.problems.unknownText, { contact, traceId: '-' }) : fill(TEXTS.problems.unknownTextNoContact, { traceId: '-' }) };
  switch (error.code) {
    case 'unauthenticated':
      // A change that meets a session that has ended (E2-20): what was typed stays on the page.
      return { ...base, title: TEXTS.problems.sessionEnded, text: TEXTS.problems.sessionEndedText };
    case 'forbidden':
      return { ...base, title: TEXTS.problems.forbidden, text: TEXTS.problems.forbiddenText };
    case 'csrf_refused':
    case 'origin_refused':
      return { ...base, title: TEXTS.problems.outOfStep, text: TEXTS.problems.outOfStepText };
    case 'too_many_requests':
      return { ...base, title: TEXTS.problems.tooMany, text: TEXTS.problems.tooManyText };
    case 'version_conflict':
      return { ...base, title: TEXTS.organisation.conflict, text: TEXTS.organisation.conflictText };
    case 'email_taken':
      return { ...base, title: TEXTS.users.emailTaken, text: TEXTS.users.emailTakenText };
    case 'not_found':
      return { ...base, title: TEXTS.problems.notFound, text: TEXTS.problems.notFoundText };
    case 'conference_code_taken':
      return { ...base, title: TEXTS.conferences.codeTaken, text: TEXTS.conferences.codeTakenText };
    case 'conference_archived':
      return { ...base, title: TEXTS.conferences.archived, text: TEXTS.conferences.archivedText };
    case 'state_change_not_allowed':
      return { ...base, title: TEXTS.conferences.stateNotAllowed, text: TEXTS.conferences.stateNotAllowedText };
    case 'mail_server_in_use':
      return { ...base, title: TEXTS.mailServers.inUse, text: TEXTS.mailServers.inUseText };
    case 'tls_required':
    case 'port_not_allowed':
    case 'address_not_allowed':
      return { ...base, title: TEXTS.problems.refused, text: fill(TEXTS.mailServers.testResult.refused!, { reason: TEXTS.mailServers.reasons[error.code] ?? TEXTS.mailServers.reasonFallback }) };
    case 'validation_failed':
    case 'bad_request':
    case 'password_refused':
      return { ...base, title: TEXTS.problems.refused, text: TEXTS.problems.refusedText };
    default: {
      const traceId = error.traceId ?? '-';
      return { ...base, title: TEXTS.problems.unknown, text: contact ? fill(TEXTS.problems.unknownText, { contact, traceId }) : fill(TEXTS.problems.unknownTextNoContact, { traceId }) };
    }
  }
}
