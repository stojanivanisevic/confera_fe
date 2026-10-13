// The local stand-ins the browser tests need next to the web application:
//   127.0.0.1:4000  a "conference site" that is on the site list of the spike form
//   127.0.0.1:4001  a site that is NOT on the list
//   127.0.0.1:3101  an API stub: GET /api/v1/meta, answered from the vendored OpenAPI contract
// Pages are static files from e2e/harness/. Nothing here is part of the application.
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const pages = resolve(here, '..', 'harness');

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json' };

function site(port, extraHeaders = () => ({})) {
  createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    if (url.pathname === '/healthz') return res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
    const file = normalize(join(pages, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!file.startsWith(pages) || !existsSync(file)) return res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store', ...extraHeaders(url) });
    res.end(readFileSync(file));
  }).listen(port, '127.0.0.1', () => console.log(`harness site on http://127.0.0.1:${port}`));
}

// A page of the listed site can ask for a strict content security policy of its own (?csp=strict):
// the conference site allows inline script by hash only and frames from Confera only.
site(4000, (url) =>
  url.searchParams.get('csp') === 'strict'
    ? { 'content-security-policy': "default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-src http://localhost:3000 http://localhost:3101; img-src 'self'" }
    : {},
);
site(4001);

// ---- API stub ---------------------------------------------------------------------
function metaExample() {
  const contract = join(root, 'packages', 'api-client', 'openapi', 'openapi.json');
  const fallback = { name: 'confera-api', version: '0.1.0' };
  if (!existsSync(contract)) return fallback;
  const doc = JSON.parse(readFileSync(contract, 'utf8'));
  const ok = doc.paths?.['/api/v1/meta']?.get?.responses?.['200']?.content?.['application/json'];
  return ok?.example ?? ok?.schema?.example ?? fallback;
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1:3101');
  if (url.pathname === '/api/v1/meta' && req.method === 'GET') {
    return res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(metaExample()));
  }
  // A third-party page that tries to keep a cookie: the control for "third-party cookies are blocked".
  if (url.pathname === '/cookie-probe') {
    return res
      .writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      .end(
        '<!doctype html><meta charset="utf-8"><title>cookie probe</title><script>' +
          'document.cookie = "probe=1; path=/; SameSite=None";' +
          'var kept = document.cookie.indexOf("probe=1") >= 0;' +
          'parent.postMessage({ type: "cookie-probe", kept: kept }, "*");' +
          '</script>',
      );
  }
  res.writeHead(404, { 'content-type': 'application/problem+json' }).end(JSON.stringify({ code: 'not_found' }));
}).listen(3101, () => console.log('API stub on http://127.0.0.1:3101'));
