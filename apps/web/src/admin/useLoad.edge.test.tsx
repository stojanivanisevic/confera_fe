// @vitest-environment jsdom
//
// E2-19 (NFR-RESP-02, FR-USR-04 search, M2-FE-02): every screen with a filter asks the API again
// when the filter changes - the users' search asks at every key - and `useLoad` shows the answer
// that ARRIVES LAST, not the answer to the LAST QUESTION. Two answers that come back in the other
// order leave the list of an older filter under the filter the person sees.
import { afterEach, describe, expect, it } from 'vitest';

import { FakeApi, forgetFake, mount, type Mounted, settle, useFake } from '../../../../tests/support/admin-harness';
import { useLoad } from './useLoad';

let screen: Mounted | undefined;
afterEach(async () => {
  forgetFake();
  await screen?.unmount();
  screen = undefined;
});

function Probe({ filter, ask }: { filter: string; ask: (filter: string) => Promise<string> }) {
  const load = useLoad<string>(() => ask(filter), [filter]);
  return (
    <p>
      <span data-filter>{filter}</span>
      <span data-shown>{load.state.data ?? '-'}</span>
    </p>
  );
}

describe('a screen that asks again when its filter changes (E2-19)', () => {
  it('shows the answer to the filter the person sees, whatever the order of the answers', async () => {
    useFake(new FakeApi());
    const pending = new Map<string, (answer: string) => void>();
    const ask = (filter: string) => new Promise<string>((resolve) => pending.set(filter, resolve));

    screen = await mount(<Probe filter="a" ask={ask} />);
    // The person types on: "ab" is asked while "a" is still on its way.
    await screen.rerender(<Probe filter="ab" ask={ask} />);
    await settle(2);
    expect([...pending.keys()]).toEqual(['a', 'ab']);

    // The answer to "ab" comes back first, the answer to "a" after it.
    pending.get('ab')!('answer to ab');
    await settle(2);
    pending.get('a')!('answer to a');
    await settle(2);

    expect(screen.container.querySelector('[data-filter]')!.textContent).toBe('ab');
    expect(screen.container.querySelector('[data-shown]')!.textContent).toBe('answer to ab');
  });
});
