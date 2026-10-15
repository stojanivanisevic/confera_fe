// The API contract pipeline (ADR-19, M1-FE-05).
//
// confera_be generates and commits two OpenAPI documents. This repository
// vendors a copy of both, with a lock that says exactly which backend commit
// they come from and what their checksums are, and generates TypeScript types
// from the copies. Nothing is fetched from a network: the source is the
// sibling checkout of confera_be.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { resolveBin, root } from './lib.mjs';

export const clientDir = join(root, 'packages', 'api-client');
/** The checkout of confera_be: the one named by CONFERA_BE_DIR, else the one next to this repository. */
export const defaultBackendDir = resolve(process.env.CONFERA_BE_DIR ?? join(root, '..', 'confera_be'));

/** The documents of the contract and the type file generated from each. */
export const DOCUMENTS = [
  { file: 'openapi.json', types: 'admin.d.ts', surface: 'admin' },
  { file: 'openapi.public.json', types: 'public.d.ts', surface: 'public' },
];
/**
 * The other contracts confera_be exports beside the OpenAPI documents, from its `contracts/`
 * folder: data both repositories must agree on. They are vendored next to the documents and
 * held by the same lock. 0.2.0: the password rule set with its shared vectors (ST-62).
 */
export const CONTRACTS = [
  { file: 'password-rules.json', source: 'contracts' },
  { file: 'template-vectors.json', source: 'contracts' },
];
export const LOCK = 'openapi.lock.json';

const lf = (text) => text.replace(/\r\n/g, '\n');
/** Checksums are taken of the text with LF line endings, so a checkout with CRLF gives the same one. */
export const checksum = (text) => createHash('sha256').update(lf(text)).digest('hex');
const readLf = (file) => lf(readFileSync(file, 'utf8'));

const generatorVersions = () => {
  const version = (pkg) => JSON.parse(readFileSync(join(clientDir, 'node_modules', pkg, 'package.json'), 'utf8')).version;
  const typescript = JSON.parse(readFileSync(join(root, 'node_modules', 'typescript', 'package.json'), 'utf8')).version;
  return { 'openapi-typescript': version('openapi-typescript'), typescript };
};

