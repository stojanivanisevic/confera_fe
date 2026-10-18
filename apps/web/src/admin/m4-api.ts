/**
 * The admin API of 0.4.0 that the screens of the statuses, the templates, the images and the mail
 * log use (M4-FE-01 to 04). The submissions, the status emails and the templates are typed by the
 * vendored contract of confera_be's m4/be (796338e). Three calls are written here before the
 * contract has them, in the direction of the plan and held by the API stub
 * (e2e/servers/api-stub-part-d.mjs): the upload and the address of an email image (M4-BE-06), the
 * resend of a mail-log entry and the retention of the mail log (M4-BE-05). `pnpm api:sync` with
 * those routes replaces them by typed calls.
 */
import type { components, SessionClient } from '@confera/api-client';

import { ApiError, call, callEmpty, UNREACHABLE } from './problems';

type Schemas = components['schemas'];
export type ManagedSubmission = Schemas['SubmissionDetailDto'];
export type HistoryEntry = Schemas['SubmissionStatusDto'];
export type Note = Schemas['SubmissionNoteDto'];
export type Revision = Schemas['SubmissionRevisionDto'];
export type StatusEmailPreview = Schemas['StatusEmailPreviewDto'];
export type StatusSwitches = Schemas['StatusEmailsDto'];
export type TemplateRecord = Schemas['MailTemplateDto'];
export type CatalogueType = Schemas['TemplateTypeDto'];
export type Catalogue = Schemas['TemplateCatalogueDto'];
export type RenderedPreview = Schemas['TemplatePreviewDto'];
export type TemplateType = Schemas['CreateMailTemplateDto']['type'];
export type TemplateLanguage = Schemas['CreateMailTemplateDto']['language'];

/** The statuses of a submission (Spec, section 5). */
export const STATUSES = ['new', 'open', 'returned_for_revision', 'accepted', 'rejected', 'withdrawn'] as const satisfies readonly ManagedSubmission['status'][];
export type Status = (typeof STATUSES)[number];
/** The changes of status an admin makes (the state table, transitions 2 and 4 to 9). */
export const ACTIONS = ['open', 'return', 'resume', 'accept', 'reject', 'withdraw', 'reopen'] as const satisfies readonly ManagedSubmission['actions'][number][];
export type Action = (typeof ACTIONS)[number];
/** The action of a row of the history, by the number of its transition in the state table. */
export const ACTION_OF_TRANSITION: Readonly<Record<number, Action>> = { 2: 'open', 4: 'return', 5: 'resume', 6: 'accept', 7: 'reject', 8: 'withdraw', 9: 'reopen' };

/** What each action asks (FR-MAIL-08, FR-SUB-08): a message for the author, an internal reason. */
export const ACTION_RULES: Readonly<Record<Action, { readonly message: 'none' | 'optional' | 'required'; readonly reason: boolean }>> = {
  open: { message: 'none', reason: false },
  return: { message: 'required', reason: false },
  resume: { message: 'none', reason: false },
  accept: { message: 'none', reason: false },
  reject: { message: 'optional', reason: false },
  withdraw: { message: 'optional', reason: true },
  reopen: { message: 'optional', reason: true },
};

/** The actions open to a submission now: the server's list. */
export const actionsOf = (record: Pick<ManagedSubmission, 'actions'>): readonly Action[] => record.actions;

export const SORT_KEYS = ['receivedAt', 'reference', 'title', 'firstAuthor', 'status'] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export interface SubmissionQuery {
  readonly conferenceId?: string | undefined;
  readonly search?: string | undefined;
  readonly status?: readonly Status[] | undefined;
  readonly participationType?: string | undefined;
  readonly sort?: SortKey | undefined;
  readonly direction?: 'asc' | 'desc' | undefined;
  readonly page: number;
  readonly pageSize: number;
}

export interface MailImage {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly width: number;
  readonly height: number;
  readonly sizeBytes: number;
}

/** The calls of the session client on a path the vendored contract does not list yet. */
type Init = { params?: { query?: Record<string, unknown> }; body?: unknown } | undefined;
type Answer = Promise<{ data?: unknown; error?: unknown; response: Response }>;
interface Loose {
  POST(path: string, init?: Init): Answer;
  PATCH(path: string, init?: Init): Answer;
}
const loose = (client: SessionClient): Loose => client as unknown as Loose;
const as = async <T>(promise: Answer): Promise<T> => (await call(promise)) as T;
const at = (id: string) => ({ params: { path: { id } } });

