// Design system 2.3.0, M1-ISS-19: the type styles, the spacing scale and the component sizes
// are tokens, generated into tokens.css, and the stylesheets use them (the style lint's rules
// size-literal and font-literal, tests/lint-fixtures.test.ts). No token of 2.2.0 changed its value.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// @ts-expect-error -- plain Node script without type declarations
import { tokensCss, typeStyleProperties } from '../scripts/ds-lib.mjs';
// @ts-expect-error -- plain Node script without type declarations
import { DEFAULT_PATHS, lintPaths } from '../scripts/lint-styles.mjs';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
interface Token {
  name: string;
  value: string;
}
const tokens = JSON.parse(readFileSync(join(root, 'design-system/tokens.json'), 'utf8')) as {
  version: number;
  color: { tokens: Token[] };
  type: { families: Record<string, string>; groups: Array<{ family: string; styles: Array<{ name: string; fontSize: string; lineHeight: number | string; fontWeight: number; letterSpacing: string }> }> };
  spacing: { tokens: Token[] };
  radius: { tokens: Token[] };
  shadow: { tokens: Token[] };
  size: { tokens: Token[] };
  breakpoint: { tokens: Token[] };
};
const css = readFileSync(join(root, 'design-system/tokens.css'), 'utf8').replace(/\r\n/g, '\n');
const declared = new Map([...css.matchAll(/^ {2}(--[a-z0-9-]+): ([^;]+);$/gm)].map((m) => [m[1]!, m[2]!]));
const all = [...tokens.color.tokens, ...tokens.spacing.tokens, ...tokens.radius.tokens, ...tokens.shadow.tokens, ...tokens.size.tokens];
const value = (name: string) => all.find((t) => t.name === name)?.value;

describe('type styles (two custom properties each)', () => {
  const styles = tokens.type.groups.flatMap((g) => g.styles.map((s) => ({ ...s, family: g.family })));

  it('the 15 styles of the Figma file and the two Confera additions', () => {
    expect(styles.map((s) => s.name)).toEqual([
      'h1', 'h2', 'metrics', 'h4', 'h5', 'h6',
      'body-lg', 'body-md', 'body-sm', 'caption', 'link', 'body-xs', 'caption-xs',
      'button-lg', 'button-md',
      'field-label', 'field-message',
    ]);
  });

  it.each([
    ['body-xs', '400 12px/1.35 var(--font-sans)', '-0.01em'],
    ['caption-xs', '600 12px/1.2 var(--font-sans)', '-0.01em'],
    ['body-sm', '400 14px/1.2 var(--font-sans)', '-0.03em'],
    ['h2', '700 32px/1.2 var(--font-sans)', '-0.03em'],
    ['field-label', '700 14px/16px var(--font-ui)', '-0.02em'],
    ['field-message', '500 12px/12px var(--font-ui)', '-0.01em'],
  ])('--text-%s is "%s", tracked %s', (name, font, tracking) => {
    expect(declared.get(`--text-${name}`)).toBe(font);
    expect(declared.get(`--text-${name}-tracking`)).toBe(tracking);
  });

  it('every style is generated from tokens.json, font and tracking', () => {
    const generated = typeStyleProperties(tokens) as Array<[string, string]>;
    expect(generated).toHaveLength(styles.length * 2);
    for (const [name, text] of generated) expect(declared.get(`--${name}`), name).toBe(text);
  });

  it('no size outside the scale: 12, 14, 16, 20, 24, 32, 36, 48 px', () => {
    expect([...new Set(styles.map((s) => s.fontSize))].sort()).toEqual(['12px', '14px', '16px', '20px', '24px', '32px', '36px', '48px'].sort());
  });
});

describe('spacing: the Figma gutters and a 4 px grid', () => {
  it('0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64', () => {
    expect(tokens.spacing.tokens.map((t) => [t.name, t.value])).toEqual([
      ['gutter-null', '0px'], ['gutter-xxs', '2px'], ['gutter-xs', '4px'], ['gutter-s', '8px'],
      ['gutter-m', '12px'], ['gutter-l', '16px'], ['gutter-xl', '20px'], ['gutter-2xl', '24px'],
      ['gutter-3xl', '32px'], ['gutter-4xl', '40px'], ['gutter-5xl', '48px'], ['gutter-6xl', '64px'],
    ]);
  });
});

describe('component sizes', () => {
  it.each([
    ['button-padding-x', '30px'], ['control-sm', '32px'], ['target-min', '24px'], ['target-touch', '44px'],
    ['avatar-sm', '28px'], ['avatar', '36px'], ['avatar-lg', '56px'], ['sidebar-width', '248px'], ['drawer-width', '480px'],
    ['dialog-sm', '420px'], ['dialog-md', '560px'], ['dialog-lg', '820px'], ['form-card-max', '700px'], ['page-max', '960px'],
    ['tooltip-max', '240px'], ['listbox-max', '260px'],
  ])('%s is %s', (name, px) => {
    expect(value(name)).toBe(px);
    expect(declared.get(`--${name}`)).toBe(px);
  });

  it('the breakpoints are listed for reference and are no custom property', () => {
    expect(tokens.breakpoint.tokens.map((t) => t.value)).toEqual(['600px', '720px', '900px']);
    for (const t of tokens.breakpoint.tokens) expect(declared.has(`--${t.name}`)).toBe(false);
    expect(css).toContain('narrow 600px, medium 720px, wide 900px');
  });
});

