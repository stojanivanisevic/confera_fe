/**
 * Where a form keeps what the author typed: in the form's own controls.
 *
 * The server sends the whole form as markup, and the scripts that attach it can
 * take seconds on a phone. An author who starts typing in that time types into
 * plain controls. If a field took its text from component state (`value=`), the
 * first render after attaching would write the state, still empty, back into
 * the control and throw the typed text away.
 *
 * So the fields of a form are NOT given a value by the page. They are plain
 * (uncontrolled) controls with a `name`; the browser holds their text from the
 * first keystroke, attached or not. The page reads the controls through this
 * store, which React subscribes to: on the server and while attaching it
 * answers with the initial values (so the markup matches), and right after
 * attaching with what is really in the controls. Nothing is ever written into
 * a control the author has touched.
 *
 * This is the pattern the form renderer of 0.3.0 builds on (ADR-09).
 */
import { useCallback, useSyncExternalStore } from 'react';

/**
 * The values of the named controls of a form. A checkbox that is not ticked is ''.
 * The object has no prototype: a field may be named `__proto__`, `constructor` or `toString`
 * (names come from form definitions) and is kept like any other.
 */
export type FormValues = Readonly<Record<string, string>>;

/** An empty object without a prototype, so that no name of a field meets a property every object has. */
const emptyValues = (): Record<string, string> => Object.create(null) as Record<string, string>;

const NOTHING: FormValues = Object.freeze(emptyValues());

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function controlsOf(form: HTMLFormElement): Control[] {
  return Array.from(form.elements).filter((element): element is Control => {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) return false;
    if (element.name === '') return false;
    return !(element instanceof HTMLInputElement && ['file', 'button', 'submit', 'reset', 'image'].includes(element.type));
  });
}

/** What the named controls of a form hold right now. */
export function readControls(form: HTMLFormElement): FormValues {
  const values = emptyValues();
  for (const control of controlsOf(form)) {
    if (control instanceof HTMLInputElement && control.type === 'checkbox') {
      values[control.name] = control.checked ? control.value || 'on' : '';
    } else if (control instanceof HTMLInputElement && control.type === 'radio') {
      if (control.checked) values[control.name] = control.value;
      else values[control.name] ??= '';
    } else {
      values[control.name] = control.value;
    }
  }
  return values;
}

/** True while a control is still exactly as the markup made it: the author has not typed in it or ticked it. */
function isUntouched(control: Control): boolean {
  if (control instanceof HTMLInputElement && (control.type === 'checkbox' || control.type === 'radio')) return control.checked === control.defaultChecked;
  if (control instanceof HTMLSelectElement) return Array.from(control.options).every((option) => option.selected === option.defaultSelected);
  return control.value === control.defaultValue;
}

export interface FormValueStore {
  /** Takes the `<form>` (or null when it goes away); `useFormRef` gives it to React. */
  readonly attach: (form: HTMLFormElement | null) => void;
  readonly subscribe: (listener: () => void) => () => void;
  /** The values in the controls; the initial values while no form is attached. The same object until something changes. */
  readonly getSnapshot: () => FormValues;
  /** What the server rendered with, and what attaching starts from. */
  readonly getServerSnapshot: () => FormValues;
  /** Looks at the controls again: call it after controls were added or removed without an input event. */
  readonly refresh: () => void;
  /**
   * Writes values into controls the author has not touched (a draft kept in the tab).
   * A control that already holds what the author typed is left alone: the typed text wins.
   */
  readonly fillUntouched: (values: FormValues) => void;
}

export function createFormValueStore(initial: FormValues = NOTHING): FormValueStore {
  const listeners = new Set<() => void>();
  let form: HTMLFormElement | null = null;
  let cached: { text: string; values: FormValues } = { text: JSON.stringify(initial), values: initial };

  const emit = () => listeners.forEach((listener) => listener());
  // A reset event comes before the controls are reset: look again once they are.
  const afterReset = () => void Promise.resolve().then(emit);

  return {
    attach(next) {
      if (form === next) return;
      if (form) {
        form.removeEventListener('input', emit);
        form.removeEventListener('change', emit);
        form.removeEventListener('reset', afterReset);
      }
      form = next;
      if (form) {
        form.addEventListener('input', emit);
        form.addEventListener('change', emit);
        form.addEventListener('reset', afterReset);
      }
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    getSnapshot() {
      if (!form) return initial;
      const values = readControls(form);
      const text = JSON.stringify(values);
      if (text !== cached.text) cached = { text, values };
      return cached.values;
    },
    getServerSnapshot: () => initial,
    refresh: emit,
    fillUntouched(values) {
      if (!form) return;
      let wrote = false;
      for (const control of controlsOf(form)) {
        const value = Object.hasOwn(values, control.name) ? values[control.name] : undefined;
        if (value === undefined || !isUntouched(control)) continue;
        if (control instanceof HTMLInputElement && (control.type === 'checkbox' || control.type === 'radio')) {
          const tick = control.type === 'checkbox' ? value !== '' : value === control.value;
          if (control.checked !== tick) {
            control.checked = tick;
            wrote = true;
          }
        } else if (control.value !== value) {
          control.value = value;
          wrote = true;
        }
      }
      if (wrote) emit();
    },
  };
}

/** The values of a form, for rendering. They follow every keystroke, and what was typed before the form was attached. */
export function useFormValues(store: FormValueStore): FormValues {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}

/** The `ref` of the `<form>` whose controls the store reads. */
export function useFormRef(store: FormValueStore): (form: HTMLFormElement | null) => void {
  return useCallback((form: HTMLFormElement | null) => store.attach(form), [store]);
}
