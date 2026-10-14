// UI review of milestone 0.1.0 (task M1-REV-02). Not part of the suite: it lives on the scratch
// branch m1/ui-review only. It takes the screenshots the UI reviewer looks at (375 px with touch
// and 1440 px) and measures what a picture does not show: sideways scroll, clipped text, target
// sizes, the font size of inputs on touch, the contrast of control boundaries and of state
// indicators, and the focus indicator of every tab stop (focused against unfocused, pixel by
// pixel). It asserts only that the screens load; findings are written to
// .artifacts/ui-review/<engine>/data/*.json for the review report, not failed.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import AxeBuilder from '@axe-core/playwright';
import type { Browser, BrowserContext, Frame, Page } from '@playwright/test';
import { PNG } from 'pngjs';

import { buildEmbedSnippet, frameId } from '../packages/embed-loader/src/index';
import { ADMIN_ORIGIN, HARNESS_ORIGIN, PUBLIC_ORIGIN } from './env';
import { expect, test } from './support/fixtures';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const SLUG = 'spike-abstract';
const FRAME = `#${frameId(SLUG)}`;
const SNIPPET = buildEmbedSnippet({ publicOrigin: PUBLIC_ORIGIN, slug: SLUG, title: 'Abstract submission', linkText: 'Open the form in a new page' });
const HARNESS_URL = `${HARNESS_ORIGIN}/hostile.html?paste=${Buffer.from(SNIPPET, 'utf8').toString('base64url')}`;

interface Width {
  name: '375' | '1440';
  viewport: { width: number; height: number };
  dsf: number;
  touch: boolean;
}
const WIDTHS: readonly Width[] = [
  { name: '375', viewport: { width: 375, height: 812 }, dsf: 2, touch: true },
  { name: '1440', viewport: { width: 1440, height: 900 }, dsf: 1, touch: false },
];

let engine = 'chromium';
const out = (...parts: string[]) => {
  const file = join(root, '.artifacts', 'ui-recheck', engine, ...parts);
  mkdirSync(dirname(file), { recursive: true });
  return file;
};
const save = (name: string, data: unknown) => writeFileSync(out('data', `${name}.json`), `${JSON.stringify(data, null, 2)}\n`);

async function open(browser: Browser, browserName: string, w: Width): Promise<{ context: BrowserContext; page: Page }> {
  engine = browserName;
  const context = await browser.newContext({
    viewport: w.viewport,
    deviceScaleFactor: w.dsf,
    ...(w.touch ? { hasTouch: true, ...(browserName === 'firefox' ? {} : { isMobile: true }) } : {}),
  });
  const page = await context.newPage();
  await page.mouse.move(0, 0);
  return { context, page };
}

const shot = (page: Page, file: string, fullPage = true) => page.screenshot({ path: out(file), fullPage, animations: 'disabled' });

async function settle(target: Page | Frame) {
  await target.evaluate(() => document.fonts.ready);
}

/** What a picture does not show: sideways scroll, parts outside the window, clipped text, input sizes, small targets. */
const measure = (target: Page | Frame) =>
  target.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const result = { viewport: vw, coarse: matchMedia('(pointer: coarse)').matches, overflowX: Math.max(0, document.documentElement.scrollWidth - vw), outside: [] as string[], clipped: [] as string[], inputs: [] as string[], small24: [] as string[], small44: 0, targets: 0 };
    const label = (el: Element) => {
      const card = el.closest('[data-component]')?.getAttribute('data-component');
      const cls = String((el as HTMLElement).className && typeof (el as HTMLElement).className === 'string' ? (el as HTMLElement).className : '').split(' ').filter(Boolean).slice(0, 2).join('.');
      const text = (el.getAttribute('aria-label') ?? (el as HTMLInputElement).labels?.[0]?.textContent ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 32);
      return `${card ? `${card} › ` : ''}${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''} "${text}"`;
    };
    const containedByAncestor = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (s.overflowX !== 'visible' || s.position === 'fixed') return true;
      }
      return false;
    };
    for (const el of document.body.querySelectorAll('*')) {
      if (el.closest('.ud-sr')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none') continue;
      if ((r.right > vw + 0.5 || r.left < -0.5) && s.position !== 'fixed' && !containedByAncestor(el)) result.outside.push(`${label(el)} left=${Math.round(r.left)} right=${Math.round(r.right)}`);
      const clips = s.overflowX === 'hidden' || s.overflowX === 'clip' || s.textOverflow === 'ellipsis';
      if (clips && el.scrollWidth > el.clientWidth + 1 && (el.textContent ?? '').trim() !== '') result.clipped.push(`${label(el)} content ${el.scrollWidth}px in ${el.clientWidth}px`);
    }
    for (const el of document.querySelectorAll<HTMLElement>('input, select, textarea')) {
      const type = (el as HTMLInputElement).type;
      if (['hidden', 'checkbox', 'radio', 'file'].includes(type)) continue;
      result.inputs.push(`${label(el)} ${getComputedStyle(el).fontSize}`);
    }
    for (const el of document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])')) {
      if ((el as HTMLInputElement).type === 'hidden' || el.closest('[hidden]') || el.tabIndex < 0) continue;
      let box = el.getBoundingClientRect();
      if (box.width < 4 || box.height < 4 || getComputedStyle(el).opacity === '0') {
        const visual = el.closest('label') ?? el.parentElement;
        if (visual) box = visual.getBoundingClientRect();
      }
      if (box.width === 0 && box.height === 0) continue;
      result.targets += 1;
      const w = Math.round(box.width);
      const h = Math.round(box.height);
      if (w < 44 || h < 44) result.small44 += 1;
      if (w < 24 || h < 24) result.small24.push(`${label(el)} ${w}x${h}${(el as HTMLButtonElement).disabled ? ' (disabled)' : ''}`);
    }
    return result;
  });

