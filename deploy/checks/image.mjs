// Checks the production image of the web application (M4-FE-05): ST-02 (frontend part) and ST-12
// on the real image, as it will run on a server.
//
//   node --experimental-strip-types deploy/checks/image.mjs [image]     default: confera-m4-infra-web:check
//
// 1. ST-02 / the route allowlist: the build inside the image is checked by scripts/verify-build.mjs
//    (its routes equal the declared, non-planned routes of routes.json: no gallery, no harness, no
//    dev page; no dev-only text; no public source map; the framework settings of ADR-20); and the
//    image holds no workspace source, no test, no package manager and no environment file.
// 2. The image runs as it will on a server: as its own non-root user, read-only root, every
//    capability dropped, no new privileges, STAGE=prod, and with no secret in its environment.
// 3. ST-12: every kind of page answers with exactly the header set that
//    apps/web/src/server/security/headers.ts defines for it (the nonce read from the answer), each
//    load with a fresh nonce; the host separation holds; the framework's files keep `nosniff`.
//
// Needs Docker. Everything it makes is named confera-m4-infra-* and removed at the end.
// Log: .artifacts/deploy-checks/image.log.
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyBuild } from '../../scripts/verify-build.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const artifacts = path.join(repoRoot, '.artifacts', 'deploy-checks');
mkdirSync(artifacts, { recursive: true });
const logFile = path.join(artifacts, 'image.log');
writeFileSync(logFile, `image check ${new Date().toISOString()}\n`);
const log = (text) => appendFileSync(logFile, `${text}\n`);

const image = process.argv[2] ?? 'confera-m4-infra-web:check';
const container = 'confera-m4-infra-web-check';
const ADMIN = 'admin.confera.test';
const PUBLIC = 'forms.confera.test';
const REPORT_TO = `https://${PUBLIC}/public/v1/csp-reports`;

const { buildSecurityHeaders } = await import('../../apps/web/src/server/security/headers.ts');

function docker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { code: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

let failed = 0;
function check(name, passed, detail = '') {
  if (!passed) failed += 1;
  const line = `${passed ? 'ok  ' : 'FAIL'}  ${name}${!passed && detail ? `\n      ${detail}` : ''}`;
  process.stdout.write(`${line}\n`);
  log(line);
}

function freePort() {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** One request with a Host header of our choice (fetch does not let a script set it). */
function get(port, host, pathname, { method = 'GET', cookie } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { host };
    if (cookie) headers.cookie = cookie;
    const req = request({ host: '127.0.0.1', port, path: pathname, method, headers }, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers }));
    });
    req.on('error', reject);
    req.setTimeout(15_000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

function nonceOf(headers) {
  const policy = String(headers['content-security-policy'] ?? '');
  return /'nonce-([^']+)'/.exec(policy)?.[1] ?? null;
}

/** The headers a response of this kind must carry, exactly as headers.ts defines them. */
function headerProblems(kind, response) {
  const nonce = nonceOf(response.headers);
  if (nonce === null) return ['no nonce in the Content-Security-Policy'];
  const expected = buildSecurityHeaders({ kind, nonce, frameSites: null, development: false, reportTo: REPORT_TO });
  const problems = [];
  for (const [name, value] of Object.entries(expected.response)) {
    const actual = response.headers[name.toLowerCase()];
    // The framework writes its own, longer no-store on a page that is not found; the rule is the
    // same as in e2e/security-headers.spec.ts: never stored, never shared.
    if (name === 'Cache-Control' && /no-store/.test(String(actual)) && !/public|s-maxage|immutable/.test(String(actual))) continue;
    if (actual !== value) problems.push(`${name}: expected "${value}", got "${String(actual)}"`);
  }
  for (const name of expected.remove) {
    if (response.headers[name.toLowerCase()] !== undefined) problems.push(`${name} must be absent`);
  }
  if (response.headers['x-powered-by'] !== undefined) problems.push('X-Powered-By is present');
  return problems;
}

