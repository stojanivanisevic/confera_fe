/**
 * The rule interpreter of the browser (ADR-09): the answers of a form against the definition of
 * its version, the client's copy of what the API checks (`src/modules/forms/rules.ts` of
 * confera_be). The shared vectors of confera_be (`contracts/form-rule-vectors.json`, vendored by
 * `pnpm api:sync`) are the contract between the two: `tests/form-rule-vectors.test.ts` runs every
 * one of them, and the API stays the one that decides.
 *
 * - Answers are read into a key-checked structure: a key the definition does not have is refused
 *   (`unknownField`), `__proto__` and `constructor` included.
 * - No code is evaluated: a pattern is a name of the catalogue, its expression comes with the
 *   definition, and a rule is a number.
 * - A field that is not shown (its condition does not hold, its section is hidden, it is the
 *   phone of a co-author) is not checked and not kept.
 * - Errors are a path and a code, in the order of the form: `title`, `authors[2].email`; the
 *   index of a block starts at 0 and the message says "author 3" (./messages).
 */
import type { Condition, FieldDefinition, FormDefinition } from './definition';
import { pluralOf } from './i18n/catalogue';

export { pluralOf };

/** The stated maxima of the API (ADR-08, ST-41), whatever a form says. */
export const ABSOLUTE_LIMITS = { maxLength: 20_000, maxAuthors: 50, maxWords: 5_000 } as const;

export const RULE_CODES = ['required', 'wrongType', 'unknownField', 'tooLong', 'tooManyWords', 'pattern', 'noUrl', 'notAnEmail', 'notAnOption', 'invalidCharacters', 'tooFewItems', 'tooManyItems'] as const;
export type RuleCode = (typeof RULE_CODES)[number];

/** One refusal, as the API gives it: where, and which rule. */
export interface RuleError {
  readonly path: string;
  /** A RuleCode, a code of the browser of its own (`uploadPending`), or any code the API gives. */
  readonly code: string;
}

export type AnswerValue = string | boolean;
/** The answers of a form as they are sent: a value per field, the blocks of the repeating section as a list. */
export type Answers = Record<string, AnswerValue | Record<string, AnswerValue>[]>;

/** Words as both interpreters count them: runs of characters between white space. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/u).length;
}

/** How many words a text has beyond its limit; 0 when it is within it. */
export function wordsOver(text: string, max: number): number {
  return Math.max(0, countWords(text) - max);
}

/** The length of a text in code points (characters), as the limits count it. */
export const codePoints = (text: string): number => [...text].length;

const LOCAL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

/**
 * The one address rule (ADR-09) for every email address that enters Confera: ONE plain address
 * of at most 254 characters, a local part of at most 64 of the dot-atom of RFC 5322, a domain of
 * at least two labels, the last of two letters at least; no display name, comma, angle bracket,
 * quote, space or control character. ASCII only (no SMTPUTF8 in the MVP).
 */
export function isEmailAddress(value: string): boolean {
  if (value.length > 254) return false;
  const at = value.indexOf('@');
  if (at <= 0 || at !== value.lastIndexOf('@')) return false;
  const local = value.slice(0, at);
  const labels = value.slice(at + 1).split('.');
  return local.length <= 64 && LOCAL.test(local) && labels.length >= 2 && labels.every((label) => LABEL.test(label)) && /^[A-Za-z]{2,63}$/.test(labels[labels.length - 1] ?? '');
}

/**
 * The URL rule of names, titles and institutions (ADR-08, item 5): a scheme with `//`, `www.`,
 * `mailto:`, a mail address, or a host name followed by a path. A dotted word alone is a word.
 */
export function hasUrl(text: string): boolean {
  return (
    /[a-z][a-z0-9+.-]*:\/\//iu.test(text) ||
    /(^|[^\p{L}\p{N}])www\./iu.test(text) ||
    /mailto:/iu.test(text) ||
    /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)+/u.test(text) ||
    /(^|[^\p{L}\p{N}@])[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)*\.[\p{L}]{2,}\/[^\s]/iu.test(text)
  );
}

