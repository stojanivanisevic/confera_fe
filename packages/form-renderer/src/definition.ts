/**
 * A form as the API publishes it (ADR-09): the definition of one immutable form version, built by
 * the server from the field catalogue in code and the office's configuration. Its shape is
 * `contracts/form-definition.schema.json` of confera_be (schema version 1), vendored by
 * `pnpm api:sync`: texts in both languages, sections, the repeating block of authors, fields whose
 * `kind` and `key` come from the catalogue, their rules, the patterns they name, and conditions.
 *
 * The renderer reads it defensively (`readDefinition`): an unknown kind, a pattern without its
 * expression, a condition it cannot read or a key that is not a plain name makes the whole form
 * unreadable, and the page says so. Nothing in a definition is ever run as code (ADR-09: "no
 * code from data"); every text of it is shown as text, and the one link syntax of the office's
 * texts is read by `./safe-text`.
 */
import { FORM_LANGUAGES, FORM_TYPES, isFormLanguage, type FormLanguage, type FormType } from './i18n/catalogue';

/** A text in the form's languages. Serbian may be empty: the form then shows the English one (ADR-23). */
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

/**
 * What a field holds, and so how it is rendered and checked (the catalogue of confera_be):
 * `text` one line, `longText` several lines, `email` one address, `choice` one of its options,
 * `yesNo` the options yes and no, `file` the id of an upload, `consent` given or not.
 */
export const FIELD_KINDS = ['text', 'longText', 'email', 'choice', 'yesNo', 'file', 'consent'] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

/** The patterns of the catalogue (never one an admin types). Their expressions come with the definition. */
export const PATTERNS = ['orcid', 'phone', 'taxNumber', 'registrationNumber'] as const;
export type PatternName = (typeof PATTERNS)[number];

/** The file types a file field may accept, detected by the API from the content (ADR-10). */
export const FILE_TYPES = ['pdf', 'docx', 'doc', 'jpeg', 'png'] as const;
export type FileType = (typeof FILE_TYPES)[number];

/** `autocomplete` values the renderer passes on: the person's own name and address, never a payment detail. */
const AUTOCOMPLETE = new Set(['name', 'given-name', 'family-name', 'email', 'tel', 'organization', 'street-address', 'off']);

export interface FieldOption {
  readonly value: string;
  readonly label: Bilingual;
}

/** A field (or a section) shows when another field at the top of the form has one of these answers. */
export interface Condition {
  readonly field: string;
  readonly in: readonly string[];
}

export interface FileRule {
  readonly accept: readonly FileType[];
  readonly maxBytes: number;
}

export interface FieldRules {
  /** Characters (code points) at most. */
  readonly maxLength: number | null;
  readonly maxWords: number | null;
  readonly pattern: PatternName | null;
  /** No address, no `www.`, no mail address in the text (ADR-08, item 5). */
  readonly noUrl: boolean;
  readonly file: FileRule | null;
}

export interface FieldDefinition {
  readonly key: string;
  readonly kind: FieldKind;
  readonly required: boolean;
  readonly label: Bilingual;
  readonly help: Bilingual | null;
  readonly options: readonly FieldOption[] | null;
  readonly rules: FieldRules;
  readonly visibleWhen: Condition | null;
  /** In the repeating section: only in its first block (the phone of the first author). */
  readonly onlyFirstInRepeat: boolean;
  /** The browser's autofill hint, for the first block only. */
  readonly autocomplete: string | null;
}

export interface RepeatDefinition {
  readonly min: number;
  /** The most blocks (decision D7: configurable per form, 10 authors by default). */
  readonly max: number;
  /** The title of one block, with `{n}`: "Author {n}". */
  readonly itemLabel: Bilingual;
  readonly addLabel: Bilingual;
  /** The name of a block's remove button, with `{n}`: "Remove author {n}". */
  readonly removeLabel: Bilingual;
  /** From this block on, `notice` is shown (the fee of a fourth author); null: never. */
  readonly noticeFrom: number | null;
  readonly notice: Bilingual | null;
}

