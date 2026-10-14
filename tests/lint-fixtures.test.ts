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
  const tokens = new Set(['--ink', '--surface-1']);
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
    expect(lintCss('.a { font-family: "Tan", linen; animation-name: red; }')).toEqual([]);
  });
});
