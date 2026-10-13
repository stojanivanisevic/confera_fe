// `pnpm test:supply-chain`: do the supply-chain checks catch what they are there for?
// (ST-11, M1-QA-01, ADR-01.) Part of `pnpm check`. The same idea as in confera_be.
//
// The secret scan, the dependency audit and the install settings of pnpm-workspace.yaml
// are only worth something if they fail when they should. This script PLANTS what they
// must catch and expects each check to fail, for the right reason:
//
//   1. package.json changed without the lockfile           -> the frozen install stops
//   2. a fake secret in a file of the repository           -> `pnpm secrets` fails and names the file
//   3. a package version with a known vulnerability        -> `pnpm audit --audit-level high` fails
//   4. a dependency with a build script that is not listed -> the install stops, and the
//                                                             script does not run
//
// NOTHING IS PLANTED IN THE WORKING TREE. Everything happens in a copy of the files git
// would take, under .artifacts/ (ignored by git, the lint and the secret scan), which is
// removed at the end, also on failure. Every fake secret is made of random characters at
// run time: none exists in this file, none is valid anywhere, and none outlives the run.
//
// That the settings themselves stay as they are is tests/supply-chain-settings.test.ts.
// Needs the network (the registry, for the audit), like `pnpm check` itself.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';

import { root } from './lib.mjs';

/** An old version of a well-known package with published advisories of severity high. */
const VULNERABLE = { name: 'lodash', version: '4.17.20' };

const started = Date.now();
const results = [];

function record(title, problems, seconds) {
  results.push({ title, problems, seconds });
  process.stdout.write(
    problems.length === 0
      ? `  caught   ${title} (${seconds} s)\n`
      : `  MISSED   ${title} (${seconds} s)\n${problems.map((line) => `             ${line}\n`).join('')}`,
  );
}

function testCase(title, run) {
  const caseStarted = Date.now();
  const problems = [];
  try {
    run((problem) => problems.push(problem));
  } catch (error) {
    problems.push(`the case itself failed: ${error instanceof Error ? error.message : 'unknown'}`);
  }
  record(title, problems, ((Date.now() - caseStarted) / 1000).toFixed(1));
}

/** The pnpm that runs this script (inside `pnpm run`), else pnpm through corepack. */
function pnpmCommand() {
  const execPath = process.env.npm_execpath;
  if (execPath && /pnpm/.test(execPath) && existsSync(execPath)) return [execPath];
  const require = createRequire(import.meta.url);
  let corepack;
  try {
    corepack = require.resolve('corepack/dist/corepack.js', { paths: [dirname(process.execPath), join(dirname(process.execPath), 'node_modules')] });
  } catch {
    corepack = join(dirname(process.execPath), 'node_modules', 'corepack', 'dist', 'corepack.js');
  }
  return [corepack, 'pnpm'];
}
const PNPM = pnpmCommand();

function node(cwd, args, env = {}) {
  const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}
/** Runs pnpm in a directory and returns its exit code and everything it printed. */
const pnpmIn = (cwd, args, env) => node(cwd, [...PNPM, ...args], env);

function random(length, alphabet) {
  const bytes = randomBytes(length);
  let text = '';
  for (let index = 0; index < length; index += 1) text += alphabet[bytes[index] % alphabet.length];
  return text;
}
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** An address with a user and a password, built from its parts so that this file never holds one. */
const address = (scheme, user, password, rest) => [scheme, '://', user, ':', password, '@', rest].join('');
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

// ---------------------------------------------------------------------------
// The copy
// ---------------------------------------------------------------------------

const artifacts = join(root, '.artifacts');
mkdirSync(artifacts, { recursive: true });
// A run that was killed may have left its copy behind.
for (const name of readdirSync(artifacts)) {
  if (name.startsWith('planted-')) rmSync(join(artifacts, name), { recursive: true, force: true });
}
const workRoot = mkdtempSync(join(artifacts, 'planted-'));
const copy = join(workRoot, 'repo');

function cleanUp() {
  rmSync(workRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    cleanUp();
    process.exit(130);
  });
}

function copyRepository() {
  const listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const files = listed.split('\0').filter((file) => file !== '');
  for (const file of files) {
    const source = join(root, file);
    if (!existsSync(source)) continue; // deleted in the working tree, not yet in the index
    const target = join(copy, file);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target);
  }
  return files.length;
}