const CONTROLS_MULTILINE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;
const CONTROLS = /[\u0000-\u001F\u007F]/u;
/** Control characters (a line break, a tab and a carriage return only in a long text) and the invisible direction characters. */
function hasForbiddenCharacters(text: string, multiline: boolean): boolean {
  return (multiline ? CONTROLS_MULTILINE : CONTROLS).test(text) || /[‪-‮⁦-⁩‎‏﻿]/u.test(text);
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Does a condition hold for the top-level answers? */
export function holds(condition: Condition | null, top: Readonly<Record<string, unknown>>): boolean {
  if (condition === null) return true;
  const value = Object.hasOwn(top, condition.field) ? top[condition.field] : undefined;
  return typeof value === 'string' && condition.in.includes(value.normalize('NFC').trim());
}

/** Is a field shown: its condition holds, and it is not the phone of a co-author. (Its section is asked separately.) */
export function isShown(field: FieldDefinition, top: Readonly<Record<string, unknown>>, index: number | null = null): boolean {
  return holds(field.visibleWhen, top) && !(field.onlyFirstInRepeat && index !== null && index > 0);
}

/** A pattern's expression, compiled once. */
const compiled = new Map<string, RegExp>();
function matches(expression: string, text: string): boolean {
  let pattern = compiled.get(expression);
  if (!pattern) {
    pattern = new RegExp(expression, 'u');
    compiled.set(expression, pattern);
  }
  return pattern.test(text);
}

/** One value against its field: the kept value, nothing when empty, or the code of the first rule that fails. */
function checkValue(definition: FormDefinition, field: FieldDefinition, raw: unknown): { value?: AnswerValue } | { code: RuleCode } {
  const empty = raw === undefined || raw === null || raw === '' || raw === false;
  if (field.kind === 'consent') {
    if (raw !== undefined && raw !== null && typeof raw !== 'boolean') return { code: 'wrongType' };
    if (raw !== true) return field.required ? { code: 'required' } : {};
    return { value: true };
  }
  if (raw !== undefined && raw !== null && typeof raw !== 'string') return { code: 'wrongType' };
  const text = typeof raw === 'string' ? raw.normalize('NFC').trim() : '';
  if (empty || text === '') return field.required ? { code: 'required' } : {};
  if (codePoints(text) > Math.min(field.rules.maxLength ?? ABSOLUTE_LIMITS.maxLength, ABSOLUTE_LIMITS.maxLength)) return { code: 'tooLong' };
  switch (field.kind) {
    case 'choice':
    case 'yesNo':
      return (field.options ?? []).some((option) => option.value === text) ? { value: text } : { code: 'notAnOption' };
    case 'file':
      return UUID.test(text) ? { value: text } : { code: 'wrongType' };
    case 'email': {
      if (hasForbiddenCharacters(text, false) || !isEmailAddress(text)) return { code: 'notAnEmail' };
      const at = text.lastIndexOf('@');
      return { value: `${text.slice(0, at)}@${text.slice(at + 1).toLowerCase()}` };
    }
    default:
      break;
  }
  if (hasForbiddenCharacters(text, field.kind === 'longText')) return { code: 'invalidCharacters' };
  if (field.rules.maxWords !== null && countWords(text) > field.rules.maxWords) return { code: 'tooManyWords' };
  const expression = field.rules.pattern ? definition.patterns[field.rules.pattern] : undefined;
  if (field.rules.pattern !== null && (expression === undefined || !matches(expression, text))) return { code: 'pattern' };
  if (field.rules.noUrl && hasUrl(text)) return { code: 'noUrl' };
  return { value: text };
}

function checkFields(definition: FormDefinition, fields: readonly FieldDefinition[], given: Readonly<Record<string, unknown>>, top: Readonly<Record<string, unknown>>, prefix: string, index: number | null, errors: RuleError[]): Record<string, AnswerValue> {
  const kept = Object.create(null) as Record<string, AnswerValue>;
  for (const field of fields) {
    if (!isShown(field, top, index)) continue;
    const raw = Object.hasOwn(given, field.key) ? given[field.key] : undefined;
    const result = checkValue(definition, field, raw);
    if ('code' in result) errors.push({ path: `${prefix}${field.key}`, code: result.code });
    else if (result.value !== undefined) kept[field.key] = result.value;
  }
  return kept;
}

/**
 * Checks answers against a definition: `ok` with the answers as they are kept (trimmed, NFC, only
 * the shown fields, the blocks in order), or the errors in the order of the form.
 */
export function checkAnswers(definition: FormDefinition, input: unknown): { ok: true; answers: Answers } | { ok: false; errors: RuleError[] } {
  if (!isPlainObject(input)) return { ok: false, errors: [{ path: '', code: 'wrongType' }] };
  const errors: RuleError[] = [];
  const known = new Set<string>();
  for (const section of definition.sections) {
    if (section.repeat !== null) known.add(section.key);
    else for (const field of section.fields) known.add(field.key);
  }
  for (const key of Object.keys(input)) if (!known.has(key)) errors.push({ path: key, code: 'unknownField' });

  const answers = Object.create(null) as Answers;
  for (const section of definition.sections) {
    const shown = holds(section.visibleWhen, input);
    if (section.repeat === null) {
      if (shown) Object.assign(answers, checkFields(definition, section.fields, input, input, '', null, errors));
      continue;
    }
    if (!shown) continue;
    const raw = Object.hasOwn(input, section.key) ? input[section.key] : undefined;
    if (raw !== undefined && !Array.isArray(raw)) {
      errors.push({ path: section.key, code: 'wrongType' });
      continue;
    }
    const blocks: unknown[] = raw ?? [];
    if (blocks.length < section.repeat.min) errors.push({ path: section.key, code: 'tooFewItems' });
    if (blocks.length > Math.min(section.repeat.max, ABSOLUTE_LIMITS.maxAuthors)) {
      errors.push({ path: section.key, code: 'tooManyItems' });
      continue;
    }
    const fieldKeys = new Set(section.fields.map((field) => field.key));
    const kept: Record<string, AnswerValue>[] = [];
    blocks.forEach((block, index) => {
      const prefix = `${section.key}[${String(index)}].`;
      if (!isPlainObject(block)) {
        errors.push({ path: `${section.key}[${String(index)}]`, code: 'wrongType' });
        return;
      }
      for (const key of Object.keys(block)) if (!fieldKeys.has(key)) errors.push({ path: `${prefix}${key}`, code: 'unknownField' });
      kept.push(checkFields(definition, section.fields, block, input, prefix, index, errors));
    });
    answers[section.key] = kept;
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, answers };
}

/** The errors of the answers, in the order of the form; none when the form may be sent. */
export const validate = (definition: FormDefinition, answers: Answers): RuleError[] => {
  const result = checkAnswers(definition, answers);
  return result.ok ? [] : result.errors;
};

/** The path of a field: `title`, or `authors[1].email` in the second block. */
export const pathOf = (field: string, block?: { key: string; index: number }): string => (block ? `${block.key}[${block.index}].${field}` : field);
