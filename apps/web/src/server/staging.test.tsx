// The staging banner (M4-OPS-02): shown only when the API names the stage `staging`; in
// production, and on any answer that is missing, late or unreadable, it never renders.
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const answer = vi.hoisted(() => ({ value: null as null | { status: number; text: string } | 'throws' }));

vi.mock('@/config/env', () => ({ getConfig: () => ({ apiOrigin: 'http://127.0.0.1:3001', adminHost: 'localhost:3000', stage: 'prod' }) }));
vi.mock('./forward', () => ({
  forwardToApi: vi.fn(() => {
    const value = answer.value;
    if (value === 'throws' || value === null) return Promise.reject(new Error('no answer'));
    return Promise.resolve(new Response(value.text, { status: value.status }));
  }),
}));

const load = async () => {
  vi.resetModules();
  return import('./staging');
};
const render = async (inside = false) => {
  const { StagingBanner } = await load();
  return renderToStaticMarkup(await StagingBanner({ inside }));
};

beforeEach(() => {
  answer.value = null;
});

describe('the staging banner', () => {
  it('shows on a staging instance, in both languages, with nothing to close', async () => {
    answer.value = { status: 200, text: JSON.stringify({ name: 'confera-api', version: '0.4.0', stage: 'staging' }) };
    const html = await render();
    expect(html).toContain('<aside class="confera-staging" aria-label="Staging"');
    expect(html).toContain('<strong lang="en">Staging — test data only</strong>');
    expect(html).toContain('<strong lang="sr">Probno okruženje — samo probni podaci</strong>');
    expect(html).not.toMatch(/<button|close/i);
  });

  it('inside a page (a form, the frame) it is a note in its main, not a second landmark', async () => {
    answer.value = { status: 200, text: JSON.stringify({ stage: 'staging' }) };
    expect(await render(true)).toMatch(/^<p class="confera-staging" role="note"/);
  });

  it.each([
    ['production', JSON.stringify({ name: 'confera-api', version: '1.0.0', stage: 'prod' })],
    ['production, spelled out', JSON.stringify({ stage: 'production' })],
    ['an API without a stage', JSON.stringify({ name: 'confera-api', version: '0.3.0' })],
    ['another casing', JSON.stringify({ stage: 'Staging' })],
    ['not JSON', 'staging'],
  ])('never renders on %s', async (_what, text) => {
    answer.value = { status: 200, text };
    expect(await render()).toBe('');
    expect(await render(true)).toBe('');
  });

  it('never renders when the API refuses or does not answer', async () => {
    answer.value = { status: 503, text: JSON.stringify({ stage: 'staging' }) };
    expect(await render()).toBe('');
    answer.value = 'throws';
    expect(await render()).toBe('');
  });

  it('asks the API at most once a minute', async () => {
    answer.value = { status: 200, text: JSON.stringify({ stage: 'staging' }) };
    const { isStaging } = await load();
    const { forwardToApi } = await import('./forward');
    const calls = vi.mocked(forwardToApi).mock.calls.length;
    expect(await isStaging(1_000)).toBe(true);
    answer.value = { status: 200, text: JSON.stringify({ stage: 'prod' }) };
    expect(await isStaging(30_000)).toBe(true);
    expect(await isStaging(62_000)).toBe(false);
    expect(vi.mocked(forwardToApi).mock.calls.length - calls).toBe(2);
  });
});
