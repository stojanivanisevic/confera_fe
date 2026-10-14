// The visual comparison of two releases of the design system (`pnpm ds:visual`).
//
// "Before" is an earlier release read from git: the commit or tag in DS_VISUAL_BASE (v0.1.0 holds
// design system 2.2.0), or by default the first commit of the repository (version 1). "After" is
// the working tree.
//   PowerShell: $env:DS_VISUAL_BASE = 'v0.1.0'; corepack pnpm ds:visual
//   elsewhere:  DS_VISUAL_BASE=v0.1.0 corepack pnpm ds:visual
// What it asserts: every preview of the working tree renders as a plain script under React 19
// without an error (the design system "still works as a plain script elsewhere", ADR-21), and so
// does every preview of the earlier release.
// What it produces, for the UI reviewer and the Security reviewer:
//   .artifacts/ds-visual/index.html   before, after and the difference, side by side
//   .artifacts/ds-visual/report.json  the share of changed pixels per component
// Differences are expected (that is what a release is), so they are reported, not failed.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Page } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

// `test` from the fixtures: it starts Chromium on the isolated profile and already
// protects the `context` it hands out (local security software, virtual authenticator).
import { expect, test } from '../support/fixtures';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const out = join(root, '.artifacts', 'ds-visual');
const components = readdirSync(join(root, 'design-system', 'components'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

type Side = 'before' | 'after';

async function shoot(page: Page, side: Side, name: string): Promise<{ png: Buffer | null; problems: string[] }> {
  const problems: string[] = [];
  const onConsole = (m: { type(): string; text(): string; location(): { url: string } }) => {
    if (m.type() !== 'error') return;
    // Known defect of version 1 to 2.2.0: the AppShell preview showed a logo by an address
    // (/_blob/...) that exists only where the design system was authored.
    if (side === 'before' && m.location().url.includes('/_blob/')) return;
    problems.push(`console.error: ${m.text()} (${m.location().url})`);
  };
  const onError = (e: Error) => problems.push(`pageerror: ${e.message}`);
  page.on('console', onConsole);
  page.on('pageerror', onError);
  const response = await page.goto(`/${side}/components/${name}/preview.html`);
  let png: Buffer | null = null;
  if (response?.status() === 200) {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    png = await page.screenshot({ fullPage: true, animations: 'disabled' });
  }
  page.off('console', onConsole);
  page.off('pageerror', onError);
  // A component that did not exist in a release has no preview there; that is not a problem of the page.
  return { png, problems: png ? problems : [] };
}

test('every preview renders as a plain script, before and after; pictures and differences are written for review', async ({ page, request }) => {
  rmSync(out, { recursive: true, force: true });
  for (const dir of ['before', 'after', 'diff']) mkdirSync(join(out, dir), { recursive: true });
  const sides = (await (await request.get('/sides.json')).json()) as { before: { version: string; ref: string; commit: string }; after: { version: string } };
  const beforeName = `design system ${sides.before.version}`;
  const afterName = `design system ${sides.after.version}`;
  const report: Array<{ component: string; status: string; changedPixels: number; share: number; size: string }> = [];
  const failures: string[] = [];

  for (const name of components) {
    const now = await shoot(page, 'after', name);
    const then = await shoot(page, 'before', name);
    if (now.problems.length > 0) failures.push(`after ${name}: ${now.problems.join('; ')}`);
    if (then.problems.length > 0) failures.push(`before ${name}: ${then.problems.join('; ')}`);
    if (!now.png) {
      failures.push(`after ${name}: no preview`);
      continue;
    }
    writeFileSync(join(out, 'after', `${name}.png`), now.png);
    if (!then.png) {
      report.push({ component: name, status: 'new', changedPixels: 0, share: 0, size: '' });
      continue;
    }
    writeFileSync(join(out, 'before', `${name}.png`), then.png);

    const a = PNG.sync.read(then.png);
    const b = PNG.sync.read(now.png);
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

  writeFileSync(join(out, 'report.json'), `${JSON.stringify({ before: sides.before, after: sides.after, previews: report }, null, 2)}\n`);
  const tokensCss = readFileSync(join(root, 'design-system', 'tokens.css'), 'utf8');
  const rows = report
    .map(
      (r) => `<section><h2>${r.component} <small>${r.status}${r.status.startsWith('changed') ? `, ${r.share}% of the pixels` : ''}</small></h2><div class="row">
${r.status === 'new' ? `<figure><figcaption>${beforeName}</figcaption><p>not there</p></figure>` : `<figure><figcaption>${beforeName}</figcaption><img src="before/${r.component}.png" alt="${r.component}, ${beforeName}"></figure>`}
<figure><figcaption>${afterName}</figcaption><img src="after/${r.component}.png" alt="${r.component}, ${afterName}"></figure>
${r.status === 'new' ? '' : `<figure><figcaption>difference</figcaption><img src="diff/${r.component}.png" alt="${r.component}, changed pixels"></figure>`}</div></section>`,
    )
    .join('\n');
  const title = `UdEkoM Balkans design system: ${sides.before.version} and ${sides.after.version}`;
  writeFileSync(
    join(out, 'index.html'),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><style>${tokensCss}
body{margin:24px;font-family:system-ui,sans-serif;background:var(--background);color:var(--ink)}h1{font-size:24px}h2{font-size:18px;margin:32px 0 8px}small{font-weight:400;color:var(--text-secondary)}
.row{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0}figcaption{font-size:12px;color:var(--text-secondary);margin-bottom:4px}img{max-width:100%;border:1px solid var(--neutral-300)}</style></head>
<body><h1>${title}</h1><p>${report.length} previews. Before: ${beforeName} (${sides.before.ref}, commit ${sides.before.commit.slice(0, 7)}); after: the working tree. Rendered as plain scripts under React 19, with the same self-hosted fonts on both sides. Generated by <code>pnpm ds:visual</code>.</p>
${rows}</body></html>\n`,
  );

  console.log(
    `ds:visual (${sides.before.version} -> ${sides.after.version}): ${report.length} previews; ${report.filter((r) => r.status.startsWith('changed')).length} changed, ${report.filter((r) => r.status === 'identical').length} identical, ${report.filter((r) => r.status === 'new').length} new. Report: .artifacts/ds-visual/index.html`,
  );
  expect(failures).toEqual([]);
  expect(report.length).toBe(components.length);
});
