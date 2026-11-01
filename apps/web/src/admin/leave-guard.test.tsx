// @vitest-environment jsdom
//
// The leave guard (UX4-01) lets the person go as soon as the screen shows that everything is saved
// (confera-rename-congresa, the fix round of the blank-slate verification). Firefox asks the page's
// `beforeunload` on a reload; a reload right after "Template saved" was asked "leave without saving?"
// because the guard was let go by a passive effect, a task after the commit that drew "saved".
//
// React runs here as in a browser, outside `act()`: a commit, the microtasks after it, and the passive
// effects in a task of their own. The check sits in that gap, in a MutationObserver's callback.
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { LeaveGuardProvider, useLeaveGuard } from './leave-guard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;

const QUESTION = { title: 'Leave the template without saving?', text: 'The changes are lost.', leave: 'Leave without saving' };

/** A screen with the editor's state beside Save: "saved" or "unsaved", and the guard held while unsaved. */
function Screen({ dirty }: { dirty: boolean }) {
  useLeaveGuard(dirty, QUESTION);
  return <span data-state={dirty ? 'unsaved' : 'saved'} />;
}
const page = (dirty: boolean) => (
  <LeaveGuardProvider>
    <Screen dirty={dirty} />
  </LeaveGuardProvider>
);

/** Whether the page would ask before it is left now: a `beforeunload` the guard cancels. */
const asks = (): boolean => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};
const later = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

let root: Root | undefined;
let container: HTMLElement | undefined;
afterEach(async () => {
  root?.unmount();
  container?.remove();
  root = undefined;
  container = undefined;
  await later();
});

describe('the leave guard and a screen that has just been saved', () => {
  it('asks while there are unsaved changes, and no longer from the commit that draws "saved"', async () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    const shown = root;
    shown.render(page(false));
    await later();
    const state = () => container!.querySelector('span')!.getAttribute('data-state');
    expect(state()).toBe('saved');
    expect(asks()).toBe(false);

    shown.render(page(true));
    await later();
    expect(state()).toBe('unsaved');
    expect(asks()).toBe(true);

    // The moment "saved" is in the page, before any later task: what a reload would meet.
    const seen = new Promise<boolean>((resolve) => {
      const observer = new MutationObserver(() => {
        if (state() !== 'saved') return;
        observer.disconnect();
        resolve(asks());
      });
      observer.observe(container!, { attributes: true, subtree: true });
    });
    shown.render(page(false));
    expect(await seen).toBe(false);
    await later();
    expect(asks()).toBe(false);
  });
});