export interface SectionDefinition {
  readonly key: string;
  readonly label: Bilingual;
  readonly repeat: RepeatDefinition | null;
  readonly visibleWhen: Condition | null;
  readonly fields: readonly FieldDefinition[];
}

export const TEXT_KEYS = ['title', 'intro', 'submit', 'thankYou', 'closed', 'consent'] as const;
export type TextKey = (typeof TEXT_KEYS)[number];

export interface FormDefinition {
  readonly schemaVersion: 1;
  readonly type: FormType;
  readonly texts: Readonly<Record<TextKey, Bilingual>>;
  /** The expressions of the patterns its fields name (ECMAScript, `u` flag). */
  readonly patterns: Readonly<Partial<Record<PatternName, string>>>;
  readonly sections: readonly SectionDefinition[];
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
    /** The consent links of the conference (D6), which `[label](terms)` and `[label](privacy)` name. */
    readonly links: { readonly terms: string | null; readonly privacy: string | null };
  };
  /** The sites that may frame the form (FR-FORM-07); the frame tells its height to these only. */
  readonly frameSites: readonly string[];
  readonly definition: FormDefinition;
}

// ---- reading a definition ---------------------------------------------------------------

/** A key of a field or a section, as the catalogue writes them, never one an object already has. */
const KEY = /^[a-z][A-Za-z]{0,47}$/;
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

function bilingual(value: unknown, path: string): Bilingual {
  if (!isObject(value) || typeof value.en !== 'string' || value.en.length > MAX_TEXT) throw new DefinitionError(path);
  if (value.sr !== undefined && value.sr !== null && (typeof value.sr !== 'string' || value.sr.length > MAX_TEXT)) throw new DefinitionError(`${path}.sr`);
  return typeof value.sr === 'string' ? { en: value.en, sr: value.sr } : { en: value.en };
}
const optionalBilingual = (value: unknown, path: string): Bilingual | null => (value === undefined || value === null ? null : bilingual(value, path));

function count(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new DefinitionError(path);
  return value;
}
const optionalCount = (value: unknown, path: string, min: number, max: number): number | null => (value === undefined || value === null ? null : count(value, path, min, max));

function condition(value: unknown, path: string): Condition | null {
  if (value === undefined || value === null) return null;
  if (!isObject(value) || !isKey(value.field) || !Array.isArray(value.in) || value.in.length === 0 || value.in.length > 50) throw new DefinitionError(path);
  const values = value.in.filter((v): v is string => typeof v === 'string');
  if (values.length !== value.in.length) throw new DefinitionError(path);
  return { field: value.field, in: values };
}

