import { describe, expect, it } from 'vitest';

import { createDraftStorage } from './safe-storage';
import { isEmailAddress, wordsOver } from './rules';
import { countOf, countWords, fill, SPIKE_FORM_TEXTS } from './texts';

function fakeStorage(overrides: Partial<Storage> = {}): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: () => null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
    ...overrides,
  };
}
const refuse = (): never => {
  throw new DOMException('The operation is insecure.', 'SecurityError');
};

describe('draft storage in a browser that refuses storage (FR-FORM-18)', () => {
  it('uses the tab storage when it works', () => {
    const real = fakeStorage();
    const storage = createDraftStorage(() => real);
    storage.set('draft', 'text');
    expect(storage.persistent).toBe(true);
    expect(real.getItem('draft')).toBe('text');
    expect(storage.get('draft')).toBe('text');
    storage.remove('draft');
    expect(storage.get('draft')).toBeNull();
  });

  it('falls back to memory when even reaching for the storage throws', () => {
    const storage = createDraftStorage(refuse);
    expect(storage.persistent).toBe(false);
    storage.set('draft', 'text');
    expect(storage.get('draft')).toBe('text');
  });

  it('falls back to memory when the storage throws on first use', () => {
    const storage = createDraftStorage(() => fakeStorage({ setItem: refuse }));
    expect(storage.persistent).toBe(false);
    storage.set('draft', 'text');
    expect(storage.get('draft')).toBe('text');
  });

  it('falls back to memory when there is no storage at all (a server)', () => {
    const storage = createDraftStorage(() => undefined);
    expect(storage.persistent).toBe(false);
    expect(storage.get('draft')).toBeNull();
  });

  it('keeps working when the storage starts to fail later', () => {
    let broken = false;
    const real = fakeStorage();
    const storage = createDraftStorage(() => ({
      ...real,
      setItem: (k: string, v: string) => (broken ? refuse() : real.setItem(k, v)),
      getItem: (k: string) => (broken ? refuse() : real.getItem(k)),
      removeItem: (k: string) => (broken ? refuse() : real.removeItem(k)),
    }));
    storage.set('a', '1');
    broken = true;
    expect(() => storage.set('b', '2')).not.toThrow();
    expect(storage.get('b')).toBe('2');
    expect(() => storage.remove('a')).not.toThrow();
  });
});

describe('texts of the form', () => {
  it('both languages have every text, and none is empty', () => {
    expect(Object.keys(SPIKE_FORM_TEXTS.sr).sort()).toEqual(Object.keys(SPIKE_FORM_TEXTS.en).sort());
    for (const language of ['en', 'sr'] as const) {
      for (const [key, text] of Object.entries(SPIKE_FORM_TEXTS[language])) {
        // A noun is a text per plural form: each of them is a text.
        for (const one of typeof text === 'string' ? [text] : Object.values<string>(text)) expect(one.trim(), `${language}.${key}`).not.toBe('');
      }
    }
  });

  it('both languages have the same parts in braces', () => {
    const parts = (text: string) => [...text.matchAll(/\{[a-z]+\}/g)].map((m) => m[0]).sort();
    for (const key of Object.keys(SPIKE_FORM_TEXTS.en) as Array<keyof typeof SPIKE_FORM_TEXTS.en>) {
      const en = SPIKE_FORM_TEXTS.en[key];
      const sr = SPIKE_FORM_TEXTS.sr[key];
      if (typeof en === 'string' && typeof sr === 'string') expect(parts(sr), key).toEqual(parts(en));
    }
  });

  it('a noun after a number takes the plural form of the language (Intl.PluralRules)', () => {
    expect([1, 2, 5, 21, 85].map((n) => countOf(n, SPIKE_FORM_TEXTS.en.word, 'en'))).toEqual(['1 word', '2 words', '5 words', '21 words', '85 words']);
    expect([1, 2, 5, 21, 22, 85].map((n) => countOf(n, SPIKE_FORM_TEXTS.sr.word, 'sr'))).toEqual(['1 reč', '2 reči', '5 reči', '21 reč', '22 reči', '85 reči']);
  });

  it('the message of a text over its limit, as the UX review proposes it', () => {
    const over = (language: 'en' | 'sr') => fill(SPIKE_FORM_TEXTS[language].wordsOver, { count: 385, max: 300, over: countOf(85, SPIKE_FORM_TEXTS[language].word, language) });
    expect(over('en')).toBe('385 of 300 words. Shorten the abstract by 85 words.');
    expect(over('sr')).toBe('385 od 300 reči. Skratite apstrakt za 85 reči.');
  });
});

describe('rules of the form (./rules), the client copy of what the API checks', () => {
  it.each([
    ['marta@example.test', true],
    // A dotted name, a hyphen in a label and several labels; an invented university (NFR-PRIV-05).
    ['marta.kovac@ef.uni-primer.example.test', true],
    [' marta@example.test ', true],
    ['marta@example', false],
    ['marta', false],
    ['marta@@example.test', false],
    ['marta kovac@example.test', false],
    ['@example.test', false],
    ['marta@.test', false],
    ['', false],
  ])('%j is an email address: %s', (value, expected) => {
    expect(isEmailAddress(value)).toBe(expected);
  });

  it('counts the words over a limit', () => {
    expect(wordsOver('one two three', 2)).toBe(1);
    expect(wordsOver('one two', 2)).toBe(0);
    expect(wordsOver(Array.from({ length: 385 }, (_, i) => `w${i}`).join(' '), 300)).toBe(85);
  });

  it('fills the parts in braces and leaves unknown ones', () => {
    expect(fill('{count} of {max} words', { count: 12, max: 300 })).toBe('12 of 300 words');
    expect(fill('Name of author {n}', {})).toBe('Name of author {n}');
  });

  it.each([
    ['', 0],
    ['   ', 0],
    ['one', 1],
    ['  two   words ', 2],
    ['Đorđe Šćepanović piše\nčetiri reči', 5],
    ['tab\tseparated', 2],
  ])('counts the words of %j as %s', (text, expected) => {
    expect(countWords(text)).toBe(expected);
  });
});
