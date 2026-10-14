// `pnpm secrets:sync`: takes the scan for secret-like names from confera_be.
//   pnpm secrets:sync                      from ../confera_be
//   pnpm secrets:sync --from <directory>   from another checkout (or set CONFERA_BE_DIR)
//
// The scanner and its two corpora (scripts/secret-assignments/) are written in confera_be
// and are the same three files in both repositories: one rule, set by the lead. They are
// copied here unchanged, byte for byte, and never edited here. The lock beside this script
// says which commit of confera_be they are and what their checksums are;
// tests/secret-assignments-lock.test.ts holds the copies to it, and to the checkout of
// confera_be next to this repository when there is one.
//
// The files must be committed there: the lock names the commit.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { fail, root } from './lib.mjs';

const DIRECTORY = 'scripts/secret-assignments';
const FILES = ['secret-assignments.mjs', 'secret-assignments.ordinary.mjs', 'secret-assignments.reported.mjs'];
const LOCK = join(root, 'scripts', 'secret-scan.lock.json');

const args = process.argv.slice(2);
const fromIndex = args.indexOf('--from');
const from = resolve(fromIndex >= 0 ? (args[fromIndex + 1] ?? '') : (process.env.CONFERA_BE_DIR ?? join(root, '..', 'confera_be')));

const git = (...gitArgs) => {
  const result = spawnSync('git', ['-C', from, ...gitArgs], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
};

for (const file of FILES) {
  if (!existsSync(join(from, DIRECTORY, file))) fail(`${join(from, DIRECTORY, file)} does not exist. Is confera_be checked out there, on a branch that has the scanner?`);
}
const commit = git('rev-parse', 'HEAD');
if (!commit) fail(`${from} is not a git checkout: the lock needs the commit the scanner comes from`);
const uncommitted = git('status', '--porcelain', '--', DIRECTORY) ?? '';
if (uncommitted !== '') fail(`The scanner in ${join(from, DIRECTORY)} has uncommitted changes:\n${uncommitted}\nCommit them in confera_be first: the lock names a commit.`);

mkdirSync(join(root, DIRECTORY), { recursive: true });
const files = {};
for (const file of FILES) {
  const bytes = readFileSync(join(from, DIRECTORY, file));
  writeFileSync(join(root, DIRECTORY, file), bytes);
  files[file] = createHash('sha256').update(bytes).digest('hex');
}
const lock = {
  $comment:
    'Written by `pnpm secrets:sync`. Do not edit. The files of scripts/secret-assignments/ are copied unchanged from confera_be; this says from which commit, and the sha256 of their bytes.',
  source: {
    repository: 'confera_be',
    directory: DIRECTORY,
    commit,
    branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
  },
  files,
};
writeFileSync(LOCK, `${JSON.stringify(lock, null, 2)}\n`);

console.log(`Scan for secret-like names taken from ${from}`);
console.log(`  commit ${commit}, branch ${lock.source.branch}`);
for (const file of FILES) console.log(`  ${file}  sha256 ${files[file].slice(0, 16)}…`);
console.log('Commit scripts/secret-assignments/ and scripts/secret-scan.lock.json together, then run `corepack pnpm secrets`.');
