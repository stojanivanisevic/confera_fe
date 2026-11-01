/**
 * The fixed texts of the public forms, in English and Serbian (Latin script, full diacritics).
 *
 * ADR-23: no i18n library. One typed catalogue per language; the type makes both have the same
 * keys, and `tests/form-catalogue.test.ts` checks the rest a type cannot: no empty text, the same
 * `{placeholders}` in both languages, Serbian with its diacritics. A third language is one more
 * entry here and the office's texts (NFR-I18N-05): nothing else changes.
 *
 * What the office edits (labels, help, options, the consent, the thank-you and closed messages)
 * is not here: it comes with the form's definition from the API, in both languages, and Serbian
 * falls back to English (ADR-23). What is here is the frame around it: the summary of errors,
 * the messages of the rules, the authors, the upload, the states of the form, the draft.
 *
 * Voice of the design system: plain and warm, the person is spoken to ("Vi" in Serbian, in
 * every sentence; the short imperative only on buttons), and an error says how to fix it.
 */
export const FORM_LANGUAGES = ['en', 'sr'] as const;
export type FormLanguage = (typeof FORM_LANGUAGES)[number];

export const isFormLanguage = (value: unknown): value is FormLanguage => typeof value === 'string' && (FORM_LANGUAGES as readonly string[]).includes(value);

/** The kinds of form (FR-FORM-01). */
export const FORM_TYPES = ['abstract', 'full_paper', 'membership'] as const;
export type FormType = (typeof FORM_TYPES)[number];

/** A noun after a number, by plural form of the language (Intl.PluralRules: "one", "few", "other"). */
export type PluralNoun = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

export interface FormCatalogue {
  /** The language switch. */
  language: string;
  /** The name of each language, written in that language (and marked with its `lang`). */
  languageNames: Record<FormLanguage, string>;
  /** Said after the language was switched, in the new language (UX3-14). */
  languageNow: string;
  /** Above the fields: what the star means (UX-M1-21). */
  requiredNote: string;
  noScript: string;
  /** Send, when the form's definition names no text of its own. */
  send: string;
  sending: string;
  /** The empty choice of a list. */
  choose: string;
  /** While the proof-of-work of a busy form runs (ADR-08). */
  checking: string;
  /** The title of the summary of errors, by kind of form (UX-M1-08). */
  errorsTitle: Record<FormType, string>;
  /** `{n}` errors, for the summary's description to a screen reader. */
  errorCount: PluralNoun;

  /** Messages of the rules (ADR-09), by the code the rule interpreter and the API give. `{label}` is the field's label. */
  rules: {
    requiredText: string;
    requiredChoice: string;
    requiredFile: string;
    requiredTick: string;
    /** A field of a repeated block: `{row}` is the block ("Author 2"), `{message}` the message. */
    inRow: string;
    /** The consent is not ticked, by kind of form. */
    consent: Record<FormType, string>;
    email: string;
    /** {count} {max} {over}: over the limit, where {over} is a number with its noun ("85 words"). */
    tooManyWords: string;
    /** {max} */
    tooLong: string;
    noUrl: string;
    /** noUrl after the field's label in the summary (UX3-04): "Title: leave out web addresses". */
    noUrlNamed: string;
    notAnOption: string;
    invalidCharacters: string;
    /** By name of a pattern of the field catalogue (ADR-09: patterns come only from the catalogue in code). */
    patterns: Record<'orcid' | 'phone' | 'taxNumber' | 'registrationNumber', string>;
    /** Any other code the API may give: the form says that the field was refused, and the API's code is not shown. */
    fallback: string;
    /** {label} {message}: a message that does not name its field, as the summary of errors says it (UX3-04). */
    named: string;
  };
  /** Under a long text: {count} {max}. */
  words: string;
  word: PluralNoun;

  files: {
    /** Under a file field: {max} {types}. */
    hint: string;
    /** The drop area of a field that takes one file (UX3-18). */
    drop: string;
    /** {name}: a chosen file is on its way (UX3-01, said in the live region). */
    started: string;
    /** {name} {max} */
    tooLarge: string;
    /** {name} {types} */
    wrongType: string;
    /** {name}: a .docx with macros is refused, and the message says how to save it without them (G2-22). */
    macros: string;
    /** {name} */
    empty: string;
    /** {name} */
    failed: string;
    /** Too many uploads from this connection, or no room for files just now. */
    busy: string;
    /** {name} {percent} */
    uploading: string;
    /** {name} */
    uploaded: string;
    /** Beside a file that is on the server, with a tick (UX3-19). */
    done: string;
    /** Send was pressed while a file is still on its way. */
    wait: string;
    /** A file must be uploaded again: the draft keeps no files (D3). */
    notKept: string;
  };

