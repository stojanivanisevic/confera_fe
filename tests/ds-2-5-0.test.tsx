// @vitest-environment jsdom
//
// Design system 2.5.0: a pill of SegmentedTabs names its language (WCAG 3.1.2, UX-M1-23), and the
// " *" of a required FileDropzone is not read out (UX-M1-21).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';

import { DS_VERSION } from '../packages/ui/src/generated/manifest';
import * as U from '../packages/ui/src/generated/udekom.client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ds = join(process.cwd(), 'design-system');

const render = async (node: ReactNode) => {
  const container = document.body.appendChild(document.createElement('div'));
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
    await Promise.resolve();
  });
  return {
    container,
    done: async () => {
      await act(async () => {
        root.unmount();
        await Promise.resolve();
      });
      container.remove();
    },
  };
};

it('is version 2.5.0 or later', () => {
  const [major, minor] = DS_VERSION.split('.').map(Number) as [number, number];
  expect(major * 100 + minor).toBeGreaterThanOrEqual(205);
  expect(readFileSync(join(ds, 'CHANGELOG.md'), 'utf8')).toMatch(/^## 2\.5\.0 \(\d{4}-\d{2}-\d{2}\)$/m);
});

it('a pill with lang carries it; a pill without it takes the page language', async () => {
  const view = await render(
    <U.SegmentedTabs
      label="Language"
      value="en"
      onChange={() => undefined}
      options={[
        { value: 'en', label: 'English', lang: 'en' },
        { value: 'sr', label: 'Srpski', lang: 'sr' },
        { value: 'x', label: 'Plain' },
      ]}
    />,
  );
  const buttons = [...view.container.querySelectorAll('button')];
  expect(buttons.map((b) => [b.textContent, b.getAttribute('lang')])).toEqual([
    ['English', 'en'],
    ['Srpski', 'sr'],
    ['Plain', null],
  ]);
  await view.done();
});

it('the star of a required FileDropzone is seen but hidden from screen readers', async () => {
  const view = await render(<U.FileDropzone label="Biographies" required files={[]} onFiles={() => undefined} onRemove={() => undefined} />);
  const label = view.container.querySelector('.ud-field__label')!;
  expect(label.textContent).toBe('Biographies *');
  const star = [...label.querySelectorAll('[aria-hidden="true"]')];
  expect(star.map((s) => s.textContent)).toEqual([' *']);
  await view.done();
});
