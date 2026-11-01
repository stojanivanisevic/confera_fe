// @vitest-environment jsdom
//
// Design system 2.6.0: three icons (image, message-square, rotate-ccw), named type styles for small
// labels and initials (M2-ISS-02, UI-DS-02), no control in the open cell of a DataTable (M2-ISS-03,
// UI-DS-03), fields and links that are targets of 44 px themselves (UXUI-M2-34), and size tokens for
// page layouts (UXUI-M2-36). Behaviour in the DOM and the rules of the stylesheet; what a browser
// measures stays with the touch walk of e2e/ds-2-3-0.spec.ts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import postcss from 'postcss';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DS_VERSION, ICON_NAMES } from '../packages/ui/src/generated/manifest';
import * as U from '../packages/ui/src/generated/udekom.client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ds = join(process.cwd(), 'design-system');
const css = readFileSync(join(ds, 'components', 'bundle.css'), 'utf8');
const tokensCss = readFileSync(join(ds, 'tokens.css'), 'utf8').replace(/\r\n/g, '\n');
const declared = new Map([...tokensCss.matchAll(/^ {2}(--[a-z0-9-]+): ([^;]+);$/gm)].map((m) => [m[1]!, m[2]!]));

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
  vi.restoreAllMocks();
});
const mount = async (element: ReactElement) => {
  await act(async () => {
    reactRoot.render(element);
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
const COARSE = '@media (pointer: coarse)';

it('is version 2.6.0 or later', () => {
  const [major, minor] = DS_VERSION.split('.').map(Number) as [number, number];
  expect(major * 100 + minor).toBeGreaterThanOrEqual(206);
  expect(readFileSync(join(ds, 'CHANGELOG.md'), 'utf8')).toMatch(/^## 2\.6\.0 \(\d{4}-\d{2}-\d{2}\)$/m);
});

describe('icons: image, message-square, rotate-ccw', () => {
  it('exist, in the manifest and in the bundle, drawn as the other icons', async () => {
    for (const name of ['image', 'message-square', 'rotate-ccw'] as const) {
      expect(ICON_NAMES).toContain(name);
      await mount(<U.Icon name={name} />);
      const svg = container.querySelector('svg')!;
      expect(svg.children.length, name).toBeGreaterThan(0);
      expect([svg.getAttribute('viewBox'), svg.getAttribute('stroke'), svg.getAttribute('stroke-width'), svg.getAttribute('fill')]).toEqual(['0 0 24 24', 'currentColor', '2', 'none']);
    }
    expect(ICON_NAMES).toHaveLength(58);
  });
});

describe('named type styles for small labels and initials (M2-ISS-02, UI-DS-02)', () => {
  it.each([
    ['caption-xs-upper', '700 12px/1.2 var(--font-sans)', '0.02em'],
    ['overline', '700 12px/1.2 var(--font-sans)', '0.08em'],
    ['initials-sm', '700 12px/1.2 var(--font-sans)', '0'],
    ['initials', '700 14px/1.2 var(--font-sans)', '0'],
    ['initials-lg', '700 20px/1.2 var(--font-sans)', '0'],
  ])('--text-%s is "%s", tracked %s', (name, font, tracking) => {
    expect(declared.get(`--text-${name}`)).toBe(font);
    expect(declared.get(`--text-${name}-tracking`)).toBe(tracking);
  });

  it.each([
    ['.ud-table th', 'caption-xs-upper'],
    ['.ud-sidenav__title', 'overline'],
    ['.ud-stepper__dot', 'initials-sm'],
    ['.ud-avatar--sm', 'initials-sm'],
    ['.ud-repeater__index', 'initials-sm'],
    ['.ud-avatar', 'initials'],
    ['.ud-avatar--lg', 'initials-lg'],
  ])('%s takes the style %s with its own tracking, and sets no weight', (selector, style) => {
    const decls = rule(selector)!;
    expect(decls.get('font')).toBe(`var(--text-${style})`);
    expect(decls.get('letter-spacing')).toBe(`var(--text-${style}-tracking)`);
    expect(decls.has('font-weight')).toBe(false);
  });

  it('no rule takes caption-xs, caption or h5 and then sets its weight or another tracking in the same rule', () => {
    const offenders = RULES.filter((r) => {
      const font = /^var\(--text-(caption-xs|caption|h5)\)$/.exec(r.decls.get('font') ?? '');
      if (!font) return false;
      const spacing = r.decls.get('letter-spacing');
      return r.decls.has('font-weight') || (spacing !== undefined && spacing !== `var(--text-${font[1]}-tracking)`);
    }).map((r) => r.selectors.join(', '));
    expect(offenders).toEqual([]);
  });
});

describe('DataTable: no control in the open cell (M2-ISS-03, UI-DS-03)', () => {
  const rows = [
    { id: 1, name: 'Marta Kovač', email: 'marta@example.test' },
    { id: 2, name: 'Lazar Primerić', email: 'lazar@example.test' },
  ];
  const errors = () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    return () => spy.mock.calls.map((c) => String(c[0])).filter((m) => m.startsWith('[Udekom] DataTable'));
  };

  it('a cell of text is the open button, and nothing is said', async () => {
    const said = errors();
    const opened: number[] = [];
    await mount(<U.DataTable caption="Users" selectable rows={rows} columns={[{ key: 'name', header: 'Name' }, { key: 'email', header: 'Email' }]} onRowClick={(r) => opened.push(r.id)} />);
    const buttons = [...container.querySelectorAll<HTMLButtonElement>('.ud-table__open')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Marta Kovač', 'Lazar Primerić']);
    buttons[1]!.click();
    expect(opened).toEqual([2]);
    expect(said()).toEqual([]);
  });

  it('a cell whose render returns a link is drawn without the open button; the console says which column, once', async () => {
    const said = errors();
    await mount(
      <U.DataTable
        caption="Users"
        selectable
        rows={rows}
        columns={[{ key: 'name', header: 'Name', render: (r: { id: number; name: string }) => <a href={`/users/${r.id}`}>{r.name}</a> }, { key: 'email', header: 'Email' }]}
        onRowClick={() => undefined}
      />,
    );
    expect(container.querySelector('.ud-table__open')).toBeNull();
    expect([...container.querySelectorAll('tbody a')].map((a) => a.closest('button'))).toEqual([null, null]);
    // The selection checkboxes are unchanged.
    expect(container.querySelectorAll('tbody .ud-table__check input[type=checkbox]')).toHaveLength(2);
    expect(said()).toHaveLength(1);
    expect(said()[0]).toContain('openColumn "name"');
  });

  it.each([
    ['a button of the system', () => <U.TextButton onClick={() => undefined}>Resend</U.TextButton>],
    ['an element with tabIndex 0', () => <div role="tabpanel" tabIndex={0}>focusable</div>],
    ['an element with a control role', () => <span role="link">link</span>],
    ['a removable Tag', () => <U.Tag onRemove={() => undefined}>Tag</U.Tag>],
  ])('%s in the open cell is found in the elements', async (_name, render) => {
    const said = errors();
    await mount(<U.DataTable caption="Users" rows={rows} columns={[{ key: 'name', header: 'Name', render }]} onRowClick={() => undefined} openColumn="name" />);
    expect(container.querySelector('.ud-table__open')).toBeNull();
    expect(said()).toHaveLength(1);
  });

  it('a component of the consumer that draws a link is found once drawn, and the cell is drawn again without the button', async () => {
    const said = errors();
    function Mine({ id }: { id: number }) {
      return <a href={`/users/${id}`}>Open {id}</a>;
    }
    await mount(<U.DataTable caption="Users" rows={rows} columns={[{ key: 'name', header: 'Name', render: (r: { id: number }) => <Mine id={r.id} /> }]} onRowClick={() => undefined} />);
    expect(container.querySelector('.ud-table__open')).toBeNull();
    expect([...container.querySelectorAll('tbody a')].map((a) => a.closest('button'))).toEqual([null, null]);
    expect(said()).toHaveLength(1);
  });

  it('a link without href and plain markup are no control', async () => {
    const said = errors();
    await mount(<U.DataTable caption="Users" rows={rows} columns={[{ key: 'name', header: 'Name', render: (r: { name: string }) => <strong>{r.name}</strong> }]} onRowClick={() => undefined} />);
    expect(container.querySelectorAll('.ud-table__open')).toHaveLength(2);
    expect(said()).toEqual([]);
  });
});

describe('fields and links are targets of 44 px themselves (UXUI-M2-34)', () => {
  it('the control of a field is target-touch high and reaches over the border of its box; a textarea and a multiple Autocomplete keep theirs', () => {
    expect(rule('.ud-field__box', COARSE)?.get('min-height')).toBe('var(--target-touch)');
    expect(rule('.ud-field__control', COARSE)?.get('height')).toBe('var(--target-touch)');
    expect(rule('.ud-field__control', COARSE)?.get('margin-block')).toBe('-1px');
    expect(rule('.ud-search__control', COARSE)?.get('align-self')).toBe('stretch');
    expect(rule('.ud-search__control', COARSE)?.get('margin-block')).toBe('-1px');
    expect(rule('.ud-field--area .ud-field__control', COARSE)?.get('margin-block')).toBe('0');
    expect(rule('.ud-field--multi .ud-field__control', COARSE)?.get('margin-block')).toBe('0');
  });

  it.each([
    ['TextField', <U.TextField key="t" label="Name" />],
    ['Select', <U.Select key="s" label="Country" options={[{ value: 'rs', label: 'Serbia' }]} />],
    ['NumberField', <U.NumberField key="n" label="Seats" />],
    ['DateField', <U.DateField key="d" label="Deadline" />],
    ['PasswordField', <U.PasswordField key="p" label="Password" />],
  ])('%s draws its control with the class that grows', async (_name, element) => {
    await mount(element);
    expect(container.querySelector('.ud-field__box .ud-field__control')).not.toBeNull();
  });

  it('a text link has padding above and below and an invisible layer of 44 x 44 px at least', () => {
    expect(rule('.ud-link', COARSE)?.get('position')).toBe('relative');
    expect(rule('.ud-link', COARSE)?.get('padding-block')).toBe('max(0px, calc((var(--target-touch) - 1em) / 2))');
    const layer = rule('.ud-link::after', COARSE)!;
    expect(layer.get('content')).toBe('""');
    expect(layer.get('position')).toBe('absolute');
    expect(layer.get('width')).toBe('max(100%, var(--target-touch))');
    expect(layer.get('height')).toBe('max(100%, var(--target-touch))');
    expect(rule('.ud-alert__body a::after', COARSE)?.get('width')).toBe('max(100%, var(--target-touch))');
  });
});

describe('size tokens for page layouts (UXUI-M2-36)', () => {
  it.each([
    ['card-min', '320px'],
    ['field-min', '240px'],
    ['filter-field-min', '180px'],
    ['filter-field-max', '320px'],
  ])('--%s is %s', (name, px) => {
    expect(declared.get(`--${name}`)).toBe(px);
  });

  it('a FilterBar field starts from filter-field-min and grows to filter-field-max', () => {
    const decls = rule('.ud-filterbar__fields > *')!;
    expect(decls.get('flex')).toBe('1 1 var(--filter-field-min)');
    expect(decls.get('max-width')).toBe('var(--filter-field-max)');
  });
});
