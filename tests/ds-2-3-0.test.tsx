// @vitest-environment jsdom
//
// Design system 2.3.0: the UI reviewer's re-check of 2.2.0 (section 7 of the 0.1.0 UI review) and
// M1-ISS-10, 20 to 26, 42, 44, 45. Behaviour in the DOM and the rules of the stylesheet here; what a
// browser draws and does, in three engines, is in e2e/ds-2-3-0.spec.ts. The tokens and their lint
// (M1-ISS-19) are in tests/ds-tokens.test.ts and tests/lint-fixtures.test.ts.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import postcss from 'postcss';
import { act, useState, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DS_VERSION } from '../packages/ui/src/generated/manifest';
import * as U from '../packages/ui/src/generated/udekom.client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ds = join(process.cwd(), 'design-system');

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
const settle = (ms = 0) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
const click = async (element: Element) => {
  await act(async () => {
    (element as HTMLElement).click();
    await Promise.resolve();
  });
};
const fire = async (element: Element, event: Event) => {
  await act(async () => {
    element.dispatchEvent(event);
    await Promise.resolve();
  });
};
const focus = async (element: Element) => {
  await act(async () => {
    (element as HTMLElement).focus();
    await Promise.resolve();
  });
};
const byText = (text: string) => [...container.querySelectorAll('*')].find((el) => el.textContent === text && el.children.length === 0) ?? null;
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

