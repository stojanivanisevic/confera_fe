// M1-FE-03 / ADR-22: every colour pair of the decision is recomputed from
// tokens.json (WCAG 2.1 relative luminance), and the stylesheet is scanned so
// that the old, failing pairs cannot come back.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const tokens = JSON.parse(readFileSync(join(root, 'design-system/tokens.json'), 'utf8')) as {
  version: number;
  color: { tokens: Array<{ name: string; value: string }> };
};
const css = readFileSync(join(root, 'design-system/components/bundle.css'), 'utf8');

type Rgba = [number, number, number, number];

const raw = new Map(tokens.color.tokens.map((t) => [t.name, t.value]));
function colour(name: string): Rgba {
  let value = raw.get(name);
  if (value === undefined) throw new Error(`No colour token named ${name}`);
  const alias = /^\{([a-z0-9-]+)\}$/.exec(value);
  if (alias) value = raw.get(alias[1]!)!;
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = Number.parseInt(hex[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = /^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/.exec(value);
  if (rgba) return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), Number(rgba[4])];
  throw new Error(`Cannot read the colour of ${name}: ${value}`);
}

/** Paints `top` over the opaque `ground`. */
function over(top: Rgba, ground: Rgba): Rgba {
  const a = top[3];
  return [top[0] * a + ground[0] * (1 - a), top[1] * a + ground[1] * (1 - a), top[2] * a + ground[2] * (1 - a), 1];
}

