// M3-FE-01 (ADR-09): the definition is read defensively, a message says how to fix its field in the
// form's language, the link syntax of the office's texts makes only safe links, and a file is
// checked before it is sent. The rule interpreter itself is held by the shared vectors of
// confera_be (tests/form-rule-vectors.test.ts).
import { describe, expect, it } from 'vitest';

import { DefinitionError, readDefinition, readPublishedForm, textOf } from '../packages/form-renderer/src/definition';
import { checkFile, extensionsOf, typesText } from '../packages/form-renderer/src/FileField';
import { messageFor } from '../packages/form-renderer/src/messages';
import { hrefOf, parseSafeText } from '../packages/form-renderer/src/safe-text';
import fixture from '../e2e/servers/public-forms.json';
import vectors from '../packages/api-client/openapi/form-rule-vectors.json';

const SEEDED = readDefinition(vectors.seededAbstractDefinition);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
type Mutable = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- a definition taken apart on purpose

describe('reading a definition (no code from data)', () => {
  it('reads every published form of the fixture, and the definitions of the vectors', () => {
    for (const form of Object.values(fixture.forms)) expect(() => readPublishedForm(form)).not.toThrow();
    expect(() => readDefinition(vectors.definition)).not.toThrow();
  });

  it.each([
    ['an unknown kind', (d: Mutable) => (d.sections[0].fields[0].kind = 'html')],
    ['a pattern that is not in the catalogue', (d: Mutable) => (d.sections[1].fields[4].rules.pattern = 'anything')],
    ['a pattern without its expression', (d: Mutable) => delete d.patterns.orcid],
    ['an expression that is no expression', (d: Mutable) => (d.patterns.orcid = '([')],
    ['a key an object already has', (d: Mutable) => (d.sections[0].fields[0].key = 'constructor')],
    ['a key that is not a plain name', (d: Mutable) => (d.sections[0].fields[0].key = '__proto__')],
    ['a key with a dot', (d: Mutable) => (d.sections[0].fields[0].key = 'a.b')],
    ['two fields with one key', (d: Mutable) => d.sections[0].fields.push(clone(d.sections[0].fields[0]))],
    ['a condition on a field that does not exist', (d: Mutable) => (d.sections[2].visibleWhen = { field: 'nothing', in: ['x'] })],
    ['a condition of another shape', (d: Mutable) => (d.sections[2].visibleWhen = { field: 'participationType', matches: '.*' })],
    ['a file field without its rule', (d: Mutable) => (d.sections[3].fields[0].rules.file = null)],
    ['a file type that is not in the catalogue', (d: Mutable) => (d.sections[3].fields[0].rules.file.accept = ['exe'])],
    ['a choice without options', (d: Mutable) => (d.sections[0].fields[0].options = [])],
    ['a block that allows fewer than it needs', (d: Mutable) => (d.sections[1].repeat.max = 0)],
    ['a file inside the block of authors', (d: Mutable) => d.sections[1].fields.push(clone(d.sections[3].fields[0]))],
    ['another schema version', (d: Mutable) => (d.schemaVersion = 2)],
    ['an unknown form type', (d: Mutable) => (d.type = 'survey')],
    ['a missing text', (d: Mutable) => delete d.texts.consent],
  ])('refuses %s', (_what, change) => {
    const definition = clone(vectors.seededAbstractDefinition) as Mutable;
    change(definition);
    expect(() => readDefinition(definition)).toThrow(DefinitionError);
  });

  it('a text in Serbian falls back to English (ADR-23)', () => {
    expect(textOf({ en: 'Keywords', sr: 'Ključne reči' }, 'sr')).toBe('Ključne reči');
    expect(textOf({ en: 'Keywords' }, 'sr')).toBe('Keywords');
    expect(textOf({ en: 'Keywords', sr: '  ' }, 'sr')).toBe('Keywords');
    expect(textOf(null, 'en')).toBe('');
  });

  it('a form that is not published is "not open yet"; a passed deadline is "closed"', () => {
    const base = fixture.forms['itema-2026-closed'];
    expect(readPublishedForm(base).state).toBe('closed');
    expect(readPublishedForm({ ...base, closedReason: 'not_published' }).state).toBe('not_open');
    expect(readPublishedForm(fixture.forms['itema-2026-abstract']).state).toBe('open');
  });
});

