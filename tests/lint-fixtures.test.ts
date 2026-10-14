// M1-FE-01: a hex colour, another UI kit and raw-markup rendering outside the
// reviewed component each fail the lint. The planted violations in
// lint-fixtures/ must keep failing, each on the rule that owns it.
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

// @ts-expect-error -- plain Node script without type declarations
import { lintCss } from '../scripts/lint-styles.mjs';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const fixtures = join(root, 'lint-fixtures');

/** file → the rule that must report it, and a fragment of its message. */
const ESLINT_PLANTED: Record<string, { rule: string; message: RegExp }> = {
  'other-ui-kit.tsx': { rule: 'no-restricted-imports', message: /design system/ },
  'tailwind-import.ts': { rule: 'no-restricted-imports', message: /Tailwind/ },
  'other-icon-set.tsx': { rule: 'no-restricted-imports', message: /icon set/ },
  'design-system-direct.ts': { rule: 'no-restricted-imports', message: /public entry of @confera\/ui/ },
  'raw-markup-jsx.tsx': { rule: 'no-restricted-syntax', message: /Raw markup/ },
  'raw-markup-dom.ts': { rule: 'no-restricted-syntax', message: /Raw markup/ },
  'raw-markup-insert.ts': { rule: 'no-restricted-syntax', message: /Raw markup/ },
  'raw-markup-srcdoc.tsx': { rule: 'no-restricted-syntax', message: /Raw markup/ },
  'hex-colour.tsx': { rule: 'no-restricted-syntax', message: /No colour literals/ },
  'colour-function.ts': { rule: 'no-restricted-syntax', message: /No colour literals/ },
  'named-colour-style.tsx': { rule: 'no-restricted-syntax', message: /No colour literals/ },
  'process-env.ts': { rule: 'no-restricted-syntax', message: /configuration module/ },
  'server-action.ts': { rule: 'no-restricted-syntax', message: /No server actions/ },
  'eval.ts': { rule: 'no-restricted-syntax', message: /No eval/ },
};
const ESLINT_FINE = ['ok-component.tsx'];

const STYLE_PLANTED: Record<string, string> = {
  'hex-colour.css': 'colour-literal',
  'named-colour.css': 'colour-literal',
  'colour-function.css': 'colour-literal',
  'unknown-custom-property.css': 'unknown-custom-property',
  'tailwind.css': 'no-tailwind',
  'external-font.css': 'external-url',
  'external-import.css': 'no-import',
  'ds-override.css': 'ds-override',
  'size-literal.css': 'size-literal',
  'font-literal.css': 'font-literal',
};
const STYLE_FINE = ['ok-tokens.css'];

describe('lint: planted violations (M1-FE-01)', () => {
  let results: ESLint.LintResult[] = [];

  beforeAll(async () => {
    // The fixtures are ignored in a normal run; this switch (read by eslint.config.mjs) includes them.
    process.env.CONFERA_LINT_FIXTURES = '1';
    const eslint = new ESLint({ cwd: root });
    results = await eslint.lintFiles(['lint-fixtures/**/*.{ts,tsx}']);
  });

  const messagesOf = (file: string) => {
    const result = results.find((r) => r.filePath === join(fixtures, file));
    expect(result, `${file} was not linted`).toBeDefined();
    return result!.messages;
  };

  it('every script fixture is covered by this test', () => {
    const present = readdirSync(fixtures).filter((f) => /\.tsx?$/.test(f)).sort();
    expect(present).toEqual([...Object.keys(ESLINT_PLANTED), ...ESLINT_FINE].sort());
  });

  it.each(Object.entries(ESLINT_PLANTED))('%s fails on its rule', (file, expected) => {
    const hits = messagesOf(file).filter((m) => m.severity === 2 && m.ruleId === expected.rule);
    expect(hits.length, `${file}: ${expected.rule} did not report`).toBeGreaterThan(0);
    expect(hits.some((m) => expected.message.test(m.message)), hits.map((m) => m.message).join(' | ')).toBe(true);
  });

  it.each(ESLINT_FINE)('%s passes', (file) => {
    expect(messagesOf(file).filter((m) => m.severity === 2)).toEqual([]);
  });
});

