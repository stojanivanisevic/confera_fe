// Serves the design system's own previews as plain-script pages, for
// `pnpm ds:visual`:
//   /after/components/<Component>/preview.html    the design system as it is in this working tree
//   /before/components/<Component>/preview.html   an earlier release, read from git: the commit or
//                                                 tag in DS_VISUAL_BASE (for example v0.1.0, which
//                                                 holds design system 2.2.0), or by default the first
//                                                 commit of the repository (version 1)
// A preview expects global React, ReactDOM and Udekom, which is exactly how the
// design system works outside Confera ("one plain script"). React 19 ships no
// script build, so a small one is bundled here from the installed packages.
// Both sides get the same self-hosted fonts, so that the comparison shows
// the design changes and not a difference in font loading.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ds = join(root, 'design-system');
const PORT = 4100;

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
const requested = process.env.DS_VISUAL_BASE?.trim();
if (requested && !/^[\w./-]+$/.test(requested)) throw new Error(`DS_VISUAL_BASE is not a commit or a tag: ${requested}`);
const base = git('rev-parse', '--verify', `${requested || git('rev-list', '--max-parents=0', 'HEAD').toString().trim().split('\n')[0]}^{commit}`).toString().trim();
const before = (path) => {
  try {
    return git('show', `${base}:design-system/${path}`);
  } catch {
    return null;
  }
};
const after = (path) => (existsSync(join(ds, path)) ? readFileSync(join(ds, path)) : null);

// Version 1 had no tokens.css: it is generated from that version's tokens.json with today's generator.
const { tokensCss } = await import('../../scripts/ds-lib.mjs');
const beforeTokensCss = before('tokens.css') ?? Buffer.from(tokensCss(JSON.parse(before('tokens.json').toString('utf8'))));
const beforeVersion = /@ds-version: (\d+\.\d+\.\d+)/.exec(before('components/bundle.js')?.toString('utf8') ?? '')?.[1] ?? '1';

const reactGlobals = (
  await build({
    root,
    logLevel: 'silent',
    configFile: false,
    define: { 'process.env.NODE_ENV': '"production"' },
    build: {
      write: false,
      minify: false,
      lib: { entry: join(root, 'e2e', 'servers', 'react-globals.entry.mjs'), formats: ['iife'], name: 'ReactGlobals' },
    },
  })
).flatMap((result) => result.output ?? [])[0].code;

const TYPES = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.woff2': 'font/woff2', '.html': 'text/html; charset=utf-8', '.json': 'application/json' };

function page(side, name) {
  const read = side === 'before' ? before : after;
  const preview = read(`components/${name}/preview.html`);
  if (!preview) return null;
  const head = `<link rel="stylesheet" href="/after/fonts/fonts.css"><link rel="stylesheet" href="/${side}/tokens.css"><link rel="stylesheet" href="/${side}/components/bundle.css">`;
  const scripts = `<script src="/react-globals.js"></script><script src="/${side}/components/bundle.js"></script>`;
  let html = preview.toString('utf8');
  html = html.includes('</head>') ? html.replace('</head>', `${head}</head>`) : head + html;
  html = html.includes('<div id="root"></div>') ? html.replace('<div id="root"></div>', `<div id="root"></div>${scripts}`) : html.replace('<body>', `<body>${scripts}`);
  return html;
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  const send = (status, type, body) => res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' }).end(body);
  if (url.pathname === '/healthz') return send(200, 'text/plain', 'ok');
  if (url.pathname === '/react-globals.js') return send(200, TYPES['.js'], reactGlobals);
  // What the comparison is between, for the report.
  if (url.pathname === '/sides.json') {
    const afterVersion = /@ds-version: (\d+\.\d+\.\d+)/.exec(after('components/bundle.js')?.toString('utf8') ?? '')?.[1] ?? '?';
    return send(200, TYPES['.json'], JSON.stringify({ before: { version: beforeVersion, commit: base, ref: requested || 'the first commit' }, after: { version: afterVersion, commit: 'working tree' } }));
  }
  const match = /^\/(before|after)\/(.+)$/.exec(url.pathname);
  if (!match) return send(404, 'text/plain', 'Not found');
  const [, side, rest] = match;
  // A preview keeps its own address, so the relative references inside it (logos) resolve.
  const preview = /^components\/([A-Za-z]+)\/preview\.html$/.exec(rest);
  if (preview) {
    const html = page(side, preview[1]);
    return html ? send(200, TYPES['.html'], html) : send(404, 'text/plain', `No preview of ${preview[1]} on the ${side} side`);
  }
  if (rest.includes('..')) return send(404, 'text/plain', 'Not found');
  if (side === 'before' && rest === 'tokens.css') return send(200, TYPES['.css'], beforeTokensCss);
  let body = side === 'before' ? before(rest) : after(rest);
  if (!body) return send(404, 'text/plain', 'Not found');
  // Version 1 imported its fonts from Google on line 1; the comparison uses the self-hosted files for both sides.
  if (side === 'before' && rest === 'components/bundle.css') body = Buffer.from(body.toString('utf8').replace(/^@import url\([^)]*\);\s*/, ''));
  send(200, TYPES[extname(rest)] ?? 'application/octet-stream', body);
}).listen(PORT, '127.0.0.1', () => console.log(`design-system previews on http://127.0.0.1:${PORT}: before = design system ${beforeVersion} (${requested || 'first commit'}, ${base.slice(0, 7)}), after = this working tree`));
