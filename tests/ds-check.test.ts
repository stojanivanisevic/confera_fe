// M1-FE-02: `pnpm ds:check` fails on an external address or a raw-markup write
// in the bundle (SEC-A-48), and on the other ways the design system and its
// adapter can drift apart. Each case plants one violation in a copy of
// design-system/ and expects the check to name it.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// @ts-expect-error -- plain Node script without type declarations
import { checkDesignSystem, scanScript } from '../scripts/ds-check.mjs';
// @ts-expect-error -- plain Node script without type declarations
import { checksumsText } from '../scripts/ds-lib.mjs';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const original = join(root, 'design-system');

let work: string;
beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), 'confera-ds-check-'));
});
afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

/** A copy of the design system with one change, re-released so that only the planted violation is reported. */
function planted(name: string, change: (dir: string) => void, release = true): string[] {
  const dir = join(work, name);
  cpSync(original, dir, { recursive: true });
  change(dir);
  if (release) writeFileSync(join(dir, 'CHECKSUMS.sha256'), checksumsText(dir) as string);
  return (checkDesignSystem({ dir }) as { problems: string[] }).problems;
}
const edit = (file: string, from: string | RegExp, to: string) => (dir: string) => {
  const path = join(dir, file);
  const text = readFileSync(path, 'utf8');
  const next = text.replace(from, to);
  if (next === text) throw new Error(`nothing to replace in ${file}`);
  writeFileSync(path, next);
};
const BUNDLE = 'components/bundle.js';
const STYLES = 'components/bundle.css';
const ANCHOR = '  function cx() {';

describe('pnpm ds:check', () => {
  it('passes on the design system as released', () => {
    expect((checkDesignSystem() as { problems: string[] }).problems).toEqual([]);
  });

  it('passes on an untouched copy', () => {
    expect(planted('untouched', () => undefined)).toEqual([]);
  });

  it('fails on an external address in the bundle', () => {
    const problems = planted('external', edit(BUNDLE, ANCHOR, `  var beacon = "https://collector.example.test/v1";\n${ANCHOR}`));
    expect(problems.join('\n')).toMatch(/bundle\.js: external address or network call: an address with a scheme/);
  });

  it('fails on a protocol-relative address in the bundle', () => {
    const problems = planted('relative', edit(BUNDLE, ANCHOR, `  var script = "//cdn.example.test/x.js";\n${ANCHOR}`));
    expect(problems.join('\n')).toMatch(/protocol-relative address/);
  });

  it('fails on a network call in the bundle', () => {
    const problems = planted('fetch', edit(BUNDLE, ANCHOR, `  function ping(u) { return fetch(u); }\n${ANCHOR}`));
    expect(problems.join('\n')).toMatch(/fetch\(\)/);
  });

  it('fails on a raw-markup write in the bundle', () => {
    const problems = planted('markup', edit(BUNDLE, ANCHOR, `  function paint(el, html) { el.innerHTML = html; }\n${ANCHOR}`));
    expect(problems.join('\n')).toMatch(/bundle\.js: raw-markup write or code from text: innerHTML/);
  });

  it('fails on raw markup through the React escape hatch', () => {
    const problems = planted('danger', edit(BUNDLE, ANCHOR, `  var raw = { dangerouslySetInnerHTML: { __html: "" } };\n${ANCHOR}`));
    expect(problems.join('\n')).toMatch(/dangerouslySetInnerHTML/);
  });

  it('fails on code built from text in the bundle', () => {
    const problems = planted('eval', edit(BUNDLE, ANCHOR, `  function run(t) { return eval(t); }\n${ANCHOR}`));
    expect(problems.join('\n')).toMatch(/eval\(\)/);
  });

  it('fails when the bundle reaches for the real window', () => {
    const problems = planted('window', edit(BUNDLE, ANCHOR, `  var where = window.location;\n${ANCHOR}`));
    expect(problems.join('\n')).toMatch(/uses window for more than React and Udekom: location/);
  });

  it('fails on a font import from another origin in the stylesheet', () => {
    const problems = planted('import', edit(STYLES, '/* UdEkoM', '@import url("https://fonts.googleapis.com/css2?family=Inter");\n/* UdEkoM'));
    expect(problems.join('\n')).toMatch(/bundle\.css:1 no-import/);
    expect(problems.join('\n')).toMatch(/external-url/);
  });

  it('fails on a colour literal in the stylesheet', () => {
    const problems = planted('literal', edit(STYLES, 'color: var(--on-brand); }', 'color: #ffffff; }'));
    expect(problems.join('\n')).toMatch(/colour-literal: #ffffff/);
  });

  it('fails on a custom property without a token', () => {
    const problems = planted('token', edit(STYLES, 'color: var(--on-brand); }', 'color: var(--on-brand-typo); }'));
    expect(problems.join('\n')).toMatch(/unknown-token: --on-brand-typo/);
  });

  it('fails when the manifest names a component the bundle does not export', () => {
    const problems = planted('manifest', edit(BUNDLE, '{"name":"FilterBar"}', '{"name":"FilterBar"},{"name":"Carousel"}'));
    expect(problems.join('\n')).toMatch(/in the manifest, not exported by the bundle: Carousel/);
    expect(problems.join('\n')).toMatch(/no CarouselProps in index\.d\.ts/);
  });

  it('fails when a component is exported and not in the manifest', () => {
    const problems = planted('unlisted', edit(BUNDLE, ',{"name":"FilterBar"}', ''));
    expect(problems.join('\n')).toMatch(/exported by the bundle, not in the manifest: FilterBar/);
  });

  it('fails when tokens.css is edited by hand', () => {
    const problems = planted('tokens', edit('tokens.css', '--brand-orange: #ef7b06;', '--brand-orange: #aa5704;'));
    expect(problems.join('\n')).toMatch(/tokens\.css is not what tokens\.json generates/);
  });

  it('fails on any change that is not followed by a release', () => {
    const problems = planted('unreleased', edit('README.md', '# UdEkoM Balkans', '# UdEkoM Balkans (edited)'), false);
    expect(problems).toEqual(['file changed without a release: README.md']);
  });

  it('fails on an added and on a removed file without a release', () => {
    const added = planted('added', (dir) => writeFileSync(join(dir, 'extra.js'), '// x\n'), false);
    expect(added).toContain('file added without a release: extra.js');
    const removed = planted('removed', (dir) => rmSync(join(dir, 'components', 'Tag', 'README.md')), false);
    expect(removed).toContain('file removed without a release: components/Tag/README.md');
  });
});

describe('the script scan', () => {
  it('finds nothing in the released bundle', () => {
    expect(scanScript(readFileSync(join(original, BUNDLE), 'utf8'))).toEqual([]);
  });

  it.each([
    ['new WebSocket("x")', /WebSocket/],
    ['navigator.sendBeacon(u)', /sendBeacon/],
    ['new XMLHttpRequest()', /XMLHttpRequest/],
    ['el.insertAdjacentHTML("beforeend", h)', /insertAdjacentHTML/],
    ['document.write(h)', /document\.write/],
    ['new Function("return 1")', /new Function/],
    ['setTimeout("alert(1)", 0)', /timer with code as text/],
    ['frame.srcdoc = h', /srcdoc/],
    ['localStorage.setItem("a", "b")', /browser storage/],
  ])('%s is reported', (code, expected) => {
    expect((scanScript(code) as string[]).join('\n')).toMatch(expected);
  });
});
