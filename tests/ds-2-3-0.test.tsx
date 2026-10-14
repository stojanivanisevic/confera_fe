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
    ['.ud-btn', 'height'], ['.ud-text-btn', 'height'], ['.ud-tab', 'height'], ['.ud-search', 'height'],
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
    expect(rule('.ud-link', COARSE)?.get('padding-block')).toBe('max(0px, calc((var(--target-touch) - 1em) / 2))');
  });

  it('the file button is 44px high already: 36px and its 4px ring above and below', () => {
    expect(rule('.ud-file__btn')?.get('height')).toBe('var(--file-button-height)');
    expect(rule('.ud-file__btn')?.get('border')).toBe('4px solid var(--ink-halo)');
    expect(readFileSync(join(ds, 'tokens.css'), 'utf8')).toContain('--file-button-height: 36px;');
  });

  it('a part that grows to 44px counts its padding in (box-sizing), so it is not 44 and its padding', () => {
    for (const r of RULES.filter((x) => x.media.replace(/\s+/g, '') === '(pointer:coarse)' && [...x.decls.values()].some((v) => v.includes('--target-touch')))) {
      // Not parts without padding or border (the control of a field), invisible layers, the box of a field (min-height), inline links.
      if (r.selectors.some((s) => s.endsWith('::after')) || r.selectors.includes('.ud-field__box') || r.selectors.includes('.ud-field__control') || r.selectors.includes('.ud-link')) continue;
      expect(r.decls.get('box-sizing') ?? RULES.find((x) => x.media === '' && r.selectors.every((s) => x.selectors.includes(s)))?.decls.get('box-sizing'), r.selectors.join(', ')).toBe('border-box');
    }
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
        await Promise.resolve();
      });
      expect(toasts()).toEqual(['Saved']);
      await settle(150);
      expect(toasts()).toEqual([]);
    });

    it('stays while the pointer is on it and goes once it has left', async () => {
      await mount(<U.ToastHost />);
      await act(async () => {
        U.toast({ title: 'Saved', duration: 60 });
        await Promise.resolve();
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
        await Promise.resolve();
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
        await Promise.resolve();
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
        await Promise.resolve();
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

describe('DataTable rows that open something are reached by keyboard (item 5: M1-ISS-10)', () => {
  const rows = [
    { id: 1, name: 'Marta Kovač', email: 'marta@example.test' },
    { id: 2, name: 'Živana Čolić', email: 'zivana@example.test' },
  ];
  const columns = [
    { key: 'name', header: 'Author' },
    { key: 'email', header: 'Email' },
  ];

  it('the first cell of each row is a button named by its text, and it opens the row once', async () => {
    const opened: string[] = [];
    await mount(<U.DataTable columns={columns} rows={rows} onRowClick={(row: { name: string }) => opened.push(row.name)} />);
    const buttons = [...container.querySelectorAll<HTMLButtonElement>('tbody button.ud-table__open')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Marta Kovač', 'Živana Čolić']);
    expect(buttons.every((b) => b.type === 'button' && b.tabIndex === 0)).toBe(true);
    await click(buttons[1]!);
    expect(opened).toEqual(['Živana Čolić']);
    // A click elsewhere in the row still opens it.
    await click(container.querySelectorAll('tbody tr')[0]!.querySelectorAll('td')[1]!);
    expect(opened).toEqual(['Živana Čolić', 'Marta Kovač']);
  });

  it('openColumn names another column', async () => {
    await mount(<U.DataTable columns={columns} rows={rows} openColumn="email" onRowClick={() => undefined} />);
    expect([...container.querySelectorAll('tbody button.ud-table__open')].map((b) => b.textContent)).toEqual(['marta@example.test', 'zivana@example.test']);
  });

  it('a table whose rows open nothing has no such button', async () => {
    await mount(<U.DataTable columns={columns} rows={rows} />);
    expect(container.querySelector('button.ud-table__open')).toBeNull();
  });

  it('the button has the blue focus outline and a target of 24 px at least', () => {
    expect(rule('.ud-table__open:focus-visible')?.get('outline')).toBe('2px solid var(--focus)');
    expect(rule('.ud-table__open::after')?.get('height')).toBe('max(100%, var(--target-min))');
  });
});

describe('AppShell, the modal layer and Menu (item 6: R-01, R-03, R-06, R-07)', () => {
  const key = (target: EventTarget, name: string, init: KeyboardEventInit = {}) =>
    act(async () => {
      target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init }));
      await Promise.resolve();
    });

  describe('Menu', () => {
    function Page() {
      return (
        <div>
          <U.Menu label="Row actions" items={[{ label: 'Open' }, { label: 'Delete' }]} />
          <button type="button">After the menu</button>
        </div>
      );
    }
    const trigger = () => container.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!;

    it('Tab closes the open menu and goes on to the next control (R-01)', async () => {
      await mount(<Page />);
      await click(trigger());
      expect(document.activeElement?.getAttribute('role')).toBe('menuitem');
      await key(document.activeElement!, 'Tab');
      expect(container.querySelector('[role="menu"]')).toBeNull();
      expect(document.activeElement?.textContent).toBe('After the menu');
    });

    it('Shift+Tab closes it and goes back to its button', async () => {
      await mount(<Page />);
      await click(trigger());
      await key(document.activeElement!, 'Tab', { shiftKey: true });
      expect(container.querySelector('[role="menu"]')).toBeNull();
      expect(document.activeElement).toBe(trigger());
    });

    it('inside a dialog, Escape closes the menu and not the dialog', async () => {
      let closed = 0;
      await mount(
        <U.Dialog open title="Edit the server" onClose={() => (closed += 1)}>
          <U.Menu label="Row actions" items={[{ label: 'Open' }]} />
        </U.Dialog>,
      );
      await click(trigger());
      await key(document.activeElement!, 'Escape');
      expect(container.querySelector('[role="menu"]')).toBeNull();
      expect(closed).toBe(0);
      expect(document.activeElement).toBe(trigger());
    });
  });

  describe('the modal layer of Dialog and Drawer', () => {
    function Page() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>Open the drawer</button>
          <p id="behind">The page behind</p>
          <U.Drawer open={open} onClose={() => setOpen(false)} title="Submission" actions={<U.Button onClick={() => setOpen(false)}>Done</U.Button>}>
            <a href="#first">The first link</a>
            <a href="#second">The second link</a>
          </U.Drawer>
        </div>
      );
    }
    const opener = () => byText('Open the drawer') as HTMLButtonElement;
    const panel = () => container.querySelector<HTMLElement>('.ud-drawer')!;

    it('makes the page behind inert while it is open, and gives it back', async () => {
      await mount(<Page />);
      await focus(opener());
      await click(opener());
      expect(document.getElementById('behind')!.hasAttribute('inert')).toBe(true);
      expect(opener().hasAttribute('inert')).toBe(true);
      expect(container.querySelector('.ud-overlay')!.hasAttribute('inert')).toBe(false);
      expect(document.body.style.overflow).toBe('hidden');
      await key(document.activeElement!, 'Escape');
      expect(container.querySelector('.ud-drawer')).toBeNull();
      expect(document.getElementById('behind')!.hasAttribute('inert')).toBe(false);
      expect(opener().hasAttribute('inert')).toBe(false);
      expect(document.body.style.overflow).toBe('');
      expect(document.activeElement).toBe(opener());
    });

    it('when an engine leaves links out of the Tab order and the focus falls out, it goes to the next part (R-07)', async () => {
      await mount(<Page />);
      await click(opener());
      const first = byText('The first link') as HTMLAnchorElement;
      expect(document.activeElement).toBe(first);
      // What WebKit does: Tab from a link finds no other part it takes, and the focus leaves the layer
      // in the same tick, before the layer looks (its look is a timeout of 0).
      await act(async () => {
        first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
        first.blur();
        await Promise.resolve();
      });
      await settle(10);
      expect(document.activeElement?.textContent).toBe('The second link');
    });

    it('goes round at the edges, both ways', async () => {
      await mount(<Page />);
      await click(opener());
      const done = [...panel().querySelectorAll('button')].find((b) => b.textContent === 'Done')!;
      await focus(done);
      await key(done, 'Tab');
      expect(document.activeElement).toBe(panel().querySelector('[data-close]'));
      await key(document.activeElement!, 'Tab', { shiftKey: true });
      expect(document.activeElement).toBe(done);
    });

    it('a focus that lands outside by another way is brought back', async () => {
      await mount(<Page />);
      await click(opener());
      const second = byText('The second link') as HTMLAnchorElement;
      await focus(second);
      await focus(opener()); // inert in a browser; here something outside takes the focus anyway
      expect(document.activeElement).toBe(second);
    });

    it('a confirm dialog opened in a drawer: Escape closes the confirm dialog only', async () => {
      let drawerClosed = 0;
      function Nested() {
        const [confirm, setConfirm] = useState(true);
        return (
          <div>
            <p id="outside">The page</p>
            <U.Drawer open onClose={() => (drawerClosed += 1)} title="Server">
              <U.ConfirmDialog open={confirm} title="Delete it?" onConfirm={() => setConfirm(false)} onCancel={() => setConfirm(false)}>
                It cannot be undone.
              </U.ConfirmDialog>
            </U.Drawer>
          </div>
        );
      }
      await mount(<Nested />);
      expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
      await key(document.activeElement!, 'Escape');
      expect(container.querySelector('[role="alertdialog"]')).toBeNull();
      expect(drawerClosed).toBe(0);
      expect(container.querySelector('.ud-drawer')).not.toBeNull();
      // The drawer is still open: the page behind it stays inert, and does not scroll.
      expect(document.getElementById('outside')!.hasAttribute('inert')).toBe(true);
      expect(document.body.style.overflow).toBe('hidden');
    });
  });

  describe('AppShell below 900 px', () => {
    // jsdom has no matchMedia: a stand-in that the test turns from narrow to wide.
    let narrow = true;
    const listeners = new Set<() => void>();
    const view = document.defaultView as unknown as { matchMedia?: (q: string) => unknown };
    beforeEach(() => {
      narrow = true;
      listeners.clear();
      view.matchMedia = (query: string) => ({
        media: query,
        get matches() {
          return narrow;
        },
        addEventListener: (_type: string, fn: () => void) => listeners.add(fn),
        removeEventListener: (_type: string, fn: () => void) => listeners.delete(fn),
      });
    });
    afterEach(() => {
      delete view.matchMedia;
    });
    function Shell() {
      return (
        <U.AppShell product="Confera" sidebar={<U.SidebarNav items={[{ label: 'Conferences', value: 'c', href: '#c' }, { label: 'Users', value: 'u', href: '#u' }]} />}>
          <button type="button">Save changes</button>
        </U.AppShell>
      );
    }
    const menuButton = () => container.querySelector<HTMLButtonElement>('.ud-shell__menu')!;
    const side = () => container.querySelector<HTMLElement>('.ud-shell__side')!;
    const main = () => container.querySelector<HTMLElement>('.ud-shell__main')!;

    it('open, it is a named modal dialog with a close button, and the page behind is inert (R-03)', async () => {
      await mount(<Shell />);
      expect(side().getAttribute('role')).toBeNull();
      await focus(menuButton());
      await click(menuButton());
      expect(side().getAttribute('role')).toBe('dialog');
      expect(side().getAttribute('aria-modal')).toBe('true');
      expect(side().getAttribute('aria-label')).toBe('Navigation');
      expect(main().hasAttribute('inert')).toBe(true);
      expect(container.querySelector('.ud-shell__scrim')!.hasAttribute('inert')).toBe(false);
      const close = side().querySelector<HTMLButtonElement>('.ud-shell__close')!;
      expect(close.getAttribute('aria-label')).toBe('Close navigation');
      await click(close);
      expect(side().classList.contains('is-open')).toBe(false);
      expect(main().hasAttribute('inert')).toBe(false);
      expect(document.activeElement).toBe(menuButton());
    });

    it('when the window grows past 900 px while it is open, it closes and gives the page back (R-06)', async () => {
      await mount(<Shell />);
      await click(menuButton());
      expect(document.body.style.overflow).toBe('hidden');
      narrow = false;
      await act(async () => {
        listeners.forEach((fn) => fn());
        await Promise.resolve();
      });
      expect(side().classList.contains('is-open')).toBe(false);
      expect(side().getAttribute('role')).toBeNull();
      expect(document.body.style.overflow).toBe('');
      expect(main().hasAttribute('inert')).toBe(false);
      const save = byText('Save changes') as HTMLButtonElement;
      await focus(save);
      expect(document.activeElement).toBe(save);
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

describe('DateField with one calendar icon (item 8: M1-ISS-22)', () => {
  it('draws no icon of its own: the browser’s picker button is the one icon', async () => {
    await mount(<U.DateField label="Abstract deadline" defaultValue="2026-12-01" />);
    expect(container.querySelector('.ud-field__icon')).toBeNull();
    expect(container.querySelector('input')!.type).toBe('date');
  });

  it('an icon that is passed is still drawn', async () => {
    await mount(<U.DateField label="Abstract deadline" icon="clock" />);
    expect(container.querySelectorAll('.ud-field__icon')).toHaveLength(1);
  });
});

describe('PermissionMatrix and FileDropzone (item 9: M1-ISS-22, M1-ISS-26)', () => {
  it('the last row of a table has no line under it, also under its row header', () => {
    expect(rule('.ud-table tbody tr:last-child th')?.get('border-bottom')).toBe('0');
  });

  it('the progress of a file takes its own line after the remove button, which stays at the right', () => {
    expect(rule('.ud-filelist__item .ud-progress')?.get('order')).toBe('1');
    expect(rule('.ud-filelist__item > .ud-icon-btn')?.get('margin-left')).toBe('auto');
  });

  it('a refused file says why, in the error colour, and its remove button is described by the reason', async () => {
    await mount(
      <U.FileDropzone label="Paper files" files={[{ name: 'talk.mp4', size: 48_100_000, error: 'Larger than 20 MB' }, { name: 'abstract.docx', size: 1000 }]} onRemove={() => undefined} />,
    );
    const [refused, fine] = [...container.querySelectorAll('.ud-filelist__item')];
    expect(refused!.className).toContain('is-error');
    expect(fine!.className).not.toContain('is-error');
    expect(refused!.querySelector('.ud-filelist__error')!.textContent).toBe('Larger than 20 MB');
    const remove = refused!.querySelector('button')!;
    expect(document.getElementById(remove.getAttribute('aria-describedby')!)!.textContent).toBe('Larger than 20 MB');
    expect(fine!.querySelector('button')!.hasAttribute('aria-describedby')).toBe(false);
  });
});

describe('Tooltip inside the view (item 10: M1-ISS-44)', () => {
  const rect = (r: Partial<DOMRect>) => () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}), ...r });
  const view = (width: number, height: number) => {
    Object.defineProperty(document.documentElement, 'clientWidth', { value: width, configurable: true });
    Object.defineProperty(document.documentElement, 'clientHeight', { value: height, configurable: true });
  };
  afterEach(() => {
    Reflect.deleteProperty(document.documentElement, 'clientWidth');
    Reflect.deleteProperty(document.documentElement, 'clientHeight');
  });
  const show = async (trigger: Partial<DOMRect>, bubble: Partial<DOMRect>, placement?: 'top' | 'bottom') => {
    await mount(
      <U.Tooltip title="Copies the snippet for the conference site" placement={placement}>
        <button type="button">Copy snippet</button>
      </U.Tooltip>,
    );
    container.querySelector<HTMLElement>('.ud-tooltip')!.getBoundingClientRect = rect(trigger);
    container.querySelector<HTMLElement>('.ud-tooltip__bubble')!.getBoundingClientRect = rect(bubble);
    await fire(container.querySelector('.ud-tooltip')!, new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }));
    return { wrapper: container.querySelector<HTMLElement>('.ud-tooltip')!, bubble: container.querySelector<HTMLElement>('.ud-tooltip__bubble')! };
  };

  it('near the left edge of a phone it moves right, 8px from the edge', async () => {
    view(375, 812);
    const { bubble } = await show({ left: 16, right: 116, width: 100, top: 400, bottom: 432, height: 32 }, { width: 240, height: 40 });
    // Centred, it would start at 16 + 50 - 120 = -54.
    expect(bubble.style.marginLeft).toBe('62px');
  });

  it('near the right edge it moves left', async () => {
    view(375, 812);
    const { bubble } = await show({ left: 330, right: 362, width: 32, top: 400, bottom: 432, height: 32 }, { width: 200, height: 40 });
    // Centred, it would end at 346 + 100 = 446; the view ends at 375 - 8.
    expect(bubble.style.marginLeft).toBe('-79px');
  });

  it('where it fits, it stays centred', async () => {
    view(1440, 900);
    const { bubble } = await show({ left: 600, right: 700, width: 100, top: 400, bottom: 432, height: 32 }, { width: 200, height: 40 });
    expect(bubble.style.marginLeft).toBe('');
  });

  it('without room above it goes below, and without room below it goes above', async () => {
    view(375, 812);
    const top = await show({ left: 150, right: 250, width: 100, top: 10, bottom: 42, height: 32 }, { width: 200, height: 40 });
    expect(top.wrapper.className).toContain('ud-tooltip--bottom');
    const bottom = await show({ left: 150, right: 250, width: 100, top: 770, bottom: 802, height: 32 }, { width: 200, height: 40 }, 'bottom');
    expect(bottom.wrapper.className).not.toContain('ud-tooltip--bottom');
  });
});

