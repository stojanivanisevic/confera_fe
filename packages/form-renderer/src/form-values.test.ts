// @vitest-environment jsdom
//
// The store a form reads its controls through (./form-values): the browser
// holds what the author types, the page only reads it.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createFormValueStore, readControls } from './form-values';

function control<K extends 'input' | 'textarea' | 'select'>(tag: K, attributes: Record<string, string> = {}): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}
const type = (element: HTMLInputElement | HTMLTextAreaElement, text: string) => {
  element.value = text;
  element.dispatchEvent(new Event('input', { bubbles: true }));
};

let form: HTMLFormElement;
let title: HTMLInputElement;
let abstract: HTMLTextAreaElement;
let consent: HTMLInputElement;

beforeEach(() => {
  form = document.createElement('form');
  title = control('input', { name: 'title' });
  abstract = control('textarea', { name: 'abstract' });
  consent = control('input', { name: 'consent', type: 'checkbox' });
  form.append(title, abstract, consent);
  document.body.replaceChildren(form);
});

describe('reading the controls of a form', () => {
  it('reads text fields, text areas, selects, checkboxes and radios by name', () => {
    const select = control('select', { name: 'country' });
    for (const country of ['', 'rs', 'me']) select.append(Object.assign(document.createElement('option'), { value: country, textContent: country }));
    const onsite = control('input', { name: 'presentation', type: 'radio', value: 'onsite' });
    const online = control('input', { name: 'presentation', type: 'radio', value: 'online' });
    form.append(select, onsite, online);

    expect(readControls(form)).toEqual({ title: '', abstract: '', consent: '', country: '', presentation: '' });
    title.value = 'Šta đaci čitaju';
    abstract.value = 'Prva druga';
    consent.checked = true;
    select.value = 'me';
    online.checked = true;
    expect(readControls(form)).toEqual({ title: 'Šta đaci čitaju', abstract: 'Prva druga', consent: 'on', country: 'me', presentation: 'online' });
  });

  it('leaves out what holds no answer: controls without a name, file pickers and buttons', () => {
    form.append(control('input', { type: 'text' }), control('input', { name: 'paper', type: 'file' }), control('input', { name: 'go', type: 'submit', value: 'Send' }), Object.assign(document.createElement('button'), { name: 'b' }));
    expect(Object.keys(readControls(form))).toEqual(['title', 'abstract', 'consent']);
  });

  it('a checkbox with a value of its own answers with it', () => {
    consent.value = 'yes';
    consent.checked = true;
    expect(readControls(form).consent).toBe('yes');
  });
});

describe('the store', () => {
  it('answers with the initial values on the server and until a form is attached', () => {
    const initial = { title: '' };
    const store = createFormValueStore(initial);
    expect(store.getServerSnapshot()).toBe(initial);
    expect(store.getSnapshot()).toBe(initial);
  });

  it('sees what was typed before it was attached', () => {
    // The author typed while no script had arrived: no listener existed, the controls just hold the text.
    title.value = 'Održivi turizam na Balkanu';
    consent.checked = true;
    const store = createFormValueStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.attach(form);
    expect(listener).toHaveBeenCalled();
    expect(store.getSnapshot()).toMatchObject({ title: 'Održivi turizam na Balkanu', consent: 'on' });
  });

  it('tells its listeners about every keystroke and every tick, and nothing after it is detached', () => {
    const store = createFormValueStore();
    const listener = vi.fn();
    const stop = store.subscribe(listener);
    store.attach(form);
    listener.mockClear();

    type(title, 'A');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().title).toBe('A');
    consent.checked = true;
    consent.dispatchEvent(new Event('change', { bubbles: true }));
    expect(listener).toHaveBeenCalledTimes(2);

    store.attach(null);
    listener.mockClear();
    type(title, 'AB');
    expect(listener).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toEqual({});

    store.attach(form);
    stop();
    listener.mockClear();
    type(title, 'ABC');
    expect(listener).not.toHaveBeenCalled();
  });

  it('gives the same object until something changes, so a reader is not told to render for nothing', () => {
    const store = createFormValueStore();
    store.attach(form);
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);
    type(title, 'A');
    const second = store.getSnapshot();
    expect(second).not.toBe(first);
    expect(store.getSnapshot()).toBe(second);
  });

  it('looks again when asked: rows come and go without an input event', () => {
    const store = createFormValueStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.attach(form);
    listener.mockClear();

    const author = control('input', { name: 'authors.2.name' });
    form.append(author);
    expect(listener).not.toHaveBeenCalled();
    store.refresh();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toHaveProperty('authors.2.name', '');
    author.remove();
    store.refresh();
    expect(store.getSnapshot()).not.toHaveProperty('authors.2.name');
  });

  it('looks again after the form is reset', async () => {
    const store = createFormValueStore();
    store.attach(form);
    type(title, 'A');
    const listener = vi.fn();
    store.subscribe(listener);
    form.reset();
    await Promise.resolve();
    expect(listener).toHaveBeenCalled();
    expect(store.getSnapshot().title).toBe('');
  });
});

describe('a draft goes only into what the author has not touched', () => {
  it('fills untouched fields and tells the listeners', () => {
    const store = createFormValueStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.attach(form);
    listener.mockClear();
    store.fillUntouched({ title: 'From the draft', abstract: 'Kept in the tab', consent: 'on', unknown: 'x' });
    expect(readControls(form)).toEqual({ title: 'From the draft', abstract: 'Kept in the tab', consent: 'on' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('what the author typed wins over the draft', () => {
    type(title, 'Typed before the scripts arrived');
    consent.checked = true;
    const store = createFormValueStore();
    store.attach(form);
    store.fillUntouched({ title: 'From the draft', abstract: 'Kept in the tab', consent: '' });
    expect(readControls(form)).toEqual({ title: 'Typed before the scripts arrived', abstract: 'Kept in the tab', consent: 'on' });
  });

  it('writes nothing, and tells nobody, when there is nothing to fill or no form', () => {
    const store = createFormValueStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.fillUntouched({ title: 'x' });
    store.attach(form);
    listener.mockClear();
    store.fillUntouched({});
    store.fillUntouched({ title: '' });
    expect(listener).not.toHaveBeenCalled();
    expect(title.value).toBe('');
  });
});
