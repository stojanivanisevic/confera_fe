// @vitest-environment jsdom
//
// F3: what an author types into the server-rendered form before the scripts
// arrive must survive the moment the form is attached (hydration), and the form
// must know it afterwards. The fields are plain controls that the page reads
// through a store (packages/form-renderer/src/form-values.ts); this test holds
// the pattern on the real form, with React's development build.
import { act, StrictMode, type ReactElement } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FormRenderer } from '../packages/form-renderer/src/FormRenderer';
import { createDraftStorage } from '../packages/form-renderer/src/safe-storage';
import { fakeApi, publishedForm } from './support/form-harness';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom lays nothing out and has no scrollIntoView; the form asks for it before it moves the focus.
Element.prototype.scrollIntoView = function scrollIntoView() {};

const DRAFT_KEY = 'confera:draft:spike-abstract:1';
const FORM = publishedForm('spike-abstract');
const storage = () => createDraftStorage(() => window.sessionStorage);
let tree: ReactElement;
/** A draft as the form keeps it (D3): the fields, the blocks, the language and the idempotency key. */
const draftOf = (values: Record<string, string>) => JSON.stringify({ language: 'en', values, rows: { authors: [1] }, idempotencyKey: '11111111-2222-4333-8444-555555555555' });
const keptValues = () => (JSON.parse(window.sessionStorage.getItem(DRAFT_KEY)!) as { values: Record<string, string> }).values;

let container: HTMLElement;
let root: Root | undefined;
let errors: ReturnType<typeof vi.spyOn>;
let warnings: ReturnType<typeof vi.spyOn>;

const field = <T extends HTMLElement = HTMLInputElement>(name: string) => container.querySelector<T>(`[name="${name}"]`)!;
/**
 * Typing the way a browser does it: the control's own setter changes the text, then the event
 * is sent. (Once React is attached it watches `element.value = …` on the control itself and
 * would take such a write for its own, not for typing.)
 */
const typeInto = (element: HTMLInputElement | HTMLTextAreaElement, text: string) => {
  element.focus();
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, text);
  element.dispatchEvent(new Event('input', { bubbles: true }));
};

/** The page as the server sends it: markup only. */
function serverPage(): void {
  const html = renderToString(tree);
  const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  container.append(...Array.from(parsed.body.childNodes));
}
/** The scripts arrive: the form is attached to the markup that is already there. */
async function attach(): Promise<unknown[]> {
  const recoverable: unknown[] = [];
  await act(async () => {
    root = hydrateRoot(container, tree, { onRecoverableError: (error) => recoverable.push(error) });
    await Promise.resolve();
  });
  return recoverable;
}

beforeEach(() => {
  window.sessionStorage.clear();
  tree = (
    <StrictMode>
      <FormRenderer form={FORM} language="en" api={fakeApi()} storage={storage} />
    </StrictMode>
  );
  errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  container = document.createElement('div');
  document.body.append(container);
});
afterEach(async () => {
  await act(async () => {
    root?.unmount();
    await Promise.resolve();
  });
  root = undefined;
  container.remove();
});

