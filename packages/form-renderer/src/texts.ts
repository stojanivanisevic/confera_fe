/**
 * Texts of the 0.1.0 spike form, in English and Serbian (Latin script).
 * No i18n library (ADR-23): a typed catalogue per language; the type makes the
 * two lists have the same keys. From 0.3.0 the texts of a form come from the
 * API with the form's definition (ADR-09).
 */
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
  authors: string;
  /** {n} */
  authorName: string;
  /** {n} */
  authorEmail: string;
  addAuthor: string;
  removeAuthor: string;
  authorsNote: string;
  consent: string;
  submit: string;
  errorsTitle: string;
  titleRequired: string;
  nameRequired: string;
  consentRequired: string;
  thanksTitle: string;
  thanksText: string;
  again: string;
  draftKept: string;
  draftInMemory: string;
}

export const SPIKE_FORM_TEXTS: Record<FormLanguage, SpikeFormTexts> = {
  en: {
    heading: 'Abstract submission',
    intro: 'Kindly complete all mandatory fields.',
    language: 'Language',
    paperTitle: 'Title of the paper',
    abstract: 'Abstract',
    words: '{count} of {max} words',
    authors: 'Authors',
    authorName: 'Name of author {n}',
    authorEmail: 'Email of author {n}',
    addAuthor: 'Add author',
    removeAuthor: 'Remove author',
    authorsNote: 'The first author is the corresponding author.',
    consent: 'I accept the terms of publication',
    submit: 'Send abstract',
    errorsTitle: 'Please correct the marked fields',
    titleRequired: 'Enter the title of the paper',
    nameRequired: 'Enter the name of the author',
    consentRequired: 'Accept the terms to continue',
    thanksTitle: 'Thank you',
    thanksText: 'This is the form of the 0.1.0 spike: nothing was sent.',
    again: 'Fill in another one',
    draftKept: 'What you write is kept in this tab until you send it.',
    draftInMemory: 'This browser does not let the form keep a draft. If you close the tab, what you wrote is lost.',
  },
  sr: {
    heading: 'Prijava apstrakta',
    intro: 'Molimo popunite sva obavezna polja.',
    language: 'Jezik',
    paperTitle: 'Naslov rada',
    abstract: 'Apstrakt',
    words: '{count} od {max} reči',
    authors: 'Autori',
    authorName: 'Ime autora {n}',
    authorEmail: 'Imejl autora {n}',
    addAuthor: 'Dodaj autora',
    removeAuthor: 'Ukloni autora',
    authorsNote: 'Prvi autor je autor za korespondenciju.',
    consent: 'Prihvatam uslove objavljivanja',
    submit: 'Pošalji apstrakt',
    errorsTitle: 'Ispravite označena polja',
    titleRequired: 'Unesite naslov rada',
    nameRequired: 'Unesite ime autora',
    consentRequired: 'Prihvatite uslove da biste nastavili',
    thanksTitle: 'Hvala',
    thanksText: 'Ovo je obrazac probe 0.1.0: ništa nije poslato.',
    again: 'Popuni još jedan',
    draftKept: 'Ono što napišete čuva se u ovoj kartici dok ne pošaljete.',
    draftInMemory: 'Ovaj pregledač ne dozvoljava obrascu da sačuva nacrt. Ako zatvorite karticu, napisano se gubi.',
  },
};

/** Fills the parts in braces of a text. */
export function fill(text: string, values: Readonly<Record<string, string | number>>): string {
  return text.replace(/\{([a-z]+)\}/g, (whole, name: string) => (Object.hasOwn(values, name) ? String(values[name]) : whole));
}

/** Words as the form counts them: runs of characters between white space. One rule, used for the counter. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/u).length;
}
