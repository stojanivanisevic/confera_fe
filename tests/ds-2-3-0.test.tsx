// @vitest-environment jsdom
//
// Design system 2.3.0: the UI reviewer's re-check of 2.2.0 (section 7 of the 0.1.0 UI review) and
// M1-ISS-10, 20 to 26, 42, 44, 45. Behaviour in the DOM and the rules of the stylesheet here; what a
// browser draws and does, in three engines, is in e2e/ds-2-3-0.spec.ts. The tokens and their lint
// (M1-ISS-19) are in tests/ds-tokens.test.ts and tests/lint-fixtures.test.ts.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

import { DS_VERSION } from '../packages/ui/src/generated/manifest';

const ds = join(process.cwd(), 'design-system');
const css = readFileSync(join(ds, 'components', 'bundle.css'), 'utf8');

/** Every rule of the stylesheet: its selectors, its declarations, and the @media it sits in ('' outside). */
const RULES: Array<{ selectors: string[]; decls: Map<string, string>; media: string }> = [];
postcss.parse(css).walkRules((rule) => {
  const decls = new Map<string, string>();
  rule.each((node) => {
    if (node.type === 'decl') decls.set(node.prop, node.value);
  });
  const parent = rule.parent;
  RULES.push({ selectors: rule.selectors, decls, media: parent?.type === 'atrule' && (parent as postcss.AtRule).name === 'media' ? (parent as postcss.AtRule).params : '' });
});
/** The declarations of the rule that names this selector (outside @media unless one is given). */
const rule = (selector: string, media = '') => RULES.find((r) => r.selectors.includes(selector) && r.media.replace(/\s+/g, '') === media.replace(/\s+/g, ''))?.decls;

it('is version 2.3.0', () => {
  expect(DS_VERSION).toBe('2.3.0');
});

describe('one focus ring everywhere, and a text link (item 1: M1-ISS-21, R-02)', () => {
  it.each([
    '.ud-pagination__size select:focus-visible',
    '.ud-breadcrumbs a:focus-visible',
    'button.ud-stepper__btn:focus-visible',
    '.ud-sidenav__link:focus-visible',
    '.ud-link:focus-visible',
    '.ud-alert__body a:focus-visible',
  ])('%s draws the blue outline (it was the browser’s own ring, or orange)', (selector) => {
    expect(rule(selector)?.get('outline')).toBe('2px solid var(--focus)');
  });

  it('no focus state of the stylesheet draws anything but the blue outline or the blue ring', () => {
    const offenders: string[] = [];
    for (const r of RULES) {
      const focus = r.selectors.filter((s) => /:focus(-visible|-within)?\b/.test(s));
      if (focus.length === 0) continue;
      const outline = r.decls.get('outline');
      const shadow = r.decls.get('box-shadow');
      if (outline !== undefined && !/var\(--focus\)/.test(outline) && !(/^(0|none)$/.test(outline) && shadow === 'var(--focus-ring)')) offenders.push(`${focus.join(', ')} { outline: ${outline} }`);
      if (shadow !== undefined && !/var\(--focus(-ring)?\)/.test(shadow)) offenders.push(`${focus.join(', ')} { box-shadow: ${shadow} }`);
      if (r.decls.get('outline-color') !== undefined) offenders.push(`${focus.join(', ')} { outline-color }`);
    }
    expect(offenders).toEqual([]);
  });

  it('a text link is underlined, in ink, and Alert gives its links the same style', () => {
    const link = rule('.ud-link')!;
    expect(link).toBe(rule('.ud-alert__body a'));
    expect(link.get('color')).toBe('var(--ink)');
    expect(link.get('text-decoration')).toBe('underline');
    expect(rule('.ud-link--brand')?.get('color')).toBe('var(--brand-orange-strong)');
  });
});

describe('targets for a finger (item 2: M1-ISS-20)', () => {
  const COARSE = '(pointer: coarse)';
  it.each([
    ['.ud-icon-btn', 'width'], ['.ud-icon-btn', 'height'], ['.ud-arrow-btn--sm', 'width'],
    ['.ud-btn', 'height'], ['.ud-text-btn', 'height'], ['.ud-tab', 'height'], ['.ud-search', 'height'], ['.ud-file__btn', 'height'],
    ['.ud-pagination__size select', 'height'], ['.ud-page-btn', 'min-width'], ['.ud-page-btn', 'height'],
    ['.ud-field__box', 'min-height'], ['.ud-field__action', 'min-width'], ['.ud-field__action', 'min-height'],
    ['.ud-search__clear', 'min-width'], ['.ud-search__clear', 'min-height'], ['.ud-tag__remove', 'min-width'], ['.ud-tag__remove', 'min-height'],
    ['.ud-check', 'min-height'], ['.ud-radio', 'min-height'], ['.ud-switch', 'min-height'], ['.ud-tabs-u__tab', 'min-height'],
    ['.ud-menu__item', 'min-height'], ['.ud-sidenav__link', 'min-height'], ['button.ud-stepper__btn', 'min-height'],
    ['.ud-table__check .ud-check', 'min-width'], ['.ud-matrix__cell .ud-check', 'min-width'], ['.ud-listbox__option', 'min-height'],
  ])('on a touch screen %s has %s target-touch (44px)', (selector, prop) => {
    const where = RULES.filter((r) => r.selectors.includes(selector) && r.media.replace(/\s+/g, '') === COARSE.replace(/\s+/g, '') && r.decls.has(prop));
    expect(where.at(-1)?.decls.get(prop), `${selector} ${prop}`).toBe('var(--target-touch)');
  });

  it('links and sort buttons get an invisible target of 44 px over them, so the line and the header do not move', () => {
    const layer = rule('.ud-nav-link::after', COARSE)!;
    expect(rule('.ud-breadcrumbs a::after', COARSE)).toBe(layer);
    expect(rule('.ud-table__sort::after', COARSE)).toBe(layer);
    expect(layer.get('width')).toBe('max(100%, var(--target-touch))');
    expect(layer.get('height')).toBe('max(100%, var(--target-touch))');
    expect(rule('.ud-link', COARSE)?.get('padding-block')).toBe('max(0px, calc((var(--target-touch) - 1lh) / 2))');
  });

  it('with a mouse a sort button is a target of 24 px at least (WCAG 2.5.8)', () => {
    expect(rule('.ud-table__sort::after')?.get('height')).toBe('max(100%, var(--target-min))');
  });
});

describe('previews hold invented people only (M1-ISS-42, NFR-PRIV-05)', () => {
  const previews = readdirSync(join(ds, 'components'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => [d.name, readFileSync(join(ds, 'components', d.name, 'preview.html'), 'utf8')] as const);

  it('reads every preview', () => {
    expect(previews.length).toBe(54);
  });

  it.each(previews)('%s: every e-mail address is on example.test', (_name, html) => {
    for (const [address] of html.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)) expect(address).toMatch(/@([\w-]+\.)*example\.test$/);
  });

  it.each(previews)('%s: no name or address of the association, its client or a real university', (_name, html) => {
    expect(html).not.toMatch(/Nikolina|Vrcelj|udekom\.org|Petrovic|Jovanovic|Kostic|University of (Novi Sad|Belgrade)/);
  });

  it('the AppShell preview shows the logo of the release, not an address that exists only where it was authored', () => {
    const shell = previews.find(([name]) => name === 'AppShell')![1];
    expect(shell).not.toContain('/_blob/');
    expect(shell).toContain("src:'../../assets/Logos/udekom-mark-on-dark.png'");
  });
});
