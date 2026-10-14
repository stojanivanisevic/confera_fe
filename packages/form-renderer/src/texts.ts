/**
 * Texts of the 0.1.0 spike form, in English and Serbian (Latin script).
 * No i18n library (ADR-23): a typed catalogue per language; the type makes the
 * two lists have the same keys. From 0.3.0 the texts of a form come from the
 * API with the form's definition (ADR-09).
 */
import { pluralOf } from './rules';

export const FORM_LANGUAGES = ['en', 'sr'] as const;
export type FormLanguage = (typeof FORM_LANGUAGES)[number];

export interface SpikeFormTexts {
  heading: string;
  intro: string;
  language: string;
  paperTitle: string;
  abstract: string;
  /** {count} {max} */
  words: string;
  /** {count} {max} {over}: over the limit, where {over} is a number with its noun ("85 words") */
  wordsOver: string;
  /** The noun after a number, by plural form of the language (Intl.PluralRules) */
  word: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
  authors: string;
  /** {n} */
  authorName: string;
  /** {n} */
  authorEmail: string;
  /** Under the email address of the first author */
  authorEmailHint: string;
  addAuthor: string;
  removeAuthor: string;
  authorsNote: string;
  consent: string;
  submit: string;
  errorsTitle: string;
  titleRequired: string;
  /** {n} */
  nameRequired: string;
  emailRequired: string;
  emailInvalid: string;
  consentRequired: string;
  thanksTitle: string;
  thanksText: string;
  again: string;
  draftKept: string;
  draftInMemory: string;
  /** Shown only where scripts never run */
  noScript: string;
}

export const SPIKE_FORM_TEXTS: Record<FormLanguage, SpikeFormTexts> = {
  en: {
    heading: 'Abstract submission',
    intro: 'Kindly complete all mandatory fields.',
    language: 'Language',
    paperTitle: 'Title of the paper',
    abstract: 'Abstract',
    words: '{count} of {max} words',
    wordsOver: '{count} of {max} words. Shorten the abstract by {over}.',
    word: { one: 'word', other: 'words' },
    authors: 'Authors',
    authorName: 'First and last name of author {n}',
    authorEmail: 'Email of author {n}',
    authorEmailHint: 'We send the confirmation here',
    addAuthor: 'Add author',
    removeAuthor: 'Remove author',
    authorsNote: 'The first author is the corresponding author.',
    consent: 'I accept the terms of publication',
    submit: 'Send abstract',
    errorsTitle: 'Please correct the marked fields',
    titleRequired: 'Enter the title of the paper',
    nameRequired: 'Enter the first and last name of author {n}',
    emailRequired: 'Enter the email address of author 1, so we can send the confirmation',
    emailInvalid: 'Enter an email address like name@university.edu',
    consentRequired: 'Accept the terms of publication to send your abstract',
    thanksTitle: 'Thank you',
    thanksText: 'This is the form of the 0.1.0 spike: nothing was sent.',
    again: 'Fill in another one',
    draftKept: 'Your title and abstract are kept in this tab until you send them.',
    draftInMemory: 'This browser does not let the form keep a draft. If you close the tab, what you wrote is lost.',
    noScript: 'This form needs JavaScript. Turn it on, or open the form in another browser.',
  },
  sr: {
    heading: 'Prijava apstrakta',
    intro: 'Molimo popunite sva obavezna polja.',
    language: 'Jezik',
    paperTitle: 'Naslov rada',
    abstract: 'Apstrakt',
    words: '{count} od {max} reči',
    wordsOver: '{count} od {max} reči. Skratite apstrakt za {over}.',
    word: { one: 'reč', few: 'reči', other: 'reči' },
    authors: 'Autori',
    authorName: 'Ime i prezime autora {n}',
    authorEmail: 'Imejl autora {n}',
    authorEmailHint: 'Ovde šaljemo potvrdu',
    addAuthor: 'Dodaj autora',
    removeAuthor: 'Ukloni autora',
    authorsNote: 'Prvi autor je autor za korespondenciju.',
    consent: 'Prihvatam uslove objavljivanja',
    submit: 'Pošalji apstrakt',
    errorsTitle: 'Ispravite označena polja',
    titleRequired: 'Unesite naslov rada',
    nameRequired: 'Unesite ime i prezime autora {n}',
    emailRequired: 'Unesite imejl adresu autora 1 da bismo poslali potvrdu',
    emailInvalid: 'Unesite imejl adresu u obliku ime@univerzitet.rs',
    consentRequired: 'Prihvatite uslove objavljivanja da biste poslali apstrakt',
    thanksTitle: 'Hvala',
    thanksText: 'Ovo je obrazac probe 0.1.0: ništa nije poslato.',
    again: 'Popuni još jedan',
    draftKept: 'Naslov i apstrakt čuvaju se u ovoj kartici dok ih ne pošaljete.',
    draftInMemory: 'Ovaj pregledač ne dozvoljava obrascu da sačuva nacrt. Ako zatvorite karticu, napisano se gubi.',
    noScript: 'Za ovaj obrazac potreban je JavaScript. Uključite ga ili otvorite obrazac u drugom pregledaču.',
  },
};

/** Fills the parts in braces of a text. */
export function fill(text: string, values: Readonly<Record<string, string | number>>): string {
  return text.replace(/\{([a-z]+)\}/g, (whole, name: string) => (Object.hasOwn(values, name) ? String(values[name]) : whole));
}

/** A number with its noun, in the plural form the language gives it ("1 word", "85 words"; "1 reč", "5 reči"). */
export function countOf(count: number, noun: SpikeFormTexts['word'], language: FormLanguage): string {
  return `${count} ${noun[pluralOf(count, language)] ?? noun.other}`;
}

export { countWords } from './rules';