describe('Autocomplete keeps its value on focus (item 11: M1-ISS-24)', () => {
  const COUNTRIES = ['Serbia', 'Montenegro', 'Croatia', 'Slovenia', 'North Macedonia'];
  const input = () => container.querySelector<HTMLInputElement>('input[role="combobox"]')!;
  const options = () => [...container.querySelectorAll('[role="option"]')].map((o) => o.textContent);

  it('the chosen value stays in the field, selected, and the list shows every option with it active', async () => {
    await mount(<U.Autocomplete label="Country" options={COUNTRIES} defaultValue="Serbia" />);
    expect(input().value).toBe('Serbia');
    await focus(input());
    expect(input().value).toBe('Serbia');
    expect(input().selectionStart).toBe(0);
    expect(input().selectionEnd).toBe('Serbia'.length);
    expect(options()).toEqual(COUNTRIES);
    expect(document.getElementById(input().getAttribute('aria-activedescendant')!)!.textContent).toBe('Serbia');
  });

  it('typing filters; Escape and leaving show the chosen value again', async () => {
    await mount(<U.Autocomplete label="Country" options={COUNTRIES} defaultValue="Serbia" />);
    await focus(input());
    await act(async () => {
      // The prototype's setter with the input as its receiver, as React's own tracking expects.
      Reflect.set(HTMLInputElement.prototype, 'value', 'mon', input());
      input().dispatchEvent(new Event('input', { bubbles: true }));
      await Promise.resolve();
    });
    expect(options()).toEqual(['Montenegro']);
    await act(async () => {
      input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    expect(input().value).toBe('Serbia');
  });

  it('the chevron of a multiple Autocomplete is pinned to the right of its box', () => {
    const chevron = rule('.ud-field--multi .ud-field__chevron')!;
    expect(chevron.get('position')).toBe('absolute');
    expect(chevron.get('right')).toBe('var(--gutter-s)');
  });

  it('a press on the box beside the control puts the focus in it', async () => {
    await mount(<U.Autocomplete label="Keywords" multiple options={['Economics', 'Finance']} defaultValue={['Economics']} />);
    const box = container.querySelector('.ud-field__box')!;
    await fire(box, new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(input());
  });
});

describe('Switch tracks that differ (item 12: M1-ISS-25)', () => {
  it('off: a white track with a neutral-700 border and thumb; on: the brand-orange-strong track with a white thumb', () => {
    expect(rule('.ud-switch__track')?.get('background')).toBe('var(--surface-1)');
    expect(rule('.ud-switch__track')?.get('border')).toBe('1px solid var(--neutral-700)');
    expect(rule('.ud-switch__thumb')?.get('background')).toBe('var(--neutral-700)');
    expect(rule('.ud-switch__input:checked + .ud-switch__track')?.get('background')).toBe('var(--brand-orange-strong)');
    expect(rule('.ud-switch__input:checked + .ud-switch__track .ud-switch__thumb')?.get('background')).toBe('var(--surface-1)');
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