describe('style lint: planted violations (M1-FE-01)', () => {
  const tokens = new Set(['--ink', '--surface-1', '--text-body-sm', '--text-body-sm-tracking', '--gutter-s', '--gutter-m', '--button-height', '--font-ui']);
  const lint = (file: string): Array<{ rule: string }> =>
    lintCss(readFileSync(join(fixtures, file), 'utf8'), { filename: file, tokens });

  it('every stylesheet fixture is covered by this test', () => {
    const present = readdirSync(fixtures).filter((f) => f.endsWith('.css')).sort();
    expect(present).toEqual([...Object.keys(STYLE_PLANTED), ...STYLE_FINE].sort());
  });

  it.each(Object.entries(STYLE_PLANTED))('%s fails on %s', (file, rule) => {
    expect(lint(file).map((f) => f.rule)).toContain(rule);
  });

  it('an address of another origin is caught in @import as well', () => {
    expect(lint('external-import.css').map((f) => f.rule)).toContain('external-url');
  });

  it.each(STYLE_FINE)('%s passes', (file) => {
    expect(lint(file)).toEqual([]);
  });

  it('an override layer is refused twice: a restyled ud-* class and a redefined token', () => {
    expect(lint('ds-override.css').filter((f) => f.rule === 'ds-override')).toHaveLength(2);
  });

  it('a word that is also a colour name is fine where a name is expected', () => {
    // A family literal is a finding of its own since 2.3.0 (font-literal); it is never a colour.
    expect(lintCss('.a { font-family: "Tan", linen; animation-name: red; }').filter((f: { rule: string }) => f.rule !== 'font-literal')).toEqual([]);
    expect(lintCss('.a { animation-name: red; grid-area: tan; }')).toEqual([]);
  });
});

// M1-ISS-19 (design system 2.3.0): sizes and type come from the tokens.
describe('style lint: size and font literals', () => {
  const rules = (css: string): string[] => (lintCss(css, { tokens: new Set(['--gutter-s', '--text-body-sm', '--font-sans']) }) as Array<{ rule: string }>).map((f) => f.rule);

  it.each([
    ['font-size', '.a { font-size: 13px; }'],
    ['the font shorthand', '.a { font: 600 14px/1.2 var(--font-sans); }'],
    ['a line height', '.a { line-height: 18px; }'],
    ['a padding', '.a { padding: 0 10px; }'],
    ['a margin, also a negative one', '.a { margin: -6px 0 0; }'],
    ['a gap', '.a { gap: 6px; }'],
    ['an inset', '.a { top: 15px; }'],
    ['a width, a height, their min and max', '.a { width: 36px; min-height: 88px; max-width: 700px; }'],
    ['a length inside calc() or min()', '.a { width: min(380px, calc(100vw - 32px)); }'],
    ['a scroll margin', '.a { scroll-margin-top: 16px; }'],
    ['a custom property of its own', '.a { --gap: 12px; gap: var(--gap); }'],
  ])('%s in px is a size literal', (_what, css) => {
    expect(rules(css)).toContain('size-literal');
  });

  it.each([
    ['1 and 2 px: borders, outlines and the hairline math around them', '.a { margin-bottom: -1px; top: 2px; height: calc(var(--gutter-s) - 2px); }'],
    ['zero, percentages, em, ch and viewport units', '.a { margin: 0; width: 100%; max-width: 65ch; height: 100vh; font-size: 1.5em; }'],
    ['unitless line heights', '.a { line-height: 1.45; }'],
    ['borders, outlines, shadows, transforms, grid tracks, flex bases and radii are not sizes of the rule', '.a { border: 4px solid; outline-offset: -3px; box-shadow: 0 12px 32px; transform: translateX(16px); grid-template-columns: minmax(220px, 1fr); flex: 1 1 180px; border-radius: 3px; }'],
    ['tokens, also in calc()', '.a { padding: var(--gutter-s); width: calc(100% - 2 * var(--gutter-s)); font: var(--text-body-sm); }'],
  ])('%s are fine', (_what, css) => {
    expect(rules(css)).not.toContain('size-literal');
  });

  it.each([
    ['a named family', '.a { font-family: "Manrope", sans-serif; }'],
    ['a generic family alone', '.a { font-family: system-ui; }'],
    ['a family in the shorthand', '.a { font: 600 1em "Inter"; }'],
    ['a family after a token', '.a { font-family: var(--font-sans), serif; }'],
    ['a token that is not a family', '.a { font-family: var(--gutter-s); }'],
  ])('%s is a font literal', (_what, css) => {
    expect(rules(css)).toContain('font-literal');
  });

  it.each([
    ['a family token', '.a { font-family: var(--font-sans); }'],
    ['a type style in the shorthand', '.a { font: var(--text-body-sm); }'],
    ['inherit', '.a { font: inherit; font-family: inherit; }'],
    ['the name a @font-face declares', '@font-face { font-family: "Manrope"; src: url("./manrope.woff2"); }'],
  ])('%s is fine', (_what, css) => {
    expect(rules(css)).not.toContain('font-literal');
  });
});