export const m4 = {
  submissions: (client: SessionClient, q: SubmissionQuery) =>
    call(
      client.GET('/api/v1/submissions', {
        params: {
          query: {
            ...(q.conferenceId ? { conferenceId: q.conferenceId } : {}),
            ...(q.search ? { q: q.search } : {}),
            // One parameter, comma-separated, as the API reads it.
            ...(q.status && q.status.length > 0 ? { status: [q.status.join(',') as Status] } : {}),
            ...(q.participationType ? { participationType: [q.participationType] } : {}),
            ...(q.sort ? { sort: q.sort, order: q.direction ?? 'desc' } : {}),
            page: q.page,
            pageSize: q.pageSize,
          },
        },
      }),
    ),
  submission: (client: SessionClient, id: string) => call(client.GET('/api/v1/submissions/{id}', at(id))),
  previewStatus: (client: SessionClient, id: string, body: { action: Action; message?: string | undefined; reason?: string | undefined }) =>
    call(client.POST('/api/v1/submissions/{id}/status/preview', { ...at(id), body: { action: body.action, ...(body.message ? { message: body.message } : {}), ...(body.reason ? { reason: body.reason } : {}) } })),
  /** One change of status. The version makes a double click or a repeated request one change and one email (FR-MAIL-05). */
  changeStatus: (client: SessionClient, id: string, body: { action: Action; version: number; message?: string | undefined; reason?: string | undefined; previewDigest?: string | undefined }) =>
    call(
      client.POST('/api/v1/submissions/{id}/status', {
        ...at(id),
        body: { action: body.action, version: body.version, ...(body.message ? { message: body.message } : {}), ...(body.reason ? { reason: body.reason } : {}), ...(body.previewDigest ? { previewDigest: body.previewDigest } : {}) },
      }),
    ),
  addNote: (client: SessionClient, id: string, text: string) => call(client.POST('/api/v1/submissions/{id}/notes', { ...at(id), body: { body: text } })),
  /** A correction on the author's behalf (FR-SUB-06): the answers that change, the authors among them. */
  edit: (client: SessionClient, id: string, body: { version: number; answers: Record<string, unknown> }) => call(client.PUT('/api/v1/submissions/{id}', { ...at(id), body })),

  catalogue: (client: SessionClient) => call(client.GET('/api/v1/mail-templates/catalogue')),
  templates: (client: SessionClient, conferenceId?: string) => call(client.GET('/api/v1/mail-templates', { params: { query: conferenceId ? { conferenceId } : {} } })).then((list) => list.items as readonly TemplateRecord[]),
  template: (client: SessionClient, id: string) => call(client.GET('/api/v1/mail-templates/{id}', at(id))) as Promise<TemplateRecord>,
  saveTemplate: (client: SessionClient, id: string, body: { subject: unknown; body: unknown; version: number }) =>
    call(client.PUT('/api/v1/mail-templates/{id}', { ...at(id), body: { subject: body.subject as Record<string, unknown>, body: body.body as Record<string, unknown>, version: body.version } })),
  /** A conference's own version of a template (FR-MAIL-01): from then on the conference uses it. */
  createOverride: (client: SessionClient, body: { conferenceId: string; type: string; language: string; subject: unknown; body: unknown }) =>
    call(client.POST('/api/v1/mail-templates', { body: { conferenceId: body.conferenceId, type: body.type as TemplateType, language: body.language as TemplateLanguage, subject: body.subject as Record<string, unknown>, body: body.body as Record<string, unknown> } })),
  /** Back to the organisation's template: the conference's own version goes. */
  deleteOverride: (client: SessionClient, id: string) => callEmpty(client.DELETE('/api/v1/mail-templates/{id}', at(id))),
  previewTemplate: (client: SessionClient, body: { type: string; language: string; conferenceId?: string | null; subject: unknown; body: unknown }) =>
    call(
      client.POST('/api/v1/mail-templates/preview', {
        body: { type: body.type as TemplateType, language: body.language as TemplateLanguage, ...(body.conferenceId ? { conferenceId: body.conferenceId } : {}), subject: body.subject as Record<string, unknown>, body: body.body as Record<string, unknown> },
      }),
    ),
  statusSwitches: (client: SessionClient, conferenceId: string) => call(client.GET('/api/v1/conferences/{id}/status-emails', at(conferenceId))),
  setStatusSwitch: (client: SessionClient, conferenceId: string, current: StatusSwitches, type: string, enabled: boolean) =>
    call(client.PUT('/api/v1/conferences/{id}/status-emails', { ...at(conferenceId), body: { types: current.types.map((item) => (item.type === type ? { ...item, enabled } : item)), version: current.version } })),
  /** The address of an email image: the browser reads it with the session (no public address, ADR-12). Before the contract (M4-BE-06). */
  imageHref: (id: string) => `/api/v1/mail-images/${encodeURIComponent(id)}`,

  /** Before the contract (M4-BE-05). */
  resend: (client: SessionClient, id: string) => as<{ messageId: string; mode: 'stored' | 'rendered' }>(loose(client).POST(`/api/v1/mail-log/${encodeURIComponent(id)}/resend`, { body: {} })),
  /** What the mail log keeps and for how long (FR-SMTP-06): the retention is before the contract (M4-BE-05). */
  mailLogSettings: (client: SessionClient, body: { mailLogContent: boolean; mailLogRetentionDays: number; version: number }) => as<{ mailLogContent: boolean; mailLogRetentionDays?: number; version: number }>(loose(client).PATCH('/api/v1/organisation', { body })),
  /** In the contract since confera_be 85e01d1 (M3-ISS-14). */
  discardHeld: (client: SessionClient, body: { ids?: string[]; all?: boolean }) => call(client.POST('/api/v1/held-mail/discard', { body })),
};

/**
 * Uploads an email image (POST /api/v1/mail-images, multipart; M4-BE-06, before the contract): the
 * one call that is not JSON. It carries the CSRF value of the session like every changing request;
 * the server checks the type by content, re-encodes the image and scans it (ADR-12, ADR-10).
 */
export async function uploadImage(file: File, csrf: string | null): Promise<MailImage> {
  const form = new FormData();
  form.append('file', file, file.name);
  let response: Response;
  try {
    response = await fetch('/api/v1/mail-images', { method: 'POST', body: form, credentials: 'same-origin', cache: 'no-store', headers: csrf ? { 'X-CSRF-Token': csrf } : {} });
  } catch {
    throw new ApiError(0, { code: UNREACHABLE });
  }
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) throw new ApiError(response.status, body);
  return body as MailImage;
}
