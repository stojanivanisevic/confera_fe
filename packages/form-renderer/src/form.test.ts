import { describe, expect, it } from 'vitest';

import { createDraftStorage } from './safe-storage';
import { countWords, fill, SPIKE_FORM_TEXTS } from './texts';

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
      for (const [key, text] of Object.entries(SPIKE_FORM_TEXTS[language])) expect(text.trim(), `${language}.${key}`).not.toBe('');
    }
  });

  it('both languages have the same parts in braces', () => {
    const parts = (text: string) => [...text.matchAll(/\{[a-z]+\}/g)].map((m) => m[0]).sort();
    for (const key of Object.keys(SPIKE_FORM_TEXTS.en) as Array<keyof typeof SPIKE_FORM_TEXTS.en>) {
      expect(parts(SPIKE_FORM_TEXTS.sr[key]), key).toEqual(parts(SPIKE_FORM_TEXTS.en[key]));
    }
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
