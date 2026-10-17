/**
 * The rule interpreter of the browser (ADR-09): what a form checks before it sends, read from
 * the form's definition. It is the client's copy of what the API checks; the shared vectors of
 * `confera_be` are the contract between the two (`tests/form-rules.test.ts` runs every vector it
 * is given), and the API stays the one that decides. Nothing here evaluates code: a rule is a
 * name from the catalogue in code and a number.
 *
 * Answers are read into a key-checked structure: the keys of the definition and nothing else.
 * An error is a path and a code, as the API gives them (`authors[1].email`, `required`); the
 * message comes from the catalogue in the form's language (./messages).
 */
import type { Condition, FieldDefinition, FormDefinition, PatternName, SectionDefinition } from './definition';
import { pluralOf } from './i18n/catalogue';

export { pluralOf };

/** Words as the form counts them: runs of characters between white space. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/u).length;
}

/** How many words a text has beyond its limit; 0 when it is within it. */
export function wordsOver(text: string, max: number): number {
  return Math.max(0, countWords(text) - max);
}

/** Characters as a person counts them (a letter with its diacritic is one, an emoji is one). */
export const lengthOf = (text: string): number => [...text].length;

/**
 * The one address rule (ADR-09) for every email address that enters Confera: one address, no
 * display name, comma, angle bracket, quote, space or control character, at most 254 characters,
 * something before the @ and a domain with a dot after it.
 */
export function isEmailAddress(value: string): boolean {
  const address = value.trim();
  if (address.length === 0 || address.length > 254) return false;
  if (/[\s,;<>"'()[\]\\\u0000-\u001f\u007f]/u.test(address)) return false;
  return /^[^@]+@[^@.]+(?:\.[^@.]+)+$/u.test(address);
}

/** A web address in a name, a title or an institution (ADR-08, control 5). */
export function hasUrl(value: string): boolean {
  return /[a-z][a-z0-9+.-]*:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:com|net|org|info|biz|io|ru|xyz|top|click|link|site|online|shop)\b/iu.test(value);
}

/** ORCID iD: four groups of four, the last character a digit or X, with the check digit of ISO 7064 11,2. */
function isOrcid(value: string): boolean {
  if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(value)) return false;
  const digits = value.replaceAll('-', '');
  let total = 0;
  for (const digit of digits.slice(0, 15)) total = (total + Number(digit)) * 2;
  const check = (12 - (total % 11)) % 11;
  return digits[15] === (check === 10 ? 'X' : String(check));
}

const PATTERN_TESTS: Readonly<Record<PatternName, (value: string) => boolean>> = {
  orcid: isOrcid,
  phone: (value) => /^\+?[0-9][0-9 ()/-]{4,22}[0-9]$/.test(value) && value.replace(/\D/g, '').length >= 6,
  taxNumber: (value) => /^\d{9}$/.test(value),
  registrationNumber: (value) => /^\d{8}$/.test(value),
};

export const matchesPattern = (pattern: PatternName, value: string): boolean => PATTERN_TESTS[pattern](value.trim());

// ---- answers --------------------------------------------------------------------------

/** The answers of one block, or of the top of the form: key → text ('' when there is none). */
export type AnswerRecord = Readonly<Record<string, string>>;
/** All answers: the top-level fields by key, and each repeated block by its id as a list. */
export interface Answers {
  readonly top: AnswerRecord;
  readonly blocks: Readonly<Record<string, readonly AnswerRecord[]>>;
  /** The consent was given. */
  readonly consent: boolean;
}

/** The value of a field a condition names: in the block first, then at the top of the form. */
function lookup(name: string, answers: Answers, row: AnswerRecord | null): string {
  if (row && Object.hasOwn(row, name)) return row[name] ?? '';
  return Object.hasOwn(answers.top, name) ? (answers.top[name] ?? '') : '';
}

export function holds(condition: Condition, answers: Answers, row: AnswerRecord | null = null): boolean {
  if ('all' in condition) return condition.all.every((c) => holds(c, answers, row));
  if ('any' in condition) return condition.any.some((c) => holds(c, answers, row));
  if ('not' in condition) return !holds(condition.not, answers, row);
  const value = lookup(condition.field, answers, row).trim();
  if ('equals' in condition) return value === condition.equals;
  if ('in' in condition) return condition.in.includes(value);
  return condition.filled ? value !== '' : value === '';
}

/** Whether a field takes part in the form: switched on, in its block, and its conditions hold. */
export function isShown(field: FieldDefinition, section: SectionDefinition, answers: Answers, row: AnswerRecord | null = null, index = 0): boolean {
  if (!field.enabled) return false;
  if (field.onlyFirstInRepeat && index !== 0) return false;
  if (section.visibleWhen && !holds(section.visibleWhen, answers, null)) return false;
  return !field.visibleWhen || holds(field.visibleWhen, answers, row);
}

