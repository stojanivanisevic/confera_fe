/**
 * What an error says (FR-FORM-13): in the form's language, next to its field and in the summary,
 * and how to fix it. The browser's rules and the API's refusals have the same codes, so a request
 * that bypassed the browser gets the same words (ADR-09). The office may write the "required"
 * message of a field itself; otherwise it comes from the catalogue, naming the field, and in a
 * repeated block naming the block ("Author 2: Fill in “Institution”.", UX-M1-08).
 */
import { textOf, type FieldDefinition, type FormDefinition, type SectionDefinition } from './definition';
import { countOf, fill, FORM_TEXTS, type FormLanguage } from './i18n/catalogue';
import { formatBytes } from './i18n/format';
import type { RuleError } from './rules';

/** The field a path names, with its block and the number of the block (1 for the first). */
export interface FieldAt {
  readonly field: FieldDefinition;
  readonly section: SectionDefinition;
  /** 1-based, in a repeated block. */
  readonly n: number | null;
}

/** `title` or `authors[1].email` → the field of the definition, or null. */
export function fieldAt(definition: FormDefinition, path: string): FieldAt | null {
  const block = /^([a-zA-Z0-9]+)\[(\d+)\]\.([a-zA-Z0-9]+)$/.exec(path);
  for (const section of definition.sections) {
    if (block && section.repeat && section.id === block[1]) {
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

export function messageFor(error: RuleError, definition: FormDefinition, language: FormLanguage): string {
  const t = FORM_TEXTS[language];
  if (error.path === 'consent') return textOf(definition.consent.message, language) || t.rules.consent[definition.type];
  const at = fieldAt(definition, error.path);
  if (!at) {
    // A block as a whole (too few authors), or a path the form does not know.
    const section = definition.sections.find((s) => s.id === error.path && s.repeat);
    if (section?.repeat && error.code === 'too_many') return fill(t.authors.limitNoContact, { max: section.repeat.max });
    return t.rules.fallback;
  }
  const label = plainLabel(fill(textOf(at.field.label, language), { n: at.n ?? 1 }));
  const params = error.params ?? {};
  let message: string;
  switch (error.code) {
    case 'required': {
      const own = textOf(at.field.messages?.required, language);
      if (own) return fill(own, { n: at.n ?? 1 });
      message = fill(at.field.kind === 'file' ? t.rules.requiredFile : at.field.kind === 'select' || at.field.kind === 'radio' ? t.rules.requiredChoice : at.field.kind === 'checkbox' ? t.rules.requiredTick : t.rules.requiredText, { label });
      break;
    }
    case 'email':
      message = t.rules.email;
      break;
    case 'too_many_words': {
      const max = Number(params.max ?? at.field.rules?.maxWords ?? 0);
      const count = Number(params.count ?? 0);
      message = fill(t.rules.tooManyWords, { count, max, over: countOf(Math.max(0, count - max), t.word, language) });
      break;
    }
    case 'too_long':
      message = fill(t.rules.tooLong, { max: Number(params.max ?? at.field.rules?.maxLength ?? 0) });
      break;
    case 'pattern': {
      const pattern = at.field.rules?.pattern;
      message = pattern ? t.rules.patterns[pattern] : t.rules.fallback;
      break;
    }
    case 'no_url':
      message = t.rules.noUrl;
      break;
    case 'not_an_option':
      message = t.rules.notAnOption;
      break;
    case 'file_too_large':
      message = fill(t.files.tooLarge, { name: label, max: formatBytes(Number(params.maxBytes ?? at.field.rules?.file?.maxBytes ?? 0), language) });
      break;
    case 'file_type':
      message = fill(t.files.wrongType, { name: label, types: (at.field.rules?.file?.accept ?? []).join(', ') });
      break;
    case 'upload_pending':
      message = t.files.wait;
      break;
    default:
      message = t.rules.fallback;
  }
  return at.n === null ? message : fill(t.rules.inRow, { row: blockTitle(at.section, at.n, language), message });
}

/** A label as a message quotes it: the link syntax of the office's texts read as its words. */
export function plainLabel(text: string): string {
  return text.replace(/\[([^\]]{1,200})\]\((?:[^)\s]{1,2000})\)/g, '$1').trim();
}