/** Contrast of control boundaries, state indicators and icons against what is next to them (WCAG 1.4.11). */
const nonText = (target: Page | Frame) =>
  target.evaluate(() => {
    type C = { r: number; g: number; b: number; a: number };
    const parse = (value: string): C | null => {
      const m = /rgba?\(([^)]+)\)/.exec(value);
      if (!m) return null;
      const p = m[1]!.split(/[\s,/]+/).filter(Boolean).map(Number);
      return { r: p[0]!, g: p[1]!, b: p[2]!, a: p.length > 3 ? p[3]! : 1 };
    };
    const over = (top: C, bottom: C): C => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
    const backdrop = (el: Element | null): C => {
      const layers: C[] = [];
      for (let p = el; p; p = p.parentElement) {
        const c = parse(getComputedStyle(p).backgroundColor);
        if (c && c.a > 0) {
          layers.push(c);
          if (c.a >= 1) break;
        }
      }
      let base: C = { r: 255, g: 255, b: 255, a: 1 };
      for (const layer of layers.reverse()) base = over(layer, base);
      return base;
    };
    const lum = (c: C) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const ratio = (a: C, b: C) => {
      const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m) as [number, number];
      return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
    };
    const hex = (c: C) => `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
    // [what, selector, property of the element, against: its parent's ground ("outside") or its own ground ("inside")]
    const checks: Array<[string, string, 'borderTopColor' | 'borderBottomColor' | 'backgroundColor' | 'color', 'outside' | 'inside']> = [
      ['field border', '.ud-field:not(.ud-field--error):not(.ud-field--success):not(.is-disabled) .ud-field__box', 'borderTopColor', 'outside'],
      ['field border, error', '.ud-field--error .ud-field__box', 'borderTopColor', 'outside'],
      ['field border, success', '.ud-field--success .ud-field__box', 'borderTopColor', 'outside'],
      ['field icon', '.ud-field__icon', 'color', 'inside'],
      ['select chevron', '.ud-field__chevron', 'color', 'inside'],
      ['field status icon', '.ud-field__status', 'color', 'inside'],
      ['search border', '.ud-search', 'borderTopColor', 'outside'],
      ['checkbox border', '.ud-check__input:not(:checked) + .ud-check__box', 'borderTopColor', 'outside'],
      ['checkbox checked fill', '.ud-check__input:checked:not(:disabled) + .ud-check__box', 'backgroundColor', 'outside'],
      ['checkbox check glyph', '.ud-check__input:checked:not(:disabled) + .ud-check__box', 'color', 'inside'],
      ['radio border', '.ud-radio__input:not(:checked) + .ud-radio__dot', 'borderTopColor', 'outside'],
      ['radio checked ring', '.ud-radio__input:checked + .ud-radio__dot', 'borderTopColor', 'outside'],
      ['switch track off', '.ud-switch__input:not(:checked):not(:disabled) + .ud-switch__track', 'backgroundColor', 'outside'],
      ['switch track on', '.ud-switch__input:checked:not(:disabled) + .ud-switch__track', 'backgroundColor', 'outside'],
      ['switch thumb on its track', '.ud-switch__input:not(:disabled) + .ud-switch__track .ud-switch__thumb', 'backgroundColor', 'outside'],
      ['scale button border', '.ud-scale__input:not(:checked) + .ud-scale__btn', 'borderTopColor', 'outside'],
      ['scale chosen fill', '.ud-scale__input:checked + .ud-scale__btn', 'backgroundColor', 'outside'],
      ['scale chosen border', '.ud-scale__input:checked + .ud-scale__btn', 'borderTopColor', 'outside'],
      ['segmented pill selected fill', '.ud-tab.is-selected', 'backgroundColor', 'outside'],
      ['underline tab selected', '.ud-tabs-u__tab.is-selected', 'borderBottomColor', 'outside'],
      ['page button current', '.ud-page-btn.is-current', 'backgroundColor', 'outside'],
      ['page-size select border', '.ud-pagination__size select', 'borderTopColor', 'outside'],
      ['sidebar link current', '.ud-sidenav__link.is-current', 'backgroundColor', 'outside'],
      ['stepper current ring', '.ud-stepper__step.is-current .ud-stepper__dot', 'borderTopColor', 'outside'],
      ['stepper todo ring', '.ud-stepper__step.is-todo .ud-stepper__dot', 'borderTopColor', 'outside'],
      ['progress bar on track', '.ud-progress__bar', 'backgroundColor', 'outside'],
      ['dropzone border', '.ud-dropzone', 'borderTopColor', 'outside'],
      ['dropzone border, inside', '.ud-dropzone', 'borderTopColor', 'inside'],
      ['tag remove icon', '.ud-tag__remove', 'color', 'outside'],
      ['icon button glyph', '.ud-icon-btn:not(.ud-icon-btn--on-dark)', 'color', 'outside'],
      ['search clear glyph', '.ud-search__clear', 'color', 'outside'],
      ['empty-state icon', '.ud-empty__icon', 'color', 'inside'],
      ['listbox active option', '.ud-listbox__option.is-active', 'backgroundColor', 'outside'],
      ['primary button fill (info)', '.ud-btn--primary:not(:disabled)', 'backgroundColor', 'outside'],
    ];
    const rows: Array<{ what: string; selector: string; value: string; against: string; ratio: number; where: string }> = [];
    for (const [what, selector, property, against] of checks) {
      const seen = new Set<string>();
      for (const el of document.querySelectorAll(selector)) {
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden') continue;
        const own = parse(s[property]);
        if (!own) continue;
        const ground = against === 'inside' ? backdrop(el) : backdrop(el.parentElement);
        const value = over(own, ground);
        const key = `${hex(value)}/${hex(ground)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({ what, selector, value: hex(value), against: hex(ground), ratio: ratio(value, ground), where: el.closest('[data-component]')?.getAttribute('data-component') ?? '' });
      }
    }
    return rows;
  });

