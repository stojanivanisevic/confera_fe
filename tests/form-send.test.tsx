// @vitest-environment jsdom
//
// The moment after Send, on the spike form (UX-M1-01 to 04, 07, UI-M1-06): every rule is
// checked; a failed Send moves the focus to the summary, whose items are links that focus their
// fields; a successful one moves it to the thank-you; the form posts, never gets; inside a frame
// the page around is asked to bring that part into view. Browser behaviour: e2e/form-send.spec.ts.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SpikeForm } from '../packages/form-renderer/src/SpikeForm';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement;
let root: Root;
let shown: HTMLElement[];

const field = <T extends HTMLElement = HTMLInputElement>(name: string) => container.querySelector<T>(`[name="${name}"]`)!;
/** Typing the way a browser does it: the control's own setter, then the event. */
const typeInto = async (element: HTMLInputElement | HTMLTextAreaElement, text: string) => {
  await act(async () => {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, text);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();
  });
};
const tick = async (box: HTMLInputElement) => {
  await act(async () => {
    box.click();
    await Promise.resolve();
  });
};
const send = async () => {
  await act(async () => {
    container.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await Promise.resolve();
  });
};
const summary = () => container.querySelector<HTMLElement>('[data-confera-errors]');
const items = () => [...(summary()?.querySelectorAll('li a') ?? [])].map((a) => a.textContent);

async function fillValid() {
  await typeInto(field('title'), 'Održivi turizam na Balkanu');
  await typeInto(field('authors.1.name'), 'Marta Kovač');
  await typeInto(field('authors.1.email'), 'marta@example.test');
  await tick(field('consent'));
}

beforeEach(async () => {
  window.sessionStorage.clear();
  shown = [];
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<SpikeForm slug="spike-abstract" onShow={(element) => shown.push(element)} />);
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

  it('says where scripts never run that it needs them (in the server markup: a browser without scripts reads it)', () => {
    expect(renderToString(<SpikeForm slug="spike-abstract" />)).toContain('<noscript><p class=');
    expect(renderToString(<SpikeForm slug="spike-abstract" />)).toContain('This form needs JavaScript. Turn it on, or open the form in another browser.');
  });
});

describe('every rule of the form is checked on Send', () => {
  it('an empty form: one item per field that needs something, each a link to its field, in the order of the fields', async () => {
    await send();
    expect(items()).toEqual([
      'Enter the title of the paper',
      'Enter the first and last name of author 1',
      'Enter the email address of author 1, so we can send the confirmation',
      'Accept the terms of publication to send your abstract',
    ]);
    for (const link of summary()!.querySelectorAll<HTMLAnchorElement>('li a')) expect(document.getElementById(link.hash.slice(1)), link.textContent).not.toBeNull();
  });

  it('two authors without a name: one item each, naming the author', async () => {
    await act(async () => {
      [...container.querySelectorAll('button')].find((b) => b.textContent === 'Add author')!.click();
      await Promise.resolve();
    });
    await send();
    expect(items()).toContain('Enter the first and last name of author 1');
    expect(items()).toContain('Enter the first and last name of author 2');
  });

  it('a wrong email address, of any author', async () => {
    await fillValid();
    await typeInto(field('authors.1.email'), 'marta@example');
    await send();
    expect(items()).toEqual(['Enter an email address like name@university.edu']);
    expect(field('authors.1.email').getAttribute('aria-invalid')).toBe('true');
  });

  it('too many words: the counter is the field\'s error at once, and Send refuses', async () => {
    await fillValid();
    await typeInto(field<HTMLTextAreaElement>('abstract'), Array.from({ length: 385 }, (_, i) => `reč${i}`).join(' '));
    const abstract = field<HTMLTextAreaElement>('abstract');
    expect(abstract.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(abstract.getAttribute('aria-describedby')!)!.textContent).toBe('385 of 300 words. Shorten the abstract by 85 words.');
    await send();
    expect(items()).toEqual(['385 of 300 words. Shorten the abstract by 85 words.']);
    expect(container.querySelector('[data-confera-thanks]')).toBeNull();
  });

  it('the same in Serbian, with the plural of the language', async () => {
    await act(async () => {
      [...container.querySelectorAll<HTMLElement>('[role="radio"]')].find((radio) => radio.textContent === 'Srpski')!.click();
      await Promise.resolve();
    });
    await typeInto(field<HTMLTextAreaElement>('abstract'), Array.from({ length: 301 }, (_, i) => `reč${i}`).join(' '));
    const abstract = field<HTMLTextAreaElement>('abstract');
    expect(document.getElementById(abstract.getAttribute('aria-describedby')!)!.textContent).toBe('301 od 300 reči. Skratite apstrakt za 1 reč.');
    expect(container.textContent).toContain('Ime i prezime autora 1');
    expect(container.textContent).toContain('Naslov i apstrakt čuvaju se u ovoj kartici dok ih ne pošaljete.');
  });

  it('the consent is marked as required, and its error is at the box', async () => {
    const consent = field('consent');
    expect(consent.required).toBe(true);
    expect(consent.closest('label')!.textContent).toBe('I accept the terms of publication *');
    await send();
    expect(consent.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(consent.getAttribute('aria-describedby')!)!.textContent).toBe('Accept the terms of publication to send your abstract');
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
    const link = [...summary()!.querySelectorAll<HTMLAnchorElement>('li a')].find((a) => a.textContent.startsWith('Enter the email address'))!;
    const before = window.location.href;
    await act(async () => {
      link.click();
      await Promise.resolve();
    });
    expect(document.activeElement).toBe(field('authors.1.email'));
    expect(window.location.href).toBe(before);
  });

  it('a successful Send: to the thank-you, and the page around is asked to show it', async () => {
    await fillValid();
    await send();
    const thanks = container.querySelector<HTMLElement>('[data-confera-thanks]')!;
    expect(thanks.textContent).toContain('Thank you');
    expect(document.activeElement).toBe(thanks);
    expect(shown).toEqual([thanks]);
  });
});

it('without a frame around it nothing is asked of anyone', async () => {
  const lonely = vi.fn();
  await act(async () => {
    root.render(<SpikeForm slug="spike-abstract" />);
    await Promise.resolve();
  });
  await send();
  expect(lonely).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(summary());
});
