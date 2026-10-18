// @vitest-environment jsdom
//
// The form renderer (M3-FE-01, M3-FE-02, M3-FE-04) on the seeded abstract form of confera_be
// (e2e/servers/public-forms.json, 'itema-2026-abstract'): the block of authors with the limit (D7),
// the question before a filled block is removed (D4), the focus and the announcements (UX-M1-09,
// 10), sections and fields shown on a condition (FR-FORM-05), the API's refusals on the same fields,
// one submit per form instance, the draft (D3), the warning where storage is refused (UX-M1-13),
// files, the consent links (D6) and the closed state (FR-DL-02).
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
/** The block keys of the renderer: the first block is 1, the ones added later 100, 101, … */
const SECOND = 100;

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
const choose = async (element: HTMLInputElement) => {
  await act(async () => {
    element.click();
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

/** Everything the abstract form asks for, as an author with a paper who pays herself. */
async function fillAll() {
  await choose(radio('participationType', 'with_paper'));
  await typeInto(field('authors.1.firstName'), 'Marta');
  await typeInto(field('authors.1.lastName'), 'Kovač');
  await typeInto(field('authors.1.institution'), 'Ekonomski fakultet, Univerzitet Primer');
  await typeInto(field('authors.1.email'), 'marta@EXAMPLE.test');
  await typeInto(field('title'), 'Održivi turizam na Balkanu');
  await typeInto(field<HTMLTextAreaElement>('abstract'), 'Kratak apstrakt o održivom turizmu.');
  await typeInto(field('keywords'), 'turizam, održivost, Balkan');
  await choose(radio('publication', 'proceedings'));
  await dropFile('biographies', file('Biografije autora – Šćepanović.pdf', 1024 * 1024));
  await choose(radio('membership', 'no'));
  await choose(radio('attendance', 'in_person'));
  await choose(radio('discountClaim', 'no'));
  await choose(radio('payer', 'individual'));
  await typeInto(field('billingAddress'), 'Izmišljena 1, Beograd');
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
    await click(buttonNamed('Add an author')!);
    expect(document.activeElement).toBe(field(`authors.${SECOND}.firstName`));
    expect(announced()).toBe('Author 2 added.');
    expect(container.querySelector(`#field-authors-${SECOND}-title`)!.textContent).toBe('Author 2');
    // A screen reader hears which author a field belongs to.
    expect(field(`authors.${SECOND}.firstName`).getAttribute('aria-describedby')).toContain(`field-authors-${SECOND}-title`);
  });

  it('removing an author with nothing written asks nothing', async () => {
    await mount();
    await click(buttonNamed('Add an author')!);
    await click(buttonNamed('Remove author 2')!);
    expect(field(`authors.${SECOND}.firstName`)).toBeNull();
    expect(container.querySelector('[data-confera-remove-question]')).toBeNull();
    expect(announced()).toBe('Author 2 removed.');
  });

  it('removing an author that holds data asks first, in the form; Keep keeps everything', async () => {
    await mount();
    await click(buttonNamed('Add an author')!);
    await typeInto(field(`authors.${SECOND}.firstName`), 'Đorđe');
    await typeInto(field(`authors.${SECOND}.lastName`), 'Šćepanović');
    await click(buttonNamed('Remove author 2')!);
    const question = container.querySelector<HTMLElement>('[data-confera-remove-question]')!;
    expect(question.textContent).toContain('Remove author 2, Đorđe Šćepanović? What you wrote for this author is lost.');
    expect(document.activeElement).toBe(question);
    expect(container.querySelector('[role="dialog"]')).toBeNull(); // no dialog inside a form (ADR-07)
    await click([...question.querySelectorAll('button')].find((b) => b.textContent === 'Keep')!);
    expect(field(`authors.${SECOND}.firstName`).value).toBe('Đorđe');
    expect(container.querySelector('[data-confera-remove-question]')).toBeNull();
    expect(document.activeElement).toBe(field(`authors.${SECOND}.firstName`));
  });

  it('Remove removes it, and when the first author goes the form says who now gets the emails', async () => {
    await mount();
    await typeInto(field('authors.1.firstName'), 'Marta');
    await click(buttonNamed('Add an author')!);
    await typeInto(field(`authors.${SECOND}.firstName`), 'Đorđe');
    await typeInto(field(`authors.${SECOND}.lastName`), 'Šćepanović');
    await click(buttonNamed('Remove author 1')!);
    const question = container.querySelector<HTMLElement>('[data-confera-remove-question]')!;
    await click([...question.querySelectorAll('button')].find((b) => b.textContent === 'Remove')!);
    expect(field('authors.1.firstName')).toBeNull();
    expect(field(`authors.${SECOND}.firstName`).value).toBe('Đorđe');
    expect(container.textContent).toContain('Đorđe Šćepanović is now the corresponding author.');
    expect(document.activeElement).toBe(field(`authors.${SECOND}.firstName`));
    // The phone belongs to the first author: it moved to the new one.
    expect(field(`authors.${SECOND}.phone`)).not.toBeNull();
  });

  it('at the limit of the form (D7) the add button goes; without an address to write to, no line leads nowhere (UX3-17)', async () => {
    await mount();
    for (let i = 1; i < 10; i += 1) await click(buttonNamed('Add an author')!);
    expect(buttonNamed('Add an author')).toBeUndefined();
    expect(container.textContent).not.toContain('You can add up to 10 authors');
    // From the fourth author on, the notice of the form.
    expect(container.textContent).toContain('Each author beyond the third adds to the fee.');
  });

  it('with the office’s address, the limit says whom to write to', async () => {
    await mount({ ...ABSTRACT, conference: { ...ABSTRACT.conference, contactEmail: 'office@example.test' } });
    for (let i = 1; i < 10; i += 1) await click(buttonNamed('Add an author')!);
    expect(container.textContent).toContain('You can add up to 10 authors. For more, write to office@example.test.');
  });

  it('only the first author has a phone, and autocomplete for the person filling in (UX-M1-23)', async () => {
    await mount();
    await click(buttonNamed('Add an author')!);
    expect(field('authors.1.phone')).not.toBeNull();
    expect(field(`authors.${SECOND}.phone`)).toBeNull();
    expect(field('authors.1.firstName').getAttribute('autocomplete')).toBe('given-name');
    expect(field('authors.1.email').getAttribute('autocomplete')).toBe('email');
    expect(field(`authors.${SECOND}.firstName`).getAttribute('autocomplete')).toBe('off');
  });
});