const lum = (r: number, g: number, b: number) => {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

/** The change between a focused and an unfocused picture of the same place: the largest contrast, and the area (CSS px) that changed by 3:1 or more. */
function focusChange(focused: Buffer, unfocused: Buffer, dsf: number) {
  const a = PNG.sync.read(focused);
  const b = PNG.sync.read(unfocused);
  if (a.width !== b.width || a.height !== b.height) return { max: 0, area3: 0, changed: 0 };
  let max = 1;
  let strong = 0;
  let changed = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const x = lum(a.data[i]!, a.data[i + 1]!, a.data[i + 2]!);
    const y = lum(b.data[i]!, b.data[i + 1]!, b.data[i + 2]!);
    const c = (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    if (c > 1.05) changed += 1;
    if (c >= 3) strong += 1;
    if (c > max) max = c;
  }
  return { max: Math.round(max * 100) / 100, area3: Math.round(strong / (dsf * dsf)), changed: Math.round(changed / (dsf * dsf)) };
}

interface Stop {
  n: number;
  what: string;
  focusVisible: boolean;
  onScreen: boolean;
  rect: { x: number; y: number; w: number; h: number };
  max?: number;
  area3?: number;
  perimeter?: number;
  verdict: string;
  ring?: string;
}

/**
 * Tab through `scope` from where the focus is now, and judge the indicator of every stop: a picture
 * of the place while focused, the same place after blur, and the difference.
 */
async function walk(page: Page, scope: Page | Frame, dir: string, w: Width, max = 400): Promise<Stop[]> {
  const stops: Stop[] = [];
  const viewport = page.viewportSize()!;
  let first = '';
  let previous = '';
  for (let n = 1; n <= max; n += 1) {
    await page.keyboard.press('Tab');
    const info = await scope.evaluate(() => {
      for (const el of document.querySelectorAll('[data-ui-review-focus], [data-ui-review-shown]')) {
        el.removeAttribute('data-ui-review-focus');
        el.removeAttribute('data-ui-review-shown');
      }
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body || el === document.documentElement || el.tagName === 'IFRAME') return null;
      el.setAttribute('data-ui-review-focus', '');
      const own = el.getBoundingClientRect();
      let shown: HTMLElement = (el.closest('.ud-field__box, .ud-search') as HTMLElement | null) ?? el;
      if (shown === el && (own.width < 4 || own.height < 4 || getComputedStyle(el).opacity === '0')) shown = (el.closest('label') ?? el.parentElement ?? el) as HTMLElement;
      shown.setAttribute('data-ui-review-shown', '');
      const r = shown.getBoundingClientRect();
      const card = el.closest('[data-component]')?.getAttribute('data-component');
      const name = (el.getAttribute('aria-label') ?? (el as HTMLInputElement).labels?.[0]?.textContent ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
      const role = el.getAttribute('role');
      const type = el.getAttribute('type');
      const what = `${card ? `${card} › ` : ''}${el.tagName.toLowerCase()}${role ? `[role=${role}]` : ''}${type ? `[type=${type}]` : ''} "${name}"`;
      const onScreen = r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight;
      // Which ring is drawn: the system's blue (outline or box-shadow in --focus), the browser's own (outline style auto), or another.
      const blue = /rgb\(11, 118, 215\)/;
      const looks: string[] = [];
      for (const part of [el, el.nextElementSibling, el.closest('.ud-field__box, .ud-search, .ud-file__btn, label')].filter((x): x is Element => !!x)) {
        const cs = getComputedStyle(part);
        if (cs.outlineStyle !== 'none' && Number.parseFloat(cs.outlineWidth) > 0) looks.push(cs.outlineStyle === 'auto' ? 'browser-default' : blue.test(cs.outlineColor) ? 'ds-blue' : `outline ${cs.outlineColor}`);
        if (cs.boxShadow !== 'none') looks.push(blue.test(cs.boxShadow) ? 'ds-blue' : `shadow ${cs.boxShadow.slice(0, 40)}`);
      }
      const ring = looks.includes('ds-blue') ? 'ds-blue' : looks.includes('browser-default') ? 'browser-default' : (looks[0] ?? 'none');
      return { what, ring, focusVisible: el.matches(':focus-visible'), onScreen, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } };
    });
    if (info === null) break;
    if (n > 1 && info.what === first) break;
    if (n === 1) first = info.what;
    // A date field is several stops in one control (day, month, year). It is judged once; a blur and
    // a new focus would put the focus back on its first part and the walk would never leave it.
    const key = `${info.what} ${JSON.stringify(info.rect)}`;
    if (key === previous) continue;
    previous = key;
    const stop: Stop = { n, ...info, verdict: '' };
    const shown = scope.locator('[data-ui-review-shown]');
    await shown.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => undefined);
    const box = await shown.boundingBox();
    const inPage = !!box && box.x + box.width > 0 && box.x < viewport.width && box.y + box.height > 0 && box.y < viewport.height;
    stop.onScreen = info.onScreen && inPage;
    if (!stop.onScreen || !box) {
      stop.verdict = 'FOCUS ON AN ELEMENT THAT IS NOT ON THE SCREEN';
      stops.push(stop);
      continue;
    }
    const pad = 7;
    const x = Math.max(0, Math.floor(box.x - pad));
    const y = Math.max(0, Math.floor(box.y - pad));
    const clip = { x, y, width: Math.max(1, Math.min(viewport.width, Math.ceil(box.x + box.width + pad)) - x), height: Math.max(1, Math.min(viewport.height, Math.ceil(box.y + box.height + pad)) - y) };
    const focused = await page.screenshot({ clip, animations: 'disabled' });
    writeFileSync(out('focus', dir, `${String(n).padStart(3, '0')}.png`), focused);
    await scope.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.waitForTimeout(30);
    const unfocused = await page.screenshot({ clip, animations: 'disabled' });
    await scope.evaluate(() => (document.querySelector('[data-ui-review-focus]') as HTMLElement | null)?.focus());
    const change = focusChange(focused, unfocused, w.dsf);
    const perimeter = Math.round(2 * (box.width + box.height));
    stop.max = change.max;
    stop.area3 = change.area3;
    stop.perimeter = perimeter;
    stop.verdict = change.max < 3 ? `WEAK: largest change ${change.max}:1` : change.area3 < perimeter ? `THIN: ${change.area3} px at 3:1 for a perimeter of ${perimeter}` : 'ok';
    stops.push(stop);
  }
  return stops;
}

