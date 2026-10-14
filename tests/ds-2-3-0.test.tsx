// @vitest-environment jsdom
//
// Design system 2.3.0: the UI reviewer's re-check of 2.2.0 (section 7 of the 0.1.0 UI review) and
// M1-ISS-10, 20 to 26, 42, 44, 45. Behaviour in the DOM and the rules of the stylesheet here; what a
// browser draws and does, in three engines, is in e2e/ds-2-3-0.spec.ts. The tokens and their lint
// (M1-ISS-19) are in tests/ds-tokens.test.ts and tests/lint-fixtures.test.ts.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DS_VERSION } from '../packages/ui/src/generated/manifest';

const ds = join(process.cwd(), 'design-system');

it('is version 2.3.0', () => {
  expect(DS_VERSION).toBe('2.3.0');
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
