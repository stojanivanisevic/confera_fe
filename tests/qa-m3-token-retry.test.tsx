// @vitest-environment jsdom
//
// Q3-01 (M3-QA-03, edge probe of the Test engineer): the API answers a submit that comes sooner
// than 3 s after its token with a FAKE success and stores nothing (ADR-08, item 7, MINIMUM_FILL_MS
// of confera_be's intake.service.ts). When a token is refused (expired after 6 hours, or used),
// the renderer fetches a new one and sends at once with the same idempotency key: the new token is
// a few milliseconds old, so the author gets a thank-you with a reference that does not exist,
// no submission and no email. The fake API below answers as confera_be does.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FormRenderer } from '../packages/form-renderer/src/FormRenderer';
import type { PublicApi, SubmitBody } from '../packages/form-renderer/src/public-api';
import { createDraftStorage } from '../packages/form-renderer/src/safe-storage';
import { click, PublicApiError, publishedForm, settle, typeInto } from './support/form-harness';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView = function scrollIntoView() {};

const FORM = publishedForm('spike-abstract');
const MINIMUM_FILL_MS = 3_000;
const SIX_HOURS = 6 * 60 * 60_000;

/** The public form API as confera_be answers: tokens with their issue time, the trap of the fill time. */
function apiLikeTheServer() {
  const issued = new Map<string, number>();
  const used = new Set<string>();
  const stored: { key: string; body: SubmitBody }[] = [];
  let count = 0;
  const api: PublicApi = {
    token: () => {
      count += 1;
      const token = `invented-form-token-${String(count)}`;
      // The first token was fetched when the author opened the form, an afternoon ago.
      issued.set(token, count === 1 ? Date.now() - SIX_HOURS - 60_000 : Date.now());
      return Promise.resolve({ token, expiresAt: new Date((issued.get(token) ?? 0) + SIX_HOURS).toISOString(), proofOfWork: null });
    },
    upload: () => Promise.reject(new PublicApiError(0, 'network')),
    submit: (_slug, token, key, body) => {
      const at = issued.get(token);
      if (at === undefined || Date.now() - at >= SIX_HOURS) return Promise.reject(new PublicApiError(403, 'form_token_invalid'));
      if (used.has(token)) return Promise.reject(new PublicApiError(409, 'form_token_used'));
      used.add(token);
      if (Date.now() - at < MINIMUM_FILL_MS) return Promise.resolve({ reference: 'IT26-7311' }); // the fake success: nothing stored
      stored.push({ key, body });
      return Promise.resolve({ reference: 'IT27-0001' });
    },
  };
  return { api, stored };
}

let container: HTMLElement;
let root: Root;
let server: ReturnType<typeof apiLikeTheServer>;
const field = (name: string) => container.querySelector<HTMLInputElement>(`[name="${name}"]`)!;

beforeEach(async () => {
  window.sessionStorage.clear();
  server = apiLikeTheServer();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<FormRenderer form={FORM} language="en" api={server.api} storage={() => createDraftStorage(() => window.sessionStorage)} />);
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

describe('Q3-01: a token refused at Send (expired after an afternoon)', () => {
  it('the thank-you is shown only for a submission the API stored', async () => {
    await typeInto(field('title'), 'Održivi turizam na Balkanu');
    await typeInto(field('authors.1.name'), 'Marta Kovač');
    await typeInto(field('authors.1.email'), 'marta@example.test');
    await click(field('consent'));
    await click(container.querySelector<HTMLButtonElement>('button[type="submit"]')!);
    // Long enough for a renderer that waits out the minimum fill time of the new token.
    for (let i = 0; i < 40 && container.querySelector('[data-confera-thanks]') === null; i += 1) {
      await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
      await settle();
    }
    expect(container.querySelector('[data-confera-thanks]')).not.toBeNull();
    expect(server.stored, 'the submission behind the thank-you').toHaveLength(1);
  }, 15_000);
});
