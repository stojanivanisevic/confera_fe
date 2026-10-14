// @vitest-environment jsdom
//
// Edge cases of the form-value store found by the edge-case hunter (M1-REV-01).
//
// readControls collects the values into a plain object, `{}`. A control whose name is a
// property every object already has is then read wrong:
//  - `__proto__`: assigning a string to it changes nothing, so what the author typed is
//    silently missing from the values;
//  - `constructor`, `toString`, `hasOwnProperty`, ...: the `??=` of an unticked radio
//    group sees the inherited function and writes no '' for it, so the group is missing
//    from the values instead of being empty (the rule written above `FormValues`:
//    "A checkbox that is not ticked is ''", and every named control has a value).
// Field names come from form definitions that the office writes (0.3.0 builds on this
// store, ADR-09: "raw answers under stable keys"); a name must never decide whether an
// answer is kept.
import { describe, expect, it } from 'vitest';

import { readControls } from './form-values';

function formWith(...controls: HTMLElement[]): HTMLFormElement {
  const form = document.createElement('form');
  form.append(...controls);
  document.body.replaceChildren(form);
  return form;
}

function input(attributes: Record<string, string>, value?: string): HTMLInputElement {
  const element = document.createElement('input');
  for (const [name, text] of Object.entries(attributes)) element.setAttribute(name, text);
  if (value !== undefined) element.value = value;
  return element;
}

describe('edge cases of reading the controls (M1-REV-01)', () => {
  it('keeps what was typed into a field named __proto__', () => {
    const values = readControls(formWith(input({ name: '__proto__' }, 'Održivi turizam')));
    expect(Object.hasOwn(values, '__proto__')).toBe(true);
    expect(Object.getOwnPropertyDescriptor(values, '__proto__')?.value).toBe('Održivi turizam');
  });

  it.each(['constructor', 'toString', 'hasOwnProperty', 'valueOf'])('an unticked radio group named %s is empty, not missing', (name) => {
    const values = readControls(formWith(input({ name, type: 'radio', value: 'onsite' }), input({ name, type: 'radio', value: 'online' })));
    expect(Object.hasOwn(values, name)).toBe(true);
    expect(values[name]).toBe('');
  });

  it('control: an ordinary name is read as the rule says', () => {
    const values = readControls(formWith(input({ name: 'presentation', type: 'radio', value: 'onsite' }), input({ name: 'title' }, 'Šta đaci čitaju')));
    expect(values).toEqual({ presentation: '', title: 'Šta đaci čitaju' });
  });
});
