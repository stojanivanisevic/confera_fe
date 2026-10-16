// @vitest-environment jsdom
//
// Design system 2.4.0: the UI findings of the 0.2.0 UX and UI review (UXUI-M2-03, 04, 08, 22, 25, 26,
// 27, 35) and M2-ISS-01, 07, 08. Behaviour in the DOM and the rules of the stylesheet here; what a
// browser draws (the cards of a narrow table, the pressed ring), in e2e/ds-2-4-0.spec.ts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import postcss from 'postcss';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DS_VERSION, ICON_NAMES } from '../packages/ui/src/generated/manifest';
import * as U from '../packages/ui/src/generated/udekom.client';
import { LABELS_SR } from '../packages/ui/src/labels';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ds = join(process.cwd(), 'design-system');
const css = readFileSync(join(ds, 'components', 'bundle.css'), 'utf8');

let container: HTMLElement;
let reactRoot: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  reactRoot = createRoot(container);
});
afterEach(async () => {
  await act(async () => {
    reactRoot.unmount();
    await Promise.resolve();
  });
  container.remove();
});
const mount = async (element: ReactElement) => {
  await act(async () => {
    reactRoot.render(element);
    await Promise.resolve();
  });
};
const click = async (element: Element) => {
  await act(async () => {
    (element as HTMLElement).click();
    await Promise.resolve();
  });
};

/** Every rule of the stylesheet with the at-rule around it ('' outside). */
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

it('is version 2.4.0', () => {
  expect(DS_VERSION).toBe('2.4.0');
  expect(readFileSync(join(ds, 'CHANGELOG.md'), 'utf8')).toMatch(/^## 2\.4\.0 \(\d{4}-\d{2}-\d{2}\)$/m);
});

describe('DataTable on a phone (UXUI-M2-03, 26, M2-ISS-08)', () => {
  const rows = [{ id: 1, name: 'Marko Petrović', email: 'marko@example.test', status: 'Active' }];
  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email address' },
    { key: 'status', header: <span>Status</span>, label: 'Status' },
  ];

  it('every cell but the first carries its header as a label; the cells keep the roles of a table', async () => {
    await mount(<U.DataTable caption="Users" rows={rows} columns={columns} />);
    const cells = [...container.querySelectorAll('tbody td')];
    expect(cells.map((td) => td.getAttribute('data-label'))).toEqual(['Name', 'Email address', 'Status']);
    expect(cells[0]!.classList.contains('ud-table__lead')).toBe(true);
    expect(container.querySelector('table')!.getAttribute('role')).toBe('table');
    expect([...container.querySelectorAll('tr')].every((tr) => tr.getAttribute('role') === 'row')).toBe(true);
    expect(cells.every((td) => td.getAttribute('role') === 'cell')).toBe(true);
    expect(container.querySelector('th')!.getAttribute('role')).toBe('columnheader');
  });

  it('below 600 px of its own width the table is a card per row, the header out of sight, the label before each value', () => {
    const at = '@container (max-width: 599px)';
    expect(rule('.ud-table-wrap')?.get('container-type')).toBe('inline-size');
    expect(rule('.ud-table td', at)?.get('display')).toBe('grid');
    expect(rule('.ud-table thead', at)?.get('clip')).toBe('rect(0 0 0 0)');
    expect(rule('.ud-table td::before', at)?.get('content')).toBe('attr(data-label)');
    expect(rule('.ud-table td.ud-table__lead::before', at)?.get('content')).toBe('none');
  });

  it('the scroll area takes the focus and has a name only while it scrolls', async () => {
    await mount(<U.DataTable caption="Users" rows={rows} columns={columns} />);
    const area = container.querySelector<HTMLElement>('.ud-table__scroll')!;
    expect(area.hasAttribute('tabindex')).toBe(false);
    // The table is wider than its box (jsdom measures nothing: the sizes are given).
    Object.defineProperty(area, 'scrollWidth', { configurable: true, value: 900 });
    Object.defineProperty(area, 'clientWidth', { configurable: true, value: 343 });
    await mount(<U.DataTable caption="Users " rows={rows} columns={columns} />);
    expect(area.getAttribute('tabindex')).toBe('0');
    expect(area.getAttribute('role')).toBe('region');
    expect(area.getAttribute('aria-label')).toBe('Users ');
    expect(rule('.ud-table__scroll:focus-visible')?.get('outline')).toBe('2px solid var(--focus)');
  });
});

