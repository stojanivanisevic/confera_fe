/**
 * The admin API of 0.3.0 that the screens of forms, deadlines, submissions and held emails use
 * (M3-FE-03, 05, 06, 08). The forms are typed by the vendored contract (`FormDto`, …). The answers
 * of the deadlines, the submissions and the held emails carry no schema in openapi.json of
 * confera_be's m3/be yet, so their shapes are written here from its DTO classes
 * (`src/modules/deadlines/deadlines.ts`, `submissions/submissions.dto.ts`, `held-mail/held-mail.ts`);
 * the calls still go through the typed client and its paths, and `pnpm api:sync` with a typed
 * contract will replace these by the generated ones.
 */
import type { components, SessionClient } from '@confera/api-client';

import { call } from './problems';

type Schemas = components['schemas'];
export type FormRecord = Schemas['FormDto'];
export type FormSummary = Schemas['FormSummaryDto'];
export type FormVersion = Schemas['FormVersionDto'];

export const DEADLINE_KINDS = ['abstract_submission', 'fee_payment', 'full_paper'] as const;
export type DeadlineKind = (typeof DEADLINE_KINDS)[number];

/** The flags a kept file may carry (G2-22, SEC-M3-06). */
export type ScanFlag = 'macros' | 'external_links';
/** Why an email is held, in numbers (UX3-06). */
export interface HeldNumbers {
  readonly windowHours: 1 | 24;
  readonly count: number;
  readonly limit: number;
}

export interface Deadline {
  readonly kind: DeadlineKind;
  /** The last day, YYYY-MM-DD, in the conference's time zone. */
  readonly endsOn: string;
  /** The instant it ends: the start of the next day there. */
  readonly endsAt: string;
  readonly passed: boolean;
  readonly version: number;
}
export interface DeadlineChange {
  readonly kind: DeadlineKind;
  readonly oldEndsOn: string | null;
  readonly newEndsOn: string;
  readonly changedAt: string;
  readonly changedBy: { readonly id: string; readonly displayName: string } | null;
}
export interface Deadlines {
  readonly timeZone: string;
  readonly items: readonly Deadline[];
  /** Newest first. */
  readonly history: readonly DeadlineChange[];
}

