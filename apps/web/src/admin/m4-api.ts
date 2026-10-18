/**
 * The admin API of 0.4.0 that the screens of the statuses, the templates, the images and the mail
 * log use (M4-FE-01 to 04). Written before confera_be's contract of 0.4.0 has these routes, in the
 * direction of the plan (M4-BE-01 to 06), and held by the API stub (e2e/servers/api-stub-part-d.mjs).
 * The calls go through the session client (its CSRF header, its 401 handling) on paths the vendored
 * contract does not list yet; `pnpm api:sync` with the backend's contract replaces the shapes and the
 * paths here by the generated ones.
 */
import type { SessionClient } from '@confera/api-client';

import type { SubmissionDetail, SubmissionPage } from './intake-api';
import { ApiError, call, callEmpty, UNREACHABLE } from './problems';

/** The statuses of a submission (Spec, section 5). `received` is the name 0.3.0 gave a new one. */
export const STATUSES = ['new', 'open', 'returned_for_revision', 'accepted', 'rejected', 'withdrawn'] as const;
export type Status = (typeof STATUSES)[number];
/** The changes of status an admin makes (the state table, transitions 2 and 4 to 9). */
export const ACTIONS = ['open', 'return', 'resume', 'accept', 'reject', 'withdraw', 'reopen'] as const;
export type Action = (typeof ACTIONS)[number];

/** What each action asks (FR-MAIL-08, FR-SUB-08): a message for the author, an internal reason. */
export const ACTION_RULES: Readonly<Record<Action, { readonly from: readonly string[]; readonly message: 'none' | 'optional' | 'required'; readonly reason: boolean }>> = {
  open: { from: ['new', 'received'], message: 'none', reason: false },
  return: { from: ['open'], message: 'required', reason: false },
  resume: { from: ['returned_for_revision'], message: 'none', reason: false },
  accept: { from: ['open', 'returned_for_revision'], message: 'none', reason: false },
  reject: { from: ['open', 'returned_for_revision'], message: 'optional', reason: false },
  withdraw: { from: ['new', 'received', 'open', 'returned_for_revision', 'accepted'], message: 'optional', reason: true },
  reopen: { from: ['accepted', 'rejected'], message: 'optional', reason: true },
};

/** The actions open to a submission: the server's list, else the state table's. */
export const actionsOf = (record: Pick<StatusRecord, 'status' | 'allowedActions'>): readonly Action[] =>
  (record.allowedActions ?? ACTIONS.filter((action) => ACTION_RULES[action].from.includes(record.status))).filter((action): action is Action => (ACTIONS as readonly string[]).includes(action));

export interface HistoryEntry {
  readonly status: string;
  readonly changedAt: string;
  readonly actor: { readonly id: string; readonly displayName: string } | null;
  readonly action?: string | null;
  /** The internal reason of a withdrawal or a reopening: admins only. */
  readonly reason?: string | null;
  /** The message to the author, as it went in the email. */
  readonly message?: string | null;
  /** queued: the email of the change went to the outbox; template_off: none, the template is off (FR-MAIL-07). */
  readonly email?: 'queued' | 'template_off' | null;
}
export interface Note {
  readonly id: string;
  readonly text: string;
  readonly createdAt: string;
  readonly author: { readonly id: string; readonly displayName: string } | null;
}
export interface Revision {
  readonly number: number;
  readonly changedAt: string;
  readonly changedBy: { readonly id: string; readonly displayName: string } | null;
  readonly changes: readonly { readonly field: string; readonly before: unknown; readonly after: unknown }[];
}
export interface StatusRecord {
  readonly status: string;
  readonly version?: number;
  readonly allowedActions?: readonly string[];
}
export type ManagedSubmission = Omit<SubmissionDetail, 'statusHistory'> &
  StatusRecord & {
    readonly statusHistory: readonly HistoryEntry[];
    readonly notes?: readonly Note[];
    readonly revisions?: readonly Revision[];
  };

export interface StatusEmailPreview {
  /** Null: no email goes, because the template is off for the conference (FR-MAIL-07). */
  readonly email: { readonly recipient: string; readonly language: string; readonly subject: string; readonly html: string; readonly text: string; readonly digest?: string } | null;
  readonly templateOff: boolean;
}

export const SORT_KEYS = ['receivedAt', 'reference', 'title', 'firstAuthor', 'status'] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export interface SubmissionQuery {
  readonly conferenceId?: string | undefined;
  readonly search?: string | undefined;
  readonly status?: readonly string[] | undefined;
  readonly participationType?: string | undefined;
  readonly sort?: SortKey | undefined;
  readonly direction?: 'asc' | 'desc' | undefined;
  readonly page: number;
  readonly pageSize: number;
}

export interface TemplateRecord {
  readonly id: string;
  readonly conferenceId: string | null;
  readonly type: string;
  readonly language: string;
  readonly subject: Record<string, unknown>;
  readonly body: Record<string, unknown>;
  readonly mailServerId: string | null;
  readonly updatedAt: string;
  readonly version: number;
}
export interface CatalogueType {
  readonly type: string;
  readonly placeholders: readonly string[];
  readonly conditions: readonly string[];
  readonly carriesLink: boolean;
  /** A status-change email, which a conference can switch off (FR-MAIL-07). */
  readonly statusEmail?: boolean;
}
export interface Catalogue {
  readonly types: readonly CatalogueType[];
  readonly languages: readonly string[];
}
export interface RenderedPreview {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}
export interface MailImage {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly width: number;
  readonly height: number;
  readonly sizeBytes: number;
}
export interface StatusSwitches {
  readonly items: readonly { readonly type: string; readonly enabled: boolean }[];
}

