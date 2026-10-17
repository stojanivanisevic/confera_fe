// M3-FE-01 (ADR-09): the definition is read defensively, and the rule interpreter of the browser
// gives the API's paths and codes. These are the browser's own vectors; the shared vectors of
// confera_be are run by tests/form-rule-vectors.test.ts once they are vendored.
import { describe, expect, it } from 'vitest';

import { DefinitionError, readDefinition, readPublishedForm, textOf, type FormDefinition } from '../packages/form-renderer/src/definition';
import { messageFor } from '../packages/form-renderer/src/messages';
import { answersToSend, hasUrl, isEmailAddress, matchesPattern, validate, type Answers } from '../packages/form-renderer/src/rules';
import { safeHref, textParts } from '../packages/form-renderer/src/safe-text';
import fixture from '../e2e/servers/public-forms.json';

const ABSTRACT = readPublishedForm(fixture.forms['itema-2026-abstract']).definition;
const base = fixture.forms['spike-abstract'].definition;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('reading a definition (no code from data)', () => {
  it('reads every published form of the fixture', () => {
    for (const form of Object.values(fixture.forms)) expect(() => readPublishedForm(form)).not.toThrow();
  });

  it.each([
    ['an unknown kind', (d: Record<string, any>) => (d.sections[0].fields[0].kind = 'html')],
    ['a pattern that is not in the catalogue', (d: Record<string, any>) => (d.sections[0].fields[0].rules = { pattern: '^(a+)+$' })],
    ['a key an object already has', (d: Record<string, any>) => (d.sections[0].fields[0].key = 'constructor')],
    ['a key that is not a plain name', (d: Record<string, any>) => (d.sections[0].fields[0].key = '__proto__')],
    ['a key with a dot', (d: Record<string, any>) => (d.sections[0].fields[0].key = 'a.b')],
    ['two fields with one key', (d: Record<string, any>) => d.sections[0].fields.push(clone(d.sections[0].fields[0]))],
    ['a field named consent', (d: Record<string, any>) => (d.sections[0].fields[0].key = 'consent')],
    ['a condition on a key that is not a name', (d: Record<string, any>) => (d.sections[0].fields[1].visibleWhen = { field: '__proto__', equals: 'x' })],
    ['a condition nested too deep', (d: Record<string, any>) => (d.sections[0].fields[1].visibleWhen = { not: { not: { not: { not: { not: { not: { field: 'title', filled: true } } } } } } })],
    ['a condition of an unknown shape', (d: Record<string, any>) => (d.sections[0].fields[1].visibleWhen = { field: 'title', matches: '.*' })],
    ['a file field without its rule', (d: Record<string, any>) => d.sections[0].fields.push({ key: 'paper', kind: 'file', required: true, label: { en: 'Paper' } })],
    ['a choice without options', (d: Record<string, any>) => d.sections[0].fields.push({ key: 'member', kind: 'radio', required: true, label: { en: 'Member' } })],
    ['a block that allows fewer than it needs', (d: Record<string, any>) => (d.sections[1].repeat = { min: 3, max: 2, itemLabel: { en: 'Author {n}' } })],
    ['no consent version', (d: Record<string, any>) => (d.consent.version = '')],
    ['an unknown form type', (d: Record<string, any>) => (d.type = 'survey')],
  ])('refuses %s', (_what, change) => {
    const definition = clone(base) as Record<string, any>;
    change(definition);
    expect(() => readDefinition(definition)).toThrow(DefinitionError);
  });

  it('a text in Serbian falls back to English (ADR-23)', () => {
    expect(textOf({ en: 'Keywords', sr: 'Ključne reči' }, 'sr')).toBe('Ključne reči');
    expect(textOf({ en: 'Keywords' }, 'sr')).toBe('Keywords');
    expect(textOf({ en: 'Keywords', sr: '  ' }, 'sr')).toBe('Keywords');
    expect(textOf(null, 'en')).toBe('');
  });
});

