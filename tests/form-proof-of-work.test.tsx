// @vitest-environment jsdom
//
// Q3-08: the proof-of-work the API asks for under load is solved while the author types; a Send
// that still has to wait for it says so after a second ("Checking that you are not a robot…"), and
// the form stays usable meanwhile. The solver itself (smallest counter, its rounds) is held by
// tests/form-rule-vectors.test.ts; here it is one the test lets finish.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { FormRenderer } from '../packages/form-renderer/src/FormRenderer';
import { createDraftStorage } from '../packages/form-renderer/src/safe-storage';
import type * as PublicApiModule from '../packages/form-renderer/src/public-api';
import { click, fakeApi, publishedForm, settle, typeInto, type FakeApi } from './support/form-harness';

const solved = vi.hoisted(() => ({ finish: (_counter: string): void => undefined }));
vi.mock('../packages/form-renderer/src/public-api', async (importOriginal) => {
  const actual = await importOriginal<typeof PublicApiModule>();
  return {
    ...actual,
    solveProofOfWork: () =>
      new Promise<string>((resolve) => {
        solved.finish = resolve;
      }),
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView = function scrollIntoView() {};

let container: HTMLElement;
let root: Root;
let api: FakeApi;
const field = (name: string) => container.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
const submit = () => container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
const wait = (ms: number) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));

beforeEach(async () => {
  window.sessionStorage.clear();
  api = fakeApi();
  vi.spyOn(api, 'token').mockImplementation(() => Promise.resolve({ token: 'invented-form-token-1', expiresAt: null, proofOfWork: { challenge: 'invented-challenge', difficulty: 16 } }));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<FormRenderer form={publishedForm('spike-abstract')} language="en" api={api} storage={() => createDraftStorage(() => window.sessionStorage)} />);
    await Promise.resolve();
  });
  await settle();
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  container.remove();
});

it('a Send that waits for the proof-of-work says so after a second, keeps the form usable, and sends the counter', async () => {
  await typeInto(field('title'), 'Održivi turizam na Balkanu');
  await typeInto(field('authors.1.name'), 'Marta Kovač');
  await typeInto(field('authors.1.email'), 'marta@example.test');
  await click(field('consent'));
  await click(submit());
  await wait(300);
  // Not at once: a check that is over within a second is not worth a word.
  expect(submit().textContent).toBe('Sending…');
  await wait(900);
  expect(submit().textContent).toBe('Checking that you are not a robot…');
  expect(container.querySelector('[data-confera-phase]')!.getAttribute('data-confera-phase')).toBe('checking');
  // The form is still usable: what the author types is taken.
  await typeInto(field('title'), 'Održivi turizam na Balkanu i u Podunavlju');
  expect(field('title').value).toBe('Održivi turizam na Balkanu i u Podunavlju');
  expect(field('title').disabled).toBe(false);
  expect(api.calls.submits).toHaveLength(0);

  await act(async () => {
    solved.finish('48213');
    await Promise.resolve();
  });
  await settle();
  expect(api.calls.submits.map((s) => s.body.proofOfWork)).toEqual(['48213']);
  expect(container.querySelector('[data-confera-thanks]')).not.toBeNull();
}, 15_000);

it('in Serbian the check has its own words', async () => {
  const { FORM_TEXTS } = await import('../packages/form-renderer/src/i18n/catalogue');
  expect(FORM_TEXTS.en.checking).toBe('Checking that you are not a robot…');
  expect(FORM_TEXTS.sr.checking).toBe('Proveravamo da niste robot…');
});
