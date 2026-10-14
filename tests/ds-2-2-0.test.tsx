// @vitest-environment jsdom
//
// Design system 2.2.0: the keyboard, the selected states and the small targets
// (the UI review of 0.1.0, UI-M1-01 to 07, 09, 10). Behaviour in the DOM here;
// what a browser draws and does is in e2e/ds-gallery.spec.ts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { act, useState, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DS_VERSION } from '../packages/ui/src/generated/manifest';
import * as U from '../packages/ui/src/generated/udekom.client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const css = readFileSync(join(process.cwd(), 'design-system', 'components', 'bundle.css'), 'utf8');
/** The declarations of a rule, by its exact selector. */
const rule = (selector: string) => {
  const at = css.indexOf(`${selector} {`);
  return at < 0 ? null : css.slice(at + selector.length + 2, css.indexOf('}', at));
};

let container: HTMLElement;
let root: Root;
const mount = async (element: ReactElement) => {
  await act(async () => {
    root.render(element);
    await Promise.resolve();
  });
};
const key = async (target: EventTarget, name: string, init: KeyboardEventInit = {}) => {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init }));
    await Promise.resolve();
  });
};
const click = async (element: HTMLElement) => {
  await act(async () => {
    element.click();
    await Promise.resolve();
  });
};