/** Answers of the abstract form, complete, of an author who pays herself. */
function complete(): { top: Record<string, string>; blocks: Record<string, Record<string, string>[]>; consent: boolean } {
  return {
    top: {
      participation: 'with_abstract', title: 'Održivi turizam', keywords: 'turizam', abstract: 'Kratko.', biographies: 'upload-1', member: 'no', attendance: 'in_person', publication: 'proceedings',
      discount: 'none', payer: 'individual', payerName: '', payerAddress: '', payerTaxNumber: '', payerRegistrationNumber: '', billingEmail: '', paymentMethod: 'bank_wire', heardFrom: '', comments: '',
    },
    blocks: { authors: [{ name: 'Marta Kovač', institution: 'Univerzitet Primer', institutionAddress: '', orcid: '', email: 'marta@example.test', phone: '' }] },
    consent: true,
  };
}
const check = (answers: Answers, definition: FormDefinition = ABSTRACT) => validate(definition, answers);

describe('the rule interpreter: paths and codes as the API gives them', () => {
  it('a complete form has no error', () => {
    expect(check(complete())).toEqual([]);
  });

  it('required fields, the consent and the block of the first author', () => {
    const answers = complete();
    answers.top.title = '   ';
    answers.blocks.authors![0]!.email = '';
    answers.consent = false;
    expect(check(answers)).toEqual([
      { path: 'title', code: 'required' },
      { path: 'authors[0].email', code: 'required' },
      { path: 'consent', code: 'consent_required' },
    ]);
  });

  it('the email of a co-author is optional, the email of the first author is not (requiredOnlyInFirst)', () => {
    const answers = complete();
    answers.blocks.authors!.push({ name: 'Đorđe Šćepanović', institution: 'Institut', institutionAddress: '', orcid: '', email: '', phone: '' });
    expect(check(answers)).toEqual([]);
    answers.blocks.authors![1]!.email = 'đorđe@';
    expect(check(answers)).toEqual([{ path: 'authors[1].email', code: 'email' }]);
  });

  it('the employer’s fields are required only when the employer pays', () => {
    const answers = complete();
    answers.top.payer = 'employer';
    expect(check(answers).map((e) => e.path)).toEqual(['payerName', 'payerAddress', 'payerTaxNumber', 'payerRegistrationNumber', 'billingEmail']);
    Object.assign(answers.top, { payerName: 'Univerzitet Primer', payerAddress: 'Primer 1, Beograd', payerTaxNumber: '10203040', payerRegistrationNumber: '12345678', billingEmail: 'racuni@example.test' });
    expect(check(answers)).toEqual([{ path: 'payerTaxNumber', code: 'pattern', params: { pattern: 'taxNumber' } }]);
  });

  it('words, length, options, patterns and web addresses', () => {
    const answers = complete();
    answers.top.abstract = Array.from({ length: 501 }, (_, i) => `reč${i}`).join(' ');
    answers.top.title = `${'š'.repeat(301)}`;
    answers.top.member = 'maybe';
    answers.blocks.authors![0]!.orcid = '0000-0002-1825-0098'; // wrong check digit
    answers.blocks.authors![0]!.institution = 'Visit www.example.test';
    expect(check(answers)).toEqual([
      { path: 'title', code: 'too_long', params: { max: 300 } },
      { path: 'abstract', code: 'too_many_words', params: { max: 500, count: 501 } },
      { path: 'authors[0].institution', code: 'no_url' },
      { path: 'authors[0].orcid', code: 'pattern', params: { pattern: 'orcid' } },
      { path: 'member', code: 'not_an_option' },
    ]);
  });

  it('a hidden field is neither checked nor sent', () => {
    const answers = complete();
    answers.top.payerTaxNumber = 'not a number';
    expect(check(answers)).toEqual([]);
    expect(answersToSend(ABSTRACT, answers).top).not.toHaveProperty('payerTaxNumber');
  });

  it('answers have no prototype: a key like a member of every object is just a key', () => {
    const sent = answersToSend(ABSTRACT, complete());
    expect(Object.getPrototypeOf(sent.top)).toBeNull();
    expect(Object.getPrototypeOf(sent.blocks.authors![0])).toBeNull();
  });
});

