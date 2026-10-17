// @vitest-environment jsdom
//
// The form renderer (M3-FE-01, M3-FE-02, M3-FE-04) on the abstract form of FR-FORM-04
// (e2e/servers/public-forms.json): blocks of authors with the limit (D7), the question before a
// filled block is removed (D4), the focus and the announcements (UX-M1-09, 10), the employer's
// fields shown on a condition (FR-FORM-05), the API's refusals on the same fields, one submit per
// form instance, the draft (D3), the warning where storage is refused (UX-M1-13), files, and the
// closed state (FR-DL-02).
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublishedForm } from '../packages/form-renderer/src/definition';
import { FormRenderer } from '../packages/form-renderer/src/FormRenderer';
import { createDraftStorage, type DraftStorage } from '../packages/form-renderer/src/safe-storage';
import { click, fakeApi, PublicApiError, publishedForm, settle, typeInto, type FakeApi } from './support/form-harness';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView = function scrollIntoView() {};

const ABSTRACT = publishedForm('itema-2026-abstract');
const DRAFT_KEY = 'confera:draft:itema-2026-abstract:3';

let container: HTMLElement;
let root: Root;
let api: FakeApi;
let storage: () => DraftStorage;

async function mount(form: PublishedForm = ABSTRACT, language: 'en' | 'sr' = 'en') {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<FormRenderer form={form} language={language} api={api} storage={storage} />);
    await Promise.resolve();
  });
  await settle();
}

const field = <T extends HTMLElement = HTMLInputElement>(name: string) => container.querySelector<T>(`[name="${name}"]`)!;
const buttonNamed = (name: string) => [...container.querySelectorAll<HTMLButtonElement>('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent) === name);
const radio = (name: string, value: string) => container.querySelector<HTMLInputElement>(`input[type="radio"][name="${name}"][value="${value}"]`)!;
const send = async () => {
  await click(container.querySelector<HTMLButtonElement>('button[type="submit"]')!);
  await settle();
};
const items = () => [...(container.querySelector('[data-confera-errors]')?.querySelectorAll('li a') ?? [])].map((a) => a.textContent);
const announced = () => container.querySelector('[data-confera-announce]')!.textContent;
const choose = async (element: HTMLInputElement | HTMLSelectElement, value?: string) => {
  await act(async () => {
    if (element instanceof HTMLSelectElement) {
      element.value = value ?? '';
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } else element.click();
    await Promise.resolve();
  });
};
const file = (name: string, size: number, type = 'application/pdf') => {
  const made = new File(['x'], name, { type });
  Object.defineProperty(made, 'size', { value: size });
  return made;
};
const dropFile = async (key: string, chosen: File) => {
  const input = container.querySelector<HTMLInputElement>(`[data-confera-file="${key}"] input[type="file"]`)!;
  Object.defineProperty(input, 'files', { configurable: true, value: [chosen] });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
  });
  await settle();
};

/** Everything the abstract form asks for, as an author who pays herself. */
async function fillAll() {
  await choose(radio('participation', 'with_abstract'));
  await typeInto(field('title'), 'Održivi turizam na Balkanu');
  await typeInto(field('keywords'), 'turizam, održivost, Balkan');
  await typeInto(field<HTMLTextAreaElement>('abstract'), 'Kratak apstrakt o održivom turizmu.');
  await typeInto(field('authors.1.name'), 'Marta Kovač');
  await typeInto(field('authors.1.institution'), 'Ekonomski fakultet, Univerzitet Primer');
  await typeInto(field('authors.1.email'), 'marta@example.test');
  await dropFile('biographies', file('Biografije autora – Šćepanović.pdf', 1024 * 1024));
  await choose(radio('member', 'no'));
  await choose(radio('attendance', 'in_person'));
  await choose(radio('publication', 'proceedings'));
  await choose(field<HTMLSelectElement>('discount'), 'none');
  await choose(radio('payer', 'individual'));
  await choose(radio('paymentMethod', 'bank_wire'));
  await click(field('consent'));
}

