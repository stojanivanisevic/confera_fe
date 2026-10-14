// @vitest-environment jsdom
//
// M1-FE-06: the accessibility defects of the frontend report, fixed in design
// system v2. Each test renders a component the way an application would,
// WITHOUT passing an id, and checks the wiring in the DOM:
//   - label and description are tied to the control;
//   - group, dropzone and repeater messages are tied to their group;
//   - tabs have panels, and pills without panels are a radio group;
//   - 16px controls on touch devices (the stylesheet rule covers every control one types in).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import postcss from 'postcss';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { COMPONENT_NAMES } from '../packages/ui/src/generated/manifest';
import * as U from '../packages/ui/src/generated/udekom.client';
import { SCENARIOS } from '../packages/ui/src/gallery/scenarios';

function render(element: ReactElement): HTMLElement {
  const host = document.createElement('div');
  const parsed = new DOMParser().parseFromString(`<body>${renderToStaticMarkup(element)}</body>`, 'text/html');
  host.append(...Array.from(parsed.body.childNodes));
  document.body.replaceChildren(host);
  return host;
}
const byId = (id: string | null) => (id ? document.getElementById(id) : null);
/** The text of the elements an attribute such as aria-describedby points at. */
const referenced = (el: Element, attribute: string) =>
  (el.getAttribute(attribute) ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => byId(id)?.textContent ?? `<missing ${id}>`)
    .join(' | ');