describe('no token of 2.2.0 changed (a change of value is said in the changelog)', () => {
  // Every token of design system 2.2.0, with its value.
  const V2_2_0: Array<[string, string]> = [
    ['gutter-null', '0px'], ['gutter-xxs', '2px'], ['gutter-xs', '4px'], ['gutter-s', '8px'],
    ['radius-xs', '3px'], ['radius-checkbox', '4px'], ['radius-sm', '6px'], ['radius-field', '12px'], ['radius-card', '24px'], ['radius-pill', '80px'],
    ['focus-ring', '0 0 0 1px rgba(255, 255, 255, 0.9), 0 0 0 3px #0b76d7'],
    ['shadow-overlay', '0 12px 32px rgba(22, 22, 22, 0.16), 0 2px 6px rgba(22, 22, 22, 0.08)'],
    ['shadow-thumb', '0 1px 2px rgba(0, 0, 0, 0.2)'],
    ['button-height', '40px'], ['checkbox-size', '17.5px'], ['checkbox-icon', '12.25px'], ['radio-size', '17.5px'], ['radio-dot', '10.5px'],
    ['brand-orange', '#ef7b06'], ['brand-orange-hover', '#d86e03'], ['brand-orange-halo', 'rgba(255, 106, 61, 0.12)'], ['brand-orange-halo-strong', 'rgba(255, 106, 61, 0.3)'],
    ['brand-orange-strong', '#a85300'], ['on-brand', '#17191b'], ['ink', '#373232'], ['ink-hover', '#1d1a1a'], ['ink-halo', 'rgba(0, 0, 0, 0.12)'], ['ink-halo-strong', 'rgba(0, 0, 0, 0.3)'],
    ['text-secondary', '#635d5d'], ['text-on-dark', '#fff7f7'], ['surface-1', '#ffffff'], ['surface-2', '#eedbdb'], ['background', '#f3efec'], ['background-2', '#fafbfd'],
    ['background-dark', '#161616'], ['neutral-100', '#f4f4f5'], ['neutral-300', '#e4e5e7'], ['neutral-400', '{neutral-500}'], ['neutral-500', '#93989f'], ['neutral-700', '#787f88'],
    ['neutral-900', '#2f3236'], ['neutral-950', '#17191b'], ['control-border', '#cbd5e1'], ['text-field', '#334155'], ['danger', '#ee3a3a'], ['danger-strong', '#be2e2e'],
    ['danger-hover', '#a82828'], ['success', '#18a94d'], ['success-strong', '#117a37'], ['focus', '#0b76d7'], ['scrim', 'rgba(22, 22, 22, 0.5)'], ['danger-surface', '#fdecec'],
    ['danger-border', '#f6c4c4'], ['success-surface', '#e8f6ed'], ['success-border', '#b9e3c8'], ['warning', '#92400e'], ['warning-surface', '#fef3c7'], ['warning-border', '#f6d79a'],
    ['info-strong', '#08589f'], ['info-surface', '#e8f2fc'], ['info-border', '#bcd8f5'], ['on-dark-muted', 'rgba(255, 247, 247, 0.8)'], ['on-dark-subtle', 'rgba(255, 247, 247, 0.55)'],
    ['on-dark-hover', 'rgba(255, 255, 255, 0.06)'], ['on-dark-chip', 'rgba(255, 255, 255, 0.12)'], ['success-on-dark', '#4ade80'], ['danger-on-dark', '#f87171'],
    ['warning-on-dark', '#fbbf24'], ['info-on-dark', '#7cc0ff'],
  ];

  it.each(V2_2_0)('%s is still %s', (name, was) => {
    expect(value(name)).toBe(was);
  });

  it('the brand orange stays #ef7b06, and tokens.css is what tokens.json generates', () => {
    expect(value('brand-orange')).toBe('#ef7b06');
    expect(css).toBe(tokensCss(tokens));
  });
});

describe('the stylesheets use the tokens', () => {
  it('no size, font or colour literal in the design system or the application (pnpm lint)', () => {
    const { findings, files } = lintPaths(DEFAULT_PATHS.map((p: string) => join(root, p))) as { findings: Array<{ file: string; line: number; rule: string; text: string }>; files: number };
    expect(files).toBeGreaterThanOrEqual(5);
    expect(findings.map((f) => `${f.file}:${f.line} ${f.rule} ${f.text}`)).toEqual([]);
  });

  it('the stylesheet of the design system writes no font size and no family of its own', () => {
    const bundle = readFileSync(join(root, 'design-system/components/bundle.css'), 'utf8');
    expect(bundle).not.toMatch(/font-size:/);
    expect(bundle.match(/font-family: ([^;]+);/g)?.every((d) => /var\(--font-(sans|ui)\)/.test(d)) ?? true).toBe(true);
  });
});
