/**
 * A form as the API publishes it (ADR-09; the shape of FE-04): the definition of one immutable
 * form version, with texts in both languages, sections, repeated blocks, fields whose `kind` and
 * `key` come from the fixed catalogue in code, rules and visibility conditions.
 *
 * The definition is data from the API. The renderer reads it defensively (`readPublishedForm`):
 * an unknown kind, a pattern that is not in the catalogue, a condition it cannot read or a key
 * that is not a plain name makes the whole form unreadable, and the page says so. Nothing in a
 * definition is ever run as code (ADR-09: "no code from data"), and every text of it is shown as
 * text; the one link syntax of the office's texts is read by `./safe-text`.
 */
import { FORM_LANGUAGES, FORM_TYPES, isFormLanguage, type FormLanguage, type FormType } from './i18n/catalogue';

/** A text in the form's languages. Serbian falls back to English (ADR-23). */
export interface Bilingual {
  readonly en: string;
  readonly sr?: string | null;
}

/** The text of a language, or English when the office wrote none for it. */
export function textOf(value: Bilingual | null | undefined, language: FormLanguage): string {
  if (!value) return '';
  const own = language === 'en' ? value.en : value[language];
  return typeof own === 'string' && own.trim() !== '' ? own : value.en;
}

/** The kinds of field the renderer knows. A definition with another kind is not read. */
export const FIELD_KINDS = ['text', 'email', 'phone', 'textarea', 'select', 'radio', 'checkbox', 'file'] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

/** The patterns of the field catalogue (ADR-09: never typed by an admin). */
export const PATTERNS = ['orcid', 'phone', 'taxNumber', 'registrationNumber'] as const;
export type PatternName = (typeof PATTERNS)[number];

/** `autocomplete` values a field may ask for: the person's own name and address, never a payment detail. */
export const AUTOCOMPLETE = ['name', 'email', 'tel', 'organization', 'street-address', 'off'] as const;
export type Autocomplete = (typeof AUTOCOMPLETE)[number];

export interface FieldOption {
  readonly value: string;
  readonly label: Bilingual;
}

/**
 * When a field is shown or required. `field` names a field of the same block or of the top of the
 * form; `equals` and `in` compare its answer; `filled` asks whether it has one.
 */
export type Condition =
  | { readonly field: string; readonly equals: string }
  | { readonly field: string; readonly in: readonly string[] }
  | { readonly field: string; readonly filled: boolean }
  | { readonly all: readonly Condition[] }
  | { readonly any: readonly Condition[] }
  | { readonly not: Condition };

export interface FileRule {
  /** File-name extensions, lower case, without the dot: `pdf`, `docx`. */
  readonly accept: readonly string[];
  readonly maxBytes: number;
}

export interface FieldRules {
  readonly maxWords?: number;
  readonly maxLength?: number;
  readonly pattern?: PatternName;
  /** Names, titles and institutions refuse web addresses (ADR-08, control 5). */
  readonly noUrl?: boolean;
  readonly file?: FileRule;
}

export interface FieldDefinition {
  readonly key: string;
  readonly kind: FieldKind;
  /** Optional fields the office switched off are not shown and not sent. */
  readonly enabled: boolean;
  readonly required: boolean | Condition;
  readonly label: Bilingual;
  readonly help?: Bilingual | null;
  readonly options?: readonly FieldOption[];
  readonly rules?: FieldRules;
  readonly visibleWhen?: Condition | null;
  /** In a repeated block: only in the first one (the phone of the first author). */
  readonly onlyFirstInRepeat?: boolean;
  /** In a repeated block: required in the first one only (the email of the corresponding author). */
  readonly requiredOnlyInFirst?: boolean;
  readonly autocomplete?: Autocomplete;
  /** Messages the office wrote for this field, in place of the catalogue's. */
  readonly messages?: { readonly required?: Bilingual | null } | null;
}

export interface RepeatDefinition {
  readonly min: number;
  /** The most blocks (decision D7: configurable per form, 10 authors by default). */
  readonly max: number;
  /** The title of one block, with `{n}`: "Author {n}". */
  readonly itemLabel: Bilingual;
  readonly addLabel?: Bilingual | null;
  /** From this block on, `notice` is shown (FE-04: a notice from the fourth author). */
  readonly noticeFrom?: number | null;
  readonly notice?: Bilingual | null;
}