const axe = async (page: Page, include?: string) => {
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  if (include) builder = builder.include(include);
  const results = await builder.analyze();
  return results.violations.map((v) => `${v.id}: ${v.help} — ${v.nodes.slice(0, 5).map((n) => n.target.join(' ')).join(' | ')}`);
};

async function openGallery(page: Page) {
  await page.goto(`${PUBLIC_ORIGIN}/dev/gallery`);
  await expect(page.locator('[data-confera-dev="gallery"]')).toHaveAttribute('data-hydrated', 'true', { timeout: 60_000 });
  await settle(page);
}
async function openForm(page: Page) {
  await page.goto(`${PUBLIC_ORIGIN}/f/${SLUG}`);
  await page.locator('[data-confera-form][data-hydrated="true"]').waitFor();
  await settle(page);
}
async function openHarness(page: Page): Promise<Frame> {
  await page.goto(HARNESS_URL);
  await page.locator(FRAME).scrollIntoViewIfNeeded();
  const frame = await (await page.locator(FRAME).elementHandle())?.contentFrame();
  if (!frame) throw new Error('the frame of the form has no document');
  await frame.locator('[data-confera-form][data-hydrated="true"]').waitFor();
  await settle(frame);
  // The frame follows its content before anything is measured.
  await expect
    .poll(async () => {
      const el = await page.locator(FRAME).evaluate((f) => f.getBoundingClientRect().height);
      const content = await frame.locator('[data-confera-embed-root]').evaluate((r) => Math.ceil(r.getBoundingClientRect().height));
      return Math.abs(el - content);
    })
    .toBeLessThanOrEqual(1);
  return frame;
}

