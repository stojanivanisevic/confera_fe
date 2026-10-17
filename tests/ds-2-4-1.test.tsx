// @vitest-environment jsdom
//
// Design system 2.4.1: an Alert with an action does not squeeze its text (UXUI-M2-41). The rule of the
// stylesheet here; what a browser draws at 375 and 1440 px, in e2e/ds-2-4-0.spec.ts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import postcss from 'postcss';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';

import { DS_VERSION } from '../packages/ui/src/generated/manifest';
import * as U from '../packages/ui/src/generated/udekom.client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ds = join(process.cwd(), 'design-system');
const css = readFileSync(join(ds, 'components', 'bundle.css'), 'utf8');

it('is version 2.4.1 or later', () => {
  const [major, minor, patch] = DS_VERSION.split('.').map(Number) as [number, number, number];
  expect(major * 10000 + minor * 100 + patch).toBeGreaterThanOrEqual(20401);
  expect(readFileSync(join(ds, 'CHANGELOG.md'), 'utf8')).toMatch(/^## 2\.4\.1 \(\d{4}-\d{2}-\d{2}\)$/m);
});

it('the action of an Alert sits in a part of its own', async () => {
  const container = document.body.appendChild(document.createElement('div'));
  const root = createRoot(container);
  await act(async () => {
    root.render(<U.Alert tone="warning" title="No mail server is set up yet" action={<U.Button>Add a mail server</U.Button>}>Text</U.Alert>);
    await Promise.resolve();
  });
  const alert = container.querySelector('.ud-alert')!;
  expect([...alert.children].map((child) => (child.getAttribute('class') ?? '').split(' ')[0])).toEqual(['ud-icon', 'ud-alert__body', 'ud-alert__action']);
  expect(alert.querySelector('.ud-alert__action button')!.textContent).toBe('Add a mail server');
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  container.remove();
});

it('in a box too narrow for the text beside the action, the action goes on a line of its own under the text', () => {
  const decls = new Map<string, Map<string, string>>();
  postcss.parse(css).walkRules((rule) => {
    const own = new Map<string, string>();
    rule.each((node) => {
      if (node.type === 'decl') own.set(node.prop, node.value);
    });
    for (const selector of rule.selectors) decls.set(selector, new Map([...(decls.get(selector) ?? []), ...own]));
  });
  // The Alert wraps; the text asks for 210px (half a small dialog) before it shares a line; the close
  // button stays on the first line, the action comes after it.
  expect(decls.get('.ud-alert')?.get('flex-wrap')).toBe('wrap');
  expect(decls.get('.ud-alert')?.has('container-type')).toBe(false);
  expect(decls.get('.ud-alert__body')?.get('flex')).toBe('1 1 calc(var(--dialog-sm) / 2)');
  expect(decls.get('.ud-alert > .ud-icon-btn')?.get('order')).toBe('1');
  expect(decls.get('.ud-alert__action')?.get('order')).toBe('2');
});
