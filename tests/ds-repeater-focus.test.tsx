// @vitest-environment jsdom
//
// Design system 2.0.1: when a row of a Repeater is removed, the focus stays in
// the repeater (WCAG 2.4.3). The button that had the focus goes away with its
// row; in 2.0.0 the focus then fell back to the page.
import { act, useState, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DS_VERSION } from '../packages/ui/src/generated/manifest';
import * as U from '../packages/ui/src/generated/udekom.client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Row {
  key: number;
  name: string;
}
const rowsOf = (count: number): Row[] => Array.from({ length: count }, (_, i) => ({ key: i + 1, name: `Author ${i + 1}` }));

function Authors({ start, min = 0, fields = true, refuse = false, focusElsewhere = false }: { start: number; min?: number; fields?: boolean; refuse?: boolean; focusElsewhere?: boolean }) {
  const [rows, setRows] = useState(rowsOf(start));
  return (
    <div>
      <button type="button" id="outside">Outside</button>
      <U.Repeater<Row>
        label="Authors"
        items={rows}
        min={min}
        onChange={(next) => {
          if (refuse) return;
          setRows(next);
          if (focusElsewhere) document.getElementById('outside')?.focus();
        }}
        removeLabel="Remove author"
        addLabel="Add author"
        renderRow={(row, _index, update) => (fields ? <U.TextField label={`Name ${row.key}`} value={row.name} onChange={(e) => update({ name: e.target.value })} /> : <span>{row.name}</span>)}
      />
    </div>
  );
}

let container: HTMLElement;
let root: Root;
const mount = async (element: ReactElement) => {
  await act(async () => {
    root.render(element);
    await Promise.resolve();
  });
};
const repeater = () => container.querySelector<HTMLElement>('.ud-repeater')!;
const removeButton = (n: number) => container.querySelector<HTMLButtonElement>(`button[aria-label="Remove author ${n}"]`)!;
const names = () => [...container.querySelectorAll<HTMLInputElement>('.ud-repeater input')].map((input) => input.value);
/** Removes row `n` the way a keyboard user does: the focus is on its button, and the button is pressed. */
const remove = async (n: number) => {
  const button = removeButton(n);
  button.focus();
  expect(document.activeElement).toBe(button);
  await act(async () => {
    button.click();
    await Promise.resolve();
  });
};
const focused = () => document.activeElement as HTMLElement;

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

describe(`Repeater of design system ${DS_VERSION}: the focus after a row is removed`, () => {
  it('is version 2.0.1 or later', () => {
    const [major, minor, patch] = DS_VERSION.split('.').map(Number) as [number, number, number];
    expect(major * 10_000 + minor * 100 + patch).toBeGreaterThanOrEqual(20_001);
    expect(U.version).toBe(DS_VERSION);
  });

  it('goes to the first control of the row that takes the place of the removed one', async () => {
    await mount(<Authors start={3} />);
    await remove(2);
    expect(names()).toEqual(['Author 1', 'Author 3']);
    expect(focused().tagName).toBe('INPUT');
    expect((focused() as HTMLInputElement).value).toBe('Author 3');
    expect(repeater().contains(focused())).toBe(true);
  });

  it('goes to the row before it when the last row was removed', async () => {
    await mount(<Authors start={3} />);
    await remove(3);
    expect((focused() as HTMLInputElement).value).toBe('Author 2');
  });

  it('never falls back to the page, whichever row is removed, down to the last one', async () => {
    await mount(<Authors start={4} />);
    for (const n of [1, 3, 1]) {
      await remove(n);
      expect(focused(), `after removing row ${n}`).not.toBe(document.body);
      expect(repeater().contains(focused())).toBe(true);
    }
    expect(names()).toHaveLength(1);
  });

  it('goes to the "add" button when no row is left', async () => {
    await mount(<Authors start={1} />);
    await remove(1);
    expect(names()).toEqual([]);
    expect(focused().textContent).toBe('Add author');
  });

  it('stays on a field when the rows that are left cannot be removed any more (min)', async () => {
    await mount(<Authors start={2} min={1} />);
    await remove(2);
    expect(container.querySelector('button[aria-label^="Remove author"]')).toBeNull();
    expect((focused() as HTMLInputElement).value).toBe('Author 1');
  });

  it('goes to the "remove" button of the neighbouring row when a row has no field', async () => {
    await mount(<Authors start={3} fields={false} />);
    await remove(2);
    expect(focused().getAttribute('aria-label')).toBe('Remove author 2');
    expect(repeater().contains(focused())).toBe(true);
  });

  it('leaves the focus alone when the owner refuses the removal', async () => {
    await mount(<Authors start={2} refuse />);
    await remove(2);
    expect(names()).toHaveLength(2);
    expect(focused()).toBe(removeButton(2));
  });

  it('does not take the focus back from a page that placed it itself', async () => {
    await mount(<Authors start={2} focusElsewhere />);
    await remove(2);
    expect(focused().id).toBe('outside');
  });

  it('adding a row or typing in one does not move the focus', async () => {
    await mount(<Authors start={1} />);
    const add = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Add author')!;
    add.focus();
    await act(async () => {
      add.click();
      await Promise.resolve();
    });
    expect(names()).toHaveLength(2);
    expect(focused()).toBe(add);
  });
});