describe('typing before the form is attached', () => {
  it('the server sends plain controls: no value is forced on them', () => {
    serverPage();
    expect(container.querySelector('[data-confera-form]')!.getAttribute('data-hydrated')).toBe('false');
    for (const name of ['title', 'abstract', 'authors.1.name', 'authors.1.email', 'consent']) expect(field(name), name).not.toBeNull();
  });

  it('what was typed is still in the fields afterwards, in the same controls, with the focus where it was', async () => {
    serverPage();
    const controls = { title: field('title'), abstract: field<HTMLTextAreaElement>('abstract'), author: field('authors.1.name'), consent: field('consent') };
    typeInto(controls.abstract, 'Prva druga treća četvrta');
    typeInto(controls.author, 'Marta Kovač');
    controls.consent.checked = true;
    typeInto(controls.title, 'Održivi turizam na Balkanu'); // the author is still in this field when the scripts arrive

    const recoverable = await attach();

    expect(container.querySelector('[data-confera-form]')!.getAttribute('data-hydrated')).toBe('true');
    expect(field('title').value).toBe('Održivi turizam na Balkanu');
    expect(field<HTMLTextAreaElement>('abstract').value).toBe('Prva druga treća četvrta');
    expect(field('authors.1.name').value).toBe('Marta Kovač');
    expect(field('consent').checked).toBe(true);
    // Attached to the controls that were there, not replaced by new ones: the caret and the focus stay.
    expect(field('title')).toBe(controls.title);
    expect(field<HTMLTextAreaElement>('abstract')).toBe(controls.abstract);
    expect(document.activeElement).toBe(controls.title);
    // And attaching was clean.
    expect(recoverable).toEqual([]);
    expect(errors.mock.calls.map((call: unknown[]) => String(call[0]))).toEqual([]);
    expect(warnings.mock.calls.map((call: unknown[]) => String(call[0]))).toEqual([]);
  });

  it('the form knows what was typed: the words are counted and nothing is reported missing', async () => {
    serverPage();
    expect(container.textContent).toContain('0 of 300 words');
    typeInto(field('title'), 'Održivi turizam na Balkanu');
    typeInto(field<HTMLTextAreaElement>('abstract'), 'Prva druga treća četvrta');
    typeInto(field('authors.1.name'), 'Marta Kovač');
    typeInto(field('authors.1.email'), 'marta@example.test');
    field('consent').checked = true;

    await attach();
    expect(container.textContent).toContain('4 of 300 words');

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.querySelector('.ud-alert--error')).toBeNull();
    expect(container.querySelector('.ud-alert--success')!.textContent).toContain('Abstract sent');
  });

  it('it is kept as the draft of the tab, although no key was pressed after attaching', async () => {
    serverPage();
    typeInto(field('title'), 'Održivi turizam na Balkanu');
    await attach();
    expect(keptValues()).toMatchObject({ title: 'Održivi turizam na Balkanu', abstract: '' });
    // Never the consent, never the trap field.
    expect(keptValues()).not.toHaveProperty('consent');
    expect(keptValues()).not.toHaveProperty('website');
  });

  it('a field that was left empty is still reported, with its message', async () => {
    serverPage();
    typeInto(field('authors.1.name'), 'Marta Kovač');
    await attach();
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
      await Promise.resolve();
    });
    expect(container.querySelector('.ud-alert--error')!.textContent).toContain('Enter the title of the paper');
    expect(container.querySelector('.ud-alert--error')!.textContent).not.toContain('Enter the first and last name of author 1');
    expect(field('title').getAttribute('aria-invalid')).toBe('true');
    expect(field('authors.1.name').value).toBe('Marta Kovač');
  });
});

describe('a draft kept in the tab and text typed before attaching', () => {
  it('the draft fills the fields the author has not touched', async () => {
    window.sessionStorage.setItem(DRAFT_KEY, draftOf({ title: 'From the draft', abstract: 'Jedna dva' }));
    serverPage();
    await attach();
    expect(field('title').value).toBe('From the draft');
    expect(field<HTMLTextAreaElement>('abstract').value).toBe('Jedna dva');
    expect(container.textContent).toContain('2 of 300 words');
  });

  it('what the author typed wins over the draft', async () => {
    window.sessionStorage.setItem(DRAFT_KEY, draftOf({ title: 'From the draft', abstract: 'Jedna dva' }));
    serverPage();
    typeInto(field('title'), 'Typed just now');
    await attach();
    expect(field('title').value).toBe('Typed just now');
    expect(field<HTMLTextAreaElement>('abstract').value).toBe('Jedna dva');
  });

  it('typing after attaching follows every keystroke and is kept', async () => {
    serverPage();
    await attach();
    await act(async () => {
      typeInto(field<HTMLTextAreaElement>('abstract'), 'Jedna dva tri');
      await Promise.resolve();
    });
    expect(container.textContent).toContain('3 of 300 words');
    expect(keptValues()).toMatchObject({ title: '', abstract: 'Jedna dva tri' });
  });
});
