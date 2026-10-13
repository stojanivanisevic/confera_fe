// The visual comparison of design system v1 and v2 (`pnpm ds:visual`).
//
// What it asserts: every preview of version 2 renders as a plain script under
// React 19 without an error (the design system "still works as a plain script
// elsewhere", ADR-21), and so does every preview version 1 had.
// What it produces, for the UI reviewer and the Security reviewer:
//   .artifacts/ds-visual/index.html   v1, v2 and the difference, side by side
//   .artifacts/ds-visual/report.json  the share of changed pixels per component
// Differences are expected (that is what version 2 is), so they are reported, not failed.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

import { neutraliseLocalSoftware } from '../support/fixtures';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const out = join(root, '.artifacts', 'ds-visual');
const components = readdirSync(join(root, 'design-system', 'components'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

async function shoot(page: Page, version: 'v1' | 'v2', name: string): Promise<{ png: Buffer | null; problems: string[] }> {
  const problems: string[] = [];
  const onConsole = (m: { type(): string; text(): string; location(): { url: string } }) => {
    if (m.type() !== 'error') return;
    // Known defect of version 1, left as it is: the AppShell preview shows a logo by an address
    // (/_blob/...) that exists only where the design system was authored.
    if (m.location().url.includes('/_blob/')) return;
    problems.push(`console.error: ${m.text()} (${m.location().url})`);
  };
  const onError = (e: Error) => problems.push(`pageerror: ${e.message}`);
  page.on('console', onConsole);
  page.on('pageerror', onError);
  const response = await page.goto(`/${version}/components/${name}/preview.html`);
  let png: Buffer | null = null;
  if (response?.status() === 200) {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    png = await page.screenshot({ fullPage: true, animations: 'disabled' });
  }
  page.off('console', onConsole);
  page.off('pageerror', onError);
  // A component that did not exist in a version has no preview there; that is not a problem of the page.
  return { png, problems: png ? problems : [] };
}

test('every preview renders as a plain script in v2 and in v1; pictures and differences are written for review', async ({ page, context }) => {
  await neutraliseLocalSoftware(context);
  for (const dir of ['v1', 'v2', 'diff']) mkdirSync(join(out, dir), { recursive: true });
  const report: Array<{ component: string; status: string; changedPixels: number; share: number; size: string }> = [];
  const failures: string[] = [];

  for (const name of components) {
    const after = await shoot(page, 'v2', name);
    const before = await shoot(page, 'v1', name);
    if (after.problems.length > 0) failures.push(`v2 ${name}: ${after.problems.join('; ')}`);
    if (before.problems.length > 0) failures.push(`v1 ${name}: ${before.problems.join('; ')}`);
    if (!after.png) {
      failures.push(`v2 ${name}: no preview`);
      continue;
    }
    writeFileSync(join(out, 'v2', `${name}.png`), after.png);
    if (!before.png) {
      report.push({ component: name, status: 'new in v2', changedPixels: 0, share: 0, size: '' });
      continue;
    }
    writeFileSync(join(out, 'v1', `${name}.png`), before.png);

    const a = PNG.sync.read(before.png);
    const b = PNG.sync.read(after.png);
    const width = Math.max(a.width, b.width);
    const height = Math.max(a.height, b.height);
    const pad = (image: PNG) => {
      const canvas = new PNG({ width, height });
      canvas.data.fill(255);
      PNG.bitblt(image, canvas, 0, 0, image.width, image.height, 0, 0);
      return canvas;
    };
    const diff = new PNG({ width, height });
    const changed = pixelmatch(pad(a).data, pad(b).data, diff.data, width, height, { threshold: 0.1 });
    writeFileSync(join(out, 'diff', `${name}.png`), PNG.sync.write(diff));
    report.push({
      component: name,
      status: a.width === b.width && a.height === b.height ? (changed === 0 ? 'identical' : 'changed') : 'changed, other size',
      changedPixels: changed,
      share: Number(((changed / (width * height)) * 100).toFixed(2)),
      size: `${a.width}x${a.height} -> ${b.width}x${b.height}`,
    });
  }

  writeFileSync(join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  const tokensCss = readFileSync(join(root, 'design-system', 'tokens.css'), 'utf8');
  const rows = report
    .map(
      (r) => `<section><h2>${r.component} <small>${r.status}${r.status.startsWith('changed') ? `, ${r.share}% of the pixels` : ''}</small></h2><div class="row">
${r.status === 'new in v2' ? '<figure><figcaption>version 1</figcaption><p>not in version 1</p></figure>' : `<figure><figcaption>version 1</figcaption><img src="v1/${r.component}.png" alt="${r.component}, version 1"></figure>`}
<figure><figcaption>version 2</figcaption><img src="v2/${r.component}.png" alt="${r.component}, version 2"></figure>
${r.status === 'new in v2' ? '' : `<figure><figcaption>difference</figcaption><img src="diff/${r.component}.png" alt="${r.component}, changed pixels"></figure>`}</div></section>`,
    )
    .join('\n');
  writeFileSync(
    join(out, 'index.html'),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>UdEkoM Balkans design system: version 1 and version 2</title><style>${tokensCss}
body{margin:24px;font-family:system-ui,sans-serif;background:var(--background);color:var(--ink)}h1{font-size:24px}h2{font-size:18px;margin:32px 0 8px}small{font-weight:400;color:var(--text-secondary)}
.row{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0}figcaption{font-size:12px;color:var(--text-secondary);margin-bottom:4px}img{max-width:100%;border:1px solid var(--neutral-300)}</style></head>
<body><h1>UdEkoM Balkans design system: version 1 and version 2</h1><p>${report.length} previews. Rendered as plain scripts under React 19, with the same self-hosted fonts for both versions. Generated by <code>pnpm ds:visual</code>.</p>
${rows}</body></html>\n`,
  );

  console.log(`ds:visual: ${report.length} previews; ${report.filter((r) => r.status.startsWith('changed')).length} changed, ${report.filter((r) => r.status === 'identical').length} identical, ${report.filter((r) => r.status === 'new in v2').length} new. Report: .artifacts/ds-visual/index.html`);
  expect(failures).toEqual([]);
  expect(report.length).toBe(components.length);
});