  authors: {
    /** The add button, when the form names none of its own. */
    add: string;
    /** The remove button of a block; the design system adds its number ("Remove author 2"). */
    removeLabel: string;
    /** Under the authors. */
    corresponding: string;
    /** {max} {email}: the limit (D7), with the office's address. */
    limit: string;
    /** {max} */
    limitNoContact: string;
    /** {n} */
    added: string;
    /** {n} */
    removed: string;
    /** {n} {name} */
    removeQuestion: string;
    /** {n} */
    removeQuestionNoName: string;
    remove: string;
    keep: string;
    /** {name} */
    correspondingChanged: string;
    /** Fourth and later authors, when the form says nothing of its own. */
    notice: string;
  };

  consent: {
    /** Read after a link that opens in a new tab. */
    newTab: string;
  };

  states: {
    thanksTitle: Record<FormType, string>;
    /** {email}: where the confirmation goes, so that a mistyped address is seen at once. */
    sentTo: string;
    /** {reference} */
    reference: string;
    again: Record<FormType, string>;
    closedTitle: string;
    /** {date} */
    closedText: string;
    closedTextNoDate: string;
    /** {email} */
    contact: string;
    /** Said when "Send another" has given a new, empty form (UX3-15). */
    ready: string;
    notOpenTitle: string;
    notOpenText: string;
    /** {date} {zone} */
    openUntil: string;
  };

  draft: {
    kept: string;
    inMemory: string;
    restored: string;
  };

  problems: {
    networkTitle: string;
    networkText: string;
    tooManyTitle: string;
    /** {minutes} */
    tooManyText: string;
    closedTitle: string;
    closedText: string;
    /** What the author can still do after the form closed while they typed (UX3-21). */
    closedNext: string;
    unknownTitle: string;
    /** {traceId} */
    unknownText: string;
    /** {email} {traceId} */
    unknownTextContact: string;
    loadTitle: string;
    loadText: string;
    tryAgain: string;
    /** The page cannot read the form from the API. */
    unavailableTitle: string;
    unavailableText: string;
    /** Send in the admin's preview of a draft. */
    previewTitle: string;
    previewText: string;
  };

  page: {
    /** {title} {conference} */
    title: string;
    notFoundTitle: string;
    notFoundText: string;
  };

  embed: {
    /** The line of the snippet above the frame (D5, UX-M1-12). */
    fallback: string;
  };
}

