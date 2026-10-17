// The local stand-ins the browser tests need next to the web application:
//   localhost:4000  a "conference site" that is on the site list of the spike form
//   localhost:4001  a site that is NOT on the list
//   127.0.0.1:3101  an API stub that behaves like confera_be for GET /api/v1/meta
// Pages are static files from e2e/harness/. Nothing here is part of the application.
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { answer } from './api-stub.mjs';
import { answerPublic } from './api-stub-public.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pages = resolve(here, '..', 'harness');

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json' };

/** Listens on both loopback addresses, because "localhost" is ::1 on some machines and 127.0.0.1 on others. */
function listen(handler, port, name) {
  createServer(handler).listen(port, '127.0.0.1', () => console.log(`${name} on port ${port}`));
  createServer(handler)
    .on('error', () => undefined) // a machine without IPv6: 127.0.0.1 is enough
    .listen(port, '::1');
}

function site(port, extraHeaders = () => ({})) {
  listen(
    (req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${port}`);
      if (url.pathname === '/healthz') return res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      const file = normalize(join(pages, url.pathname === '/' ? 'index.html' : url.pathname));
      if (!file.startsWith(pages) || !existsSync(file)) return res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store', ...extraHeaders(url) });
      // ?paste=<base64url> puts that text where an admin would paste the snippet. The page must come from
      // this server (not from an intercepted response) so that the browser sees a normal local site.
      const paste = url.searchParams.get('paste');
      const body = readFileSync(file);
      res.end(paste === null ? body : body.toString('utf8').replace('<!--CONFERA_SNIPPET-->', Buffer.from(paste, 'base64url').toString('utf8')));
    },
    port,
    'harness site',
  );
}

// A page can ask for a content security policy of the conference site itself (?csp=...):
//   allow-inline  a strict site that still lets pasted inline script run and allows Confera's frame
//   no-inline     a site that lets no pasted script run at all: the snippet falls back to its fixed height
const CONFERA_PUBLIC = 'http://127.0.0.1:3000';
const HOST_POLICIES = {
  'allow-inline': `default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-src ${CONFERA_PUBLIC}`,
  'no-inline': `default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; frame-src ${CONFERA_PUBLIC}`,
};
const hostPolicy = (url) => {
  const policy = HOST_POLICIES[url.searchParams.get('csp') ?? ''];
  return policy ? { 'content-security-policy': policy } : {};
};
site(4000, hostPolicy);
site(4001, hostPolicy);

// ---- API stub ---------------------------------------------------------------------
// It follows the rules of confera_be that matter to the web application:
//  - the surface is read from the Host header, without the port: /api/v1 answers under
//    "localhost" only and /public/v1 under "127.0.0.1" only; X-Forwarded-Host is ignored;
//  - the admin API of 0.2.0 part A as the vendored contract describes it (./api-stub.mjs):
//    sign-in with the session cookie and the CSRF value, the password asked again, users,
//    the organisation, the audit log, the links; `POST /__stub/reset` restores the fixture;
//  - POST /public/v1/csp-reports takes the reports of the content security policy (204);
//  - the public form API of 0.3.0 (./api-stub-public.mjs): the published forms of
//    public-forms.json, the form token, uploads and submissions.
const problem = (res, status, code) => res.writeHead(status, { 'content-type': 'application/problem+json', 'cache-control': 'no-store' }).end(JSON.stringify({ type: 'about:blank', status, code }));

listen(
  (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1:3101');
    const host = (req.headers.host ?? '').replace(/:\d+$/, '').toLowerCase();
    // A third-party page that tries to keep a cookie: the control for "third-party cookies are blocked".
    if (url.pathname === '/cookie-probe') {
      return res
        .writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
        .end(
          '<!doctype html><meta charset="utf-8"><title>cookie probe</title><script>' +
            'document.cookie = "probe=1; path=/";' +
            'var kept = document.cookie.indexOf("probe=1") >= 0;' +
            'parent.postMessage({ type: "cookie-probe", kept: kept }, "*");' +
            '</script>',
        );
    }
    if (url.pathname.startsWith('/api/v1/') && host !== 'localhost') return problem(res, 404, 'not_found');
    if (url.pathname.startsWith('/public/v1/') && host !== '127.0.0.1') return problem(res, 404, 'not_found');
    if (url.pathname === '/public/v1/csp-reports' && req.method === 'POST') return req.on('data', () => undefined).on('end', () => res.writeHead(204, { 'cache-control': 'no-store' }).end());
    if (url.pathname.startsWith('/public/v1/forms/') || url.pathname.startsWith('/__stub/public/')) return void answerPublic(req, res, url);
    if (url.pathname.startsWith('/api/v1/') || url.pathname === '/__stub/reset') return void answer(req, res, url);
    problem(res, 404, 'not_found');
  },
  3101,
  'API stub',
);