try {
  // ---- 1. The image's files ------------------------------------------------------------------
  const inspect = JSON.parse(docker(['image', 'inspect', image]).stdout || '[]')[0];
  check(`the image ${image} exists`, inspect !== undefined, 'build it first: docker build -t confera-m4-infra-web:check .');
  if (inspect === undefined) throw new Error('no image');

  const extracted = path.join(artifacts, 'image-next');
  rmSync(extracted, { recursive: true, force: true });
  docker(['rm', '--force', `${container}-files`]);
  docker(['create', '--name', `${container}-files`, image]);
  const copied = docker(['cp', `${container}-files:/app/apps/web/.next`, extracted]);
  check('the build can be read out of the image', copied.code === 0, copied.stderr);
  const listing = docker(['run', '--rm', '--entrypoint', 'sh', image, '-c', 'find / -xdev \\( -path /proc -o -path /sys \\) -prune -o -print 2>/dev/null']);
  docker(['rm', '--force', `${container}-files`]);

  const problems = verifyBuild(extracted);
  check('ST-02: verify-build passes on the build inside the image (routes = allowlist, no dev text, no source map, ADR-20 settings)', problems.length === 0, problems.join('; '));
  rmSync(extracted, { recursive: true, force: true });

  const files = listing.stdout.split('\n').filter(Boolean);
  const appFiles = files.filter((file) => file.startsWith('/app/'));
  const forbidden = [
    [/\/(gallery|render-error)\b/, 'dev page'],
    [/\.dev\.(tsx?|js)$/, 'dev-only module'],
    [/dev-fixtures/, 'dev fixture'],
    [/\/e2e\/|\/harness\//, 'browser test or harness page'],
    [/\.test\.(tsx?|m?js)$|\/tests\//, 'test'],
    [/\/src\/.*\.tsx?$/, 'workspace source'],
    [/\/\.env(\.|$)/, 'environment file'],
    [/\/node_modules\/(vitest|playwright|@playwright|eslint|typescript|jsdom|vite|secretlint)\//, 'development dependency'],
  ];
  for (const [pattern, what] of forbidden) {
    const found = appFiles.filter((file) => pattern.test(file));
    check(`ST-02: the image holds no ${what}`,found.length === 0, found.slice(0, 5).join(', '));
  }
  const managers = files.filter((file) => /\/(npm|npx|corepack|pnpm|yarn)$/.test(file) && /bin\//.test(file));
  check('the image holds no package manager', managers.length === 0, managers.join(', '));

  // ---- 2. Runs as on a server ----------------------------------------------------------------
  const user = inspect.Config?.User ?? '';
  check('the image runs as a non-root user', user !== '' && user !== 'root' && user !== '0', `User is "${user}"`);
  const envNames = (inspect.Config?.Env ?? []).map((entry) => entry.split('=')[0]);
  const secretLike = envNames.filter((name) => /DATABASE|PASSWORD|SECRET|TOKEN|_KEY$|^DEV_/.test(name));
  check('the image environment holds no database address and no key', secretLike.length === 0, secretLike.join(', '));

  const port = await freePort();
  docker(['rm', '--force', container]);
  const started = docker([
    'run', '--detach', '--name', container,
    '--read-only', '--tmpfs', '/tmp:uid=1000,gid=1000,mode=0700', '--tmpfs', '/app/apps/web/.next/cache:uid=1000,gid=1000,mode=0700',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--memory', '768m', '--pids-limit', '200',
    '--publish', `127.0.0.1:${String(port)}:3000`,
    '--env', 'STAGE=prod',
    '--env', `CONFERA_ADMIN_ORIGIN=https://${ADMIN}`,
    '--env', `CONFERA_PUBLIC_ORIGIN=https://${PUBLIC}`,
    // Nothing answers there: the pages must keep their headers when the API cannot be reached.
    '--env', 'CONFERA_API_ORIGIN=http://127.0.0.1:9',
    image,
  ]);
  check('the image starts read-only, without capabilities, on STAGE=prod', started.code === 0, started.stderr);

  let up = false;
  for (let attempt = 0; attempt < 60 && !up; attempt += 1) {
    try {
      await get(port, ADMIN, '/sign-in');
      up = true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  check('the web application answers', up, docker(['logs', container]).stderr);
  const uid = docker(['exec', container, 'id', '-u']).stdout.trim();
  check('its process runs as a non-root user', uid !== '' && uid !== '0', `uid ${uid}`);
  const write = docker(['exec', container, 'sh', '-c', 'touch /app/probe']);
  check('its root file system cannot be written', write.code !== 0);
  const runtimeEnv = docker(['exec', container, 'env']).stdout.split('\n').map((line) => line.split('=')[0]);
  const runtimeSecretLike = runtimeEnv.filter((name) => /DATABASE|PASSWORD|SECRET|TOKEN|_KEY$|^DEV_/.test(name));
  check('its environment holds no database address and no key', runtimeSecretLike.length === 0, runtimeSecretLike.join(', '));

  // ---- 3. ST-12: every kind of page has its headers ----------------------------------------------
  const session = '__Host-confera_session=invented-session-of-the-image-check';
  const pages = [
    ['admin', ADMIN, '/', { cookie: session }],
    ['admin', ADMIN, '/submissions', { cookie: session }],
    ['auth', ADMIN, '/', {}],
    ['auth', ADMIN, '/sign-in', {}],
    ['auth', ADMIN, '/invitations/invented-token', {}],
    ['hosted-form', PUBLIC, '/f/invented-form', {}],
    ['frame', PUBLIC, '/embed/invented-form', {}],
    ['secure-link', PUBLIC, '/s/invented-token', {}],
    ['secure-link', PUBLIC, '/pay/invented-token', {}],
    ['error', ADMIN, '/no-such-page', {}],
    ['error', PUBLIC, '/sign-in', {}],
    ['error', ADMIN, '/f/invented-form', {}],
    ['error', ADMIN, '/dev/gallery', {}],
    ['error', ADMIN, '/_next/no-such-file', {}],
    ['auth', ADMIN, '/sign-in', { method: 'POST' }],
    ['hosted-form', PUBLIC, '/f/invented-form', { method: 'PUT' }],
  ];
  for (const [kind, host, pathname, options] of pages) {
    const response = await get(port, host, pathname, options);
    const found = headerProblems(kind, response);
    check(`ST-12: ${options.method ?? 'GET'} ${host}${pathname} (${String(response.status)}) carries the headers of "${kind}"`, found.length === 0, found.join('; '));
  }

  const signIn = await get(port, ADMIN, '/');
  check('a screen behind sign-in without a session answers 307 to sign-in', signIn.status === 307 && String(signIn.headers.location).includes('/sign-in'), `${String(signIn.status)} ${String(signIn.headers.location)}`);
  const gallery = await get(port, ADMIN, '/dev/gallery');
  check('the gallery is not found in the image', gallery.status === 404, String(gallery.status));
  const first = nonceOf((await get(port, PUBLIC, '/f/invented-form')).headers);
  const second = nonceOf((await get(port, PUBLIC, '/f/invented-form')).headers);
  check('two loads of the hosted form carry different nonces', first !== null && second !== null && first !== second);
  const apiWrongHost = await get(port, PUBLIC, '/api/v1/meta');
  check('/api/v1 under the public host name is not found', apiWrongHost.status === 404, String(apiWrongHost.status));
  const icon = await get(port, ADMIN, '/icon.png');
  check('a file of the application keeps nosniff', icon.headers['x-content-type-options'] === 'nosniff', JSON.stringify(icon.headers));

  const staticFile = files.find((file) => /^\/app\/apps\/web\/\.next\/static\/chunks\/.+\.js$/.test(file));
  if (staticFile) {
    const served = await get(port, ADMIN, staticFile.replace('/app/apps/web', '').replace('/.next/', '/_next/'));
    check('the framework\'s static files are served with nosniff', served.status === 200 && served.headers['x-content-type-options'] === 'nosniff', `${String(served.status)}`);
  } else {
    check('the image holds the framework\'s static files', false);
  }
  log(docker(['logs', container]).stdout);
} catch (error) {
  check('the check ran to its end', false, String(error));
} finally {
  docker(['rm', '--force', container]);
  docker(['rm', '--force', `${container}-files`]);
}

process.stdout.write(`\n${failed === 0 ? 'Image check passed' : `Image check FAILED (${String(failed)})`}; log ${logFile}\n`);
process.exit(failed === 0 ? 0 : 1);
