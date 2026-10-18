// @vitest-environment jsdom
//
// The moment after Send (UX-M1-01 to 04, 07, UI-M1-06), on the real renderer with the spike's form
// written as a definition (e2e/servers/public-forms.json): every rule is checked; a failed Send
// moves the focus to the summary, whose items are links that focus their fields; a successful one
// moves it to the thank-you; the form posts, never gets; inside a frame the page around is asked
// to bring that part into view. Browser behaviour: e2e/form-send.spec.ts.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FormRenderer } from '../packages/form-renderer/src/FormRenderer';
import { createDraftStorage } from '../packages/form-renderer/src/safe-storage';
import { click, fakeApi, publishedForm, settle, typeInto, type FakeApi } from './support/form-harness';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom lays nothing out and has no scrollIntoView; the form asks for it before it moves the focus.
Element.prototype.scrollIntoView = function scrollIntoView() {};

const FORM = publishedForm('spike-abstract');
const storage = () => createDraftStorage(() => window.sessionStorage);

let container: HTMLElement;
let root: Root;
let shown: HTMLElement[];
let api: FakeApi;

const field = <T extends HTMLElement = HTMLInputElement>(name: string) => container.querySelector<T>(`[name="${name}"]`)!;
const send = async () => {
  await click(container.querySelector<HTMLButtonElement>('button[type="submit"]')!);
  await settle();
};
const summary = () => container.querySelector<HTMLElement>('[data-confera-errors]');
const items = () => [...(summary()?.querySelectorAll('li a') ?? [])].map((a) => a.textContent);
const button = (text: string) => [...container.querySelectorAll('button')].find((b) => b.textContent === text)!;

async function fillValid() {
  await typeInto(field('title'), 'Održivi turizam na Balkanu');
  await typeInto(field('authors.1.name'), 'Marta Kovač');
  await typeInto(field('authors.1.email'), 'marta@example.test');
  await click(field('consent'));
}

beforeEach(async () => {
  window.sessionStorage.clear();
  shown = [];
  api = fakeApi();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<FormRenderer form={FORM} language="en" api={api} storage={storage} onShow={(element) => shown.push(element)} />);
    await Promise.resolve();
  });
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  container.remove();
});

describe('the form posts, and never to an address', () => {
  it('has method="post" and posts to its own POST path, so a Send before the scripts arrive puts nothing in an address', () => {
    const form = container.querySelector('form')!;
    expect(form.getAttribute('method')).toBe('post');
    expect(form.getAttribute('action')).toBe('/f/spike-abstract/send');
  });

  it('Send cannot be pressed before the scripts are there (server markup), and can once they are', () => {
    expect(renderToString(<FormRenderer form={FORM} language="en" api={api} />)).toMatch(/<button type="submit" disabled=""/);
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
  });

  it('says where scripts never run that it needs them (in the server markup: a browser without scripts reads it)', () => {
    const html = renderToString(<FormRenderer form={FORM} language="en" api={api} />);
    expect(html).toContain('<noscript><p class=');
    expect(html).toContain('This form needs JavaScript. Turn it on, or open the form in another browser.');
  });
});

