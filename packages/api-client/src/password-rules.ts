// The password rule set of confera_be (ADR-03, G2-25, FR-USR-06, ST-62): the four lines of
// the live checklist, ticked in the browser while the person types, without a request.
//
// The rule set is the API's: `openapi/password-rules.json` is vendored from
// `contracts/password-rules.json` of confera_be by `pnpm api:sync` (generated there from
// src/modules/access/password-rules.ts). Every list and number below is read from that file,
// never written here; the algorithm is the one the file describes, and
// tests/password-rules.test.ts runs its vectors, so the two repositories cannot drift apart.
import rules from '../openapi/password-rules.json';

export type PasswordRuleId = 'length' | 'not_common' | 'not_personal' | 'match';

export const PASSWORD_RULE_IDS: readonly PasswordRuleId[] = ['length', 'not_common', 'not_personal', 'match'];

/** Whose password it is: the words it must not contain. */
export interface PasswordContext {
  readonly email?: string | undefined;
  readonly displayName?: string | undefined;
  readonly organisationName?: string | undefined;
  readonly conferenceNames?: readonly string[] | undefined;
}

export interface PasswordCheck {
  readonly id: PasswordRuleId;
  readonly met: boolean;
}

interface LengthLine {
  readonly id: 'length';
  readonly code: string;
  readonly minimum: number;
  readonly maximum: number;
}
interface NotCommonLine {
  readonly id: 'not_common';
  readonly code: string;
  readonly common: readonly string[];
  readonly sequences: readonly string[];
}
interface NotPersonalLine {
  readonly id: 'not_personal';
  readonly code: string;
  readonly folds: Readonly<Record<string, string>>;
  readonly minimumWordLength: number;
}
interface MatchLine {
  readonly id: 'match';
  readonly code: string;
}
type Line = LengthLine | NotCommonLine | NotPersonalLine | MatchLine;

const LINES = rules.lines as readonly Line[];
const line = <T extends Line>(id: T['id']): T => {
  const found = LINES.find((l) => l.id === id);
  if (!found) throw new Error(`password-rules.json has no line "${id}"`);
  return found as T;
};
const LENGTH = line<LengthLine>('length');
const NOT_COMMON = line<NotCommonLine>('not_common');
const NOT_PERSONAL = line<NotPersonalLine>('not_personal');
const MATCH = line<MatchLine>('match');

/** The version of the rule set, as the file says it. */
export const PASSWORD_RULES_VERSION: number = rules.version;
export const MIN_LENGTH: number = LENGTH.minimum;
export const MAX_LENGTH: number = LENGTH.maximum;
/** The code of the field error when a rule is not met, as the API names it. */
export const RULE_CODES: Readonly<Record<PasswordRuleId, string>> = {
  length: LENGTH.code,
  not_common: NOT_COMMON.code,
  not_personal: NOT_PERSONAL.code,
  match: MATCH.code,
};
/** Units of repetition this short make a password common whatever they are (`abcabcabcabc`); the file's rule names 4. */
const MAX_TRIVIAL_UNIT_LENGTH = 4;