function field(value: unknown, path: string, patterns: FormDefinition['patterns']): FieldDefinition {
  if (!isObject(value) || !isKey(value.key)) throw new DefinitionError(`${path}.key`);
  if (!(FIELD_KINDS as readonly unknown[]).includes(value.kind)) throw new DefinitionError(`${path}.kind`);
  const kind = value.kind as FieldKind;
  const r = isObject(value.rules) ? value.rules : {};
  let pattern: PatternName | null = null;
  if (r.pattern !== undefined && r.pattern !== null) {
    if (!(PATTERNS as readonly unknown[]).includes(r.pattern) || typeof patterns[r.pattern as PatternName] !== 'string') throw new DefinitionError(`${path}.rules.pattern`);
    pattern = r.pattern as PatternName;
  }
  let file: FileRule | null = null;
  if (r.file !== undefined && r.file !== null) {
    if (!isObject(r.file) || !Array.isArray(r.file.accept) || r.file.accept.length === 0) throw new DefinitionError(`${path}.rules.file`);
    const accept = r.file.accept.filter((t): t is FileType => (FILE_TYPES as readonly unknown[]).includes(t));
    if (accept.length !== r.file.accept.length) throw new DefinitionError(`${path}.rules.file`);
    file = { accept, maxBytes: count(r.file.maxBytes, `${path}.rules.file.maxBytes`, 1, 1024 * 1024 * 1024) };
  }
  if (kind === 'file' && !file) throw new DefinitionError(`${path}.rules.file`);
  let options: FieldOption[] | null = null;
  if (kind === 'choice' || kind === 'yesNo') {
    if (!Array.isArray(value.options) || value.options.length === 0 || value.options.length > 50) throw new DefinitionError(`${path}.options`);
    options = value.options.map((option, i) => {
      if (!isObject(option) || typeof option.value !== 'string' || option.value === '' || option.value.length > 100) throw new DefinitionError(`${path}.options[${i}]`);
      return { value: option.value, label: bilingual(option.label, `${path}.options[${i}].label`) };
    });
  }
  return {
    key: value.key,
    kind,
    required: value.required === true,
    label: bilingual(value.label, `${path}.label`),
    help: optionalBilingual(value.help, `${path}.help`),
    options,
    rules: {
      maxLength: optionalCount(r.maxLength, `${path}.rules.maxLength`, 1, 100_000),
      maxWords: optionalCount(r.maxWords, `${path}.rules.maxWords`, 1, 100_000),
      pattern,
      noUrl: r.noUrl === true,
      file,
    },
    visibleWhen: condition(value.visibleWhen, `${path}.visibleWhen`),
    onlyFirstInRepeat: value.onlyFirstInRepeat === true,
    autocomplete: typeof value.autocomplete === 'string' && AUTOCOMPLETE.has(value.autocomplete) ? value.autocomplete : null,
  };
}

function section(value: unknown, path: string, patterns: FormDefinition['patterns']): SectionDefinition {
  if (!isObject(value) || !isKey(value.key)) throw new DefinitionError(`${path}.key`);
  if (!Array.isArray(value.fields) || value.fields.length > 60) throw new DefinitionError(`${path}.fields`);
  let repeat: RepeatDefinition | null = null;
  if (value.repeat !== undefined && value.repeat !== null) {
    const r = value.repeat;
    if (!isObject(r)) throw new DefinitionError(`${path}.repeat`);
    const min = count(r.min, `${path}.repeat.min`, 1, 100);
    repeat = {
      min,
      max: count(r.max, `${path}.repeat.max`, min, 100),
      itemLabel: bilingual(r.itemLabel, `${path}.repeat.itemLabel`),
      addLabel: bilingual(r.addLabel, `${path}.repeat.addLabel`),
      removeLabel: bilingual(r.removeLabel, `${path}.repeat.removeLabel`),
      noticeFrom: optionalCount(r.noticeFrom, `${path}.repeat.noticeFrom`, 1, 100),
      notice: optionalBilingual(r.notice, `${path}.repeat.notice`),
    };
  }
  const fields = value.fields.map((f, i) => field(f, `${path}.fields[${i}]`, patterns));
  if (new Set(fields.map((f) => f.key)).size !== fields.length) throw new DefinitionError(`${path}.fields`);
  if (!repeat && fields.some((f) => f.onlyFirstInRepeat)) throw new DefinitionError(`${path}.fields`);
  // Files and the consent belong to the top of the form: one per submission.
  if (repeat && fields.some((f) => f.kind === 'file' || f.kind === 'consent')) throw new DefinitionError(`${path}.fields`);
  return { key: value.key, label: bilingual(value.label, `${path}.label`), repeat, visibleWhen: condition(value.visibleWhen, `${path}.visibleWhen`), fields };
}

