/**
 * The draft of a form in this tab (FR-FORM-18; decision D3): every field the author typed or
 * chose, the blocks (how many authors, in which order), the chosen language and the idempotency
 * key of this form instance. Never a file (a file must be chosen again), never the consent (it is
 * given when the form is sent). It lives in sessionStorage through ./safe-storage, which falls back
 * to memory where the browser refuses storage, and it is never handed to the page that frames the
 * form. It is removed once the form is sent.
 */
import { isFormLanguage, type FormLanguage } from './i18n/catalogue';
import type { FormValues } from './form-values';
import { TRAP_FIELD } from './public-api';
import type { DraftStorage } from './safe-storage';

export interface Draft {
  readonly language: FormLanguage | null;
  /** The named controls, without files and without the consent. */
  readonly values: FormValues;
  /** The keys of the blocks of each repeated section, in order. */
  readonly rows: Readonly<Record<string, readonly number[]>>;
  readonly idempotencyKey: string | null;
}

/** The names that are never kept: the consent, and the trap field of ADR-08 (SEC-M3-07). */
const NOT_KEPT = new Set(['consent', TRAP_FIELD]);
/** A draft larger than this is not kept: the storage of a tab is small, and a form is not that long. */
const MAX_DRAFT = 400_000;

export const draftKey = (slug: string, version: number): string => `confera:draft:${slug}:${version}`;

export function readDraft(storage: DraftStorage, key: string): Draft | null {
  const text = storage.get(key);
  if (!text) return null;
  try {
    const value = JSON.parse(text) as { language?: unknown; values?: unknown; rows?: unknown; idempotencyKey?: unknown } | null;
    if (!value || typeof value !== 'object') return null;
    const values = Object.create(null) as Record<string, string>;
    if (value.values && typeof value.values === 'object') {
      for (const [name, entry] of Object.entries(value.values)) if (typeof entry === 'string' && !NOT_KEPT.has(name) && name.length <= 200) values[name] = entry;
    }
    const rows: Record<string, number[]> = {};
    if (value.rows && typeof value.rows === 'object') {
      for (const [id, keys] of Object.entries(value.rows)) {
        if (Array.isArray(keys) && keys.length <= 100 && keys.every((k) => Number.isSafeInteger(k) && k > 0)) rows[id] = keys as number[];
      }
    }
    return {
      language: isFormLanguage(value.language) ? value.language : null,
      values,
      rows,
      idempotencyKey: typeof value.idempotencyKey === 'string' && /^[0-9a-f-]{36}$/.test(value.idempotencyKey) ? value.idempotencyKey : null,
    };
  } catch {
    return null;
  }
}

export function writeDraft(storage: DraftStorage, key: string, draft: Draft): void {
  const values: Record<string, string> = {};
  for (const [name, value] of Object.entries(draft.values)) if (!NOT_KEPT.has(name)) values[name] = value;
  const text = JSON.stringify({ language: draft.language, values, rows: draft.rows, idempotencyKey: draft.idempotencyKey });
  if (text.length <= MAX_DRAFT) storage.set(key, text);
}

/** Whether there is anything typed in the values: the warning before a tab closes asks only then. */
export const hasTyped = (values: FormValues): boolean => Object.entries(values).some(([name, value]) => !NOT_KEPT.has(name) && value.trim() !== '');