describe('sections and fields on a condition (FR-FORM-05)', () => {
  const card = (key: string) => container.querySelector<HTMLElement>(`[data-confera-section="${key}"]`)!;
  const wrapper = (path: string) => container.querySelector<HTMLElement>(`[data-confera-field="${path}"]`)!;

  it('the paper shows only for a participation with a paper', async () => {
    await mount();
    expect(card('paper').hidden).toBe(true);
    await choose(radio('participationType', 'with_paper'));
    expect(card('paper').hidden).toBe(false);
    await choose(radio('participationType', 'without_paper'));
    expect(card('paper').hidden).toBe(true);
  });

  it('the employer’s data appear, and are required, only when the employer pays; hidden, they are not sent', async () => {
    await mount();
    await fillAll();
    expect(wrapper('employerName').hidden).toBe(true);
    await choose(radio('payer', 'employer'));
    expect(wrapper('employerName').hidden).toBe(false);
    expect(wrapper('billingAddress').hidden).toBe(true);
    await send();
    expect(items()).toEqual(['Fill in “Name of the legal entity”', 'Fill in “Address of the legal entity”', 'Fill in “Tax number (PIB)”', 'Fill in “Registration number”', 'Fill in “Email address for the invoice”']);
    await typeInto(field('employerName'), 'Univerzitet Primer');
    // Back to "I pay": the typed data stay in the controls, but are neither checked nor sent.
    await choose(radio('payer', 'individual'));
    expect(wrapper('employerName').hidden).toBe(true);
    expect(field('employerName').value).toBe('Univerzitet Primer');
    await send();
    expect(items()).toEqual([]);
    expect(api.calls.submits[0]!.body.answers).not.toHaveProperty('employerName');
  });

  it('a claimed discount asks for its ground', async () => {
    await mount();
    await fillAll();
    await choose(radio('discountClaim', 'yes'));
    await send();
    expect(items()).toEqual(['Choose an answer for “On what grounds?”']);
  });
});