beforeEach(() => {
  window.sessionStorage.clear();
  api = fakeApi();
  storage = () => createDraftStorage(() => window.sessionStorage);
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  container.remove();
});

describe('authors (FR-FORM-03; UX-M1-09, 10; D4, D7)', () => {
  it('after adding, the focus is in the first field of the new author, and it is announced', async () => {
    await mount();
    await click(buttonNamed('Add author')!);
    expect(document.activeElement).toBe(field('authors.100.name'));
    expect(announced()).toBe('Author 2 added.');
    expect(container.querySelector('label[for="field-authors-100-name"]')!.textContent).toContain('First and last name of author 2');
  });

  it('removing an author with nothing written asks nothing', async () => {
    await mount();
    await click(buttonNamed('Add author')!);
    await click(buttonNamed('Remove author 2')!);
    expect(field('authors.100.name')).toBeNull();
    expect(container.querySelector('[data-confera-remove-question]')).toBeNull();
    expect(announced()).toBe('Author 2 removed.');
  });

  it('removing an author that holds data asks first, in the form; Keep keeps everything', async () => {
    await mount();
    await click(buttonNamed('Add author')!);
    await typeInto(field('authors.100.name'), 'Đorđe Šćepanović');
    await click(buttonNamed('Remove author 2')!);
    const question = container.querySelector<HTMLElement>('[data-confera-remove-question]')!;
    expect(question.textContent).toContain('Remove author 2, Đorđe Šćepanović? What you wrote for this author is lost.');
    expect(document.activeElement).toBe(question);
    expect(container.querySelector('[role="dialog"]')).toBeNull(); // no dialog inside a form (ADR-07)
    await click([...question.querySelectorAll('button')].find((b) => b.textContent === 'Keep')!);
    expect(field('authors.100.name').value).toBe('Đorđe Šćepanović');
    expect(container.querySelector('[data-confera-remove-question]')).toBeNull();
    expect(document.activeElement).toBe(field('authors.100.name'));
  });

  it('Remove removes it, and when the first author goes the form says who now gets the emails', async () => {
    await mount();
    await typeInto(field('authors.1.name'), 'Marta Kovač');
    await click(buttonNamed('Add author')!);
    await typeInto(field('authors.100.name'), 'Đorđe Šćepanović');
    await click(buttonNamed('Remove author 1')!);
    const question = container.querySelector<HTMLElement>('[data-confera-remove-question]')!;
    await click([...question.querySelectorAll('button')].find((b) => b.textContent === 'Remove')!);
    expect(field('authors.1.name')).toBeNull();
    expect(field('authors.100.name').value).toBe('Đorđe Šćepanović');
    expect(container.textContent).toContain('Đorđe Šćepanović is now the corresponding author.');
    expect(document.activeElement).toBe(field('authors.100.name'));
  });

  it('at the limit of the form (D7) the add button goes and a line says the limit, with the office’s address', async () => {
    await mount();
    for (let i = 1; i < 10; i += 1) await click(buttonNamed('Add author')!);
    expect(buttonNamed('Add author')).toBeUndefined();
    expect(container.textContent).toContain('You can add up to 10 authors. For more, write to office@example.test.');
    // From the fourth author on, the notice of the form.
    expect(container.textContent).toContain('Each co-author beyond three adds EUR 30 to the fee.');
  });

  it('only the first author has a phone, and autocomplete for the person filling in (UX-M1-23)', async () => {
    await mount();
    await click(buttonNamed('Add author')!);
    expect(field('authors.1.phone')).not.toBeNull();
    expect(field('authors.100.phone')).toBeNull();
    expect(field('authors.1.name').getAttribute('autocomplete')).toBe('name');
    expect(field('authors.1.email').getAttribute('autocomplete')).toBe('email');
    expect(field('authors.100.name').getAttribute('autocomplete')).toBe('off');
  });
});

