// @vitest-environment jsdom
//
// ST-42, second half (M3-QA-03): markup and an inline script planted in what the office configures
// (a field's label and help, an option, the texts of the form) are shown as text and never run.
// The configuration is plain text with one link syntax (ADR-09); the renderer must not make
// elements of it, on the server's markup or in the browser.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { PublishedForm } from '../packages/form-renderer/src/definition';
import { FormRenderer } from '../packages/form-renderer/src/FormRenderer';
import { fakeApi, publishedForm } from './support/form-harness';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PLANTED = '<img src=x onerror="window.__plantedRan=1"><script>window.__plantedRan=1</script>[x](javascript:window.__plantedRan=1)';

function planted(): PublishedForm {
  const form = JSON.parse(JSON.stringify(publishedForm('itema-2026-abstract'))) as { definition: { texts: Record<string, { en: string; sr: string }>; sections: Array<{ label: { en: string }; fields: Array<{ label: { en: string }; help: { en: string } | null; options: Array<{ label: { en: string } }> | null }> }> } };
  for (const section of form.definition.sections) {
    section.label.en = `${section.label.en} ${PLANTED}`;
    for (const field of section.fields) {
      field.label.en = `${field.label.en} ${PLANTED}`;
      if (field.help) field.help.en = `${field.help.en} ${PLANTED}`;
      for (const option of field.options ?? []) option.label.en = `${option.label.en} ${PLANTED}`;
    }
  }
  for (const key of Object.keys(form.definition.texts)) form.definition.texts[key]!.en = `${form.definition.texts[key]!.en} ${PLANTED}`;
  return form as unknown as PublishedForm;
}

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  (window as { __plantedRan?: number }).__plantedRan = undefined;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  container.remove();
});

describe('ST-42: what the office configures is text, never markup', () => {
  it('in the server markup', () => {
    const html = renderToString(<FormRenderer form={planted()} language="en" api={fakeApi()} />);
    expect(html).not.toMatch(/<img[^>]*onerror/i);
    expect(html).not.toMatch(/<script>window\.__plantedRan/);
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('&lt;script&gt;');
  });

  it('in the browser: no element is made of it and nothing runs', async () => {
    await act(async () => {
      root.render(<FormRenderer form={planted()} language="en" api={fakeApi()} />);
      await Promise.resolve();
    });
    expect(container.querySelectorAll('img, script').length).toBe(0);
    expect([...container.querySelectorAll('a')].filter((a) => a.getAttribute('href')?.startsWith('javascript:'))).toEqual([]);
    expect(container.textContent).toContain('<script>window.__plantedRan=1</script>');
    expect((window as { __plantedRan?: number }).__plantedRan).toBeUndefined();
  });
});