function luminance([r, g, b]: Rgba): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio of the token `fg` on the token `bg` (translucent colours are painted on their ground first). */
function contrast(fg: string, bg: string, under?: string): number {
  const ground = under ? over(colour(bg), colour(under)) : colour(bg);
  const a = luminance(over(colour(fg), ground));
  const b = luminance(ground);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const TEXT = 4.5; // WCAG 1.4.3, normal text
const UI = 3; // WCAG 1.4.11, control borders, icons, focus rings; large text

describe('ADR-22: the token values', () => {
  it.each([
    ['brand-orange', '#ef7b06'], // the brand stays
    ['on-brand', '#17191b'],
    ['brand-orange-strong', '#a85300'],
    ['success-strong', '#117a37'],
    ['danger-hover', '#a82828'],
  ])('%s is %s', (name, value) => {
    expect(raw.get(name)).toBe(value);
  });

  it('the tokens are version 2', () => {
    expect(tokens.version).toBe(2);
  });
});

describe('ADR-22: every listed pair meets its ratio', () => {
  // [foreground, background, minimum, the ratio the decision states]
  const PAIRS: Array<[string, string, number, number]> = [
    // 1. labels and glyphs on orange
    ['on-brand', 'brand-orange', TEXT, 6.3],
    ['on-brand', 'brand-orange-hover', TEXT, 5.16],
    // 2. orange text, icons, checked borders, switch track
    ['brand-orange-strong', 'surface-1', TEXT, 5.38],
    ['brand-orange-strong', 'background-2', TEXT, 5.2],
    ['brand-orange-strong', 'background', TEXT, 4.71],
    ['brand-orange-strong', 'surface-2', UI, 4.05], // icons and borders only on the blush ground
    // 3. the blue focus ring of choice controls
    ['focus', 'surface-1', UI, 4.58],
    ['focus', 'background', UI, 4.0],
    ['focus', 'background-dark', UI, 3.95],
    // 4. muted text
    ['text-secondary', 'surface-1', TEXT, 6.45],
    ['text-secondary', 'background-2', TEXT, 6.23],
    ['text-secondary', 'background', TEXT, 5.64],
    ['text-secondary', 'surface-2', TEXT, 4.85],
    // 5. control borders
    ['neutral-700', 'surface-1', UI, 4.05],
    ['neutral-700', 'background', UI, 3.54],
    // 6. success text
    ['success-strong', 'success-surface', TEXT, 4.88],
    ['success-strong', 'background', TEXT, 4.76],
    // 7. danger button, at rest and on hover
    ['surface-1', 'danger-strong', TEXT, 5.8],
    ['surface-1', 'danger-hover', TEXT, 7.0],
  ];

  it.each(PAIRS)('%s on %s is at least %s:1 (decision: %s)', (fg, bg, minimum, stated) => {
    const ratio = contrast(fg, bg);
    expect(ratio).toBeGreaterThanOrEqual(minimum);
    // The decision's own number, to two decimals, so a changed token is noticed.
    expect(Math.abs(ratio - stated)).toBeLessThan(0.011);
  });

  it('small orange text is not possible on the blush ground, as the decision says', () => {
    expect(contrast('brand-orange-strong', 'surface-2')).toBeLessThan(TEXT);
  });

  it('the two tracks of a switch differ by 3:1 and more, and each thumb stands out from its track (2.3.0, M1-ISS-25)', () => {
    // Off: white track, neutral-700 border and thumb. On: brand-orange-strong track, white thumb. Was 1.33:1 between the tracks.
    expect(contrast('brand-orange-strong', 'surface-1')).toBeGreaterThanOrEqual(UI);
    expect(contrast('neutral-700', 'surface-1')).toBeGreaterThanOrEqual(UI);
    expect(contrast('surface-1', 'brand-orange-strong')).toBeGreaterThanOrEqual(UI);
  });
});

describe('the pairs that already passed still pass', () => {
  it.each<[string, string, number, string?]>([
    ['ink', 'surface-1', TEXT],
    ['ink', 'background-2', TEXT],
    ['ink', 'background', TEXT],
    ['ink', 'surface-2', TEXT],
    ['neutral-900', 'surface-1', TEXT],
    ['neutral-900', 'neutral-100', TEXT],
    ['neutral-950', 'background', TEXT],
    ['text-on-dark', 'background-dark', TEXT],
    ['text-on-dark', 'ink', TEXT],
    ['text-on-dark', 'ink-hover', TEXT],
    ['on-dark-muted', 'background-dark', TEXT],
    ['on-dark-subtle', 'background-dark', TEXT],
    ['danger-strong', 'danger-surface', TEXT],
    ['danger-strong', 'surface-1', TEXT],
    ['warning', 'warning-surface', TEXT],
    ['info-strong', 'info-surface', TEXT],
    ['ink', 'danger-surface', TEXT],
    ['ink', 'success-surface', TEXT],
    ['ink', 'warning-surface', TEXT],
    ['ink', 'info-surface', TEXT],
    ['danger', 'surface-1', UI], // error border and icon
    ['success', 'surface-1', UI], // success border and icon
    ['neutral-700', 'background-2', UI],
    ['neutral-700', 'neutral-100', UI],
    ['brand-orange', 'background-dark', UI], // focus outline of sidebar links
    ['success-on-dark', 'background-dark', UI],
    ['danger-on-dark', 'background-dark', UI],
    ['warning-on-dark', 'background-dark', UI],
    ['info-on-dark', 'background-dark', UI],
  ])('%s on %s is at least %s:1', (fg, bg, minimum) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(minimum);
  });

  it('the counter of the current sidebar link stays readable (on-brand on the chip over orange)', () => {
    expect(contrast('on-brand', 'on-dark-chip', 'brand-orange')).toBeGreaterThanOrEqual(TEXT);
  });
});

