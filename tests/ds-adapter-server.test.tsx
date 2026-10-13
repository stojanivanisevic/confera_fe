// M1-FE-02: every component of the design system renders on a server.
// This file runs in plain Node: there is no `window` and no `document`.
// The design-system script would throw here on its first line
// (`var React = window.React`); the generated adapter makes it run.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { COMPONENT_NAMES } from '../packages/ui/src/generated/manifest';
import * as adapter from '../packages/ui/src/generated/udekom.client';
import { OVERLAY_SCENARIOS, SCENARIOS } from '../packages/ui/src/gallery/scenarios';

const bundle = readFileSync(fileURLToPath(new URL('../design-system/components/bundle.js', import.meta.url)), 'utf8');

describe('the adapter on a server (no window, no document)', () => {
  let errors: ReturnType<typeof vi.spyOn>;
  let warnings: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    expect(errors.mock.calls, 'console.error during server rendering').toEqual([]);
    expect(warnings.mock.calls, 'console.warn during server rendering').toEqual([]);
  });

  it('really runs without a browser', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
  });

  it('the plain script cannot run here, which is why the adapter exists', () => {
    // First-party text of design-system/, run as the plain script it is, in an empty context.
    expect(() => runInNewContext(bundle, {})).toThrow(/window is not defined/);
  });

  it('exports every component of the manifest, and nothing is undefined', () => {
    for (const name of COMPONENT_NAMES) expect(typeof adapter[name], name).toBe('function');
    expect(typeof adapter.toast).toBe('function');
  });

  it('has a scenario for every component of the manifest, and no other', () => {
    expect(Object.keys(SCENARIOS).sort()).toEqual([...COMPONENT_NAMES].sort());
  });

  it.each(COMPONENT_NAMES)('%s renders to markup', (name) => {
    const Scenario = SCENARIOS[name];
    const html = renderToString(<Scenario />);
    expect(html.length, `${name} rendered nothing`).toBeGreaterThan(20);
    expect(html).toMatch(/class="[^"]*\bud-/);
  });

  it.each(OVERLAY_SCENARIOS)('%s renders its open overlay to markup', (name) => {
    const Scenario = SCENARIOS[name];
    const html = renderToString(<Scenario initialOpen />);
    expect(html).toMatch(/role="(?:dialog|alertdialog)"/);
    expect(html).toContain('aria-modal="true"');
  });
});
