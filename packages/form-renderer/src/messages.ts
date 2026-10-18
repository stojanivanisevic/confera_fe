/**
 * What an error says (FR-FORM-13): in the form's language, next to its field and in the summary,
 * and how to fix it. The browser's rules and the API's refusals have the same codes, so a request
 * that bypassed the browser gets the same words (ADR-09). A message names its field, and in a
 * block of authors names the author ("Author 2: Fill in “Institution”", UX-M1-08). A code the
 * form does not know gets a plain message, never the code.
 */
import { textOf, type FieldDefinition, type FormDefinition, type SectionDefinition } from './definition';
import { countOf, fill, FORM_TEXTS, type FormLanguage } from './i18n/catalogue';
import { formatBytes } from './i18n/format';
import { countWords, type RuleError } from './rules';

/** The field a path names, with its section and the number of its block (1 for the first). */
export interface FieldAt {
  readonly field: FieldDefinition;
  readonly section: SectionDefinition;
  /** 1-based, in the repeating section. */
  readonly n: number | null;
}

/** `title` or `authors[1].email` → the field of the definition, or null. */
export function fieldAt(definition: FormDefinition, path: string): FieldAt | null {
  const block = /^([a-zA-Z]+)\[(\d+)\]\.([a-zA-Z]+)$/.exec(path);
  for (const section of definition.sections) {
    if (block && section.repeat && section.key === block[1]) {
      const field = section.fields.find((f) => f.key === block[3]);
      return field ? { field, section, n: Number(block[2]) + 1 } : null;
    }
    if (!block && !section.repeat) {
      const field = section.fields.find((f) => f.key === path);
      if (field) return { field, section, n: null };
    }
  }
  return null;
}

/** The title of a block: "Author 2" / "Autor 2". */
export const blockTitle = (section: SectionDefinition, n: number, language: FormLanguage): string => fill(textOf(section.repeat?.itemLabel, language), { n });

/** A label as a message quotes it: the link syntax of the office's texts read as its words. */
export function plainLabel(text: string): string {
  return text.replace(/\[([^\]]{1,200})\]\((?:[^)\s]{1,2000})\)/g, '$1').trim();
}

/**
 * The message of an error. `value` is what the field holds now (for the count of words); `extra`
 * carries what an upload refusal names (the limit).
 */
/** The codes whose message does not name the field ("Leave out web addresses here"): the summary puts the label first (UX3-04). */
const NAMELESS = new Set(['tooManyWords', 'tooLong', 'noUrl', 'notAnOption', 'invalidCharacters']);

/** The first letter of a message after "Label: " in lower case ("Title: leave out web addresses"), unless it is a number. */
const afterLabel = (message: string, language: FormLanguage): string => message.charAt(0).toLocaleLowerCase(language) + message.slice(1);

export interface MessageOptions {
  /** As the summary of errors says it: a message that does not name its field gets the field's label first (UX3-04). */
  readonly named?: boolean;
}

export function messageFor(error: RuleError, definition: FormDefinition, language: FormLanguage, value = '', extra: { maxBytes?: number } = {}, options: MessageOptions = {}): string {
  const t = FORM_TEXTS[language];
  const at = fieldAt(definition, error.path);
  if (!at) {
    // The block of authors as a whole, or a path the form does not know.
    const section = definition.sections.find((s) => s.key === error.path && s.repeat);
    if (section?.repeat && error.code === 'tooManyItems') return fill(t.authors.limitNoContact, { max: section.repeat.max });
    return t.rules.fallback;
  }
  if (at.field.kind === 'consent' && error.code === 'required') return t.rules.consent[definition.type];
  const label = plainLabel(fill(textOf(at.field.label, language), { n: at.n ?? 1 }));
  const rules = at.field.rules;
  let message: string;
  switch (error.code) {
    case 'required':
      message = fill(at.field.kind === 'file' ? t.rules.requiredFile : at.field.kind === 'choice' || at.field.kind === 'yesNo' ? t.rules.requiredChoice : t.rules.requiredText, { label });
      break;
    case 'notAnEmail':
      message = t.rules.email;
      break;
    case 'tooManyWords': {
      const max = rules.maxWords ?? 0;
      const words = countWords(value);
      message = fill(t.rules.tooManyWords, { count: words, max, over: countOf(Math.max(0, words - max), t.word, language) });
      break;
    }
    case 'tooLong':
      message = fill(t.rules.tooLong, { max: rules.maxLength ?? 20_000 });
      break;
    case 'pattern':
      message = rules.pattern ? t.rules.patterns[rules.pattern] : t.rules.fallback;
      break;
    case 'noUrl':
      message = t.rules.noUrl;
      break;
    case 'notAnOption':
      message = t.rules.notAnOption;
      break;
    case 'invalidCharacters':
      message = t.rules.invalidCharacters;
      break;
    case 'fileTooLarge':
      message = fill(t.files.tooLarge, { name: label, max: formatBytes(extra.maxBytes ?? rules.file?.maxBytes ?? 0, language) });
      break;
    case 'uploadPending':
      message = t.files.wait;
      break;
    default:
      message = t.rules.fallback;
  }
  if (options.named && NAMELESS.has(error.code)) {
    message = fill(t.rules.named, { label, message: afterLabel(error.code === 'noUrl' ? t.rules.noUrlNamed : message, language) });
  }
  // A label that already names its block ("Email of author {n}") needs no "Author 2:" before the message.
  const namesItsBlock = textOf(at.field.label, language).includes('{n}');
  return at.n === null || (namesItsBlock && error.code === 'required') ? message : fill(t.rules.inRow, { row: blockTitle(at.section, at.n, language), message });
}