export function isRequired(field: FieldDefinition, answers: Answers, row: AnswerRecord | null = null, index = 0): boolean {
  if (field.requiredOnlyInFirst && index !== 0) return false;
  return typeof field.required === 'boolean' ? field.required : holds(field.required, answers, row);
}

// ---- checking -------------------------------------------------------------------------

export type RuleCode = 'required' | 'email' | 'too_many_words' | 'too_long' | 'pattern' | 'no_url' | 'not_an_option' | 'too_few' | 'too_many' | 'consent_required';

/** One refusal, as the API gives it: where, which rule, and the numbers of the rule. */
export interface RuleError {
  readonly path: string;
  /** A RuleCode of the browser, or any code the API gives. */
  readonly code: string;
  readonly params?: Readonly<Record<string, string | number>>;
}

/** The path of a field: `title`, or `authors[1].email` in the second block. */
export const pathOf = (field: string, block?: { id: string; index: number }): string => (block ? `${block.id}[${block.index}].${field}` : field);

function checkField(field: FieldDefinition, value: string, required: boolean, path: string, out: RuleError[]): void {
  const text = value.trim();
  if (text === '') {
    if (required) out.push({ path, code: 'required' });
    return;
  }
  if (field.kind === 'email' && !isEmailAddress(text)) out.push({ path, code: 'email' });
  if ((field.kind === 'select' || field.kind === 'radio') && !(field.options ?? []).some((option) => option.value === text)) out.push({ path, code: 'not_an_option' });
  const rules = field.rules ?? {};
  if (rules.maxWords !== undefined && countWords(value) > rules.maxWords) out.push({ path, code: 'too_many_words', params: { max: rules.maxWords, count: countWords(value) } });
  if (rules.maxLength !== undefined && lengthOf(value) > rules.maxLength) out.push({ path, code: 'too_long', params: { max: rules.maxLength } });
  if (rules.pattern && !matchesPattern(rules.pattern, text)) out.push({ path, code: 'pattern', params: { pattern: rules.pattern } });
  if (rules.noUrl && hasUrl(text)) out.push({ path, code: 'no_url' });
}

/** Every refusal of the answers, in the order of the fields. An empty list: the form may be sent. */
export function validate(definition: FormDefinition, answers: Answers): RuleError[] {
  const out: RuleError[] = [];
  for (const section of definition.sections) {
    if (section.repeat) {
      const rows = answers.blocks[section.id] ?? [];
      if (section.visibleWhen && !holds(section.visibleWhen, answers, null)) continue;
      if (rows.length < section.repeat.min) out.push({ path: section.id, code: 'too_few', params: { min: section.repeat.min } });
      if (rows.length > section.repeat.max) out.push({ path: section.id, code: 'too_many', params: { max: section.repeat.max } });
      rows.forEach((row, index) => {
        for (const field of section.fields) {
          if (!isShown(field, section, answers, row, index)) continue;
          checkField(field, row[field.key] ?? '', isRequired(field, answers, row, index), pathOf(field.key, { id: section.id, index }), out);
        }
      });
    } else {
      for (const field of section.fields) {
        if (!isShown(field, section, answers)) continue;
        checkField(field, answers.top[field.key] ?? '', isRequired(field, answers), field.key, out);
      }
    }
  }
  if (!answers.consent) out.push({ path: 'consent', code: 'consent_required' });
  return out;
}

/**
 * What is sent: the answers of the fields that take part, and nothing else. A field that is
 * switched off or hidden by its condition (the employer's data once the author pays) is left out,
 * also when something is still typed in it.
 */
export function answersToSend(definition: FormDefinition, answers: Answers): { top: Record<string, string>; blocks: Record<string, Record<string, string>[]> } {
  const top: Record<string, string> = Object.create(null) as Record<string, string>;
  const blocks: Record<string, Record<string, string>[]> = Object.create(null) as Record<string, Record<string, string>[]>;
  for (const section of definition.sections) {
    if (section.repeat) {
      if (section.visibleWhen && !holds(section.visibleWhen, answers, null)) continue;
      blocks[section.id] = (answers.blocks[section.id] ?? []).map((row, index) => {
        const record: Record<string, string> = Object.create(null) as Record<string, string>;
        for (const field of section.fields) if (isShown(field, section, answers, row, index)) record[field.key] = (row[field.key] ?? '').trim();
        return record;
      });
    } else {
      for (const field of section.fields) if (isShown(field, section, answers)) top[field.key] = field.kind === 'textarea' ? (answers.top[field.key] ?? '').replace(/\s+$/u, '') : (answers.top[field.key] ?? '').trim();
    }
  }
  return { top, blocks };
}