beforeEach(() => {
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

it('is version 2.2.0 or later', () => {
  const [major, minor] = DS_VERSION.split('.').map(Number) as [number, number];
  expect(major * 100 + minor).toBeGreaterThanOrEqual(202);
});

describe('Menu', () => {
  const items = (chosen: string[]) => [
    { label: 'Resend the email', onSelect: () => chosen.push('resend') },
    { label: 'Delete', onSelect: () => chosen.push('delete') },
  ];
  const trigger = () => container.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!;

  it('Escape closes it and gives the focus back to its button', async () => {
    await mount(<U.Menu items={items([])} label="Row actions" />);
    await click(trigger());
    expect(document.activeElement?.getAttribute('role')).toBe('menuitem');
    await key(document.activeElement!, 'Escape');
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('a choice closes it, gives the focus back, and then runs', async () => {
    const chosen: string[] = [];
    await mount(<U.Menu items={items(chosen)} label="Row actions" />);
    await click(trigger());
    await click(container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[1]!);
    expect(chosen).toEqual(['delete']);
    expect(document.activeElement).toBe(trigger());
  });

  it('a focused item has the blue outline (it was a grey of 1.10:1)', () => {
    expect(rule('.ud-menu__item:focus-visible')).toContain('outline: 2px solid var(--focus)');
    expect(rule('.ud-listbox__option.is-active')).toContain('box-shadow: inset 0 0 0 2px var(--focus)');
  });
});

describe('AppShell below 900 px', () => {
  function Shell() {
    return (
      <U.AppShell product="Confera" sidebar={<U.SidebarNav items={[{ label: 'Conferences', value: 'conferences', href: '#c' }, { label: 'Forms', value: 'forms', href: '#f' }]} />}>
        <p>Content</p>
      </U.AppShell>
    );
  }
  const menuButton = () => container.querySelector<HTMLButtonElement>('.ud-shell__menu')!;
  const side = () => container.querySelector<HTMLElement>('.ud-shell__side')!;

  it('the open drawer takes the focus, keeps Tab inside, closes on Escape and gives the focus back', async () => {
    await mount(<Shell />);
    menuButton().focus();
    await click(menuButton());
    expect(side().classList.contains('is-open')).toBe(true);
    const links = [...side().querySelectorAll<HTMLAnchorElement>('a')];
    expect(document.activeElement).toBe(links[0]);
    links[1]!.focus();
    await key(links[1]!, 'Tab');
    expect(document.activeElement).toBe(links[0]);
    await key(document.activeElement!, 'Escape');
    expect(side().classList.contains('is-open')).toBe(false);
    expect(document.activeElement).toBe(menuButton());
  });

  it('closed, it is hidden, so its links are out of the tab order', () => {
    const narrow = css.slice(css.indexOf('@media (max-width: 900px)'));
    expect(narrow).toMatch(/\.ud-shell__side \{[^}]*visibility: hidden;/);
    expect(narrow).toMatch(/\.ud-shell__side\.is-open \{[^}]*visibility: visible;/);
  });
});

describe('Tooltip', () => {
  it('Escape hides it until the pointer or the focus leaves, and the bubble can be hovered', async () => {
    await mount(
      <U.Tooltip title="Visible to the office only">
        <button type="button">Note</button>
      </U.Tooltip>,
    );
    const wrapper = container.querySelector<HTMLElement>('.ud-tooltip')!;
    const button = container.querySelector('button')!;
    // Escape while it is not shown changes nothing: another part of the page may use the key.
    await key(document, 'Escape');
    expect(wrapper.classList.contains('is-dismissed')).toBe(false);
    await act(async () => {
      button.focus();
      await Promise.resolve();
    });
    await key(document, 'Escape');
    expect(wrapper.classList.contains('is-dismissed')).toBe(true);
    await act(async () => {
      button.blur();
      await Promise.resolve();
    });
    expect(wrapper.classList.contains('is-dismissed')).toBe(false);
    expect(css).toMatch(/\.ud-tooltip:hover \.ud-tooltip__bubble, \.ud-tooltip:focus-within \.ud-tooltip__bubble \{ opacity: 1; pointer-events: auto; \}/);
    expect(rule('.ud-tooltip.is-dismissed .ud-tooltip__bubble')).toContain('opacity: 0');
  });
});

describe('Checkbox', () => {
  function Consent({ error }: { error: boolean }) {
    return <U.Checkbox label="I accept the terms of publication" name="consent" required status={error ? 'error' : 'default'} message={error ? 'Accept the terms of publication to send your abstract' : undefined} />;
  }

  it('can be required: the mark of a field, and `required` on the box', async () => {
    await mount(<Consent error={false} />);
    const box = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(box.required).toBe(true);
    expect(container.querySelector('.ud-check__label')!.textContent).toBe('I accept the terms of publication *');
    expect(box.getAttribute('aria-invalid')).toBeNull();
  });

  it('says what is wrong, at the box and tied to it, and the box is never re-created', async () => {
    await mount(<Consent error={false} />);
    const box = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    await mount(<Consent error />);
    expect(container.querySelector('input[type="checkbox"]')).toBe(box);
    expect(box.getAttribute('aria-invalid')).toBe('true');
    const message = document.getElementById(box.getAttribute('aria-describedby')!)!;
    expect(message.textContent).toBe('Accept the terms of publication to send your abstract');
    expect(message.className).toContain('is-error');
    expect(container.querySelector('.ud-check')!.className).toContain('ud-check--error');
    await mount(<Consent error={false} />);
    expect(container.querySelector('input[type="checkbox"]')).toBe(box);
    expect(box.getAttribute('aria-describedby')).toBeNull();
  });

  it('a checkbox without these props renders as before', async () => {
    function Plain() {
      const [on, setOn] = useState(false);
      return <U.Checkbox label="Plain" checked={on} onChange={() => setOn(!on)} />;
    }
    await mount(<Plain />);
    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild!.tagName).toBe('LABEL');
    expect(container.querySelector('input')!.required).toBe(false);
  });
});

describe('the stylesheet', () => {
  it('a selected pill and a chosen scale value have an inner ring, not only a fill', () => {
    expect(rule('.ud-tab.is-selected')).toContain('box-shadow: inset 0 0 0 2px var(--brand-orange-strong)');
    expect(rule('.ud-scale__input:checked + .ud-scale__btn')).toContain('outline: 2px solid var(--brand-orange-strong)');
  });

  it('a success field is drawn in success-strong (3:1 and more)', () => {
    expect(rule('.ud-field--success .ud-field__box')).toContain('border-color: var(--success-strong)');
    expect(rule('.ud-field--success .ud-field__status')).toContain('color: var(--success-strong)');
  });

  it('the remove button of a tag and the clear button of a search are 24 x 24 px at least', () => {
    for (const selector of ['.ud-tag__remove', '.ud-search__clear']) {
      expect(rule(selector), selector).toContain('min-width: 24px');
      expect(rule(selector), selector).toContain('min-height: 24px');
    }
  });

  it('below 720 px only the current step keeps its width', () => {
    expect(css).toMatch(/\.ud-stepper:not\(\.ud-stepper--vertical\) \.ud-stepper__step:not\(\.is-current\) \{ min-width: 0; flex: 0 0 auto; \}/);
  });
});
