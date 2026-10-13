// @vitest-environment jsdom
//
// M1-FE-02: every component of the design system hydrates under React 19
// without a warning. React's development build is used here on purpose: it
// reports every mismatch between the server markup and the first client
// render, including attributes, which a production build would hide.
// The same thing is checked in three real browsers against the Next
// application by e2e/ds-gallery.spec.ts.
import { act, StrictMode, type ReactElement } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { version as reactVersion } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { COMPONENT_NAMES } from '../packages/ui/src/generated/manifest';
import { OVERLAY_SCENARIOS, SCENARIOS } from '../packages/ui/src/gallery/scenarios';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cases: Array<[string, ReactElement]> = [
  ...COMPONENT_NAMES.map((name): [string, ReactElement] => {
    const Scenario = SCENARIOS[name];
    return [name, <Scenario key={name} />];
  }),
  ...OVERLAY_SCENARIOS.map((name): [string, ReactElement] => {
    const Scenario = SCENARIOS[name];
    return [`${name} (open)`, <Scenario key={name} initialOpen />];
  }),
];

describe(`hydration under React ${reactVersion}`, () => {
  let errors: ReturnType<typeof vi.spyOn>;
  let warnings: ReturnType<typeof vi.spyOn>;
  let container: HTMLElement;
  let root: Root | undefined;

  beforeEach(() => {
    errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    container = document.createElement('div');
    document.body.append(container);
  });
  afterEach(async () => {
    await act(async () => {
      root?.unmount();
      await Promise.resolve();
    });
    root = undefined;
    container.remove();
  });

  it('runs on React 19', () => {
    expect(reactVersion).toMatch(/^19\./);
  });

  it('covers every component of the manifest', () => {
    expect(cases.length).toBe(COMPONENT_NAMES.length + OVERLAY_SCENARIOS.length);
    expect(COMPONENT_NAMES.length).toBeGreaterThanOrEqual(52);
  });

  it.each(cases)('%s hydrates without a warning', async (_name, element) => {
    const tree = <StrictMode>{element}</StrictMode>;
    const serverHtml = renderToString(tree);
    // Server markup arrives as markup: parse it the way a browser would.
    const parsed = new DOMParser().parseFromString(`<body>${serverHtml}</body>`, 'text/html');
    container.append(...Array.from(parsed.body.childNodes));

    const recoverable: unknown[] = [];
    await act(async () => {
      root = hydrateRoot(container, tree, { onRecoverableError: (error) => recoverable.push(error) });
      await Promise.resolve();
    });

    expect(recoverable, 'recoverable hydration errors').toEqual([]);
    expect(errors.mock.calls.map((c: unknown[]) => String(c[0])), 'console.error').toEqual([]);
    expect(warnings.mock.calls.map((c: unknown[]) => String(c[0])), 'console.warn').toEqual([]);
    // Hydration attached to the server markup instead of replacing it.
    expect(container.querySelector('[class*="ud-"]')).not.toBeNull();
  });
});