describe('sending (FR-FORM-13, 14, 15; ADR-08)', () => {
  it('a complete form is sent once, with the token, the idempotency key, the language and the file, as the API keeps it', async () => {
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
    expect(JSON.parse(JSON.stringify(submit!.body))).toEqual({
      language: 'en',
      confera_hp: '',
      answers: {
        participationType: 'with_paper',
        authors: [{ firstName: 'Marta', lastName: 'Kovač', institution: 'Ekonomski fakultet, Univerzitet Primer', email: 'marta@example.test' }],
        title: 'Održivi turizam na Balkanu',
        abstract: 'Kratak apstrakt o održivom turizmu.',
        keywords: 'turizam, održivost, Balkan',
        publication: 'proceedings',
        biographies: '0e2e0000-0000-4000-8000-000000000001',
        membership: 'no',
        attendance: 'in_person',
        discountClaim: 'no',
        payer: 'individual',
        billingAddress: 'Izmišljena 1, Beograd',
        paymentMethod: 'bank_wire',
        consent: true,
      },
    });
    const thanks = container.querySelector('[data-confera-thanks]')!;
    expect(thanks.textContent).toContain('Abstract sent');
    expect(thanks.textContent).toContain('The confirmation goes to marta@example.test.');
    expect(container.querySelector('[data-confera-reference]')!.textContent).toBe('Your reference: IT27-0042');
    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBeNull(); // nothing is kept once it is sent
  });

  it('the trap field (SEC-M3-07): confera_hp, no autofill, in an inert container out of sight and hidden from assistive technology', async () => {
    await mount();
    expect(container.querySelector('[name="website"]')).toBeNull();
    const trap = field('confera_hp');
    expect(trap.getAttribute('autocomplete')).toBe('off');
    expect(trap.getAttribute('tabindex')).toBe('-1');
    for (const hint of ['data-1p-ignore', 'data-lpignore', 'data-bwignore', 'data-form-type']) expect(trap.hasAttribute(hint)).toBe(true);
    const box = trap.closest('[data-confera-trap]')!;
    expect(box.hasAttribute('inert')).toBe(true);
    expect(box.getAttribute('aria-hidden')).toBe('true');
    expect(box.classList.contains('ud-sr')).toBe(true);
    // A neutral label: nothing an autofill heuristic maps to an address, a name or a site.
    expect(trap.closest('label')!.textContent.trim()).toBe('Extra field');
  });

  it('the API’s refusals come back to their fields, in the form’s words and in the order of the form', async () => {
    await mount();
    await fillAll();
    api.failNext(new PublicApiError(400, 'validation_failed', [{ path: 'title', code: 'noUrl' }, { path: 'authors[0].email', code: 'notAnEmail' }]));
    await send();
    // In the summary a message that does not name its field gets the label first (UX3-04); at the field it stays as it was.
    expect(items()).toEqual(['Author 1: Enter an email address like name@university.edu', 'Title: leave out web addresses']);
    const described = (field('title').getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent ?? '');
    expect(described).toContain('Leave out web addresses here');
    expect(field('title').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(container.querySelector('[data-confera-errors]'));
  });

  // Q3-01: the API answers a submit inside its fill time with a success that stores nothing.
  it('a Send sooner than the fill time after the token waits it out, then sends once', async () => {
    // The fill time ends 800 ms after the Send, however long the typing below takes on this machine.
    let fillMs = 0;
    Object.defineProperty(api, 'minimumFillMs', { get: () => fillMs });
    const opened = Date.now();
    await mount();
    await fillAll();
    fillMs = Date.now() - opened + 800;
    await send();
    expect(api.calls.submits, 'nothing sent inside the fill time').toHaveLength(0);
    expect(container.querySelector('form')!.getAttribute('data-confera-phase')).toBe('sending');
    for (let i = 0; i < 30 && api.calls.submits.length === 0; i += 1) {
      await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
    }
    await settle();
    expect(api.calls.submits).toHaveLength(1);
    expect(container.querySelector('[data-confera-thanks]')).not.toBeNull();
  });

  it('a token that expired while the author typed is replaced before Send, presenting the old one for renewal', async () => {
    const token = vi.spyOn(api, 'token');
    token.mockImplementationOnce(() => Promise.resolve({ token: 'invented-form-token-old', expiresAt: '2026-01-01T06:00:00.000Z', proofOfWork: null }));
    await mount();
    await fillAll();
    await send();
    expect(token.mock.calls).toEqual([['itema-2026-abstract'], ['itema-2026-abstract', 'invented-form-token-old']]);
    expect(api.calls.submits.map((s) => s.token)).toEqual(['invented-form-token-1']);
    expect(container.querySelector('[data-confera-thanks]')).not.toBeNull();
  });

  it('a proof-of-work asked for only at submit: the token is renewed with its challenge, solved, and sent once more', async () => {
    const token = vi.spyOn(api, 'token');
    await mount();
    await fillAll();
    // The renewal carries a challenge of 4 bits: quick to solve here.
    token.mockImplementationOnce(() => Promise.resolve({ token: 'invented-form-token-renewed', expiresAt: null, proofOfWork: { challenge: 'invented-challenge', difficulty: 4 } }));
    api.failNext(new PublicApiError(403, 'proof_of_work_failed'));
    await send();
    for (let i = 0; i < 20 && api.calls.submits.length < 2; i += 1) await settle();
    expect(token.mock.calls).toEqual([['itema-2026-abstract'], ['itema-2026-abstract', 'invented-form-token-1']]);
    expect(api.calls.submits.map((s) => s.token)).toEqual(['invented-form-token-1', 'invented-form-token-renewed']);
    expect(api.calls.submits[1]!.body.proofOfWork).toMatch(/^[0-9]+$/);
    expect(api.calls.submits[0]!.key).toBe(api.calls.submits[1]!.key);
    expect(container.querySelector('[data-confera-thanks]')).not.toBeNull();
  });

  it('a second refusal of the renewed token is not renewed again: the form says what happened', async () => {
    await mount();
    await fillAll();
    api.failNext(new PublicApiError(409, 'form_token_used'));
    api.failNext(new PublicApiError(403, 'form_token_invalid'));
    await send();
    expect(api.calls.tokens).toBe(2);
    expect(api.calls.submits).toHaveLength(2);
    expect(container.querySelector('[data-confera-problem]')).not.toBeNull();
    expect(container.querySelector('[data-confera-thanks]')).toBeNull();
  });

  it('a used or refused token: a new one, once, with the same idempotency key', async () => {
    await mount();
    await fillAll();
    api.failNext(new PublicApiError(409, 'form_token_used'));
    await send();
    expect(api.calls.submits.map((s) => s.token)).toEqual(['invented-form-token-1', 'invented-form-token-2']);
    expect(api.calls.submits[0]!.key).toBe(api.calls.submits[1]!.key);
    expect(container.querySelector('[data-confera-thanks]')).not.toBeNull();
  });

  it.each([
    [new PublicApiError(0, 'network'), 'The form was not sent', 'Check the connection and send again. Nothing you typed is lost.'],
    [new PublicApiError(429, 'too_many_requests', [], null, 300), 'Too many forms were sent from this connection', 'Try again in 5 minutes.'],
    [new PublicApiError(409, 'form_closed'), 'Submissions closed while you were filling in the form', 'The deadline has passed'],
    [new PublicApiError(500, 'internal', [], 'trace-7f3a'), 'Something went wrong on our side', 'Code: trace-7f3a'],
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
      return new Promise<{ id: string; name: string; size: number }>((resolve) => (finish = () => resolve({ id: '0e2e0000-0000-4000-8000-0000000000ff', name: chosen.name, size: chosen.size })));
    });
    await dropFile('biographies', file('Biografije.pdf', 2048));
    await send();
    expect(api.calls.submits).toHaveLength(0);
    expect(items()).toEqual(['Wait until the file is uploaded, then send.']);
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

  it('after “Send another” the first field of the new form has the focus, and it is said (UX3-15)', async () => {
    await mount();
    await fillAll();
    await send();
    await click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Send another abstract')!);
    await settle();
    expect(document.activeElement).toBe(radio('participationType', 'with_paper').closest('[role="radiogroup"]')?.querySelector('input') ?? radio('participationType', 'with_paper'));
    expect(announced()).toBe('A new form is ready.');
  });

  it('a switch of the language keeps the focus on the switch, also with the summary showing, and is said (UX3-14)', async () => {
    await mount();
    await send();
    expect(document.activeElement).toBe(container.querySelector('[data-confera-errors]'));
    const srpski = [...container.querySelectorAll<HTMLElement>('[role="radio"]')].find((r) => r.textContent === 'Srpski')!;
    srpski.focus();
    await click(srpski);
    await settle();
    expect(document.activeElement?.textContent).toBe('Srpski');
    expect(announced()).toBe('Obrazac je sada na srpskom.');
  });

  it('says what the star means once: the office’s intro says it here, so the form adds no second note (UX3-13)', async () => {
    await mount();
    expect(container.textContent).toContain('Fields marked with * are required.');
    expect(container.textContent).not.toContain('Kindly complete all mandatory fields');
  });
});

describe('files (M3-FE-04; FR-FORM-10)', () => {
  const at = () => container.querySelector('[data-confera-file="biographies"]')!.textContent;

  it('a file of another type is refused before any upload, with the types', async () => {
    await mount();
    await dropFile('biographies', file('photo.png', 1000, 'image/png'));
    expect(api.calls.uploads).toEqual([]);
    expect(at()).toContain('photo.png is not one of these types: .pdf, .docx, .doc.');
  });

  it('choosing, refusing and uploading are each said in the live region; a refusal is an alert at the file (UX3-01)', async () => {
    await mount();
    const zone = () => container.querySelector('[data-confera-file="biographies"]')!;
    await dropFile('biographies', file('photo.png', 1000, 'image/png'));
    expect(announced()).toBe('photo.png is not one of these types: .pdf, .docx, .doc. Save it as one of them and add it again.');
    expect(zone().querySelector('[role="alert"]')!.textContent).toBe(announced());
    // The same refusal twice is said twice.
    await dropFile('biographies', file('photo.png', 1000, 'image/png'));
    expect(announced().trim()).toBe('photo.png is not one of these types: .pdf, .docx, .doc. Save it as one of them and add it again.');
    let finish: (value: { id: string; name: string; size: number }) => void = () => undefined;
    api.upload = vi.fn(() => new Promise<{ id: string; name: string; size: number }>((resolve) => (finish = resolve)));
    await dropFile('biographies', file('rad.pdf', 5000));
    expect(announced()).toBe('Uploading rad.pdf…');
    expect(zone().querySelector('[role="alert"]')).toBeNull();
    await act(async () => {
      finish({ id: '0e2e0000-0000-4000-8000-000000000009', name: 'rad.pdf', size: 5000 });
      await Promise.resolve();
    });
    await settle();
    expect(announced()).toBe('rad.pdf is uploaded.');
    api.upload = vi.fn(() => Promise.reject(new PublicApiError(0, 'network')));
    await dropFile('biographies', file('drugi.pdf', 5000));
    expect(announced()).toBe('The upload of drugi.pdf stopped. Check the connection and add the file again.');
    expect(zone().querySelector('[role="alert"]')!.textContent).toBe(announced());
  });

  it('the drop area of a one-file field says “a file” (UX3-18)', async () => {
    await mount();
    expect(at()).toContain('Drop a file here or click to choose');
  });

  it('20 MB is accepted, one byte more is refused before the upload, with the limit', async () => {
    await mount();
    await dropFile('biographies', file('exactly.pdf', 20 * 1024 * 1024));
    expect(api.calls.uploads.map((u) => u.name)).toEqual(['exactly.pdf']);
    await dropFile('biographies', file('too-large.pdf', 20 * 1024 * 1024 + 1));
    expect(api.calls.uploads.map((u) => u.name)).toEqual(['exactly.pdf']);
    expect(at()).toContain('too-large.pdf is larger than 20 MB. Choose a smaller file.');
  });

  it.each([
    [new PublicApiError(422, 'docx_macros'), 'sr', 'rad.docx sadrži makroe. U Wordu izaberite Datoteka › Sačuvaj kao'],
    [new PublicApiError(415, 'file_type_refused'), 'en', 'rad.docx is not one of these types: .pdf, .docx, .doc.'],
    [new PublicApiError(413, 'file_too_large'), 'en', 'rad.docx is larger than 20 MB.'],
    [new PublicApiError(503, 'upload_quota_reached'), 'en', 'Files cannot be taken just now. Try again in a few minutes.'],
    [new PublicApiError(0, 'network'), 'sr', 'Otpremanje fajla rad.docx je prekinuto.'],
  ] as const)('the API’s refusal %s is said at the file', async (error, language, text) => {
    await mount(ABSTRACT, language);
    api.upload = vi.fn(() => Promise.reject(error));
    await dropFile('biographies', file('rad.docx', 5000, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'));
    expect(at()).toContain(text);
  });
});

describe('the draft of the tab (D3, FR-FORM-18)', () => {
  it('keeps every field but files and the consent, the authors, the language and the key', async () => {
    await mount();
    await typeInto(field('authors.1.firstName'), 'Marta');
    await click(buttonNamed('Add an author')!);
    await typeInto(field(`authors.${SECOND}.firstName`), 'Đorđe');
    await click([...container.querySelectorAll<HTMLElement>('[role="radio"]')].find((r) => r.textContent === 'Srpski')!);
    await click(field('consent'));
    await settle();
    const draft = JSON.parse(window.sessionStorage.getItem(DRAFT_KEY)!) as { language: string; values: Record<string, string>; rows: Record<string, number[]>; idempotencyKey: string };
    expect(draft.language).toBe('sr');
    expect(draft.rows).toEqual({ authors: [1, SECOND] });
    expect(draft.values['authors.1.firstName']).toBe('Marta');
    expect(draft.values[`authors.${SECOND}.firstName`]).toBe('Đorđe');
    expect(draft.values).not.toHaveProperty('consent');
    expect(Object.keys(draft.values).some((name) => name.includes('biographies'))).toBe(false);
    expect(draft.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('brings everything back after a reload, in the chosen language, and the same key is sent', async () => {
    window.sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ language: 'sr', values: { 'authors.1.firstName': 'Marta', [`authors.${SECOND}.firstName`]: 'Đorđe', consent: 'yes' }, rows: { authors: [1, SECOND] }, idempotencyKey: '11111111-2222-4333-8444-555555555555' }),
    );
    await mount();
    expect(field('authors.1.firstName').value).toBe('Marta');
    expect(field(`authors.${SECOND}.firstName`).value).toBe('Đorđe');
    expect(field('consent').checked).toBe(false); // the consent is given when the form is sent
    expect(container.querySelector('[data-confera-form]')!.getAttribute('lang')).toBe('sr');
    expect(container.textContent).toContain('Vratili smo ono što ste ranije upisali u ovoj kartici. Fajlove dodajte ponovo.');
    await fillAll();
    await typeInto(field(`authors.${SECOND}.lastName`), 'Šćepanović');
    await typeInto(field(`authors.${SECOND}.institution`), 'Fakultet za turizam');
    await typeInto(field(`authors.${SECOND}.email`), 'djordje@example.test');
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
    await typeInto(field('authors.1.firstName'), 'Nešto');
    expect(event()).toBe(true);
    expect(container.textContent).toContain('This browser does not let the form keep a draft.');
  });
});

describe('states of the form (FR-DL-02)', () => {
  it('a closed form says so, with its deadline in the language and the zone of the conference, and has no fields', async () => {
    await mount(publishedForm('itema-2026-closed'), 'sr');
    const closed = container.querySelector('[data-confera-state="closed"]')!.textContent;
    expect(closed).toContain('Ovaj obrazac je zatvoren');
    expect(closed).toContain('Prijave za ovu konferenciju su zatvorene.');
    expect(closed).toContain('Rok je bio 15.03.2026.');
    // The date ends the sentence with its own full stop: no "15.03.2026.." (UX3-16).
    expect(closed).not.toContain('2026..');
    expect(closed).toContain('Rok je bio 15.03.2026. Hvala vam');
    // The office's introduction speaks to a person filling the form in: not on a closed form (UX3-13).
    expect(container.textContent).not.toContain('Polja označena zvezdicom');
    expect(container.querySelector('form')).toBeNull();
    expect(api.calls.tokens).toBe(0);
  });

  it('a form the office closed before its deadline names no date (UX3-03)', async () => {
    await mount({ ...publishedForm('itema-2026-abstract'), state: 'closed', closedReason: 'conference_closed' });
    const closed = container.querySelector('[data-confera-state="closed"]')!.textContent;
    expect(closed).toContain('This form is closed');
    expect(closed).not.toContain('The deadline was');
    expect(closed).not.toContain('2027');
  });

  it('an open form names its deadline and says what the star means', async () => {
    await mount();
    // The star is explained by the office's intro, once (UX3-13); the deadline is a line of its own.
    expect(container.textContent).toContain('Fields marked with * are required.');
    const notes = [...container.querySelectorAll('p')].map((p) => p.textContent);
    expect(notes).toContain('Open until the end of 15 March 2027 (Central European Time).');
  });
});

describe('the consent (FR-FORM-11; D6)', () => {
  it('links to the documents of the conference, in a new tab that is announced', async () => {
    await mount();
    const links = [...field('consent').closest('label')!.querySelectorAll('a')];
    expect(links.map((a) => [a.textContent, a.getAttribute('href'), a.getAttribute('target'), a.getAttribute('rel')])).toEqual([
      ['privacy notice (opens in a new tab)', 'https://www.example.test/privacy', '_blank', 'noopener noreferrer'],
      ['terms of publication (opens in a new tab)', 'https://www.example.test/terms', '_blank', 'noopener noreferrer'],
    ]);
  });

  it('without the conference’s address a named link is its words', async () => {
    await mount({ ...ABSTRACT, conference: { ...ABSTRACT.conference, links: { terms: null, privacy: null } } });
    expect(field('consent').closest('label')!.querySelectorAll('a')).toHaveLength(0);
    expect(field('consent').closest('label')!.textContent).toContain('as the privacy notice describes, and I accept the terms of publication.');
  });
});