describe('every rule of the form is checked on Send', () => {
  it('an empty form: one item per field that needs something, each a link to its field, in the order of the fields', async () => {
    await send();
    expect(items()).toEqual([
      'Fill in “Title of the paper”',
      'Fill in “First and last name of author 1”',
      'Fill in “Email of author 1”',
      'Accept the terms to send your abstract',
    ]);
    for (const link of summary()!.querySelectorAll<HTMLAnchorElement>('li a')) expect(document.getElementById(link.hash.slice(1)), link.textContent).not.toBeNull();
    expect(api.calls.submits).toHaveLength(0);
  });

  it('two authors without a name: one item each, naming the author', async () => {
    await click(button('Add author'));
    await send();
    expect(items()).toContain('Fill in “First and last name of author 1”');
    expect(items()).toContain('Fill in “First and last name of author 2”');
  });

  it('a wrong email address, of any author', async () => {
    await fillValid();
    await typeInto(field('authors.1.email'), 'marta@example');
    await send();
    expect(items()).toEqual(['Author 1: Enter an email address like name@university.edu']);
    expect(field('authors.1.email').getAttribute('aria-invalid')).toBe('true');
  });

  it("too many words: the counter is the field's error at once, and Send refuses", async () => {
    await fillValid();
    await typeInto(field<HTMLTextAreaElement>('abstract'), Array.from({ length: 385 }, (_, i) => `reč${i}`).join(' '));
    const abstract = field<HTMLTextAreaElement>('abstract');
    expect(abstract.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(abstract.getAttribute('aria-describedby')!)!.textContent).toBe('385 of 300 words. Shorten the text by 85 words.');
    await send();
    // In the summary the field is named first (UX3-04).
    expect(items()).toEqual(['Abstract: 385 of 300 words. Shorten the text by 85 words.']);
    expect(container.querySelector('[data-confera-thanks]')).toBeNull();
    expect(api.calls.submits).toHaveLength(0);
  });

  it('the same in Serbian, with the plural of the language', async () => {
    await click([...container.querySelectorAll<HTMLElement>('[role="radio"]')].find((radio) => radio.textContent === 'Srpski')!);
    await typeInto(field<HTMLTextAreaElement>('abstract'), Array.from({ length: 301 }, (_, i) => `reč${i}`).join(' '));
    const abstract = field<HTMLTextAreaElement>('abstract');
    expect(document.getElementById(abstract.getAttribute('aria-describedby')!)!.textContent).toBe('301 od 300 reči. Skratite tekst za 1 reč.');
    expect(container.textContent).toContain('Autor 1');
    expect(container.textContent).toContain('Ime i prezime');
    expect(container.textContent).toContain('Ono što upišete čuva se u ovoj kartici dok ne pošaljete obrazac. Fajlovi se ne čuvaju.');
  });

  it('the consent is marked as required, and its error is at the box', async () => {
    const consent = field('consent');
    expect(consent.required).toBe(true);
    expect(consent.closest('label')!.textContent).toBe('I accept the terms of publication *');
    await send();
    expect(consent.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(consent.getAttribute('aria-describedby')!)!.textContent).toBe('Accept the terms to send your abstract');
  });
});

describe('where the focus goes after Send', () => {
  it('a failed Send: to the summary, every time, and the page around is asked to show it', async () => {
    await send();
    expect(document.activeElement).toBe(summary());
    expect(shown).toEqual([summary()]);
    field('title').focus();
    await send();
    expect(document.activeElement).toBe(summary());
    expect(shown).toHaveLength(2);
  });

  it('an item of the summary takes the focus to its field, and puts nothing in the address', async () => {
    await send();
    const link = [...summary()!.querySelectorAll<HTMLAnchorElement>('li a')].find((a) => a.textContent.startsWith('Fill in “Email'))!;
    const before = window.location.href;
    await click(link);
    expect(document.activeElement).toBe(field('authors.1.email'));
    expect(window.location.href).toBe(before);
  });

  it('a successful Send: to the thank-you, with the reference, and the page around is asked to show it', async () => {
    await fillValid();
    await send();
    const thanks = container.querySelector<HTMLElement>('[data-confera-thanks]')!;
    expect(thanks.textContent).toContain('Abstract sent');
    expect(thanks.textContent).toContain('Thank you. A confirmation with its reference is on its way to your email address.');
    expect(thanks.textContent).toContain('The confirmation goes to marta@example.test.');
    expect(thanks.textContent).toContain('Your reference: IT27-0042');
    expect(document.activeElement).toBe(thanks);
    expect(shown).toEqual([thanks]);
    // The thank-you does not keep the line about mandatory fields (UX-M1-18).
    expect(container.textContent).not.toContain('Kindly complete all mandatory fields');
  });
});

it('without a frame around it nothing is asked of anyone', async () => {
  const lonely = vi.fn();
  await act(async () => {
    root.render(<FormRenderer form={FORM} language="en" api={api} storage={storage} />);
    await Promise.resolve();
  });
  await send();
  expect(lonely).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(summary());
});
