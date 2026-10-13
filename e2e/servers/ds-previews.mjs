// Serves the design system's own previews as plain-script pages, for
// `pnpm ds:visual`:
//   /v2/components/<Component>/preview.html   the design system as it is in this working tree
//   /v1/components/<Component>/preview.html   version 1, read from the first commit of the repository
// A preview expects global React, ReactDOM and Udekom, which is exactly how the
// design system works outside Confera ("one plain script"). React 19 ships no
// script build, so a small one is bundled here from the installed packages.
// Both versions get the same self-hosted fonts, so that the comparison shows
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
const firstCommit = git('rev-list', '--max-parents=0', 'HEAD').toString().trim().split('\n')[0];
const v1 = (path) => {
  try {
    return git('show', `${firstCommit}:design-system/${path}`);
  } catch {
    return null;
  }
};
const v2 = (path) => (existsSync(join(ds, path)) ? readFileSync(join(ds, path)) : null);

// tokens.css did not exist in version 1: generate it from version 1's tokens.json with today's generator.
const { tokensCss } = await import('../../scripts/ds-lib.mjs');
const v1TokensCss = tokensCss(JSON.parse(v1('tokens.json').toString('utf8')));

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

const TYPES = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.woff2': 'font/woff2', '.html': 'text/html; charset=utf-8' };

function page(version, name) {
  const read = version === 'v1' ? v1 : v2;
  const preview = read(`components/${name}/preview.html`);
  if (!preview) return null;
  const head = `<link rel="stylesheet" href="/v2/fonts/fonts.css"><link rel="stylesheet" href="/${version}/tokens.css"><link rel="stylesheet" href="/${version}/components/bundle.css">`;
  const scripts = `<script src="/react-globals.js"></script><script src="/${version}/components/bundle.js"></script>`;
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
  const match = /^\/(v1|v2)\/(.+)$/.exec(url.pathname);
  if (!match) return send(404, 'text/plain', 'Not found');
  const [, version, rest] = match;
  // A preview keeps its own address, so the relative references inside it (logos) resolve.
  const preview = /^components\/([A-Za-z]+)\/preview\.html$/.exec(rest);
  if (preview) {
    const html = page(version, preview[1]);
    return html ? send(200, TYPES['.html'], html) : send(404, 'text/plain', `No preview of ${preview[1]} in ${version}`);
  }
  if (rest.includes('..')) return send(404, 'text/plain', 'Not found');
  if (version === 'v1' && rest === 'tokens.css') return send(200, TYPES['.css'], v1TokensCss);
  let body = version === 'v1' ? v1(rest) : v2(rest);
  if (!body) return send(404, 'text/plain', 'Not found');
  // Version 1 imported its fonts from Google on line 1; the comparison uses the self-hosted files for both.
  if (version === 'v1' && rest === 'components/bundle.css') body = Buffer.from(body.toString('utf8').replace(/^@import url\([^)]*\);\s*/, ''));
  send(200, TYPES[extname(rest)] ?? 'application/octet-stream', body);
}).listen(PORT, '127.0.0.1', () => console.log(`design-system previews on http://127.0.0.1:${PORT} (version 1 from commit ${firstCommit.slice(0, 7)})`));
