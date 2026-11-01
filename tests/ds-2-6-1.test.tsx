// @vitest-environment jsdom
//
// Design system 2.6.1: below 600 px the hidden header row of a DataTable does not stick out of the
// table (and widen the page): the wrap is its containing block and clips it, and each header cell is
// out of sight on its own. The header is still in the DOM with its roles, for a screen reader.
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

const RULES: Array<{ selectors: string[]; decls: Map<string, string>; at: string }> = [];
postcss.parse(css).walkRules((rule) => {
  const decls = new Map<string, string>();
  rule.each((node) => {
    if (node.type === 'decl') decls.set(node.prop, node.value);
  });
  const parent = rule.parent;
  RULES.push({ selectors: rule.selectors, decls, at: parent?.type === 'atrule' ? `@${(parent as postcss.AtRule).name} ${(parent as postcss.AtRule).params}` : '' });
});
const rule = (selector: string, at = '') => RULES.findLast((r) => r.selectors.includes(selector) && r.at.replace(/\s+/g, '') === at.replace(/\s+/g, ''))?.decls;
const NARROW = '@container (max-width: 599px)';

it('is version 2.6.1 or later', () => {
  const [major, minor, patch] = DS_VERSION.split('.').map(Number) as [number, number, number];
  expect(major * 10000 + minor * 100 + patch).toBeGreaterThanOrEqual(20601);
  expect(readFileSync(join(ds, 'CHANGELOG.md'), 'utf8')).toMatch(/^## 2\.6\.1 \(\d{4}-\d{2}-\d{2}\)$/m);
});

it('the wrap is the containing block of the hidden header row and clips it', () => {
  const wrap = rule('.ud-table-wrap')!;
  expect(wrap.get('position')).toBe('relative');
  expect(wrap.get('overflow')).toBe('hidden');
  expect(wrap.get('container-type')).toBe('inline-size');
  const thead = rule('.ud-table thead', NARROW)!;
  expect([thead.get('position'), thead.get('width'), thead.get('height'), thead.get('overflow'), thead.get('clip')]).toEqual(['absolute', '1px', '1px', 'hidden', 'rect(0 0 0 0)']);
});

it('below 600 px each header cell is out of sight on its own, the way of a text for screen readers only', () => {
  const th = rule('.ud-table thead th', NARROW)!;
  expect([th.get('position'), th.get('width'), th.get('height'), th.get('overflow'), th.get('clip'), th.get('clip-path'), th.get('white-space')]).toEqual([
    'absolute', '1px', '1px', 'hidden', 'rect(0 0 0 0)', 'inset(50%)', 'nowrap',
  ]);
  // Not taken out of the accessibility tree.
  expect(th.has('display')).toBe(false);
  expect(th.has('visibility')).toBe(false);
});

it('the header cells are still in the table with their role and text', async () => {
  const container = document.body.appendChild(document.createElement('div'));
  const root = createRoot(container);
  const columns = ['Name', 'Email address', 'ORCID iD', 'Phone', 'Institution', 'Country'].map((header, i) => ({ key: `c${i}`, header }));
  await act(async () => {
    root.render(<U.DataTable caption="Authors" rows={[{ id: 1, c0: 'Marta Kovač' }]} columns={columns} />);
    await Promise.resolve();
  });
  const headers = [...container.querySelectorAll('thead th')];
  expect(headers.map((th) => [th.getAttribute('role'), th.textContent])).toEqual(columns.map((c) => ['columnheader', c.header]));
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  container.remove();
});