export interface SectionDefinition {
  readonly id: string;
  readonly label?: Bilingual | null;
  readonly help?: Bilingual | null;
  readonly repeat?: RepeatDefinition | null;
  readonly visibleWhen?: Condition | null;
  readonly fields: readonly FieldDefinition[];
}

export interface FormTexts {
  readonly title: Bilingual;
  readonly intro?: Bilingual | null;
  readonly submit?: Bilingual | null;
  readonly thankYouTitle?: Bilingual | null;
  readonly thankYouText?: Bilingual | null;
  readonly closed?: Bilingual | null;
}

export interface ConsentDefinition {
  /** The version of the consent text the author accepts (FR-FORM-11 stores it). */
  readonly version: string;
  /** The text of the consent, with the one link syntax: `[terms of publication](https://…)` (D6). */
  readonly label: Bilingual;
  /** What the form says when it is not ticked, in place of the catalogue's. */
  readonly message?: Bilingual | null;
}

export interface FormDefinition {
  readonly type: FormType;
  readonly texts: FormTexts;
  readonly sections: readonly SectionDefinition[];
  readonly consent: ConsentDefinition;
}

export const FORM_STATES = ['open', 'closed', 'not_open'] as const;
export type FormState = (typeof FORM_STATES)[number];

/** What `GET /public/v1/forms/{slug}` gives: the published version and what the page needs around it. */
export interface PublishedForm {
  readonly slug: string;
  readonly version: number;
  readonly state: FormState;
  /** The last day of the form (FR-DL-01), `2027-03-15`; it ends at the end of that day in the conference's zone. */
  readonly deadline: string | null;
  readonly conference: {
    readonly code: string;
    readonly name: string;
    readonly timeZone: string;
    readonly languages: readonly FormLanguage[];
    /** The office's address, named in the limit of the authors and in the closed message. */
    readonly contactEmail: string | null;
  };
  /** The sites that may frame the form (FR-FORM-07); the frame tells its height to these only. */
  readonly frameSites: readonly string[];
  readonly definition: FormDefinition;
}

// ---- reading a definition ---------------------------------------------------------------

/** A key of a field or a block: a plain name, never one an object already has. */
const KEY = /^[a-z][a-zA-Z0-9]{0,47}$/;
const RESERVED = new Set(['constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty']);
export const isKey = (value: unknown): value is string => typeof value === 'string' && KEY.test(value) && !RESERVED.has(value);

export class DefinitionError extends Error {
  constructor(readonly path: string) {
    super(`The form definition cannot be read at ${path}`);
    this.name = 'DefinitionError';
  }
}

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const MAX_TEXT = 20_000;

function bilingual(value: unknown, path: string, optional = false): Bilingual | null {
  if (value === undefined || value === null) {
    if (optional) return null;
    throw new DefinitionError(path);
  }
  if (!isObject(value) || typeof value.en !== 'string' || value.en.length > MAX_TEXT) throw new DefinitionError(path);
  const out: { en: string; sr?: string | null } = { en: value.en };
  if (value.sr !== undefined && value.sr !== null) {
    if (typeof value.sr !== 'string' || value.sr.length > MAX_TEXT) throw new DefinitionError(`${path}.sr`);
    out.sr = value.sr;
  }
  return out;
}

const required = (value: Bilingual | null, path: string): Bilingual => {
  if (!value) throw new DefinitionError(path);
  return value;
};

function count(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new DefinitionError(path);
  return value;
}

function condition(value: unknown, path: string, depth = 0): Condition {
  if (!isObject(value) || depth > 4) throw new DefinitionError(path);
  if (Array.isArray(value.all) || Array.isArray(value.any)) {
    const list = (value.all ?? value.any) as unknown[];
    if (list.length === 0 || list.length > 10) throw new DefinitionError(path);
    const items = list.map((item, i) => condition(item, `${path}[${i}]`, depth + 1));
    return Array.isArray(value.all) ? { all: items } : { any: items };
  }
  if (value.not !== undefined) return { not: condition(value.not, `${path}.not`, depth + 1) };
  if (!isKey(value.field)) throw new DefinitionError(`${path}.field`);
  if (typeof value.equals === 'string') return { field: value.field, equals: value.equals };
  if (Array.isArray(value.in) && value.in.every((v) => typeof v === 'string')) return { field: value.field, in: value.in };
  if (typeof value.filled === 'boolean') return { field: value.field, filled: value.filled };
  throw new DefinitionError(path);
}