describe('label and description are tied to the control without an id', () => {
  const cases: Array<[string, ReactElement, string]> = [
    ['TextField', <U.TextField key="a" label="Email address" message="We send the confirmation here" />, 'input'],
    ['Select', <U.Select key="b" label="Country" options={['Serbia']} message="Where you work" />, 'select'],
    ['Textarea', <U.Textarea key="c" label="Abstract" message="Up to 300 words" />, 'textarea'],
    ['NumberField', <U.NumberField key="d" label="Fee" message="In EUR" />, 'input'],
    ['DateField', <U.DateField key="e" label="Deadline" message="Local time" />, 'input'],
    ['PasswordField', <U.PasswordField key="f" label="Password" message="At least 12 characters" />, 'input'],
    ['Autocomplete', <U.Autocomplete key="g" label="City" options={['Beograd']} message="Start typing" />, 'input'],
  ];

  it.each(cases)('%s', (_name, element, selector) => {
    const root = render(element);
    const control = root.querySelector<HTMLElement>(selector)!;
    const label = root.querySelector('label.ud-field__label')!;
    const message = root.querySelector('.ud-field__message')!;

    expect(control.id, 'the control has an id although none was passed').not.toBe('');
    expect(label.getAttribute('for')).toBe(control.id);
    expect((control as HTMLInputElement).labels?.[0]).toBe(label);
    expect(control.getAttribute('aria-describedby')).toBe(message.id);
    expect(referenced(control, 'aria-describedby')).toBe(message.textContent);
  });

  it('an id that is passed is still used', () => {
    const root = render(<U.TextField id="email" label="Email address" message="Note" />);
    expect(root.querySelector('input')!.id).toBe('email');
    expect(root.querySelector('label')!.getAttribute('for')).toBe('email');
    expect(root.querySelector('.ud-field__message')!.id).toBe('email-msg');
  });

  it('two fields on one page get different ids', () => {
    const root = render(<div><U.TextField label="First name" /><U.TextField label="Last name" /></div>);
    const ids = [...root.querySelectorAll('input')].map((i) => i.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('a description the caller adds is kept next to the message', () => {
    render(<div><p id="extra">Extra</p><U.TextField label="Title" message="Note" aria-describedby="extra" /></div>);
    expect(referenced(document.querySelector('input')!, 'aria-describedby')).toBe('Extra | Note');
  });

  it('an error is announced as invalid, with its message', () => {
    const root = render(<U.TextField label="Phone" status="error" message="Enter a full phone number" />);
    const input = root.querySelector('input')!;
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(referenced(input, 'aria-describedby')).toBe('Enter a full phone number');
  });

  it('Switch: the description describes the switch', () => {
    const root = render(<U.Switch label="Form is open" description="Authors can submit" />);
    expect(referenced(root.querySelector('input')!, 'aria-describedby')).toBe('Authors can submit');
  });

  it('FileButton: label, file name and hint are tied to the file input', () => {
    const root = render(<U.FileButton label="Photo" fileName="photo.png" hint="Max 20 MB" />);
    const input = root.querySelector('input[type=file]')!;
    expect(referenced(input, 'aria-labelledby')).toBe('Photo | Please Select File');
    expect(referenced(input, 'aria-describedby')).toBe('photo.png | Max 20 MB');
  });
});

describe('group, dropzone and repeater messages are tied to their group', () => {
  it('RadioGroup: a named radio group that is described by its message', () => {
    const root = render(<U.RadioGroup label="Fee category" options={['Regular', 'Student']} message="The category decides the fee" required status="error" />);
    const group = root.querySelector('fieldset')!;
    expect(group.getAttribute('role')).toBe('radiogroup');
    expect(referenced(group, 'aria-labelledby')).toContain('Fee category');
    expect(referenced(group, 'aria-describedby')).toBe('The category decides the fee');
    expect(group.getAttribute('aria-required')).toBe('true');
    expect(group.getAttribute('aria-invalid')).toBe('true');
    expect(root.querySelectorAll('[role=radiogroup]')).toHaveLength(1);
  });

  it('CheckboxGroup: the group is described by its message', () => {
    const root = render(<U.CheckboxGroup label="Topics" options={['Economics']} message="Choose up to three" />);
    const group = root.querySelector('fieldset')!;
    expect(group.querySelector('legend')!.textContent).toBe('Topics');
    expect(referenced(group, 'aria-describedby')).toBe('Choose up to three');
  });

  it('ScaleField: a named radio group that is described by its message', () => {
    const root = render(<U.ScaleField label="Originality" message="1 is the lowest grade" />);
    const group = root.querySelector('fieldset')!;
    expect(group.getAttribute('role')).toBe('radiogroup');
    expect(referenced(group, 'aria-labelledby')).toBe('Originality');
    expect(referenced(group, 'aria-describedby')).toBe('1 is the lowest grade');
  });

  it('FileDropzone: the drop area is named by its label and described by hint and message', () => {
    const root = render(<U.FileDropzone label="Paper files" hint="Word or PDF" message="The file is larger than 20 MB" status="error" />);
    const area = root.querySelector('[role=button]')!;
    expect(referenced(area, 'aria-labelledby')).toBe('Paper files | Drop files here or click to choose');
    expect(referenced(area, 'aria-describedby')).toBe('Word or PDF | The file is larger than 20 MB');
    expect(referenced(root.querySelector('[role=group]')!, 'aria-labelledby')).toBe('Paper files');
  });

  it('Repeater: a named group that is described by its message', () => {
    const root = render(<U.Repeater label="Authors" items={[{ key: 1 }]} onChange={() => undefined} renderRow={() => null} message="The first author is the corresponding author" />);
    const group = root.querySelector('[role=group]')!;
    expect(referenced(group, 'aria-labelledby')).toBe('Authors');
    expect(referenced(group, 'aria-describedby')).toBe('The first author is the corresponding author');
  });
});

describe('tabs with panels', () => {
  it('SegmentedTabs with content: the selected tab controls a panel that is named by it', () => {
    const root = render(
      <U.SegmentedTabs label="Applicant" value="b" options={[{ value: 'a', label: 'Individuals', content: 'One person' }, { value: 'b', label: 'Companies', content: 'An institution' }]} />,
    );
    const list = root.querySelector('[role=tablist]')!;
    const tabs = [...list.querySelectorAll('[role=tab]')];
    const panel = root.querySelector('[role=tabpanel]')!;
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true']);
    expect(tabs[1]!.getAttribute('aria-controls')).toBe(panel.id);
    expect(tabs[0]!.hasAttribute('aria-controls')).toBe(false);
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs[1]!.id);
    expect(panel.textContent).toBe('An institution');
    expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['-1', '0']);
  });

  it('SegmentedTabs without content: not a tab list without panels, but a radio group', () => {
    const root = render(<U.SegmentedTabs label="Language" value="sr" options={[{ value: 'en', label: 'English' }, { value: 'sr', label: 'Srpski' }]} />);
    expect(root.querySelector('[role=tablist]')).toBeNull();
    expect(root.querySelector('[role=tab]')).toBeNull();
    const group = root.querySelector('[role=radiogroup]')!;
    expect(group.getAttribute('aria-label')).toBe('Language');
    expect([...group.querySelectorAll('[role=radio]')].map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true']);
  });

  it('Tabs: a tab controls its panel only when there is one, and the panel is named by its tab', () => {
    const withPanel = render(<U.Tabs items={[{ value: 'a', label: 'Data', content: 'Panel' }, { value: 'b', label: 'Files', content: 'Other' }]} />);
    const tab = withPanel.querySelector('[role=tab][aria-selected=true]')!;
    const panel = withPanel.querySelector('[role=tabpanel]')!;
    expect(tab.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('aria-labelledby')).toBe(tab.id);
    expect(withPanel.querySelectorAll('[aria-controls]')).toHaveLength(1);

    const without = render(<U.Tabs items={[{ value: 'a', label: 'Data' }, { value: 'b', label: 'Files' }]} />);
    expect(without.querySelector('[role=tabpanel]')).toBeNull();
    expect(without.querySelector('[aria-controls]')).toBeNull();
  });
});

describe('no reference points at nothing, in any component', () => {
  it.each(COMPONENT_NAMES)('%s', (name) => {
    const Scenario = SCENARIOS[name];
    const root = render(<Scenario initialOpen />);
    for (const attribute of ['aria-labelledby', 'aria-describedby', 'aria-controls', 'for']) {
      for (const el of root.querySelectorAll(`[${attribute}]`)) {
        for (const id of (el.getAttribute(attribute) ?? '').split(/\s+/).filter(Boolean)) {
          expect(byId(id), `${name}: ${attribute}="${id}" on <${el.tagName.toLowerCase()}> points at nothing`).not.toBeNull();
        }
      }
    }
    const ids = [...root.querySelectorAll('[id]')].map((el) => el.id);
    expect(ids.length, `${name}: duplicate id`).toBe(new Set(ids).size);
  });
});

describe('16px controls on touch devices', () => {
  const css = readFileSync(resolve(process.cwd(), 'design-system/components/bundle.css'), 'utf8');
  // Since 2.3.0 a size is a type style: `font: var(--text-body-md)`. Its size is read from tokens.css.
  const tokensCss = readFileSync(resolve(process.cwd(), 'design-system/tokens.css'), 'utf8');
  const fontSizeOf = (value: string) => {
    const style = /^var\((--text-[a-z0-9-]+)\)$/.exec(value.trim());
    const font = style ? new RegExp(`${style[1]}: ([^;]+);`).exec(tokensCss)?.[1] ?? '' : value;
    return Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 'NaN');
  };
  const touch: string[] = [];
  postcss.parse(css).walkAtRules('media', (media) => {
    if (media.params.replace(/\s+/g, '') !== '(pointer:coarse)') return;
    media.walkRules((rule) => {
      rule.walkDecls(/^font(-size)?$/, (decl) => {
        expect(fontSizeOf(decl.value), `${rule.selector} { ${decl.prop}: ${decl.value} }`).toBeGreaterThanOrEqual(16);
        touch.push(...rule.selectors);
      });
    });
  });

  it('the stylesheet has the rule', () => {
    expect(touch).toEqual(['.ud-field__control', '.ud-search__control', '.ud-pagination__size select']);
  });

  it('the rule covers every control a person types or chooses in, in every component', () => {
    let seen = 0;
    for (const name of COMPONENT_NAMES) {
      const Scenario = SCENARIOS[name];
      const root = render(<Scenario initialOpen />);
      for (const control of root.querySelectorAll<HTMLElement>('input, select, textarea')) {
        const type = control.getAttribute('type') ?? 'text';
        if (['checkbox', 'radio', 'file', 'hidden'].includes(type)) continue; // nothing is typed into these
        seen += 1;
        expect(touch.some((selector) => control.matches(selector)), `${name}: <${control.tagName.toLowerCase()} class="${control.className}"> is not 16px on touch devices`).toBe(true);
      }
    }
    expect(seen).toBeGreaterThan(20);
  });
});