describe('the feedback components of 0.2.0 (item 3: M1-ISS-26)', () => {
  it('ConfirmDialog is named by its title and described by its text', async () => {
    await mount(
      <U.ConfirmDialog open title="Delete ITEMA office server?" destructive onConfirm={() => undefined} onCancel={() => undefined}>
        Emails that use it will switch to the fallback server.
      </U.ConfirmDialog>,
    );
    const dialog = container.querySelector('[role="alertdialog"]')!;
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)!.textContent).toBe('Delete ITEMA office server?');
    expect(document.getElementById(dialog.getAttribute('aria-describedby')!)!.textContent).toBe('Emails that use it will switch to the fallback server.');
  });

  describe('Alert: a dismissed alert hands the focus on', () => {
    function Page({ keep = false, last = false }: { keep?: boolean; last?: boolean }) {
      const [shown, setShown] = useState(true);
      return (
        <div>
          <button type="button">Before</button>
          {shown ? <U.Alert tone="error" title="The file was not uploaded" onClose={() => setShown(keep)}>Too large.</U.Alert> : null}
          {last ? null : <button type="button">After</button>}
        </div>
      );
    }
    const dismiss = () => container.querySelector<HTMLButtonElement>('.ud-alert .ud-icon-btn')!;

    it('to the next control, not to the page', async () => {
      await mount(<Page />);
      await focus(dismiss());
      await click(dismiss());
      await settle(10);
      expect(container.querySelector('.ud-alert')).toBeNull();
      expect(document.activeElement?.textContent).toBe('After');
    });

    it('to the control before it when it was the last one', async () => {
      await mount(<Page last />);
      await focus(dismiss());
      await click(dismiss());
      await settle(10);
      expect(document.activeElement?.textContent).toBe('Before');
    });

    it('and leaves the focus alone when the owner keeps the alert', async () => {
      await mount(<Page keep />);
      await focus(dismiss());
      await click(dismiss());
      await settle(10);
      expect(document.activeElement).toBe(dismiss());
    });
  });

  describe('Toast: its time stops while the pointer or the focus is on it, and an error stays', () => {
    const toasts = () => [...container.querySelectorAll('.ud-toast')].map((t) => t.querySelector('.ud-toast__title')!.textContent);
    const region = () => container.querySelector('.ud-toasts')!;

    it('goes by itself after its time', async () => {
      await mount(<U.ToastHost />);
      await act(async () => {
        U.toast({ title: 'Saved', duration: 60 });
      });
      expect(toasts()).toEqual(['Saved']);
      await settle(150);
      expect(toasts()).toEqual([]);
    });

    it('stays while the pointer is on it and goes once it has left', async () => {
      await mount(<U.ToastHost />);
      await act(async () => {
        U.toast({ title: 'Saved', duration: 60 });
      });
      await fire(region(), new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }));
      await settle(150);
      expect(toasts()).toEqual(['Saved']);
      await fire(region(), new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
      await settle(150);
      expect(toasts()).toEqual([]);
    });

    it('stays while the focus is in it', async () => {
      await mount(
        <div>
          <button type="button">Elsewhere</button>
          <U.ToastHost />
        </div>,
      );
      await act(async () => {
        U.toast({ title: 'Saved', duration: 60 });
      });
      await focus(container.querySelector('.ud-toast button')!);
      await settle(150);
      expect(toasts()).toEqual(['Saved']);
      await focus(byText('Elsewhere')!);
      await settle(150);
      expect(toasts()).toEqual([]);
    });

    it('an error toast does not go by itself, and is announced at once', async () => {
      await mount(<U.ToastHost />);
      await act(async () => {
        U.toast({ title: 'The server did not answer', tone: 'error', duration: 60 });
      });
      await settle(150);
      expect(toasts()).toEqual(['The server did not answer']);
      expect(container.querySelector('.ud-toast')!.getAttribute('role')).toBe('alert');
    });

    it('a dismissed toast gives the focus back to where it came from', async () => {
      await mount(
        <div>
          <button type="button">Elsewhere</button>
          <U.ToastHost />
        </div>,
      );
      await act(async () => {
        U.toast({ title: 'Saved', duration: 0 });
      });
      const from = byText('Elsewhere') as HTMLButtonElement;
      await focus(from);
      const close = container.querySelector<HTMLButtonElement>('.ud-toast button')!;
      await act(async () => {
        close.dispatchEvent(new FocusEvent('focusin', { bubbles: true, relatedTarget: from }));
        close.focus();
        await Promise.resolve();
      });
      await click(close);
      await settle(10);
      expect(toasts()).toEqual([]);
      expect(document.activeElement).toBe(from);
    });
  });

  describe('DataTable: no data yet, no results, and loading', () => {
    const columns = [{ key: 'name', header: 'Name' }];

    it('without rows and without filters: "Nothing here yet", with the action of the page', async () => {
      await mount(<U.DataTable columns={columns} rows={[]} emptyAction={<U.Button>Invite a user</U.Button>} />);
      expect(container.querySelector('.ud-empty__title')!.textContent).toBe('Nothing here yet');
      expect(container.querySelector('.ud-empty .ud-btn')!.textContent).toBe('Invite a user');
    });

    it('without rows for the filters: "No results for these filters", and a button that clears them', async () => {
      let cleared = 0;
      await mount(<U.DataTable columns={columns} rows={[]} filtered onClearFilters={() => (cleared += 1)} emptyAction={<U.Button>Invite a user</U.Button>} />);
      expect(container.querySelector('.ud-empty__title')!.textContent).toBe('No results for these filters');
      expect(container.querySelector('.ud-empty .ud-btn')).toBeNull();
      await click(container.querySelector('.ud-empty .ud-text-btn')!);
      expect(cleared).toBe(1);
    });

    it('loading: the table is busy and a status line says so; the line is there before, so it is heard', async () => {
      await mount(<U.DataTable columns={columns} rows={[{ id: 1, name: 'Marta Kovač' }]} />);
      const status = container.querySelector('[role="status"]')!;
      expect(status.textContent).toBe('');
      expect(container.querySelector('table')!.hasAttribute('aria-busy')).toBe(false);
      await mount(<U.DataTable columns={columns} rows={[]} loading />);
      expect(container.querySelector('[role="status"]')).toBe(status);
      expect(status.textContent).toBe('Loading');
      expect(container.querySelector('table')!.getAttribute('aria-busy')).toBe('true');
    });
  });
});

describe('Card takes a heading level (item 4: M1-ISS-23)', () => {
  it.each([
    [undefined, 'H3'],
    [2, 'H2'],
    [4, 'H4'],
    [6, 'H6'],
    [1, 'H3'], // a card is never the page's h1
    [7, 'H3'],
  ] as const)('headingLevel %s gives an %s', async (level, tag) => {
    await mount(<U.Card title="API" headingLevel={level as 2 | 3 | 4 | 5 | 6 | undefined} />);
    const title = container.querySelector('.ud-card__title')!;
    expect(title.tagName).toBe(tag);
    expect(title.textContent).toBe('API');
    expect(container.querySelector('section')!.hasAttribute('headingLevel')).toBe(false);
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