function field(value: unknown, path: string): FieldDefinition {
  if (!isObject(value) || !isKey(value.key)) throw new DefinitionError(`${path}.key`);
  if (!(FIELD_KINDS as readonly unknown[]).includes(value.kind)) throw new DefinitionError(`${path}.kind`);
  const kind = value.kind as FieldKind;
  const rules: { -readonly [K in keyof FieldRules]?: FieldRules[K] } = {};
  if (value.rules !== undefined && value.rules !== null) {
    if (!isObject(value.rules)) throw new DefinitionError(`${path}.rules`);
    const r = value.rules;
    if (r.maxWords !== undefined && r.maxWords !== null) rules.maxWords = count(r.maxWords, `${path}.rules.maxWords`, 1, 100_000);
    if (r.maxLength !== undefined && r.maxLength !== null) rules.maxLength = count(r.maxLength, `${path}.rules.maxLength`, 1, 100_000);
    if (r.pattern !== undefined && r.pattern !== null) {
      if (!(PATTERNS as readonly unknown[]).includes(r.pattern)) throw new DefinitionError(`${path}.rules.pattern`);
      rules.pattern = r.pattern as PatternName;
    }
    if (r.noUrl === true) rules.noUrl = true;
    if (r.file !== undefined && r.file !== null) {
      if (!isObject(r.file) || !Array.isArray(r.file.accept) || !r.file.accept.every((ext) => typeof ext === 'string' && /^[a-z0-9]{1,8}$/.test(ext))) throw new DefinitionError(`${path}.rules.file`);
      rules.file = { accept: r.file.accept as string[], maxBytes: count(r.file.maxBytes, `${path}.rules.file.maxBytes`, 1, 1024 * 1024 * 1024) };
    }
  }
  let options: FieldOption[] | undefined;
  if (kind === 'select' || kind === 'radio') {
    if (!Array.isArray(value.options) || value.options.length === 0 || value.options.length > 50) throw new DefinitionError(`${path}.options`);
    options = value.options.map((option, i) => {
      if (!isObject(option) || typeof option.value !== 'string' || option.value === '' || option.value.length > 100) throw new DefinitionError(`${path}.options[${i}]`);
      return { value: option.value, label: required(bilingual(option.label, `${path}.options[${i}].label`), `${path}.options[${i}].label`) };
    });
  }
  if (kind === 'file' && !rules.file) throw new DefinitionError(`${path}.rules.file`);
  const autocomplete = (AUTOCOMPLETE as readonly unknown[]).includes(value.autocomplete) ? (value.autocomplete as Autocomplete) : undefined;
  const messages = isObject(value.messages) ? { required: bilingual(value.messages.required, `${path}.messages.required`, true) } : null;
  return {
    key: value.key,
    kind,
    enabled: value.enabled !== false,
    required: typeof value.required === 'boolean' ? value.required : value.required === undefined ? false : condition(value.required, `${path}.required`),
    label: required(bilingual(value.label, `${path}.label`), `${path}.label`),
    help: bilingual(value.help, `${path}.help`, true),
    ...(options ? { options } : {}),
    rules,
    visibleWhen: value.visibleWhen === undefined || value.visibleWhen === null ? null : condition(value.visibleWhen, `${path}.visibleWhen`),
    onlyFirstInRepeat: value.onlyFirstInRepeat === true,
    requiredOnlyInFirst: value.requiredOnlyInFirst === true,
    ...(autocomplete ? { autocomplete } : {}),
    messages,
  };
}

