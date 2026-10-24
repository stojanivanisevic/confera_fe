// The staging banner (M4-OPS-02), failing closed (SEC-M4-06): it shows unless the API confirmed an
// instance that is not staging. Production, and a developer machine's API seen from a developer stage,
// confirm; an answer that is missing, late, refused, unreadable or unsure shows the banner. A recent
// confirmation outlives a moment in which the API does not answer.
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const answer = vi.hoisted(() => ({ value: null as null | { status: number; text: string } | 'throws', stage: 'prod' }));

vi.mock('@/config/env', () => ({ getConfig: () => ({ apiOrigin: 'http://127.0.0.1:3001', adminHost: 'localhost:3000', stage: answer.stage }) }));
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
const meta = (body: Record<string, unknown>) => ({ status: 200, text: JSON.stringify(body) });

beforeEach(() => {
  answer.value = null;
  answer.stage = 'prod';
});

describe('the staging banner', () => {
  it('shows on a staging instance, in both languages, with nothing to close', async () => {
    answer.value = meta({ name: 'confera-api', version: '0.4.0', instance: 'staging' });
    const html = await render();
    expect(html).toContain('<aside class="confera-staging" aria-label="Staging"');
    expect(html).toContain('<strong lang="en">Staging — test data only</strong>');
    expect(html).toContain('<strong lang="sr">Probno okruženje — samo probni podaci</strong>');
    expect(html).not.toMatch(/<button|close/i);
  });

  it('inside a page (a form, the frame) it is a note in its main, not a second landmark', async () => {
    answer.value = meta({ stage: 'staging' });
    expect(await render(true)).toMatch(/^<p class="confera-staging" role="note"/);
  });

  it.each([
    ['production', meta({ name: 'confera-api', version: '1.0.0', instance: 'production' })],
    ['production that also names a stage', meta({ instance: 'production', stage: 'staging' })],
  ])('never renders on %s', async (_what, value) => {
    answer.value = value;
    expect(await render()).toBe('');
    expect(await render(true)).toBe('');
  });

  it.each(['local', 'dev', 'test'])('never renders on a developer machine: the API names no instance and the web application runs on %s', async (stage) => {
    answer.stage = stage;
    answer.value = meta({ name: 'confera-api', version: '0.4.0', instance: null });
    expect(await render()).toBe('');
  });

  it.each([
    ['a production build whose API names no instance', meta({ name: 'confera-api', version: '0.4.0', instance: null })],
    ['an API without an instance', meta({ name: 'confera-api', version: '0.3.0' })],
    ['a stage of prod but no instance', meta({ stage: 'prod' })],
    ['another casing', meta({ instance: 'Staging' })],
    ['an instance it does not know', meta({ instance: 'preview' })],
    ['not JSON', { status: 200, text: 'production' }],
    ['a refusal', { status: 503, text: JSON.stringify({ instance: 'production' }) }],
  ])('fails closed and shows on %s (SEC-M4-06)', async (_what, value) => {
    answer.value = value;
    expect(await render()).toContain('data-confera-staging');
  });

  it('fails closed when the API does not answer at all, on any stage', async () => {
    answer.value = 'throws';
    expect(await render()).toContain('data-confera-staging');
    answer.stage = 'local';
    expect(await render()).toContain('data-confera-staging');
  });

  it('asks the API at most once a minute; a confirmation outlives a short silence, not a long one', async () => {
    answer.value = meta({ instance: 'production' });
    const { isStaging } = await load();
    const { forwardToApi } = await import('./forward');
    const calls = vi.mocked(forwardToApi).mock.calls.length;
    expect(await isStaging(1_000)).toBe(false);
    answer.value = meta({ instance: 'staging' });
    expect(await isStaging(30_000)).toBe(false);
    expect(vi.mocked(forwardToApi).mock.calls.length - calls).toBe(1);
    // The API goes silent: the confirmation of a minute ago still counts...
    answer.value = 'throws';
    expect(await isStaging(62_000)).toBe(false);
    // ...and is asked again soon, not after a minute.
    expect(await isStaging(75_000)).toBe(false);
    expect(vi.mocked(forwardToApi).mock.calls.length - calls).toBe(3);
    // Ten minutes after the last confirmation, silence shows the banner.
    expect(await isStaging(1_000 + 10 * 60_000 + 1)).toBe(true);
  });

  it('a staging answer is believed at once, also after production was confirmed', async () => {
    answer.value = meta({ instance: 'production' });
    const { isStaging } = await load();
    expect(await isStaging(1_000)).toBe(false);
    answer.value = meta({ instance: 'staging' });
    expect(await isStaging(70_000)).toBe(true);
    answer.value = 'throws';
    expect(await isStaging(140_000)).toBe(true);
  });
});
