// `pnpm secrets:sync`: takes the scan for secret-like names from confera_be.
//   pnpm secrets:sync                      from ../confera_be
//   pnpm secrets:sync --from <directory>   from another checkout (or set CONFERA_BE_DIR)
//
// The scanner, its two corpora and their manifest (scripts/secret-assignments/) are written
// in confera_be and are the same four files in both repositories: one rule, set by the lead.
// They are copied here unchanged and never edited here. The manifest records the version of
// the scanner and the SHA-256 of each of the three files; the scanner's own `--self-test`
// fails when a file or the version does not match it. The lock beside this script records
// which version was taken and the SHA-256 of the manifest (LF line endings);
// tests/secret-assignments-lock.test.ts holds the copies to it, and compares the manifest
// with the one of the checkout of confera_be next to this repository when there is one.
//
// The files must be committed there.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { fail, root } from './lib.mjs';

const DIRECTORY = 'scripts/secret-assignments';
const MANIFEST = 'secret-assignments.manifest.json';
const FILES = ['secret-assignments.mjs', 'secret-assignments.reported.mjs', 'secret-assignments.ordinary.mjs', MANIFEST];
const LOCK = join(root, 'scripts', 'secret-scan.lock.json');

const args = process.argv.slice(2);
const fromIndex = args.indexOf('--from');
const from = resolve(fromIndex >= 0 ? (args[fromIndex + 1] ?? '') : (process.env.CONFERA_BE_DIR ?? join(root, '..', 'confera_be')));

const git = (...gitArgs) => {
  const result = spawnSync('git', ['-C', from, ...gitArgs], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
};

for (const file of FILES) {
  if (!existsSync(join(from, DIRECTORY, file))) fail(`${join(from, DIRECTORY, file)} does not exist. Is confera_be checked out there, on a branch that has the scanner and its manifest?`);
}
const commit = git('rev-parse', 'HEAD');
if (!commit) fail(`${from} is not a git checkout`);
const uncommitted = git('status', '--porcelain', '--', DIRECTORY) ?? '';
if (uncommitted !== '') fail(`The scanner in ${join(from, DIRECTORY)} has uncommitted changes:\n${uncommitted}\nCommit them in confera_be first.`);

mkdirSync(join(root, DIRECTORY), { recursive: true });
for (const file of FILES) writeFileSync(join(root, DIRECTORY, file), readFileSync(join(from, DIRECTORY, file)));

// The copies are the files their manifest records, of its version.
const selfTest = spawnSync(process.execPath, [join(root, DIRECTORY, 'secret-assignments.mjs'), '--self-test'], { encoding: 'utf8' });
if (selfTest.status !== 0) fail(`The scanner taken from ${from} does not pass its own self-test:\n${selfTest.stdout}${selfTest.stderr}`);

const manifestText = readFileSync(join(root, DIRECTORY, MANIFEST), 'utf8').replace(/\r\n/g, '\n');
const manifest = JSON.parse(manifestText);
const lock = {
  $comment:
    'Written by `pnpm secrets:sync`. Do not edit. scripts/secret-assignments/ is the scanner of confera_be with its corpora and their manifest, copied unchanged; this records the version taken and the SHA-256 of the manifest (LF line endings), which records the SHA-256 of each file.',
  scanner: manifest.scanner,
  version: manifest.version,
  manifest: createHash('sha256').update(manifestText, 'utf8').digest('hex'),
  source: { repository: 'confera_be', directory: DIRECTORY, branch: git('rev-parse', '--abbrev-ref', 'HEAD'), commit },
};
writeFileSync(LOCK, `${JSON.stringify(lock, null, 2)}\n`);

console.log(`Scan for secret-like names, version ${lock.version}, taken from ${from} (branch ${lock.source.branch})`);
console.log(`  ${selfTest.stdout.trim().split('\n').join('\n  ')}`);
console.log(`  manifest sha256 ${lock.manifest.slice(0, 16)}…`);
console.log('Commit scripts/secret-assignments/ and scripts/secret-scan.lock.json together, then run `corepack pnpm secrets`.');
