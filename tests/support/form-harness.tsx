// What the unit tests of the public form share: the published forms of the API stub
// (e2e/servers/public-forms.json, the same the browser tests use), an API that answers like the
// public form API and records what it was sent, and the way a browser types.
import { act } from 'react';
import { vi } from 'vitest';

import { readPublishedForm, type PublishedForm } from '../../packages/form-renderer/src/definition';
import { PublicApiError, type PublicApi } from '../../packages/form-renderer/src/public-api';
import fixture from '../../e2e/servers/public-forms.json';

export const publishedForm = (slug: keyof typeof fixture.forms): PublishedForm => readPublishedForm(fixture.forms[slug]);

export interface FakeApi extends PublicApi {
  readonly calls: { tokens: number; uploads: Array<{ token: string; field: string; name: string }>; submits: Array<{ token: string; key: string; body: Record<string, unknown> }> };
  /** The next submit answers with this error instead of a reference. */
  failNext(error: PublicApiError): void;
}

export function fakeApi(): FakeApi {
  let tokens = 0;
  const calls: FakeApi['calls'] = { tokens: 0, uploads: [], submits: [] };
  const failures: PublicApiError[] = [];
  return {
    calls,
    failNext: (error) => void failures.push(error),
    token: vi.fn(() => {
      tokens += 1;
      calls.tokens = tokens;
      return Promise.resolve({ token: `invented-form-token-${tokens}`, expiresAt: null, proofOfWork: null });
    }),
    upload: vi.fn((_slug: string, token: string, field: string, file: File, onProgress: (percent: number) => void) => {
      calls.uploads.push({ token, field, name: file.name });
      onProgress(50);
      return Promise.resolve({ id: `upload-${calls.uploads.length}`, name: file.name, size: file.size });
    }),
    submit: vi.fn((_slug: string, token: string, key: string, body: unknown) => {
      calls.submits.push({ token, key, body: body as Record<string, unknown> });
      const failure = failures.shift();
      return failure ? Promise.reject(failure) : Promise.resolve({ reference: 'IT-2026-0042' });
    }),
  };
}

export { PublicApiError };

/** Typing the way a browser does it: the control's own setter, then the event. */
export function typeIntoNow(element: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, text);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

export const typeInto = async (element: HTMLInputElement | HTMLTextAreaElement, text: string): Promise<void> => {
  await act(async () => {
    typeIntoNow(element, text);
    await Promise.resolve();
  });
};

export const click = async (element: HTMLElement): Promise<void> => {
  await act(async () => {
    element.click();
    await Promise.resolve();
  });
};

/** Lets the promises of a send (token, submit) settle. */
export const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
};