for (const w of WIDTHS) {
  test.describe(`${w.name} px`, () => {
    test(`gallery: every card, measures, non-text contrast`, async ({ browser, browserName }) => {
      test.setTimeout(240_000);
      const { context, page } = await open(browser, browserName, w);
      try {
        await openGallery(page);
        if (w.name === '1440') await shot(page, `gallery/${w.name}/_full.png`);
        save(`gallery-${w.name}-measure`, await measure(page));
        save(`gallery-${w.name}-nontext`, await nonText(page));
      } finally {
        await context.close();
      }
      // The pictures of the cards. At 375 px without the mobile flag: a page that is wider than the
      // phone is zoomed out by a mobile browser, and element pictures would then be taken from the
      // wrong place. What the page does at 375 px is measured above, with the flag.
      const pictures = await browser.newContext({ viewport: w.viewport, deviceScaleFactor: w.dsf, ...(w.touch ? { hasTouch: true } : {}) });
      try {
        const page2 = await pictures.newPage();
        await page2.mouse.move(0, 0);
        await openGallery(page2);
        for (const card of await page2.locator('[data-confera-dev="gallery-card"]').all()) {
          const name = await card.getAttribute('data-component');
          await card.scrollIntoViewIfNeeded();
          await card.screenshot({ path: out(`gallery/${w.name}/${name}.png`), animations: 'disabled' });
        }
      } finally {
        await pictures.close();
      }
    });

    test(`gallery: focus walk over every tab stop`, async ({ browser, browserName }) => {
      test.skip(browserName !== 'chromium', 'the walk is engine-independent CSS; Chromium only');
      test.setTimeout(420_000);
      const { context, page } = await open(browser, browserName, w);
      try {
        await openGallery(page);
        const stops = await walk(page, page, `gallery-${w.name}`, w);
        save(`gallery-${w.name}-focus`, stops);
      } finally {
        await context.close();
      }
    });

    test(`gallery: overlays, menu, listbox, tooltip, shell`, async ({ browser, browserName }) => {
      test.setTimeout(180_000);
      const { context, page } = await open(browser, browserName, w);
      const notes: Record<string, unknown> = {};
      try {
        await openGallery(page);
        const card = (name: string) => page.locator(`[data-component="${name}"]`);

        // Menu, by keyboard: the first item takes the focus. Its indicator is compared with the same item unfocused.
        const trigger = card('Menu').getByRole('button', { name: 'Row actions' });
        await trigger.focus();
        await page.keyboard.press('Enter');
        const item = page.getByRole('menuitem', { name: 'Open' });
        await expect(item).toBeFocused();
        const list = page.locator('.ud-menu__list');
        await list.scrollIntoViewIfNeeded();
        const menuBox = (await list.boundingBox())!;
        const menuClip = { x: Math.max(0, menuBox.x - 8), y: Math.max(0, menuBox.y - 8), width: Math.min(w.viewport.width - Math.max(0, menuBox.x - 8), menuBox.width + 16), height: menuBox.height + 16 };
        const focused = await page.screenshot({ clip: menuClip, path: out(`probes/${w.name}/menu-first-item-focused.png`), animations: 'disabled' });
        await page.keyboard.press('ArrowDown');
        const unfocused = await page.screenshot({ clip: menuClip, path: out(`probes/${w.name}/menu-second-item-focused.png`), animations: 'disabled' });
        notes.menuFocusChange = focusChange(focused, unfocused, w.dsf);
        notes.menuItemFocusStyle = await page.getByRole('menuitem', { name: 'Resend the email' }).evaluate((el) => {
          const s = getComputedStyle(el);
          return { outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`, background: s.backgroundColor, boxShadow: s.boxShadow };
        });
        notes.menuFocusedItemStyle = await page.getByRole('menuitem', { name: 'Open' }).evaluate((el) => {
          const s = getComputedStyle(el);
          return { outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor} offset ${s.outlineOffset}`, background: s.backgroundColor };
        });
        await page.keyboard.press('Escape');
        await expect(page.getByRole('menu')).toBeHidden();
        notes.menuFocusAfterEscape = await page.evaluate(() => {
          const el = document.activeElement;
          return el === document.body ? 'body (focus lost)' : `${el?.tagName.toLowerCase()} "${el?.getAttribute('aria-label') ?? el?.textContent ?? ''}"`;
        });
        // Choosing an item with Enter.
        await trigger.focus();
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        notes.menuFocusAfterChoosing = await page.evaluate(() => {
          const el = document.activeElement;
          return el === document.body ? 'body (focus lost)' : `${el?.tagName.toLowerCase()} "${el?.getAttribute('aria-label') ?? el?.textContent ?? ''}"`;
        });
        // Tab out of an open menu: does it close?
        await trigger.focus();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('menuitem', { name: 'Open' })).toBeFocused();
        await page.keyboard.press('Tab');
        notes.menuOpenAfterTab = await page.getByRole('menu').isVisible();
        await page.keyboard.press('Escape');

        // Autocomplete: the keyboard highlight in the list.
        const country = card('Autocomplete').getByRole('combobox', { name: 'Country' });
        notes.autocompleteValueBeforeFocus = await country.inputValue();
        await country.focus();
        notes.autocompleteValueAfterFocus = await country.inputValue();
        await page.keyboard.press('ArrowDown');
        await expect(page.getByRole('listbox', { name: 'Country' })).toBeVisible();
        await card('Autocomplete').screenshot({ path: out(`probes/${w.name}/autocomplete-open.png`), animations: 'disabled' });
        const listBox = (await page.getByRole('listbox', { name: 'Country' }).boundingBox())!;
        const listClip = { x: listBox.x, y: listBox.y, width: Math.min(listBox.width, w.viewport.width - listBox.x), height: listBox.height };
        const second = await page.screenshot({ clip: listClip, animations: 'disabled' });
        await page.keyboard.press('ArrowDown');
        const third = await page.screenshot({ clip: listClip, animations: 'disabled' });
        notes.listboxActiveChange = focusChange(second, third, w.dsf);
        notes.listboxNonText = (await nonText(page)).filter((row) => row.what === 'listbox active option');
        await page.keyboard.press('Escape');

        // Tooltip: shown on hover and on focus; can it be dismissed with Escape, and hovered (WCAG 1.4.13)?
        const tipTrigger = card('Tooltip').getByRole('button', { name: 'Copy snippet' });
        const bubble = card('Tooltip').locator('.ud-tooltip__bubble').first();
        await tipTrigger.scrollIntoViewIfNeeded();
        await tipTrigger.hover();
        await page.waitForTimeout(200);
        notes.tooltipOnHover = await bubble.evaluate((el) => getComputedStyle(el).opacity);
        await card('Tooltip').screenshot({ path: out(`probes/${w.name}/tooltip-hover.png`), animations: 'disabled' });
        notes.tooltipBubbles = await card('Tooltip').locator('.ud-tooltip__bubble').evaluateAll((bubbles) =>
          bubbles.map((b) => {
            const r = b.getBoundingClientRect();
            return `${b.textContent} left=${Math.round(r.left)} right=${Math.round(r.right)} viewport=${document.documentElement.clientWidth}`;
          }),
        );
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
        notes.tooltipAfterEscape = await bubble.evaluate((el) => getComputedStyle(el).opacity);
        await page.mouse.move(0, 0);
        await page.waitForTimeout(200);
        await tipTrigger.hover();
        await page.waitForTimeout(200);
        notes.tooltipHoverAgain = await bubble.evaluate((el) => getComputedStyle(el).opacity);
        const bubbleBox = (await bubble.boundingBox())!;
        await page.mouse.move(bubbleBox.x + bubbleBox.width / 2, bubbleBox.y + bubbleBox.height / 2, { steps: 6 });
        await page.waitForTimeout(250);
        notes.tooltipWhenPointerOnBubble = await bubble.evaluate((el) => getComputedStyle(el).opacity);
        await page.mouse.move(0, 0);
        await page.waitForTimeout(200);
        // The bottom tooltip ("Help") at this width.
        const help = card('Tooltip').getByRole('button', { name: 'Help' });
        await help.hover();
        await page.waitForTimeout(200);
        notes.tooltipHelpBubble = await card('Tooltip').locator('.ud-tooltip__bubble').nth(1).evaluate((b) => {
          const r = b.getBoundingClientRect();
          return `left=${Math.round(r.left)} right=${Math.round(r.right)} opacity=${getComputedStyle(b).opacity}`;
        });
        await card('Tooltip').screenshot({ path: out(`probes/${w.name}/tooltip-help-hover.png`), animations: 'disabled' });
        await page.mouse.move(0, 0);
        await tipTrigger.focus();
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
        notes.tooltipFocusedAfterEscape = await bubble.evaluate((el) => getComputedStyle(el).opacity);
        await page.locator('body').evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

        // Dialog, confirm dialog, drawer: at this width.
        for (const [name, opener, role] of [
          ['Dialog', 'Open the dialog', 'dialog'],
          ['ConfirmDialog', 'Delete the mail server', 'alertdialog'],
          ['Drawer', 'Open the drawer', 'dialog'],
        ] as const) {
          await card(name).getByRole('button', { name: opener }).click();
          await expect(page.getByRole(role)).toBeVisible();
          await shot(page, `probes/${w.name}/${name}-open.png`, false);
          await page.keyboard.press('Escape');
          await expect(page.getByRole(role)).toBeHidden();
        }

        // Toast.
        await card('ToastHost').getByRole('button', { name: 'Show a toast' }).click();
        await expect(page.locator('.ud-toast')).toBeVisible();
        await shot(page, `probes/${w.name}/toast.png`, false);
        notes.toastNonText = await page.locator('.ud-toast .ud-icon-btn').evaluate((el) => {
          const r = el.getBoundingClientRect();
          return `${Math.round(r.width)}x${Math.round(r.height)}`;
        });
        await page.locator('.ud-toast .ud-icon-btn').click();

        // The admin shell: where are the sidebar links at this width, and can they take the focus?
        const shell = card('AppShell');
        await shell.scrollIntoViewIfNeeded();
        notes.shellSidebarLinks = await shell.locator('.ud-shell__side a').evaluateAll((links) =>
          links.map((a) => {
            const r = a.getBoundingClientRect();
            const s = getComputedStyle(a.closest('.ud-shell__side')!);
            return `${a.textContent?.trim()} x=${Math.round(r.x)} w=${Math.round(r.width)} tabIndex=${(a as HTMLElement).tabIndex} sidebar visibility=${s.visibility} transform=${s.transform}`;
          }),
        );
        await shell.locator('.ud-shell__side a').first().focus();
        notes.shellFirstLinkTakesFocus = await shell.locator('.ud-shell__side a').first().evaluate((a) => document.activeElement === a);
        if (w.name === '375') {
          const menuButton = shell.getByRole('button', { name: 'Open navigation' });
          await menuButton.focus();
          await page.keyboard.press('Enter');
          await page.waitForTimeout(300);
          const inSide = () => page.evaluate(() => {
            const el = document.activeElement;
            return `${el?.closest('.ud-shell__side') ? 'inside' : 'OUTSIDE'} ${el?.tagName.toLowerCase()} "${el?.textContent?.trim().slice(0, 20) ?? ''}"`;
          });
          const walkInDrawer: string[] = [await inSide()];
          for (let i = 0; i < 5; i += 1) {
            await page.keyboard.press('Tab');
            walkInDrawer.push(await inSide());
          }
          notes.shellDrawerFocus = walkInDrawer;
          await shot(page, `probes/${w.name}/appshell-drawer-open.png`, false);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(400);
          notes.shellDrawerOpenAfterEscape = await shell.locator('.ud-shell__side').evaluate((el) => el.classList.contains('is-open'));
          notes.shellFocusAfterEscape = await page.evaluate(() => `${document.activeElement?.tagName.toLowerCase()} "${document.activeElement?.getAttribute('aria-label') ?? ''}"`);
          // The drawer is open and the window grows past 900 px (a phone turned, a window widened).
          await menuButton.focus();
          await page.keyboard.press('Enter');
          await page.waitForTimeout(300);
          await page.setViewportSize({ width: 1200, height: 812 });
          await page.waitForTimeout(400);
          const afterGrow: string[] = [];
          for (let i = 0; i < 4; i += 1) {
            await page.keyboard.press('Tab');
            afterGrow.push(await inSide());
          }
          notes.shellOpenThenWide = {
            stillOpen: await shell.locator('.ud-shell__side').evaluate((el) => el.classList.contains('is-open')),
            bodyOverflow: await page.evaluate(() => document.body.style.overflow),
            tabs: afterGrow,
          };
          await page.keyboard.press('Escape');
          await page.setViewportSize(w.viewport);
        }

        // The four layout faults of UI-M1-16.
        notes.layout = await page.evaluate(() => {
          const result: Record<string, unknown> = {};
          const rows = [...document.querySelectorAll('[data-component="FileDropzone"] .ud-filelist__item')];
          result.dropzoneRows = rows.map((row) => {
            const r = row.getBoundingClientRect();
            const b = row.querySelector('.ud-icon-btn')?.getBoundingClientRect();
            return b ? `row ${Math.round(r.left)}–${Math.round(r.right)} h=${Math.round(r.height)}; remove button at x=${Math.round(b.left)} (row right ${Math.round(r.right)}), y offset ${Math.round(b.top - r.top)}` : 'no button';
          });
          const lastTh = document.querySelector('[data-component="PermissionMatrix"] tbody tr:last-child th');
          result.matrixLastRowThBorderBottom = lastTh ? `${getComputedStyle(lastTh).borderBottomWidth} ${getComputedStyle(lastTh).borderBottomStyle}` : 'none';
          const date = document.querySelector('[data-component="DateField"] input[type="date"]');
          result.dateField = date
            ? { systemIcon: !!date.parentElement?.querySelector('.ud-field__icon'), nativeIndicator: `${getComputedStyle(date, '::-webkit-calendar-picker-indicator').display} opacity ${getComputedStyle(date, '::-webkit-calendar-picker-indicator').opacity}` }
            : null;
          const vertical = [...document.querySelectorAll('[data-component="Stepper"] .ud-stepper--vertical .ud-stepper__step')];
          result.verticalStepperConnectors = vertical.map((s) => getComputedStyle(s, '::after').display);
          const current = document.querySelector('[data-component="Stepper"] .ud-stepper:not(.ud-stepper--vertical) .ud-stepper__step.is-current');
          result.horizontalCurrentConnector = current ? getComputedStyle(current, '::after').display : null;
          const ol = document.querySelector('[data-component="Stepper"] .ud-stepper:not(.ud-stepper--vertical)')?.getBoundingClientRect();
          result.horizontalStepperBox = ol ? `${Math.round(ol.left)}–${Math.round(ol.right)} of ${document.documentElement.clientWidth}` : null;
          return result;
        });
        await card('FileDropzone').screenshot({ path: out(`probes/${w.name}/filedropzone.png`), animations: 'disabled' });
        await card('PermissionMatrix').screenshot({ path: out(`probes/${w.name}/permissionmatrix.png`), animations: 'disabled' });
        await card('DateField').screenshot({ path: out(`probes/${w.name}/datefield.png`), animations: 'disabled' });
        await card('Stepper').screenshot({ path: out(`probes/${w.name}/stepper.png`), animations: 'disabled' });
        await card('SegmentedTabs').screenshot({ path: out(`probes/${w.name}/segmentedtabs.png`), animations: 'disabled' });
        await card('ScaleField').screenshot({ path: out(`probes/${w.name}/scalefield.png`), animations: 'disabled' });
        await card('Checkbox').screenshot({ path: out(`probes/${w.name}/checkbox.png`), animations: 'disabled' });
        save(`gallery-${w.name}-probes`, notes);
      } finally {
        await context.close();
      }
    });

    test(`hosted form: empty, errors, Serbian, thank-you`, async ({ browser, browserName }) => {
      test.setTimeout(120_000);
      const { context, page } = await open(browser, browserName, w);
      const data: Record<string, unknown> = {};
      try {
        await openForm(page);
        await shot(page, `hosted/${w.name}/1-empty.png`);
        data.empty = await measure(page);
        data.nontext = await nonText(page);
        data.axeEmpty = await axe(page);
        await page.getByRole('button', { name: 'Add author' }).click();
        await page.getByRole('button', { name: 'Send abstract' }).click();
        await expect(page.locator('.ud-alert--error')).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 0));
        await shot(page, `hosted/${w.name}/2-errors.png`);
        data.errors = await measure(page);
        data.focusAfterSendWithErrors = await page.evaluate(() => {
          const el = document.activeElement;
          return `${el?.tagName.toLowerCase()} "${el?.textContent?.trim().slice(0, 30) ?? ''}"`;
        });
        data.consentInError = await page.getByLabel('I accept the terms of publication').evaluate((el) => ({ ariaInvalid: el.getAttribute('aria-invalid'), describedBy: el.getAttribute('aria-describedby'), required: (el as HTMLInputElement).required }));
        data.nontextErrors = await nonText(page);
        data.axeErrors = await axe(page);
        await page.getByRole('radio', { name: 'Srpski' }).click();
        await expect(page.getByRole('heading', { level: 1, name: 'Prijava apstrakta' })).toBeVisible();
        await shot(page, `hosted/${w.name}/3-serbian-errors.png`);
        data.serbian = await measure(page);
        await page.getByLabel('Naslov rada').fill('Održivi turizam na Balkanu: šta đaci čitaju i zašto');
        await page.getByLabel('Ime i prezime autora 1').fill('Marta Kovač');
        await page.getByLabel('Imejl autora 1').fill('marta@example.test');
        await page.getByLabel('Ime i prezime autora 2').fill('Đorđe Šćepanović');
        await page.getByText('Prihvatam uslove objavljivanja').first().click();
        await page.getByRole('button', { name: 'Pošalji apstrakt' }).click();
        await expect(page.locator('.ud-alert--success')).toBeVisible();
        await shot(page, `hosted/${w.name}/4-thank-you.png`);
        data.thanks = await measure(page);
        save(`hosted-${w.name}`, data);
      } finally {
        await context.close();
      }
    });

    test(`hosted form: focus walk`, async ({ browser, browserName }) => {
      test.setTimeout(120_000);
      const { context, page } = await open(browser, browserName, w);
      try {
        await openForm(page);
        await page.getByRole('button', { name: 'Add author' }).click();
        await page.getByRole('button', { name: 'Send abstract' }).click();
        // A click on the heading: the next Tab starts from the top of the form, not after the Send button.
        await page.getByRole('heading', { level: 1 }).click();
        save(`hosted-${w.name}-focus`, await walk(page, page, `hosted-${w.name}`, w, 60));
      } finally {
        await context.close();
      }
    });

    test(`embedded form on the hostile page`, async ({ browser, browserName }) => {
      test.setTimeout(150_000);
      const { context, page } = await open(browser, browserName, w);
      const data: Record<string, unknown> = {};
      try {
        const frame = await openHarness(page);
        await page.evaluate(() => window.scrollTo(0, 0));
        await shot(page, `embedded/${w.name}/1-site-with-frame.png`);
        await page.locator(FRAME).screenshot({ path: out(`embedded/${w.name}/2-frame.png`), animations: 'disabled' });
        data.site = await measure(page);
        data.frame = await measure(frame);
        data.nontext = await nonText(frame);
        data.frameBox = await page.locator(FRAME).evaluate((f) => {
          const r = f.getBoundingClientRect();
          const slot = f.parentElement!.getBoundingClientRect();
          return { x: Math.round(r.x), width: Math.round(r.width), slotRight: Math.round(slot.right), height: Math.round(r.height) };
        });
        await frame.getByRole('button', { name: 'Add author' }).click();
        await frame.getByRole('button', { name: 'Send abstract' }).click();
        await expect(frame.locator('.ud-alert--error')).toBeVisible();
        await page.waitForTimeout(400);
        await page.locator(FRAME).screenshot({ path: out(`embedded/${w.name}/3-frame-errors.png`), animations: 'disabled' });
        data.frameErrors = await measure(frame);
        data.axeFrame = await axe(page, FRAME);
        await frame.getByRole('radio', { name: 'Srpski' }).click();
        await page.waitForTimeout(400);
        await page.locator(FRAME).screenshot({ path: out(`embedded/${w.name}/4-frame-serbian.png`), animations: 'disabled' });
        if (browserName === 'chromium') {
          await frame.getByRole('heading', { level: 1 }).click();
          save(`embedded-${w.name}-focus`, await walk(page, frame, `embedded-${w.name}`, w, 60));
        }
        save(`embedded-${w.name}`, data);
      } finally {
        await context.close();
      }
    });

    test(`admin home (three states), sign-in, not found`, async ({ browser, browserName }) => {
      test.setTimeout(120_000);
      const { context, page } = await open(browser, browserName, w);
      const data: Record<string, unknown> = {};
      try {
        await page.goto(`${ADMIN_ORIGIN}/sign-in`);
        await settle(page);
        await shot(page, `admin/${w.name}/4-sign-in.png`);
        data.signIn = await measure(page);
        const notFound = await context.newPage();
        await notFound.goto(`${PUBLIC_ORIGIN}/no-such-page`, { waitUntil: 'domcontentloaded' });
        await settle(notFound);
        await shot(notFound, `admin/${w.name}/5-not-found.png`);
        data.notFound = await measure(notFound);
        await notFound.close();
        save(`admin-${w.name}`, data);

        await page.goto(`${ADMIN_ORIGIN}/`);
        await expect(page.getByText('Connected')).toBeVisible();
        await settle(page);
        await shot(page, `admin/${w.name}/1-home-connected.png`);
        data.connected = await measure(page);
        data.headings = await page.evaluate(() => [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((h) => `${h.tagName} ${h.textContent?.trim()}`));
        data.axe = await axe(page);
        data.walk = await walk(page, page, `admin-${w.name}`, w, 30);

        await page.route('**/api/v1/meta', (route) => route.fulfill({ status: 502, contentType: 'application/problem+json', json: { status: 502, code: 'api_unreachable' } }));
        await page.goto(`${ADMIN_ORIGIN}/`);
        await expect(page.locator('.ud-alert--warning')).toBeVisible();
        await shot(page, `admin/${w.name}/2-home-unreachable.png`);
        await page.unroute('**/api/v1/meta');
        await page.route('**/api/v1/meta', (route) => route.fulfill({ json: { name: 'confera-api', version: '9.0.0' } }));
        await page.goto(`${ADMIN_ORIGIN}/`);
        await expect(page.locator('.ud-alert--error')).toBeVisible();
        await shot(page, `admin/${w.name}/3-home-mismatch.png`);
        await page.unroute('**/api/v1/meta');
        // The loading state: the answer is held back.
        let release: () => void = () => undefined;
        const held = new Promise<void>((resolveHeld) => (release = resolveHeld));
        await page.route('**/api/v1/meta', async (route) => {
          await held;
          await route.continue().catch(() => undefined);
        });
        await page.goto(`${ADMIN_ORIGIN}/`);
        await expect(page.locator('.ud-spinner')).toBeVisible();
        await shot(page, `admin/${w.name}/0-home-loading.png`);
        save(`admin-${w.name}`, data);
        release();
      } finally {
        await context.close();
      }
    });
  });
}