/** The calls of the session client on a path the vendored contract does not list yet. */
type Init = { params?: { query?: Record<string, unknown> }; body?: unknown; headers?: Record<string, string> } | undefined;
type Answer = Promise<{ data?: unknown; error?: unknown; response: Response }>;
interface Loose {
  GET(path: string, init?: Init): Answer;
  POST(path: string, init?: Init): Answer;
  PUT(path: string, init?: Init): Answer;
  PATCH(path: string, init?: Init): Answer;
  DELETE(path: string, init?: Init): Answer;
}
const loose = (client: SessionClient): Loose => client as unknown as Loose;
const at = (id: string) => encodeURIComponent(id);
const as = async <T>(promise: Answer): Promise<T> => (await call(promise)) as T;

export const m4 = {
  submissions: (client: SessionClient, q: SubmissionQuery) =>
    as<SubmissionPage>(
      loose(client).GET('/api/v1/submissions', {
        params: {
          query: {
            ...(q.conferenceId ? { conferenceId: q.conferenceId } : {}),
            ...(q.search ? { search: q.search } : {}),
            ...(q.status && q.status.length > 0 ? { status: q.status.join(',') } : {}),
            ...(q.participationType ? { participationType: q.participationType } : {}),
            ...(q.sort ? { sort: q.sort, direction: q.direction ?? 'desc' } : {}),
            page: q.page,
            pageSize: q.pageSize,
          },
        },
      }),
    ),
  submission: (client: SessionClient, id: string) => as<ManagedSubmission>(loose(client).GET(`/api/v1/submissions/${at(id)}`)),
  previewStatus: (client: SessionClient, id: string, body: { action: Action; message?: string | undefined }) => as<StatusEmailPreview>(loose(client).POST(`/api/v1/submissions/${at(id)}/status-preview`, { body })),
  /** One change of status; the key makes a double click or a repeated request one change and one email (FR-MAIL-05). */
  changeStatus: (client: SessionClient, id: string, body: { action: Action; version: number; message?: string | undefined; reason?: string | undefined; digest?: string | undefined }, key: string) =>
    as<ManagedSubmission>(loose(client).POST(`/api/v1/submissions/${at(id)}/status`, { body, headers: { 'Idempotency-Key': key } })),
  addNote: (client: SessionClient, id: string, text: string) => as<ManagedSubmission>(loose(client).POST(`/api/v1/submissions/${at(id)}/notes`, { body: { text } })),
  edit: (client: SessionClient, id: string, body: { version: number; title?: string; answers?: Record<string, string>; authors?: readonly unknown[] }) => as<ManagedSubmission>(loose(client).PATCH(`/api/v1/submissions/${at(id)}`, { body })),

  catalogue: (client: SessionClient) => as<Catalogue>(loose(client).GET('/api/v1/mail-templates/catalogue')),
  templates: (client: SessionClient, conferenceId?: string) => as<{ items: readonly TemplateRecord[] }>(loose(client).GET('/api/v1/mail-templates', { params: { query: conferenceId ? { conferenceId } : {} } })).then((list) => list.items),
  template: (client: SessionClient, id: string) => as<TemplateRecord>(loose(client).GET(`/api/v1/mail-templates/${at(id)}`)),
  saveTemplate: (client: SessionClient, id: string, body: { subject: unknown; body: unknown; version: number }) => as<TemplateRecord>(loose(client).PUT(`/api/v1/mail-templates/${at(id)}`, { body })),
  /** A conference's own version of a template (FR-MAIL-01): from then on the conference uses it. */
  createOverride: (client: SessionClient, body: { conferenceId: string; type: string; language: string; subject: unknown; body: unknown }) => as<TemplateRecord>(loose(client).POST('/api/v1/mail-templates', { body })),
  /** Back to the organisation's template: the conference's own version goes. */
  deleteOverride: (client: SessionClient, id: string, version: number) => callEmpty(loose(client).DELETE(`/api/v1/mail-templates/${at(id)}`, { params: { query: { version } } })),
  previewTemplate: (client: SessionClient, body: { type: string; language: string; conferenceId?: string | null; subject: unknown; body: unknown }) => as<RenderedPreview>(loose(client).POST('/api/v1/mail-templates/preview', { body })),
  statusSwitches: (client: SessionClient, conferenceId: string) => as<StatusSwitches>(loose(client).GET(`/api/v1/conferences/${at(conferenceId)}/status-emails`)),
  setStatusSwitch: (client: SessionClient, conferenceId: string, type: string, enabled: boolean) => as<StatusSwitches>(loose(client).PUT(`/api/v1/conferences/${at(conferenceId)}/status-emails/${at(type)}`, { body: { enabled } })),
  /** The address of an email image: the browser reads it with the session (no public address, ADR-12). */
  imageHref: (id: string) => `/api/v1/mail-images/${encodeURIComponent(id)}`,

  resend: (client: SessionClient, id: string) => as<{ messageId: string; mode: 'stored' | 'rendered' }>(loose(client).POST(`/api/v1/mail-log/${at(id)}/resend`, { body: {} })),
  discardHeld: (client: SessionClient, body: { ids?: readonly string[]; all?: boolean }) => as<{ discarded: number }>(loose(client).POST('/api/v1/held-mail/discard', { body })),
};

/**
 * Uploads an email image (POST /api/v1/mail-images, multipart): the one call that is not JSON. It
 * carries the CSRF value of the session like every changing request; the server checks the type by
 * content, re-encodes the image and scans it (ADR-12, ADR-10).
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