function section(value: unknown, path: string): SectionDefinition {
  if (!isObject(value) || !isKey(value.id)) throw new DefinitionError(`${path}.id`);
  if (!Array.isArray(value.fields) || value.fields.length > 60) throw new DefinitionError(`${path}.fields`);
  let repeat: RepeatDefinition | null = null;
  if (value.repeat !== undefined && value.repeat !== null) {
    const r = value.repeat;
    if (!isObject(r)) throw new DefinitionError(`${path}.repeat`);
    const min = count(r.min, `${path}.repeat.min`, 0, 100);
    repeat = {
      min,
      max: count(r.max, `${path}.repeat.max`, Math.max(1, min), 100),
      itemLabel: required(bilingual(r.itemLabel, `${path}.repeat.itemLabel`), `${path}.repeat.itemLabel`),
      addLabel: bilingual(r.addLabel, `${path}.repeat.addLabel`, true),
      noticeFrom: r.noticeFrom === undefined || r.noticeFrom === null ? null : count(r.noticeFrom, `${path}.repeat.noticeFrom`, 1, 100),
      notice: bilingual(r.notice, `${path}.repeat.notice`, true),
    };
  }
  const fields = value.fields.map((f, i) => field(f, `${path}.fields[${i}]`));
  if (new Set(fields.map((f) => f.key)).size !== fields.length) throw new DefinitionError(`${path}.fields`);
  if (!repeat && fields.some((f) => f.onlyFirstInRepeat || f.requiredOnlyInFirst)) throw new DefinitionError(`${path}.fields`);
  if (repeat && fields.some((f) => f.kind === 'file')) throw new DefinitionError(`${path}.fields`); // files belong to the top of the form
  return {
    id: value.id,
    label: bilingual(value.label, `${path}.label`, true),
    help: bilingual(value.help, `${path}.help`, true),
    repeat,
    visibleWhen: value.visibleWhen === undefined || value.visibleWhen === null ? null : condition(value.visibleWhen, `${path}.visibleWhen`),
    fields,
  };
}

/** Reads a definition, or throws DefinitionError naming the first place it cannot read. */
export function readDefinition(value: unknown): FormDefinition {
  if (!isObject(value) || !(FORM_TYPES as readonly unknown[]).includes(value.type)) throw new DefinitionError('type');
  if (!isObject(value.texts)) throw new DefinitionError('texts');
  const t = value.texts;
  if (!Array.isArray(value.sections) || value.sections.length === 0 || value.sections.length > 30) throw new DefinitionError('sections');
  const sections = value.sections.map((s, i) => section(s, `sections[${i}]`));
  // A key names one thing: a field at the top of the form, or a block. Fields inside a block are
  // named within it ("authors[0].email"), so they may share a name with a field of another block.
  const top = [...sections.filter((s) => !s.repeat).flatMap((s) => s.fields.map((f) => f.key)), ...sections.filter((s) => s.repeat).map((s) => s.id)];
  if (new Set(top).size !== top.length || top.includes('consent') || top.includes('language')) throw new DefinitionError('sections');
  if (!isObject(value.consent) || typeof value.consent.version !== 'string' || value.consent.version === '' || value.consent.version.length > 64) throw new DefinitionError('consent');
  return {
    type: value.type as FormType,
    texts: {
      title: required(bilingual(t.title, 'texts.title'), 'texts.title'),
      intro: bilingual(t.intro, 'texts.intro', true),
      submit: bilingual(t.submit, 'texts.submit', true),
      thankYouTitle: bilingual(t.thankYouTitle, 'texts.thankYouTitle', true),
      thankYouText: bilingual(t.thankYouText, 'texts.thankYouText', true),
      closed: bilingual(t.closed, 'texts.closed', true),
    },
    sections,
    consent: { version: value.consent.version, label: required(bilingual(value.consent.label, 'consent.label'), 'consent.label'), message: bilingual(value.consent.message, 'consent.message', true) },
  };
}

/** Reads the published form of the API, or throws DefinitionError. */
export function readPublishedForm(value: unknown): PublishedForm {
  if (!isObject(value) || typeof value.slug !== 'string') throw new DefinitionError('slug');
  if (!(FORM_STATES as readonly unknown[]).includes(value.state)) throw new DefinitionError('state');
  const c = value.conference;
  if (!isObject(c) || typeof c.code !== 'string' || typeof c.name !== 'string' || typeof c.timeZone !== 'string') throw new DefinitionError('conference');
  const languages = Array.isArray(c.languages) ? c.languages.filter(isFormLanguage) : [];
  const deadline = typeof value.deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.deadline) ? value.deadline : null;
  return {
    slug: value.slug,
    version: count(value.version, 'version', 1, 1_000_000),
    state: value.state as FormState,
    deadline,
    conference: {
      code: c.code,
      name: c.name,
      timeZone: c.timeZone,
      languages: languages.length > 0 ? languages : [...FORM_LANGUAGES],
      contactEmail: typeof c.contactEmail === 'string' && c.contactEmail !== '' ? c.contactEmail : null,
    },
    frameSites: Array.isArray(value.frameSites) ? value.frameSites.filter((site): site is string => typeof site === 'string') : [],
    definition: readDefinition(value.definition),
  };
}