describe('AppShell (UXUI-M2-04, 35)', () => {
  const view = document.defaultView as unknown as { matchMedia?: (q: string) => unknown };
  beforeEach(() => {
    view.matchMedia = (query: string) => ({ media: query, matches: true, addEventListener: () => undefined, removeEventListener: () => undefined });
  });
  afterEach(() => {
    delete view.matchMedia;
  });

  it('a link chosen in the open drawer closes it, and the focus goes to the content', async () => {
    await mount(
      <U.AppShell product="Confera" sidebar={<U.SidebarNav items={[{ label: 'Users', value: 'u', href: '#u' }]} onNavigate={() => undefined} />}>
        <h1>Users</h1>
      </U.AppShell>,
    );
    await click(container.querySelector('.ud-shell__menu')!);
    const side = container.querySelector<HTMLElement>('.ud-shell__side')!;
    expect(side.classList.contains('is-open')).toBe(true);
    await click(side.querySelector('a[href="#u"]')!);
    expect(side.classList.contains('is-open')).toBe(false);
    expect(document.activeElement).toBe(container.querySelector('main'));
  });

  it('the first stop of the Tab order skips to the content', async () => {
    await mount(<U.AppShell product="Confera">content</U.AppShell>);
    const skip = container.querySelector<HTMLAnchorElement>('.ud-shell > a')!;
    expect(skip.textContent).toBe('Skip to content');
    expect(skip.getAttribute('href')).toBe(`#${container.querySelector('main')!.id}`);
    await click(skip);
    expect(document.activeElement).toBe(container.querySelector('main'));
    expect(LABELS_SR.skipToContent).toBe('Pređi na sadržaj');
    expect(LABELS_SR.table).toBe('Tabela');
  });
});

describe('a toggle that is on is seen, not only read (UXUI-M2-22)', () => {
  it('Button and IconButton with aria-pressed="true" draw the ring of a chosen pill on a lighter surface', () => {
    expect(rule('.ud-icon-btn[aria-pressed="true"]')?.get('box-shadow')).toBe('inset 0 0 0 2px var(--brand-orange-strong)');
    expect(rule('.ud-btn[aria-pressed="true"]')?.get('box-shadow')).toBe('inset 0 0 0 2px var(--brand-orange-strong)');
    expect(rule('.ud-btn[aria-pressed="true"]')?.get('background-color')).toBe('var(--surface-1)');
  });

  it('the icons of a rich-text toolbar exist (M2-ISS-07), and an empty circle', async () => {
    for (const name of ['bold', 'italic', 'underline', 'list', 'list-ordered', 'undo', 'redo', 'corner-down-left', 'braces', 'circle'] as const) {
      expect(ICON_NAMES).toContain(name);
      await mount(<U.Icon name={name} />);
      expect(container.querySelector('svg')!.children.length, name).toBeGreaterThan(0);
    }
  });
});

describe('long values and messages (UXUI-M2-25, 27)', () => {
  it('a long address breaks inside an Alert; a field message of two lines does not touch', () => {
    const anyRule = (selector: string, prop: string) => RULES.filter((r) => r.selectors.includes(selector) && r.at === '').map((r) => r.decls.get(prop)).find((value) => value !== undefined);
    expect(anyRule('.ud-alert__title', 'overflow-wrap')).toBe('anywhere');
    expect(anyRule('.ud-alert__text', 'overflow-wrap')).toBe('anywhere');
    expect(anyRule('.ud-field__message', 'line-height')).toBe('1.4');
  });
});

describe('the Drawer body that scrolls takes the focus (UXUI-M2-26)', () => {
  it('named by the title of the drawer', async () => {
    await mount(
      <U.Drawer open title="Entry" onClose={() => undefined}>
        <p>Details</p>
      </U.Drawer>,
    );
    const body = document.querySelector<HTMLElement>('.ud-drawer__body')!;
    expect(body.hasAttribute('tabindex')).toBe(false);
    Object.defineProperty(body, 'scrollHeight', { configurable: true, value: 2000 });
    Object.defineProperty(body, 'clientHeight', { configurable: true, value: 600 });
    await mount(
      <U.Drawer open title="Entry " onClose={() => undefined}>
        <p>Details</p>
      </U.Drawer>,
    );
    expect(body.getAttribute('tabindex')).toBe('0');
    expect(document.getElementById(body.getAttribute('aria-labelledby')!)!.textContent).toBe('Entry ');
  });
});