describe('fields on a condition (FR-FORM-05)', () => {
  it('the employer’s data appear, and are required, only when the employer pays; hidden, they are not sent', async () => {
    await mount();
    const wrapper = () => container.querySelector<HTMLElement>('[data-confera-field="payerName"]')!;
    expect(wrapper().hidden).toBe(true);
    await choose(radio('payer', 'employer'));
    expect(wrapper().hidden).toBe(false);
    await send();
    expect(items()).toContain('Fill in “Name of the employer”');
    expect(items()).toContain('Fill in “Tax number (PIB)”');
    await typeInto(field('payerName'), 'Univerzitet Primer');
    await typeInto(field('payerTaxNumber'), '1234');
    await send();
    expect(items()).toContain('Enter the tax number (PIB): 9 digits');
    // Back to "I pay": the typed data stay in the controls, but are neither checked nor sent.
    await choose(radio('payer', 'individual'));
    expect(wrapper().hidden).toBe(true);
    expect(field('payerName').value).toBe('Univerzitet Primer');
    expect(items().some((item) => item?.includes('employer') || item?.includes('PIB'))).toBe(false);
  });
});

describe('sending (FR-FORM-13, 14, 15; ADR-08)', () => {
  it('a complete form is sent once, with the token, the idempotency key, the language, the consent and the file', async () => {
    await mount();
    await fillAll();
    expect(container.querySelector('[data-confera-file="biographies"]')!.getAttribute('data-confera-file-state')).toBe('uploaded');
    await send();
    expect(items()).toEqual([]);
    expect(api.calls.submits).toHaveLength(1);
    const [submit] = api.calls.submits;
    expect(submit!.token).toBe('invented-form-token-1');
    expect(submit!.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(api.calls.uploads).toEqual([{ token: 'invented-form-token-1', field: 'biographies', name: 'Biografije autora – Šćepanović.pdf' }]);
    const body = submit!.body as { language: string; formVersion: number; answers: Record<string, string>; blocks: Record<string, Array<Record<string, string>>>; consent: unknown; website: string };
    expect(body.language).toBe('en');
    expect(body.formVersion).toBe(3);
    expect(body.consent).toEqual({ version: '2026-10-terms-1', accepted: true });
    expect(body.website).toBe('');
    expect(body.answers.biographies).toBe('upload-1');
    expect(body.answers.title).toBe('Održivi turizam na Balkanu');
    expect(body.answers).not.toHaveProperty('payerName'); // hidden: not sent
    expect(body.blocks.authors).toEqual([{ name: 'Marta Kovač', institution: 'Ekonomski fakultet, Univerzitet Primer', institutionAddress: '', orcid: '', email: 'marta@example.test', phone: '' }]);
    expect(container.querySelector('[data-confera-reference]')!.textContent).toBe('Your reference: IT-2026-0042');
    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBeNull(); // nothing is kept once it is sent
  });

  it('the API’s refusals come back to their fields, in the form’s words', async () => {
    await mount();
    await fillAll();
    api.failNext(new PublicApiError(422, 'validation_failed', [{ path: 'authors[0].email', code: 'email' }, { path: 'title', code: 'no_url' }]));
    await send();
    expect(items()).toEqual(['Leave out web addresses here', 'Author 1: Enter an email address like name@university.edu']);
    expect(field('title').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(container.querySelector('[data-confera-errors]'));
  });

  it('an expired token: a new one, once, with the same idempotency key', async () => {
    await mount();
    await fillAll();
    api.failNext(new PublicApiError(401, 'form_token_expired'));
    await send();
    expect(api.calls.submits.map((s) => s.token)).toEqual(['invented-form-token-1', 'invented-form-token-2']);
    expect(api.calls.submits[0]!.key).toBe(api.calls.submits[1]!.key);
    expect(container.querySelector('[data-confera-thanks]')).not.toBeNull();
  });

  it.each([
    [new PublicApiError(0, 'network'), 'The form was not sent', 'Check the connection and send again. Nothing you typed is lost.'],
    [new PublicApiError(429, 'too_many_requests', [], null, 300), 'Too many forms were sent from this connection', 'Try again in 5 minutes.'],
    [new PublicApiError(409, 'form_closed'), 'Submissions closed while you were filling in the form', 'Questions? Write to office@example.test.'],
    [new PublicApiError(500, 'internal', [], 'trace-7f3a'), 'Something went wrong on our side', 'mention the code trace-7f3a'],
  ])('%s: the form says what happened and keeps everything', async (error, title, text) => {
    await mount();
    await fillAll();
    api.failNext(error);
    await send();
    const problem = container.querySelector<HTMLElement>('[data-confera-problem]')!;
    expect(problem.textContent).toContain(title);
    expect(problem.textContent).toContain(text);
    expect(document.activeElement).toBe(problem);
    expect(field('title').value).toBe('Održivi turizam na Balkanu');
  });

  it('a file still on its way: Send waits, and says so at the file', async () => {
    await mount();
    await fillAll();
    let finish: (() => void) | undefined;
    api.upload = vi.fn((_s: string, _t: string, _f: string, chosen: File, onProgress: (p: number) => void) => {
      onProgress(10);
      return new Promise((resolve) => (finish = () => resolve({ id: 'upload-late', name: chosen.name, size: chosen.size })));
    });
    await dropFile('biographies', file('Biografije.pdf', 2048));
    await send();
    expect(api.calls.submits).toHaveLength(0);
    expect(container.querySelector('[data-confera-file="biographies"]')!.textContent).toContain('Wait until the file is uploaded, then send.');
    finish!();
    await settle();
    await send();
    expect(api.calls.submits).toHaveLength(1);
  });

  it('“Send another” starts a new form instance with a new key', async () => {
    await mount();
    await fillAll();
    await send();
    const first = api.calls.submits[0]!.key;
    await click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Send another abstract')!);
    await fillAll();
    await send();
    expect(api.calls.submits[1]!.key).not.toBe(first);
  });
});

describe('files (M3-FE-04; FR-FORM-10)', () => {
  it('a file of another type is refused before any upload, with the types', async () => {
    await mount();
    await dropFile('biographies', file('photo.png', 1000, 'image/png'));
    expect(api.calls.uploads).toEqual([]);
    expect(container.querySelector('[data-confera-file="biographies"]')!.textContent).toContain('photo.png is not one of these types: .doc, .docx, .pdf.');
  });

  it('20 MB is accepted, one byte more is refused before the upload, with the limit', async () => {
    await mount();
    await dropFile('biographies', file('exactly.pdf', 20 * 1024 * 1024));
    expect(api.calls.uploads.map((u) => u.name)).toEqual(['exactly.pdf']);
    await dropFile('biographies', file('too-large.pdf', 20 * 1024 * 1024 + 1));
    expect(api.calls.uploads.map((u) => u.name)).toEqual(['exactly.pdf']);
    expect(container.querySelector('[data-confera-file="biographies"]')!.textContent).toContain('too-large.pdf is larger than 20 MB. Choose a smaller file.');
  });

  it('the API’s refusal of a .docx with macros says how to save it without them, in Serbian too', async () => {
    await mount(ABSTRACT, 'sr');
    api.upload = vi.fn(() => Promise.reject(new PublicApiError(422, 'docx_macros')));
    await dropFile('biographies', file('rad.docx', 5000, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'));
    expect(container.querySelector('[data-confera-file="biographies"]')!.textContent).toContain('rad.docx sadrži makroe. U Wordu izaberite Datoteka › Sačuvaj kao');
  });
});

describe('the draft of the tab (D3, FR-FORM-18)', () => {
  it('keeps every field but files and the consent, the authors, the language and the key', async () => {
    await mount();
    await typeInto(field('title'), 'Šta đaci čitaju');
    await click(buttonNamed('Add author')!);
    await typeInto(field('authors.100.name'), 'Đorđe Šćepanović');
    await click([...container.querySelectorAll<HTMLElement>('[role="radio"]')].find((r) => r.textContent === 'Srpski')!);
    await click(field('consent'));
    await settle();
    const draft = JSON.parse(window.sessionStorage.getItem(DRAFT_KEY)!) as { language: string; values: Record<string, string>; rows: Record<string, number[]>; idempotencyKey: string };
    expect(draft.language).toBe('sr');
    expect(draft.rows).toEqual({ authors: [1, 100] });
    expect(draft.values.title).toBe('Šta đaci čitaju');
    expect(draft.values['authors.100.name']).toBe('Đorđe Šćepanović');
    expect(draft.values).not.toHaveProperty('consent');
    expect(Object.keys(draft.values).some((name) => name.includes('biographies'))).toBe(false);
    expect(draft.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('brings everything back after a reload, in the chosen language, and the same key is sent', async () => {
    window.sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ language: 'sr', values: { title: 'Šta đaci čitaju', 'authors.100.name': 'Đorđe Šćepanović', consent: 'yes' }, rows: { authors: [1, 100] }, idempotencyKey: '11111111-2222-4333-8444-555555555555' }),
    );
    await mount();
    expect(field('title').value).toBe('Šta đaci čitaju');
    expect(field('authors.100.name').value).toBe('Đorđe Šćepanović');
    expect(field('consent').checked).toBe(false); // the consent is given when the form is sent
    expect(container.querySelector('[data-confera-form]')!.getAttribute('lang')).toBe('sr');
    expect(container.textContent).toContain('Vratili smo ono što ste ranije upisali u ovoj kartici. Fajlove dodajte ponovo.');
    await fillAll();
    await typeInto(field('authors.100.institution'), 'Fakultet za turizam');
    await send();
    expect(api.calls.submits[0]!.key).toBe('11111111-2222-4333-8444-555555555555');
  });

  it('where storage is refused, the tab asks before it closes while something is typed (UX-M1-13)', async () => {
    storage = () => createDraftStorage(() => undefined);
    await mount();
    const event = () => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(event()).toBe(false);
    await typeInto(field('title'), 'Nešto');
    expect(event()).toBe(true);
    expect(container.textContent).toContain('This browser does not let the form keep a draft.');
  });
});

describe('states of the form (FR-DL-02)', () => {
  it('a closed form says so, with its deadline in the language and the zone of the conference, and has no fields', async () => {
    await mount(publishedForm('itema-2026-closed'), 'sr');
    expect(container.querySelector('[data-confera-state="closed"]')!.textContent).toContain('Ovaj obrazac je zatvoren');
    expect(container.textContent).toContain('Rok je bio 15.03.2026.');
    expect(container.textContent).toContain('Imate pitanje? Pišite na office@example.test.');
    expect(container.querySelector('form')).toBeNull();
    expect(api.token).not.toHaveBeenCalled();
  });

  it('an open form names its deadline and says what the star means', async () => {
    await mount();
    expect(container.textContent).toContain('Kindly complete all mandatory fields, marked *. Open until the end of 15 March 2027 (Central European Time).');
  });
});

describe('the consent (FR-FORM-11; D6)', () => {
  it('links to the documents of the conference, in a new tab that is announced', async () => {
    await mount();
    const links = [...field('consent').closest('label')!.querySelectorAll('a')];
    expect(links.map((a) => [a.textContent, a.getAttribute('href'), a.getAttribute('target'), a.getAttribute('rel')])).toEqual([
      ['terms of publication (opens in a new tab)', 'https://www.example.test/terms', '_blank', 'noopener noreferrer'],
      ['privacy notice (opens in a new tab)', 'https://www.example.test/privacy', '_blank', 'noopener noreferrer'],
    ]);
  });
});