describe('the pairs version 1 failed on are gone from the stylesheet', () => {
  const cssRoot = postcss.parse(css);
  const rules: Array<{ selector: string; decls: Map<string, string> }> = [];
  cssRoot.walkRules((rule) => {
    const decls = new Map<string, string>();
    rule.each((node) => {
      if (node.type === 'decl') decls.set(node.prop, node.value);
    });
    rules.push({ selector: rule.selector, decls });
  });
  const token = (value: string | undefined) => (value ? /^var\(--([a-z0-9-]+)\)$/.exec(value.trim())?.[1] : undefined);
  const isDisabled = (selector: string) => /:disabled|\.is-disabled/.test(selector);

  it('reads the stylesheet', () => {
    expect(rules.length).toBeGreaterThan(300);
  });

  it('no text or icon is brand-orange or brand-orange-hover', () => {
    const offenders = rules.filter((r) => ['brand-orange', 'brand-orange-hover'].includes(token(r.decls.get('color')) ?? ''));
    expect(offenders.map((r) => r.selector)).toEqual([]);
  });

  it('nothing on an orange fill is white', () => {
    const orange = ['brand-orange', 'brand-orange-hover'];
    const offenders = rules.filter((r) => {
      const bg = token(r.decls.get('background-color')) ?? token(r.decls.get('background'));
      return bg !== undefined && orange.includes(bg) && token(r.decls.get('color')) === 'surface-1';
    });
    expect(offenders.map((r) => r.selector)).toEqual([]);
  });

  // Rules whose `color` paints an icon only (their text has its own rule): 3:1 applies (WCAG 1.4.11).
  const ICON_ONLY = ['.ud-dropzone', '.ud-empty__icon'];

  it('every rule that sets a text colour and a fill together meets 4.5:1 (3:1 for icons; disabled states apart)', () => {
    const failures: string[] = [];
    let checked = 0;
    for (const r of rules) {
      if (isDisabled(r.selector)) continue;
      const fg = token(r.decls.get('color'));
      const bg = token(r.decls.get('background-color')) ?? token(r.decls.get('background'));
      if (!fg || !bg || !raw.has(fg) || !raw.has(bg)) continue;
      checked += 1;
      const translucent = colour(bg)[3] < 1;
      const ratio = translucent ? contrast(fg, bg, 'background-dark') : contrast(fg, bg);
      const minimum = ICON_ONLY.includes(r.selector) ? UI : TEXT;
      if (ratio < minimum) failures.push(`${r.selector}: ${fg} on ${bg} = ${ratio.toFixed(2)}`);
    }
    expect(checked).toBeGreaterThan(25);
    expect(failures).toEqual([]);
  });

  it('muted grey (neutral-500) is the colour of disabled text only', () => {
    const offenders = rules.filter((r) => r.decls.get('color')?.includes('--neutral-500') && !isDisabled(r.selector));
    expect(offenders.map((r) => r.selector)).toEqual([]);
  });

  it('no control border uses control-border, and no focus ring is orange on a light ground', () => {
    expect(css).not.toContain('--control-border');
    const orangeRings = rules.filter((r) => /focus/.test(r.selector) && r.decls.get('box-shadow')?.includes('--brand-orange'));
    expect(orangeRings.map((r) => r.selector)).toEqual([]);
  });

  it.each([
    ['.ud-check__input:focus-visible + .ud-check__box'],
    ['.ud-radio__input:focus-visible + .ud-radio__dot'],
    ['.ud-switch__input:focus-visible + .ud-switch__track'],
    ['.ud-scale__input:focus-visible + .ud-scale__btn'],
  ])('%s takes the blue focus ring', (selector) => {
    expect(rules.find((r) => r.selector === selector)?.decls.get('box-shadow')).toBe('var(--focus-ring)');
  });

  it.each([
    ['.ud-check__box', 'border', '--neutral-700'],
    ['.ud-radio__dot', 'border', '--neutral-700'],
    ['.ud-field__box', 'border', '--neutral-700'],
    ['.ud-search', 'border', '--neutral-700'],
    ['.ud-scale__btn', 'border', '--neutral-700'],
    ['.ud-dropzone', 'border', '--neutral-700'],
    // 2.3.0 (M1-ISS-25): the "off" track is white with a neutral-700 border and thumb; it was a solid neutral-700 track.
    ['.ud-switch__track', 'border', '--neutral-700'],
    ['.ud-switch__track', 'background', '--surface-1'],
    ['.ud-switch__thumb', 'background', '--neutral-700'],
    ['.ud-switch__input:checked + .ud-switch__track', 'background', '--brand-orange-strong'],
    ['.ud-switch__input:checked + .ud-switch__track .ud-switch__thumb', 'background', '--surface-1'],
    ['.ud-field__message', 'color', '--text-secondary'],
    ['.ud-field__control::placeholder', 'color', '--text-secondary'],
    ['.ud-btn--danger:hover:not(:disabled)', 'background-color', '--danger-hover'],
  ])('%s: %s uses %s', (selector, prop, expected) => {
    expect(rules.find((r) => r.selector === selector)?.decls.get(prop)).toContain(expected);
  });

  it('the stylesheet imports nothing and names no other origin', () => {
    expect(css).not.toMatch(/@import/);
    expect(css).not.toMatch(/https?:|\/\/[a-z]/i);
  });
});