export interface SubmissionSummary {
  readonly id: string;
  readonly reference: string;
  readonly conference: { readonly id: string; readonly code: string; readonly name: string; readonly editionYear: number | null };
  readonly title: string | null;
  readonly firstAuthor: string;
  readonly institution: string | null;
  readonly participationType: string | null;
  readonly status: string;
  /** Not matched yet: 0.8.0. */
  readonly memberMatch: string | null;
  /** No proforma yet: 0.6.0. */
  readonly billingStatus: string | null;
  readonly language: string;
  readonly authorCount: number;
  readonly receivedAt: string;
  /** For the list (UX3-07): the flags its files carry, each once, and whether a file still waits for its scan. */
  readonly fileSigns?: { readonly flags: readonly ScanFlag[]; readonly scanPending: boolean };
}
export interface SubmissionPage {
  readonly items: readonly SubmissionSummary[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}
export const SCAN_STATES = ['pending', 'clean', 'infected', 'not_clean'] as const;
export interface SubmissionFile {
  readonly id: string;
  readonly field: string | null;
  readonly name: string;
  readonly type: string;
  readonly sizeBytes: number;
  readonly scanState: (typeof SCAN_STATES)[number];
  /**
   * `macros`: an old .doc with macros, accepted and flagged for the office (G2-22);
   * `external_links`: a .docx with a remote template, frame or object, or a UNC path (SEC-M3-06).
   */
  readonly scanFlag: ScanFlag | null;
  /** Null: it may be downloaded; otherwise why not, yet or ever (UX3-07). */
  readonly downloadBlocked?: 'scan_pending' | 'scan_retrying' | 'file_not_clean' | null;
  /** Pending: when the next scan is due. */
  readonly nextScanAt?: string | null;
  readonly scannedAt: string | null;
  readonly pendingSince: string | null;
  readonly sha256: string;
}
export interface SubmissionDetail extends SubmissionSummary {
  readonly form: { readonly id: string; readonly slug: string; readonly versionNumber: number };
  readonly answers: Readonly<Record<string, unknown>>;
  readonly authors: readonly {
    readonly position: number;
    readonly firstName: string;
    readonly lastName: string;
    readonly institution: string | null;
    readonly institutionAddress: string | null;
    readonly orcid: string | null;
    readonly email: string;
    readonly phone: string | null;
    readonly isCorresponding: boolean;
  }[];
  readonly files: readonly SubmissionFile[];
  readonly consent: { readonly text: string; readonly links: Readonly<Record<string, string | null>>; readonly version: string; readonly consentedAt: string };
  readonly statusHistory: readonly { readonly status: string; readonly changedAt: string; readonly actor: { readonly id: string; readonly displayName: string } | null }[];
  readonly emails: readonly {
    readonly id: string;
    readonly kind: string;
    readonly recipient: string;
    /** queued, sending, sent, failed, held, stuck or waiting_for_server. */
    readonly status: string;
    readonly heldReason: string | null;
    /** The numbers of the hold (UX3-06); null when not held, or held before the numbers were kept. */
    readonly heldBy?: HeldNumbers | null;
    readonly lastErrorCode: string | null;
    readonly createdAt: string;
    readonly sentAt: string | null;
  }[];
}

export const HELD_REASONS = ['send_breaker_form', 'send_breaker_organisation', 'recipient_domain'] as const;
export interface HeldMail {
  readonly id: string;
  readonly kind: string;
  readonly recipient: string;
  readonly heldReason: (typeof HELD_REASONS)[number];
  /** The numbers of the hold (UX3-06): `count` in the last `windowHours` hours above `limit`; null for one held before they were kept. */
  readonly heldBy?: HeldNumbers | null;
  readonly conference: { readonly id: string; readonly code: string; readonly name: string } | null;
  readonly formId: string | null;
  readonly submission: { readonly id: string; readonly reference: string } | null;
  readonly createdAt: string;
}
export interface HeldMailPage {
  readonly items: readonly HeldMail[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  /** The send breaker of the organisation (ADR-08). */
  readonly breaker: { readonly perHour: number; readonly perDay: number; readonly version: number };
}

/** An answer whose shape the contract does not name yet (above). */
const as = <T>(value: unknown): T => value as T;

export const intake = {
  forms: (client: SessionClient, conferenceId?: string) => call(client.GET('/api/v1/forms', { params: { query: conferenceId ? { conferenceId } : {} } })).then((list) => list.items),
  form: (client: SessionClient, id: string) => call(client.GET('/api/v1/forms/{id}', { params: { path: { id } } })),
  createForm: (client: SessionClient, conferenceId: string) => call(client.POST('/api/v1/conferences/{id}/forms', { params: { path: { id: conferenceId } }, body: { type: 'abstract' } })),
  saveDraft: (client: SessionClient, id: string, configuration: Record<string, unknown>, version: number) => call(client.PUT('/api/v1/forms/{id}/draft', { params: { path: { id } }, body: { configuration, version } })),
  publish: (client: SessionClient, id: string, version: number) => call(client.POST('/api/v1/forms/{id}/publish', { params: { path: { id } }, body: { version } })),
  version: (client: SessionClient, id: string, number: number) => call(client.GET('/api/v1/forms/{id}/versions/{number}', { params: { path: { id, number } } })),
  setFormBreaker: (client: SessionClient, id: string, breakerPerHour: number, breakerPerDay: number, version: number) =>
    call(client.PATCH('/api/v1/forms/{id}/breaker', { params: { path: { id } }, body: { breakerPerHour, breakerPerDay, version } })),

  deadlines: async (client: SessionClient, conferenceId: string) => as<Deadlines>(await call(client.GET('/api/v1/conferences/{id}/deadlines', { params: { path: { id: conferenceId } } }))),
  setDeadline: async (client: SessionClient, conferenceId: string, kind: DeadlineKind, endsOn: string, version?: number) =>
    as<Deadlines>(await call(client.PUT('/api/v1/conferences/{id}/deadlines/{kind}', { params: { path: { id: conferenceId, kind } }, body: { endsOn, ...(version === undefined ? {} : { version }) } }))),

  submissions: async (client: SessionClient, query: { conferenceId?: string; page: number; pageSize: number }) =>
    as<SubmissionPage>(await call(client.GET('/api/v1/submissions', { params: { query: { ...(query.conferenceId ? { conferenceId: query.conferenceId } : {}), page: query.page, pageSize: query.pageSize } } }))),
  submission: async (client: SessionClient, id: string) => as<SubmissionDetail>(await call(client.GET('/api/v1/submissions/{id}', { params: { path: { id } } }))),
  /** The address of a file of a submission: the browser downloads it with the session (an attachment, ADR-10). */
  fileHref: (submissionId: string, fileId: string) => `/api/v1/submissions/${encodeURIComponent(submissionId)}/files/${encodeURIComponent(fileId)}`,

  heldMail: async (client: SessionClient, query: { page: number; pageSize: number; formId?: string } = { page: 1, pageSize: 50 }) =>
    // The contract names no query of this route yet: the query goes as the DTO class reads it.
    as<HeldMailPage>(await call(client.GET('/api/v1/held-mail', as<never>({ params: { query } })))),
  release: async (client: SessionClient, body: { ids?: readonly string[]; all?: boolean; formId?: string }) => as<{ released: number }>(await call(client.POST('/api/v1/held-mail/release', { body: as<Record<string, never>>(body) }))),
  setOrganisationBreaker: async (client: SessionClient, perHour: number, perDay: number, version: number) => call(client.PATCH('/api/v1/held-mail/breaker', { body: { perHour, perDay, version } })),
};