describe('the rules themselves', () => {
  it.each([
    ['marta@example.test', true],
    ['marta.kovac@ef.uni-primer.example.test', true],
    ['a@b.co', true],
    ['Marta <marta@example.test>', false],
    ['marta@example.test, ana@example.test', false],
    ['"marta"@example.test', false],
    ['marta@example', false],
    ['marta\u0000@example.test', false],
    [`${'a'.repeat(250)}@b.cd`, false],
  ])('the one address rule (ADR-09): %j is %s', (value, ok) => {
    expect(isEmailAddress(value)).toBe(ok);
  });

  it.each([
    ['orcid', '0000-0002-1825-0097', true],
    ['orcid', '0000-0001-5109-3700', true],
    ['orcid', '0000-0002-1694-233X', true],
    ['orcid', '0000-0002-1825-0098', false],
    ['orcid', '0000000218250097', false],
    ['phone', '+381 11 123 4567', true],
    ['phone', '011/123-456', true],
    ['phone', '12345', false],
    ['phone', 'call me', false],
    ['taxNumber', '100002010', true],
    ['taxNumber', '10000201', false],
    ['registrationNumber', '07001703', true],
    ['registrationNumber', '0700170', false],
  ] as const)('the %s pattern: %j is %s', (pattern, value, ok) => {
    expect(matchesPattern(pattern, value)).toBe(ok);
  });

  it.each([
    ['https://spam.example.test', true],
    ['see www.example.test', true],
    ['buy at cheap-pills.shop', true],
    ['Ekonomski fakultet, Univerzitet u Beogradu', false],
    ['Ph.D. Marta Kovač', false],
    ['e.g. tourism', false],
  ])('a web address in %j: %s', (value, found) => {
    expect(hasUrl(value)).toBe(found);
  });
});

describe('messages say how to fix it, in the form’s language (FR-FORM-13)', () => {
  it('naming the field, and in a block the block', () => {
    expect(messageFor({ path: 'title', code: 'required' }, ABSTRACT, 'en')).toBe('Fill in “Title of the paper”');
    expect(messageFor({ path: 'participation', code: 'required' }, ABSTRACT, 'sr')).toBe('Izaberite odgovor za „Kako učestvujete?“');
    expect(messageFor({ path: 'authors[1].institution', code: 'required' }, ABSTRACT, 'en')).toBe('Author 2: Fill in “Institution of author 2”');
    expect(messageFor({ path: 'authors[0].orcid', code: 'pattern' }, ABSTRACT, 'sr')).toBe('Autor 1: Unesite ORCID iD kao 16 cifara u grupama od po četiri, na primer 0000-0002-1825-0097');
    expect(messageFor({ path: 'biographies', code: 'required' }, ABSTRACT, 'en')).toBe('Add a file for “Biographies with photos of all authors”');
    expect(messageFor({ path: 'consent', code: 'consent_required' }, ABSTRACT, 'en')).toBe('Accept the terms to send your abstract');
  });

  it('a code or a path the form does not know gets a message, never the code', () => {
    expect(messageFor({ path: 'title', code: 'something_new' }, ABSTRACT, 'en')).toBe('Check this field: the form could not accept what it holds.');
    expect(messageFor({ path: 'nowhere', code: 'required' }, ABSTRACT, 'sr')).toBe('Proverite ovo polje: obrazac nije mogao da prihvati ono što je upisano.');
  });
});

describe('the one link syntax of the office’s texts (ADR-09)', () => {
  it('makes a link of an https address only', () => {
    expect(textParts('I accept the [terms](https://www.example.test/terms).')).toEqual([{ text: 'I accept the ' }, { text: 'terms', href: 'https://www.example.test/terms' }, { text: '.' }]);
    for (const address of ['javascript:alert(1)', 'http://evil.example.com', 'data:text/html,x', '//evil.example.test', 'https://user:pw@example.test/']) {
      const parts = textParts(`[terms](${address})`);
      expect(parts.some((part) => part.href !== undefined), address).toBe(false);
      expect(parts[0], address).toEqual({ text: 'terms' });
      expect(safeHref(address)).toBeNull();
    }
  });

  it('leaves markup as text', () => {
    expect(textParts('<img src=x onerror=alert(1)> [a](https://example.test)')[0]).toEqual({ text: '<img src=x onerror=alert(1)> ' });
  });
});