function plant(base, file, text) {
  const target = join(base, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
}

// ---------------------------------------------------------------------------
// The cases
// ---------------------------------------------------------------------------

function frozenLockfile() {
  testCase('package.json changed without the lockfile: the install stops and rewrites nothing', (miss) => {
    const manifestFile = join(copy, 'package.json');
    const lockFile = join(copy, 'pnpm-lock.yaml');
    const original = readFileSync(manifestFile, 'utf8');
    const lockBefore = sha256(lockFile);
    const manifest = JSON.parse(original);
    // A real version of the same package, other than the locked one.
    manifest.devDependencies.pngjs = '6.0.0';
    writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
    try {
      const install = pnpmIn(copy, ['install']);
      if (install.status === 0) miss('`pnpm install` succeeded although package.json and the lockfile disagree');
      if (!/ERR_PNPM_OUTDATED_LOCKFILE|frozen-lockfile/i.test(install.output)) miss('the install did not say that the lockfile is out of date');
      if (sha256(lockFile) !== lockBefore) miss('the install rewrote pnpm-lock.yaml');
    } finally {
      writeFileSync(manifestFile, original);
    }
  });
}

function plantedSecrets() {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  // Prefixes are written in two parts, so that this file never holds anything that looks like a credential itself.
  const secrets = [
    { what: 'a GitHub token in application code', file: 'apps/web/src/planted/github-token.ts', text: `export const token = '${'gh' + 'p_'}${random(36, ALNUM)}';\n` },
    { what: 'an npm token in a package .npmrc', file: 'packages/ui/.npmrc', text: `//registry.npmjs.org/:_authToken=${'np' + 'm_'}${random(36, ALNUM)}\n` },
    { what: 'AWS keys in an environment file', file: 'apps/web/planted-aws.env', text: `AWS_ACCESS_KEY_ID=${'AK' + 'IA'}${random(16, BASE32)}\nAWS_SECRET_ACCESS_KEY=${random(40, ALNUM)}\n` },
    { what: 'a private key', file: 'e2e/planted-key.pem', text: privateKey },
    { what: 'an API address with a user and a password, in a test', file: 'tests/planted/address.test.ts', text: `export const api = '${address('https', 'deploy', random(16, ALNUM), 'api.confera.example.org/api/v1')}';\n` },
    { what: 'a registry address with a password, in a workflow file', file: '.github/workflows/planted.yml', text: `url: ${address('https', 'deploy', random(16, ALNUM), 'registry.example.org/confera')}\n` },
    { what: 'a chat token in the design system', file: 'design-system/planted.md', text: `Hook: ${'xo' + 'xb'}-${'1'.repeat(12)}-${'2'.repeat(13)}-${random(24, ALNUM)}\n` },
    // The web application must never be given a secret (ADR-26); if one is committed all the same,
    // it will most likely look like these: a name and a random value, in no token format.
    { what: 'a session secret in an environment file (no known token format)', file: 'apps/web/planted-server.env', text: `STAGE=prod\nSESSION_SECRET=${random(48, ALNUM)}\n` },
    { what: 'a PayPal client secret in an environment file (no known token format)', file: 'apps/web/planted-payments.env', text: `PAYPAL_CLIENT_SECRET=${random(80, ALNUM)}\nDATA_KEY=${randomBytes(32).toString('hex')}\n` },
    // Second round: the same kind of secret, written the other ways a secret is commonly written
    // into the files of a server and into code. None has a token format; the name gives each away.
    { what: 'a session secret as a list entry of a compose file (- NAME=value)', file: 'apps/web/planted-compose.yml', text: `services:\n  web:\n    environment:\n      - STAGE=prod\n      - SESSION_SECRET=${random(48, ALNUM)}\n` },
    { what: 'a session secret in a Dockerfile (ENV NAME=value)', file: 'apps/web/planted.Dockerfile', text: `ENV STAGE=prod\nENV SESSION_SECRET=${random(48, ALNUM)}\n` },
    { what: 'a generated password with a dollar sign in an environment file', file: 'apps/web/planted-generated.env', text: `SMTP_PASSWORD=${random(8, ALNUM)}$${random(12, ALNUM)}\n` },
    { what: 'a password under a lower-case key of a configuration file (password: value)', file: 'apps/web/planted-config.yml', text: `smtp:\n  host: mail.example.test\n  password: ${random(24, ALNUM)}\n` },
    { what: 'a session secret in code, declared with a type (const name: string = value)', file: 'apps/web/src/planted/typed-secret.ts', text: `export const sessionSecret: string = '${random(48, ALNUM)}';\n` },
    { what: 'a session secret in code, as the fallback of an environment variable (?? value)', file: 'apps/web/src/planted/fallback-secret.ts', text: `export const sessionSecret = process.env.SESSION_SECRET ?? '${random(48, ALNUM)}';\n` },
    // Caught today. These three hold the edges of the rules that let something through: a placeholder STARTS
    // with `invented-` or `local-only-`; a branch of a choice is the quoted text right after the question mark,
    // not everything after one; the `credentials` of fetch is one of its three words, not any text.
    { what: 'a session secret that only contains the placeholder words, not at its start', file: 'apps/web/planted-not-a-placeholder.env', text: `SESSION_SECRET=${random(6, ALNUM)}-invented-${random(6, ALNUM)}-local-only-${random(6, ALNUM)}\n` },
    { what: 'a client secret after a question mark on the same line (not a branch of a choice)', file: 'apps/web/src/planted/after-question.ts', text: `export const paypal = isLive() ? { clientSecret: '${random(80, ALNUM)}' } : null;\n` },
    { what: 'a value under the name credentials that is not a mode of fetch', file: 'apps/web/src/planted/credentials.ts', text: `export const service = { credentials: '${random(40, ALNUM)}' };\n` },
  ];
  const control = {
    file: 'tests/planted/no-secret.test.ts',
    text: "export const settings = 'STAGE=local CONFERA_API_ORIGIN=http://127.0.0.1:3001';\n",
  };

  const scanWithPlants = () => {
    try {
      for (const { file, text } of [...secrets, control]) plant(copy, file, text);
      return node(copy, [join('scripts', 'run.mjs'), 'secrets']);
    } finally {
      for (const { file } of [...secrets, control]) rmSync(join(copy, file), { force: true });
      for (const directory of ['apps/web/src/planted', 'tests/planted', '.github']) rmSync(join(copy, directory), { recursive: true, force: true });
    }
  };
  const { status, output } = scanWithPlants();
  const named = (file) => output.replaceAll('\\', '/').includes(`/${file}`);

  testCase('planted fake secrets: `pnpm secrets` fails', (miss) => {
    if (status === 0) miss('`pnpm secrets` passed with fake secrets in the tree');
  });
  for (const { what, file } of secrets) {
    testCase(`planted fake secret: ${what}`, (miss) => {
      if (!named(file)) miss(`the secret scan did not report ${file}`);
    });
  }
  testCase('control: a file without a secret is not reported', (miss) => {
    if (named(control.file)) miss(`the secret scan reported ${control.file}, which holds no secret`);
  });
  testCase('control: without the plants the same scan passes', (miss) => {
    const clean = node(copy, [join('scripts', 'run.mjs'), 'secrets']);
    if (clean.status !== 0) miss(`the secret scan fails on the copy itself:\n${clean.output.slice(-600)}`);
  });
}

function vulnerablePackage() {
  testCase(`a planted vulnerable package (${VULNERABLE.name}@${VULNERABLE.version}): \`pnpm audit --audit-level high\` fails`, (miss) => {
    const manifestFile = join(copy, 'package.json');
    const lockFile = join(copy, 'pnpm-lock.yaml');
    const manifestBefore = readFileSync(manifestFile, 'utf8');
    const lockBefore = readFileSync(lockFile, 'utf8');
    // The same command as the last step of `pnpm check`.
    const audit = () => pnpmIn(copy, ['audit', '--audit-level', 'high']);
    const before = audit();
    if (before.status !== 0) throw new Error(`the audit fails before anything is planted:\n${before.output.slice(-600)}`);
    try {
      // The documented way to add a dependency on purpose (README, section 11); only the lockfile is written.
      const add = pnpmIn(copy, ['add', '-w', '--lockfile-only', `${VULNERABLE.name}@${VULNERABLE.version}`]);
      if (add.status !== 0) throw new Error(`could not plant the package:\n${add.output.slice(-600)}`);
      const after = audit();
      if (after.status === 0) miss('the audit passed with a vulnerable package in the lockfile');
      if (!after.output.includes(VULNERABLE.name)) miss('the audit did not name the package');
      if (!/\bhigh\b/i.test(after.output)) miss('the audit did not report a severity of high');
    } finally {
      writeFileSync(manifestFile, manifestBefore);
      writeFileSync(lockFile, lockBefore);
    }
  });
}

function unlistedBuildScript() {
  // A project of its own with the install settings of this repository and one
  // dependency: a package whose install script leaves a marker file behind.
  const project = join(workRoot, 'build-script');
  const dependency = join(workRoot, 'planted-build-script');
  const marker = join(workRoot, 'BUILD-SCRIPT-RAN');
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

  plant(dependency, 'package.json', `${JSON.stringify({ name: 'planted-build-script', version: '1.0.0', scripts: { postinstall: 'node postinstall.js' } }, null, 2)}\n`);
  plant(dependency, 'postinstall.js', "require('node:fs').writeFileSync(process.env.PLANTED_MARKER, 'ran');\n");
  plant(dependency, 'index.js', 'module.exports = 1;\n');
  const packed = pnpmIn(dependency, ['pack']);
  const tarball = join(dependency, 'planted-build-script-1.0.0.tgz');

  plant(
    project,
    'package.json',
    `${JSON.stringify(
      {
        name: 'planted-project',
        version: '0.0.0',
        private: true,
        packageManager: manifest.packageManager,
        dependencies: { 'planted-build-script': 'file:../planted-build-script/planted-build-script-1.0.0.tgz' },
      },
      null,
      2,
    )}\n`,
  );
  // The settings under test: the real file of this repository, unchanged.
  cpSync(join(root, 'pnpm-workspace.yaml'), join(project, 'pnpm-workspace.yaml'));
  const env = { PLANTED_MARKER: marker };

  testCase('a dependency with an unlisted build script: the install stops and the script does not run', (miss) => {
    if (packed.status !== 0 || !existsSync(tarball)) throw new Error(`could not pack the planted dependency:\n${packed.output.slice(-600)}`);
    // The first install of a new project writes its lockfile; the second is frozen.
    for (const [name, flag] of [
      ['the first install', '--no-frozen-lockfile'],
      ['the frozen install', '--frozen-lockfile'],
    ]) {
      const install = pnpmIn(project, ['install', flag], env);
      if (install.status === 0) miss(`${name} succeeded for a dependency with an unlisted build script`);
      if (!install.output.includes('ERR_PNPM_IGNORED_BUILDS')) miss(`${name}: pnpm did not report the ignored build script`);
      if (!install.output.includes('planted-build-script')) miss(`${name}: pnpm did not name the dependency`);
      if (existsSync(marker)) miss(`${name}: THE BUILD SCRIPT RAN, its marker file exists`);
    }
  });
  testCase('control: the same install runs the script once the guard is switched off, so the marker can be seen', (miss) => {
    rmSync(join(project, 'node_modules'), { recursive: true, force: true });
    const open = pnpmIn(project, ['install', '--frozen-lockfile', '--config.dangerouslyAllowAllBuilds=true'], env);
    if (open.status !== 0) miss(`the install without the guard failed:\n${open.output.slice(-400)}`);
    if (!existsSync(marker)) miss('the marker file does not exist: this test could not have seen a script run');
  });
}

// ---------------------------------------------------------------------------

let exitCode;
try {
  process.stdout.write('\nSupply chain: planted cases (ST-11)\n');
  // The copy is not installed: it lies inside this repository, so the tools it starts are the ones
  // installed here, and the audit and the frozen-lockfile check need the lockfile only.
  const files = copyRepository();
  process.stdout.write(`  copied ${files} files into .artifacts/\n`);

  frozenLockfile();
  plantedSecrets();
  vulnerablePackage();
  unlistedBuildScript();

  const missed = results.filter(({ problems }) => problems.length > 0);
  const total = ((Date.now() - started) / 1000).toFixed(1);
  process.stdout.write(
    missed.length === 0
      ? `\n✓ all ${results.length} planted cases were caught (${total} s)\n`
      : `\n✗ ${missed.length} of ${results.length} planted cases were NOT caught (${total} s)\n`,
  );
  exitCode = missed.length === 0 ? 0 : 1;
} catch (error) {
  process.stderr.write(`\n✗ planted cases could not run: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  exitCode = 1;
} finally {
  cleanUp();
}

// Nothing may be left behind, and the working tree must be as it was.
if (existsSync(workRoot)) {
  process.stderr.write(`the copy under ${relative(root, workRoot)} could not be removed\n`);
  exitCode = 1;
}
process.exit(exitCode);