export const FORM_TEXTS: Readonly<Record<FormLanguage, FormCatalogue>> = {
  en: {
    language: 'Language',
    languageNames: { en: 'English', sr: 'Srpski' },
    languageNow: 'The form is now in English.',
    requiredNote: 'Kindly complete all mandatory fields, marked *.',
    noScript: 'This form needs JavaScript. Turn it on, or open the form in another browser.',
    send: 'Send',
    sending: 'Sending…',
    choose: 'Choose',
    checking: 'Checking that you are not a robot…',
    errorsTitle: {
      abstract: 'Check these fields to send your abstract',
      full_paper: 'Check these fields to send your paper',
      membership: 'Check these fields to send your application',
    },
    errorCount: { one: '{n} field to check', other: '{n} fields to check' },
    rules: {
      requiredText: 'Fill in “{label}”',
      requiredChoice: 'Choose an answer for “{label}”',
      requiredFile: 'Add a file for “{label}”',
      requiredTick: 'Tick “{label}” to send the form',
      inRow: '{row}: {message}',
      consent: {
        abstract: 'Accept the terms to send your abstract',
        full_paper: 'Accept the terms to send your paper',
        membership: 'Accept the terms to send your application',
      },
      email: 'Enter an email address like name@university.edu',
      tooManyWords: '{count} of {max} words. Shorten the text by {over}.',
      tooLong: 'Shorten this to {max} characters or fewer',
      noUrl: 'Leave out web addresses here',
      noUrlNamed: 'leave out web addresses',
      notAnOption: 'Choose one of the answers given',
      invalidCharacters: 'Remove the invisible or control characters from this text',
      patterns: {
        orcid: 'Enter the ORCID iD as four groups of four digits, like 0000-0002-1825-0097',
        phone: 'Enter a phone number with digits and spaces, with + and the country code at the start if you like',
        taxNumber: 'Enter the tax number with digits and letters only, like 100002010',
        registrationNumber: 'Enter the registration number with digits and letters only, like 07001703',
      },
      fallback: 'Check this field: the form could not accept what it holds.',
      named: '{label}: {message}',
    },
    words: '{count} of {max} words',
    word: { one: 'word', other: 'words' },
    files: {
      hint: 'Up to {max}: {types}',
      drop: 'Drop a file here or click to choose',
      started: 'Uploading {name}…',
      tooLarge: '{name} is larger than {max}. Choose a smaller file.',
      wrongType: '{name} is not one of these types: {types}. Save it as one of them and add it again.',
      macros: '{name} contains macros. In Word choose File › Save As, pick “Word Document (*.docx)” and add the new file.',
      empty: '{name} is empty. Choose the file again.',
      failed: 'The upload of {name} stopped. Check the connection and add the file again.',
      busy: 'Files cannot be taken just now. Try again in a few minutes.',
      uploading: 'Uploading {name}: {percent} %',
      uploaded: '{name} is uploaded.',
      done: 'Uploaded',
      wait: 'Wait until the file is uploaded, then send.',
      notKept: 'Files are not kept in the draft: add them again.',
    },
    authors: {
      add: 'Add author',
      removeLabel: 'Remove author',
      corresponding: 'The first author is the corresponding author: the confirmation goes to their email address.',
      limit: 'You can add up to {max} authors. For more, write to {email}.',
      limitNoContact: 'You can add up to {max} authors.',
      added: 'Author {n} added.',
      removed: 'Author {n} removed.',
      removeQuestion: 'Remove author {n}, {name}? What you wrote for this author is lost.',
      removeQuestionNoName: 'Remove author {n}? What you wrote for this author is lost.',
      remove: 'Remove',
      keep: 'Keep',
      correspondingChanged: '{name} is now the corresponding author.',
      notice: 'From the fourth author on, the registration fee may be higher.',
    },
    consent: { newTab: '(opens in a new tab)' },
    states: {
      thanksTitle: { abstract: 'Abstract sent', full_paper: 'Paper sent', membership: 'Application sent' },
      sentTo: 'The confirmation goes to {email}. If it does not arrive within 15 minutes, check your spam folder.',
      reference: 'Your reference: {reference}',
      again: { abstract: 'Send another abstract', full_paper: 'Send another paper', membership: 'Send another application' },
      closedTitle: 'This form is closed',
      closedText: 'The deadline was {date}. Thank you for your interest.',
      closedTextNoDate: 'The form does not take submissions any more. Thank you for your interest.',
      contact: 'Questions? Write to {email}.',
      ready: 'A new form is ready.',
      notOpenTitle: 'This form is not open yet',
      notOpenText: 'Come back later, or ask the organisers when it opens.',
      openUntil: 'Open until the end of {date} ({zone}).',
    },
    draft: {
      kept: 'What you type is kept in this tab until you send it. Files are not kept.',
      inMemory: 'This browser does not let the form keep a draft. If you close the tab, what you wrote is lost.',
      restored: 'What you typed earlier in this tab is back. Add the files again.',
    },
    problems: {
      networkTitle: 'The form was not sent',
      networkText: 'Check the connection and send again. Nothing you typed is lost.',
      tooManyTitle: 'Too many forms were sent from this connection',
      tooManyText: 'Try again in {minutes} minutes. Nothing you typed is lost.',
      closedTitle: 'Submissions closed while you were filling in the form',
      closedText: 'The deadline has passed, so the form could not be sent.',
      closedNext: 'Your answers stay on this page. If the organisers extend the deadline, you can send the form from here.',
      unknownTitle: 'Something went wrong on our side',
      unknownText: 'Your answers are still here. Try again in a few minutes. Code: {traceId}',
      unknownTextContact: 'Your answers are still here. Try again in a few minutes. If it keeps happening, write to {email} and mention the code {traceId}.',
      loadTitle: 'The form could not be prepared for sending',
      loadText: 'Check the connection, then try again. Nothing you typed is lost.',
      tryAgain: 'Try again',
      unavailableTitle: 'The form cannot be shown right now',
      unavailableText: 'Reload the page in a few minutes.',
      previewTitle: 'This is the preview',
      previewText: 'The form would be sent now. Nothing is sent from the preview.',
    },
    page: {
      title: '{title} · {conference}',
      notFoundTitle: 'This page does not exist',
      notFoundText: 'The link may be incomplete. Open the form again from the conference website.',
    },
    embed: { fallback: 'Form not showing? Open it on its own page.' },
  },
  sr: {
    language: 'Jezik',
    languageNames: { en: 'English', sr: 'Srpski' },
    languageNow: 'Obrazac je sada na srpskom.',
    requiredNote: 'Molimo vas da popunite sva obavezna polja, označena zvezdicom (*).',
    noScript: 'Za ovaj obrazac potreban je JavaScript. Uključite ga ili otvorite obrazac u drugom pregledaču.',
    send: 'Pošalji',
    sending: 'Šalje se…',
    choose: 'Izaberite',
    checking: 'Proveravamo da niste robot…',
    errorsTitle: {
      abstract: 'Proverite ova polja da biste poslali apstrakt',
      full_paper: 'Proverite ova polja da biste poslali rad',
      membership: 'Proverite ova polja da biste poslali prijavu',
    },
    errorCount: { one: '{n} polje za proveru', few: '{n} polja za proveru', other: '{n} polja za proveru' },
    rules: {
      requiredText: 'Popunite polje „{label}“',
      requiredChoice: 'Izaberite odgovor za „{label}“',
      requiredFile: 'Dodajte fajl za „{label}“',
      requiredTick: 'Označite „{label}“ da biste poslali obrazac',
      inRow: '{row}: {message}',
      consent: {
        abstract: 'Prihvatite uslove da biste poslali apstrakt',
        full_paper: 'Prihvatite uslove da biste poslali rad',
        membership: 'Prihvatite uslove da biste poslali prijavu',
      },
      email: 'Unesite adresu e-pošte u obliku ime@univerzitet.rs',
      tooManyWords: '{count} od {max} reči. Skratite tekst za {over}.',
      tooLong: 'Skratite ovo na najviše {max} znakova',
      noUrl: 'Ovde ne upisujte veb adrese',
      noUrlNamed: 'ne upisujte veb adrese',
      notAnOption: 'Izaberite jedan od ponuđenih odgovora',
      invalidCharacters: 'Uklonite nevidljive ili kontrolne znakove iz ovog teksta',
      patterns: {
        orcid: 'Unesite ORCID iD kao četiri grupe od po četiri cifre, na primer 0000-0002-1825-0097',
        phone: 'Unesite broj telefona ciframa i razmacima, po želji sa + i pozivnim brojem zemlje na početku',
        taxNumber: 'Unesite PIB samo ciframa i slovima, na primer 100002010',
        registrationNumber: 'Unesite matični broj samo ciframa i slovima, na primer 07001703',
      },
      fallback: 'Proverite ovo polje: obrazac nije mogao da prihvati ono što je upisano.',
      named: '{label}: {message}',
    },
    words: '{count} od {max} reči',
    word: { one: 'reč', few: 'reči', other: 'reči' },
    files: {
      hint: 'Do {max}: {types}',
      drop: 'Prevucite fajl ovde ili kliknite da ga izaberete',
      started: 'Otprema se {name}…',
      tooLarge: '{name} je veći od {max}. Izaberite manji fajl.',
      wrongType: '{name} nije nijednog od ovih tipova: {types}. Sačuvajte ga u jednom od njih i dodajte ponovo.',
      macros: '{name} sadrži makroe. U Wordu izaberite Datoteka › Sačuvaj kao, zatim „Word dokument (*.docx)“ i dodajte novi fajl.',
      empty: '{name} je prazan. Izaberite fajl ponovo.',
      failed: 'Otpremanje fajla {name} je prekinuto. Proverite vezu i dodajte fajl ponovo.',
      busy: 'Fajlovi trenutno ne mogu da se prime. Pokušajte ponovo za nekoliko minuta.',
      uploading: 'Otprema se {name}: {percent} %',
      uploaded: '{name} je otpremljen.',
      done: 'Otpremljeno',
      wait: 'Sačekajte da se fajl otpremi, pa pošaljite.',
      notKept: 'Fajlovi se ne čuvaju u nacrtu: dodajte ih ponovo.',
    },
    authors: {
      add: 'Dodaj autora',
      removeLabel: 'Ukloni autora',
      corresponding: 'Prvi autor je autor za korespondenciju: potvrda stiže na njegovu adresu e-pošte.',
      limit: 'Možete dodati najviše {max} autora. Za više autora pišite na {email}.',
      limitNoContact: 'Možete dodati najviše {max} autora.',
      added: 'Dodat je autor {n}.',
      removed: 'Autor {n} je uklonjen.',
      removeQuestion: 'Želite li da uklonite autora {n}, {name}? Ono što ste upisali za ovog autora se gubi.',
      removeQuestionNoName: 'Želite li da uklonite autora {n}? Ono što ste upisali za ovog autora se gubi.',
      remove: 'Ukloni',
      keep: 'Zadrži',
      correspondingChanged: '{name} je sada autor za korespondenciju.',
      notice: 'Od četvrtog autora kotizacija može biti viša.',
    },
    consent: { newTab: '(otvara se u novoj kartici)' },
    states: {
      thanksTitle: { abstract: 'Apstrakt je poslat', full_paper: 'Rad je poslat', membership: 'Prijava je poslata' },
      sentTo: 'Potvrda stiže na {email}. Ako ne stigne za 15 minuta, proverite folder za neželjenu poštu.',
      reference: 'Broj vaše prijave: {reference}',
      again: { abstract: 'Pošalji još jedan apstrakt', full_paper: 'Pošalji još jedan rad', membership: 'Pošalji još jednu prijavu' },
      closedTitle: 'Ovaj obrazac je zatvoren',
      closedText: 'Rok je bio {date}. Hvala vam na interesovanju.',
      closedTextNoDate: 'Obrazac više ne prima prijave. Hvala vam na interesovanju.',
      contact: 'Imate pitanje? Pišite na {email}.',
      ready: 'Novi obrazac je spreman.',
      notOpenTitle: 'Ovaj obrazac još nije otvoren',
      notOpenText: 'Vratite se kasnije ili pitajte organizatore kada se otvara.',
      openUntil: 'Otvoreno do kraja dana {date} ({zone}).',
    },
    draft: {
      kept: 'Ono što upišete čuva se u ovoj kartici dok ne pošaljete obrazac. Fajlovi se ne čuvaju.',
      inMemory: 'Ovaj pregledač ne dozvoljava obrascu da sačuva nacrt. Ako zatvorite karticu, upisano se gubi.',
      restored: 'Vratili smo ono što ste ranije upisali u ovoj kartici. Fajlove dodajte ponovo.',
    },
    problems: {
      networkTitle: 'Obrazac nije poslat',
      networkText: 'Proverite vezu i pošaljite ponovo. Ništa od upisanog nije izgubljeno.',
      tooManyTitle: 'Sa ove veze poslato je previše obrazaca',
      tooManyText: 'Pokušajte ponovo za {minutes} min. Ništa od upisanog nije izgubljeno.',
      closedTitle: 'Prijave su zatvorene dok ste popunjavali obrazac',
      closedText: 'Rok je istekao, pa obrazac nije mogao da bude poslat.',
      closedNext: 'Vaši odgovori ostaju na ovoj stranici. Ako organizatori produže rok, obrazac možete da pošaljete odavde.',
      unknownTitle: 'Nešto nije u redu kod nas',
      unknownText: 'Vaši odgovori su i dalje ovde. Pokušajte ponovo za nekoliko minuta. Kôd: {traceId}',
      unknownTextContact: 'Vaši odgovori su i dalje ovde. Pokušajte ponovo za nekoliko minuta. Ako se ponovi, pišite na {email} i navedite kôd {traceId}.',
      loadTitle: 'Obrazac nije mogao da se pripremi za slanje',
      loadText: 'Proverite vezu, pa pokušajte ponovo. Ništa od upisanog nije izgubljeno.',
      tryAgain: 'Pokušaj ponovo',
      unavailableTitle: 'Obrazac trenutno ne može da se prikaže',
      unavailableText: 'Ponovo učitajte stranicu za nekoliko minuta.',
      previewTitle: 'Ovo je pregled',
      previewText: 'Obrazac bi sada bio poslat. Iz pregleda se ništa ne šalje.',
    },
    page: {
      title: '{title} · {conference}',
      notFoundTitle: 'Ova stranica ne postoji',
      notFoundText: 'Link možda nije potpun. Otvorite obrazac ponovo sa sajta konferencije.',
    },
    embed: { fallback: 'Obrazac se ne prikazuje? Otvorite ga na posebnoj stranici.' },
  },
};

/** Fills the parts in braces of a text. A part without a value stays as it is. */
export function fill(text: string, values: Readonly<Record<string, string | number>>): string {
  return text.replace(/\{([a-zA-Z]+)\}/g, (whole, name: string) => (Object.hasOwn(values, name) ? String(values[name]) : whole));
}

/** The plural form a number takes in a language (CLDR rules: "one", "few", "other", ...). */
export function pluralOf(count: number, language: string): Intl.LDMLPluralRule {
  return new Intl.PluralRules(language).select(count);
}

/** A number with its noun, in the plural form the language gives it ("1 word", "85 words"; "1 reč", "5 reči"). */
export function countOf(count: number, noun: PluralNoun, language: FormLanguage): string {
  return `${count} ${noun[pluralOf(count, language)] ?? noun.other}`;
}

/** A text with `{n}` in the plural form of the language ("1 field to check", "3 polja za proveru"). */
export function plural(noun: PluralNoun, count: number, language: FormLanguage): string {
  return fill(noun[pluralOf(count, language)] ?? noun.other, { n: count });
}