/** Generates the TypeScript types of one document. Returns the text of the type file. */
export function generateTypes(documentPath) {
  const work = mkdtempSync(join(tmpdir(), 'confera-api-types-'));
  try {
    const out = join(work, 'types.d.ts');
    const cli = resolveBin('openapi-typescript', 'openapi-typescript', clientDir);
    const result = spawnSync(process.execPath, [cli, documentPath, '--output', out], { cwd: clientDir, encoding: 'utf8' });
    if (result.status !== 0 || !existsSync(out)) throw new Error(`openapi-typescript failed for ${documentPath}:\n${result.stdout}\n${result.stderr}`);
    return readLf(out);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const git = (dir, ...args) => {
  const result = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
};

/**
 * Copies the contract from a checkout of confera_be, writes the lock and generates the types.
 * @param {{ from?: string, dir?: string, allowUncommitted?: boolean }} [options]
 */
export function syncContract(options = {}) {
  const from = options.from ?? defaultBackendDir;
  const dir = options.dir ?? clientDir;
  const source = join(from, 'openapi');
  for (const { file } of DOCUMENTS) {
    if (!existsSync(join(source, file))) throw new Error(`${join(source, file)} does not exist. Is confera_be checked out next to this repository, on a branch that has the contract?`);
  }
  for (const { file, source: folder } of CONTRACTS) {
    if (!existsSync(join(from, folder, file))) throw new Error(`${join(from, folder, file)} does not exist. Is confera_be on a branch that exports it (0.2.0 and later)?`);
  }
  const commit = git(from, 'rev-parse', 'HEAD');
  if (!commit) throw new Error(`${from} is not a git checkout: the lock needs the commit the contract comes from`);
  const uncommitted = git(from, 'status', '--porcelain', '--', 'openapi', ...CONTRACTS.map(({ source: folder }) => folder)) ?? '';
  if (uncommitted !== '' && !options.allowUncommitted) {
    throw new Error(`The contract in ${source} has uncommitted changes:\n${uncommitted}\nCommit them in confera_be first: the lock names a commit.`);
  }

  mkdirSync(join(dir, 'openapi'), { recursive: true });
  mkdirSync(join(dir, 'src', 'generated'), { recursive: true });
  const files = {};
  for (const { file, types } of DOCUMENTS) {
    const text = readLf(join(source, file));
    const document = JSON.parse(text);
    writeFileSync(join(dir, 'openapi', file), text);
    writeFileSync(join(dir, 'src', 'generated', types), generateTypes(join(dir, 'openapi', file)));
    files[file] = {
      title: document.info.title,
      version: document.info.version,
      sha256: checksum(text),
      // The last commit of confera_be that changed this file.
      commit: git(from, 'log', '-1', '--format=%H', '--', `openapi/${file}`),
    };
  }
  for (const { file, source: folder } of CONTRACTS) {
    const text = readLf(join(from, folder, file));
    writeFileSync(join(dir, 'openapi', file), text);
    files[file] = {
      title: `${folder}/${file}`,
      version: String(JSON.parse(text).version),
      sha256: checksum(text),
      commit: git(from, 'log', '-1', '--format=%H', '--', `${folder}/${file}`),
    };
  }
  const lock = {
    $comment: 'Written by `pnpm api:sync`. Do not edit: it says which contract of confera_be the vendored copies and the generated types are.',
    source: {
      repository: 'confera_be',
      directory: 'openapi',
      commit,
      tag: git(from, 'describe', '--tags', '--exact-match') ?? null,
      branch: git(from, 'rev-parse', '--abbrev-ref', 'HEAD'),
      committed: uncommitted === '',
    },
    files,
    generator: generatorVersions(),
  };
  writeFileSync(join(dir, 'openapi', LOCK), `${JSON.stringify(lock, null, 2)}\n`);
  return lock;
}

/**
 * Checks the vendored contract. Returns { problems, notices }.
 *  - the vendored copies are the ones the lock names (checksum, version);
 *  - the generated types are what the copies generate (a stale type file fails);
 *  - against a checkout of confera_be: with `strict` a different contract there is a
 *    problem (a stale copy fails); without it, it is a notice.
 * @param {{ dir?: string, backendDir?: string | null, strict?: boolean }} [options]
 */
export function checkContract(options = {}) {
  const dir = options.dir ?? clientDir;
  const backendDir = options.backendDir === undefined ? defaultBackendDir : options.backendDir;
  const problems = [];
  const notices = [];
  const lockPath = join(dir, 'openapi', LOCK);
  if (!existsSync(lockPath)) return { problems: ['packages/api-client/openapi/openapi.lock.json is missing: run `pnpm api:sync`'], notices };
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  if (!lock.source?.commit) problems.push('the lock does not name the commit of confera_be');
  if (lock.source?.committed !== true) problems.push('the lock was written from uncommitted files of confera_be: sync again from a commit');

  for (const { file, types } of DOCUMENTS) {
    const entry = lock.files?.[file];
    const vendored = join(dir, 'openapi', file);
    if (!entry) problems.push(`the lock has no entry for ${file}`);
    if (!existsSync(vendored)) {
      problems.push(`the vendored copy openapi/${file} is missing`);
      continue;
    }
    const text = readLf(vendored);
    if (entry && checksum(text) !== entry.sha256) problems.push(`openapi/${file} is not the file the lock names (checksum differs): it was edited, or the lock is stale. Run \`pnpm api:sync\``);
    if (entry && JSON.parse(text).info.version !== entry.version) problems.push(`openapi/${file} has another version than the lock says`);

    const generated = join(dir, 'src', 'generated', types);
    if (!existsSync(generated)) problems.push(`src/generated/${types} is missing: run \`pnpm api:sync\``);
    else if (readLf(generated) !== generateTypes(vendored)) problems.push(`src/generated/${types} is stale: it is not what openapi/${file} generates. Run \`pnpm api:sync\``);

    if (backendDir && existsSync(join(backendDir, 'openapi', file)) && entry) {
      if (checksum(readLf(join(backendDir, 'openapi', file))) !== entry.sha256) {
        const message = `the checkout of confera_be has another ${file} than the vendored copy (lock: commit ${String(entry.commit).slice(0, 7)}). Run \`pnpm api:sync\``;
        (options.strict ? problems : notices).push(message);
      }
    } else if (options.strict) {
      problems.push(`no checkout of confera_be with openapi/${file} was found at ${backendDir}: the strict check needs it`);
    }
  }
  for (const { file, source: folder } of CONTRACTS) {
    const entry = lock.files?.[file];
    const vendored = join(dir, 'openapi', file);
    if (!entry) problems.push(`the lock has no entry for ${file}: run \`pnpm api:sync\` from a checkout of confera_be that exports ${folder}/${file}`);
    if (!existsSync(vendored)) {
      problems.push(`the vendored copy openapi/${file} is missing`);
      continue;
    }
    const text = readLf(vendored);
    if (entry && checksum(text) !== entry.sha256) problems.push(`openapi/${file} is not the file the lock names (checksum differs): it was edited, or the lock is stale. Run \`pnpm api:sync\``);
    if (backendDir && existsSync(join(backendDir, folder, file)) && entry && checksum(readLf(join(backendDir, folder, file))) !== entry.sha256) {
      (options.strict ? problems : notices).push(`the checkout of confera_be has another ${folder}/${file} than the vendored copy. Run \`pnpm api:sync\``);
    }
  }
  // Which checkout of confera_be was compared with, if one was (`api:check` says so).
  const compared =
    backendDir && DOCUMENTS.every(({ file }) => existsSync(join(backendDir, 'openapi', file)))
      ? { dir: backendDir, commit: git(backendDir, 'rev-parse', 'HEAD'), branch: git(backendDir, 'rev-parse', '--abbrev-ref', 'HEAD') }
      : null;
  return { problems, notices, lock, compared };
}