describe('messages say how to fix it, in the form’s language (FR-FORM-13)', () => {
  it('naming the field, and in the block of authors the author', () => {
    expect(messageFor({ path: 'title', code: 'required' }, SEEDED, 'en')).toBe('Fill in “Title”');
    expect(messageFor({ path: 'participationType', code: 'required' }, SEEDED, 'sr')).toBe('Izaberite odgovor za „Kako učestvujete?“');
    expect(messageFor({ path: 'authors[1].institution', code: 'required' }, SEEDED, 'en')).toBe('Author 2: Fill in “Institution”');
    expect(messageFor({ path: 'authors[0].orcid', code: 'pattern' }, SEEDED, 'sr')).toBe('Autor 1: Unesite ORCID iD kao četiri grupe od po četiri cifre, na primer 0000-0002-1825-0097');
    expect(messageFor({ path: 'authors[2].email', code: 'notAnEmail' }, SEEDED, 'en')).toBe('Author 3: Enter an email address like name@university.edu');
    expect(messageFor({ path: 'biographies', code: 'required' }, SEEDED, 'en')).toBe('Add a file for “Biographies with photos of all authors”');
    expect(messageFor({ path: 'consent', code: 'required' }, SEEDED, 'en')).toBe('Accept the terms to send your abstract');
    expect(messageFor({ path: 'authors', code: 'tooManyItems' }, SEEDED, 'en')).toBe('You can add up to 10 authors.');
  });

  it('the word limit counts what the field holds', () => {
    const text = Array.from({ length: 503 }, (_, i) => `reč${i}`).join(' ');
    expect(messageFor({ path: 'abstract', code: 'tooManyWords' }, SEEDED, 'en', text)).toBe('503 of 500 words. Shorten the text by 3 words.');
    expect(messageFor({ path: 'abstract', code: 'tooManyWords' }, SEEDED, 'sr', text)).toBe('503 od 500 reči. Skratite tekst za 3 reči.');
  });

  it('a code or a path the form does not know gets a message, never the code', () => {
    expect(messageFor({ path: 'title', code: 'somethingNew' }, SEEDED, 'en')).toBe('Check this field: the form could not accept what it holds.');
    expect(messageFor({ path: 'nowhere', code: 'required' }, SEEDED, 'sr')).toBe('Proverite ovo polje: obrazac nije mogao da prihvati ono što je upisano.');
  });
});

describe('the one link syntax of the office’s texts (ADR-09, D6)', () => {
  const links = { terms: 'https://www.example.test/terms', privacy: null };

  it('a named link goes to the conference’s address; without one it is its label', () => {
    const [, terms, , privacy] = parseSafeText('I accept the [terms](terms) and the [privacy notice](privacy).');
    expect(terms).toEqual({ type: 'link', text: 'terms', target: 'terms' });
    expect(hrefOf((terms as { target: string }).target, links)).toBe('https://www.example.test/terms');
    expect(hrefOf((privacy as { target: string }).target, links)).toBeNull();
  });

  it('makes a link of an https address only, and never of an address the conference gives that is not https', () => {
    expect(hrefOf('https://www.example.test/guide', {})).toBe('https://www.example.test/guide');
    for (const address of ['javascript:alert(1)', 'http://evil.example.com', 'data:text/html,x', '//evil.example.test', 'https://user:pw@example.test/']) expect(hrefOf(address, {}), address).toBeNull();
    expect(hrefOf('terms', { terms: 'javascript:alert(1)' })).toBeNull();
    expect(hrefOf('terms', { terms: 'http://example.test/terms' })).toBeNull();
  });
});

describe('a file before it is sent (FR-FORM-10)', () => {
  const rule = { accept: ['pdf', 'docx', 'doc', 'jpeg'] as const, maxBytes: 20 * 1024 * 1024 };

  it('by the extension of its name, a JPEG by either of its two', () => {
    expect(extensionsOf(rule)).toEqual(['pdf', 'docx', 'doc', 'jpg', 'jpeg']);
    expect(typesText(rule)).toBe('.pdf, .docx, .doc, .jpg');
    expect(checkFile({ name: 'Rad.PDF', size: 10 }, rule)).toBeNull();
    expect(checkFile({ name: 'slika.jpeg', size: 10 }, rule)).toBeNull();
    expect(checkFile({ name: 'program.exe', size: 10 }, rule)).toEqual({ code: 'file_type' });
    expect(checkFile({ name: 'bez-tacke', size: 10 }, rule)).toEqual({ code: 'file_type' });
  });

  it('20 MB is taken, one byte more is not; an empty file is not', () => {
    expect(checkFile({ name: 'a.pdf', size: 20 * 1024 * 1024 }, rule)).toBeNull();
    expect(checkFile({ name: 'a.pdf', size: 20 * 1024 * 1024 + 1 }, rule)).toEqual({ code: 'file_too_large', maxBytes: 20 * 1024 * 1024 });
    expect(checkFile({ name: 'a.pdf', size: 0 }, rule)).toEqual({ code: 'file_empty' });
  });
});
