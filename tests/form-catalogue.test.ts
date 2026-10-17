// M3-FE-07 (NFR-I18N-01, 02, 04, 05; ADR-23): the catalogues of the public form have the same
// keys in both languages (the type holds that at compile time; this test at run time, for a key
// added to one object through a cast), every text is filled in, both languages name the same
// {placeholders}, and the Serbian texts are Latin script with full diacritics.
import { describe, expect, it } from 'vitest';

import { FORM_LANGUAGES, FORM_TEXTS, countOf, fill, plural, type FormLanguage } from '../packages/form-renderer/src/i18n/catalogue';
import { browserLanguages, pickLanguage } from '../packages/form-renderer/src/i18n/language';

/** Every text of a catalogue, by its path ("rules.patterns.orcid"). */
function leaves(value: unknown, path = ''): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof value === 'string') out.set(path, value);
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) for (const [p, text] of leaves(child, path ? `${path}.${key}` : key)) out.set(p, text);
  }
  return out;
}
const placeholders = (text: string) => [...text.matchAll(/\{([a-zA-Z]+)\}/g)].map((m) => m[1]).sort();

const en = leaves(FORM_TEXTS.en);
const sr = leaves(FORM_TEXTS.sr);
// The plural forms differ by language by nature: Serbian has "few", English has not.
const withoutPluralForms = (keys: Iterable<string>) => [...keys].filter((key) => !/\.(zero|one|two|few|many)$/.test(key)).sort();

describe('the catalogues of the public form', () => {
  it('have the same keys in both languages', () => {
    expect(withoutPluralForms(sr.keys())).toEqual(withoutPluralForms(en.keys()));
  });

  it('have no empty text', () => {
    for (const language of FORM_LANGUAGES) for (const [key, text] of leaves(FORM_TEXTS[language])) expect(text.trim(), `${language}: ${key}`).not.toBe('');
  });

  it('name the same placeholders in both languages', () => {
    for (const [key, text] of en) {
      const other = sr.get(key) ?? sr.get(key.replace(/\.one$/, '.other'));
      if (other === undefined) continue;
      expect(placeholders(other), key).toEqual(placeholders(text));
    }
  });

  it('write Serbian in Latin script, never Cyrillic, and with its letters (NFR-I18N-02)', () => {
    const all = [...sr.values()].join(' ');
    expect(all).not.toMatch(/[Ѐ-ӿ]/);
    for (const letter of ['š', 'č', 'ć', 'ž', 'đ']) expect(all).toContain(letter);
    // The words that lose their meaning without the diacritic are written with it.
    expect(FORM_TEXTS.sr.words).toBe('{count} od {max} reči');
    expect(FORM_TEXTS.sr.send).toBe('Pošalji');
  });

  it('avoid the calques the UX review found (UX-M1-20)', () => {
    const all = [...sr.values()].join(' ');
    for (const calque of ['Molimo popunite', 'Popuni još jedan', 'Prihvatite uslove da biste nastavili']) expect(all).not.toContain(calque);
  });

  it('say what the star means (UX-M1-21)', () => {
    expect(FORM_TEXTS.en.requiredNote).toContain('*');
    expect(FORM_TEXTS.sr.requiredNote).toContain('(*)');
  });

  it('count in the plural forms of each language', () => {
    expect(countOf(1, FORM_TEXTS.en.word, 'en')).toBe('1 word');
    expect(countOf(85, FORM_TEXTS.en.word, 'en')).toBe('85 words');
    expect(countOf(1, FORM_TEXTS.sr.word, 'sr')).toBe('1 reč');
    expect(countOf(3, FORM_TEXTS.sr.word, 'sr')).toBe('3 reči');
    expect(countOf(21, FORM_TEXTS.sr.word, 'sr')).toBe('21 reč');
    expect(plural(FORM_TEXTS.sr.errorCount, 3, 'sr')).toBe('3 polja za proveru');
    expect(plural(FORM_TEXTS.en.errorCount, 1, 'en')).toBe('1 field to check');
  });

  it('fill only the parts it is given', () => {
    expect(fill('{count} of {max} words', { count: 3 })).toBe('3 of {max} words');
    expect(fill('{constructor}', {})).toBe('{constructor}');
  });
});

describe('the language a form opens in (decision D2)', () => {
  const both: FormLanguage[] = ['en', 'sr'];

  it('is the one chosen earlier in this tab, then the one of the snippet, then the browser’s', () => {
    expect(pickLanguage({ available: both, chosen: 'en', requested: 'sr', browser: ['sr-RS'] })).toBe('en');
    expect(pickLanguage({ available: both, requested: 'sr', browser: ['en-GB'] })).toBe('sr');
    expect(pickLanguage({ available: both, browser: ['sr-Latn-RS', 'en'] })).toBe('sr');
    expect(pickLanguage({ available: both, browser: ['de-DE', 'en-US'] })).toBe('en');
    expect(pickLanguage({ available: both, browser: ['de-DE'] })).toBe('en');
  });

  it('reads the languages close to Serbian as Serbian', () => {
    for (const tag of ['hr-HR', 'bs', 'cnr', 'sh', 'sr-Cyrl-RS']) expect(pickLanguage({ available: both, browser: [tag] })).toBe('sr');
  });

  it('reads an Accept-Language header by its weights', () => {
    expect(browserLanguages('en-GB;q=0.4, sr-RS;q=0.9, de;q=0.8')).toEqual(['sr', 'en']);
    expect(browserLanguages('*, de')).toEqual([]);
    expect(browserLanguages('sr;q=0')).toEqual([]);
    expect(pickLanguage({ available: both, browser: 'de-AT,de;q=0.9,sr;q=0.5' })).toBe('sr');
  });

  it('takes only a language the form has, and nothing that is not a language', () => {
    expect(pickLanguage({ available: ['en'], requested: 'sr', browser: ['sr'] })).toBe('en');
    expect(pickLanguage({ available: ['sr'], browser: ['en'] })).toBe('sr');
    for (const requested of ['SR', 'sr-RS', '<script>', { toString: () => 'sr' }, ['sr'], null]) expect(pickLanguage({ available: both, requested })).toBe('en');
  });
});