/** Reads a definition, or throws DefinitionError naming the first place it cannot read. */
export function readDefinition(value: unknown): FormDefinition {
  if (!isObject(value) || value.schemaVersion !== 1) throw new DefinitionError('schemaVersion');
  if (!(FORM_TYPES as readonly unknown[]).includes(value.type)) throw new DefinitionError('type');
  if (!isObject(value.texts)) throw new DefinitionError('texts');
  const texts = value.texts;
  const patterns: Partial<Record<PatternName, string>> = {};
  if (isObject(value.patterns)) {
    for (const [name, expression] of Object.entries(value.patterns)) {
      if (!(PATTERNS as readonly string[]).includes(name) || typeof expression !== 'string' || expression.length > 500) throw new DefinitionError(`patterns.${name}`);
      try {
        new RegExp(expression, 'u');
      } catch {
        throw new DefinitionError(`patterns.${name}`);
      }
      patterns[name as PatternName] = expression;
    }
  }
  if (!Array.isArray(value.sections) || value.sections.length === 0 || value.sections.length > 30) throw new DefinitionError('sections');
  const sections = value.sections.map((s, i) => section(s, `sections[${i}]`, patterns));
  // A key names one thing at the top of the form: a field of a section without blocks, or the section of blocks.
  const top = sections.flatMap((s) => (s.repeat ? [s.key] : s.fields.map((f) => f.key)));
  if (new Set(top).size !== top.length) throw new DefinitionError('sections');
  for (const s of sections) {
    for (const c of [s.visibleWhen, ...s.fields.map((f) => f.visibleWhen)]) if (c && !top.includes(c.field)) throw new DefinitionError(`sections.${s.key}.visibleWhen`);
  }
  if (sections.filter((s) => s.repeat).length > 1) throw new DefinitionError('sections');
  const read = Object.fromEntries(TEXT_KEYS.map((key) => [key, bilingual(texts[key], `texts.${key}`)]));
  return { schemaVersion: 1, type: value.type as FormType, texts: read as Record<TextKey, Bilingual>, patterns, sections };
}

const httpsOrNull = (value: unknown): string | null => (typeof value === 'string' && /^https:\/\//.test(value) ? value : null);

/**
 * Reads the published form of the API (`PublicFormDto` of openapi.public.json), or throws
 * DefinitionError. `frameSites` come from their own call (`/frame-sites`); the page that needs
 * them (the frame) passes them in.
 */
export function readPublishedForm(value: unknown, frameSites: readonly string[] = []): PublishedForm {
  if (!isObject(value) || typeof value.slug !== 'string') throw new DefinitionError('slug');
  if (value.state !== 'open' && value.state !== 'closed') throw new DefinitionError('state');
  const c = value.conference;
  if (!isObject(c) || typeof c.code !== 'string' || typeof c.name !== 'string' || typeof c.timeZone !== 'string') throw new DefinitionError('conference');
  const languages = Array.isArray(c.languages) ? c.languages.filter(isFormLanguage) : [];
  const deadline = typeof value.deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.deadline) ? value.deadline : null;
  const links = isObject(value.consentLinks) ? value.consentLinks : {};
  // A form that is not published yet is "not open yet"; a closed conference or a passed deadline is "closed".
  const state: FormState = value.state === 'open' ? 'open' : value.closedReason === 'not_published' ? 'not_open' : 'closed';
  return {
    slug: value.slug,
    version: count(value.versionNumber, 'versionNumber', 1, 1_000_000),
    state,
    deadline,
    conference: {
      code: c.code,
      name: c.name,
      timeZone: c.timeZone,
      languages: languages.length > 0 ? languages : [...FORM_LANGUAGES],
      // Not in the public form of 0.3.0: the lines that name the office's address are left out without it.
      contactEmail: typeof c.contactEmail === 'string' && c.contactEmail !== '' ? c.contactEmail : null,
      links: { terms: httpsOrNull(links.terms), privacy: httpsOrNull(links.privacy) },
    },
    frameSites: frameSites.filter((site): site is string => typeof site === 'string'),
    definition: readDefinition(value.definition),
  };
}