/** NFC, lower case, letters and digits only. */
export function normalForm(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

const FOLDED_LETTERS = new RegExp(`[${Object.keys(NOT_PERSONAL.folds).join('')}]`, 'g');

/** The folded forms of a text: đ written as dj, and as d. */
export function foldedForms(text: string): [string, string] {
  const fold = (dj: string): string =>
    normalForm(text)
      .replace(FOLDED_LETTERS, (letter) => (letter === 'đ' ? dj : (NOT_PERSONAL.folds[letter] ?? letter)))
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .normalize('NFC');
  return [fold('dj'), fold('d')];
}

/** Code points, not UTF-16 units: what the rule says. */
export function codePointLength(password: string): number {
  return Array.from(password.normalize('NFC')).length;
}

const COMMON = new Set(NOT_COMMON.common.map((entry) => normalForm(entry)));
const SEQUENCES = NOT_COMMON.sequences.map((sequence) => [sequence, Array.from(sequence).reverse().join('')] as const);

function isSequence(normal: string): boolean {
  return SEQUENCES.some(([forward, backward]) => forward.includes(normal) || backward.includes(normal));
}

/** The shortest unit that the text is two or more copies of, or null. */
function repeatedUnit(normal: string): string | null {
  for (let size = 1; size <= normal.length / 2; size += 1) {
    if (normal.length % size === 0) {
      const unit = normal.slice(0, size);
      if (unit.repeat(normal.length / size) === normal) return unit;
    }
  }
  return null;
}

const withoutEdgeDigits = (normal: string) => normal.replace(/^\p{N}+|\p{N}+$/gu, '');

function isCommonCore(normal: string): boolean {
  const core = withoutEdgeDigits(normal);
  return COMMON.has(normal) || (core !== '' && COMMON.has(core)) || isSequence(normal);
}

/**
 * Not a common or leaked password: its normal form is not on the list (also with digits
 * before or after it), has more than two different characters, is no part of a line of a
 * keyboard or of counting, and is not two or more copies of a unit that is any of these
 * or has at most four characters.
 */
export function isCommon(password: string): boolean {
  const normal = normalForm(password);
  if (normal === '') return true;
  if (new Set(normal).size <= 2 || isCommonCore(normal)) return true;
  return [normal, withoutEdgeDigits(normal)].some((text) => {
    const unit = repeatedUnit(text);
    return unit !== null && (unit.length <= MAX_TRIVIAL_UNIT_LENGTH || isCommonCore(unit));
  });
}

/**
 * The words a password must not contain, in their folded forms: the runs of letters of the
 * email before its last @ and of the names, each at least four characters long.
 */
export function personalWords(context: PasswordContext): string[] {
  const words = new Set<string>();
  const add = (text: string): void => {
    for (const run of text.normalize('NFC').match(/\p{L}+/gu) ?? []) {
      for (const folded of foldedForms(run)) {
        if (folded.length >= NOT_PERSONAL.minimumWordLength) words.add(folded);
      }
    }
  };
  if (context.email !== undefined) {
    const at = context.email.lastIndexOf('@');
    add(at === -1 ? context.email : context.email.slice(0, at));
  }
  for (const name of [context.displayName, context.organisationName, ...(context.conferenceNames ?? [])]) {
    if (name !== undefined) add(name);
  }
  return [...words].sort();
}

/** Not the person's own name or email name, nor the name of the organisation. */
export function isPersonal(password: string, context: PasswordContext): boolean {
  const forms = foldedForms(password);
  return personalWords(context).some((word) => forms.some((form) => form.includes(word)));
}

/** The four lines of the checklist, each met or not, in the order of the checklist. */
export function checkPassword(password: string, repeat: string, context: PasswordContext): PasswordCheck[] {
  const length = codePointLength(password);
  return [
    { id: 'length', met: length >= MIN_LENGTH && length <= MAX_LENGTH },
    { id: 'not_common', met: !isCommon(password) },
    { id: 'not_personal', met: !isPersonal(password, context) },
    { id: 'match', met: password === repeat },
  ];
}

/** The codes of the rules a password does not meet, as the API would name them. */
export function passwordProblems(password: string, repeat: string, context: PasswordContext): string[] {
  return checkPassword(password, repeat, context)
    .filter(({ met }) => !met)
    .map(({ id }) => RULE_CODES[id]);
}

export interface PasswordVector {
  readonly name: string;
  readonly candidate: string;
  readonly repeat: string;
  readonly context: PasswordContext;
  readonly met: Readonly<Record<PasswordRuleId, boolean>>;
}

/** The shared vectors of the rule set, as the API exports them. */
export const PASSWORD_VECTORS: readonly PasswordVector[] = rules.vectors as readonly PasswordVector[];
