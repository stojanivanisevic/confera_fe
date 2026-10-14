// The scan for secret-like names is written in confera_be and is the same three files in
// both repositories (scripts/secret-assignments/): one rule, set by the lead. Here they are
// copies, taken by `pnpm secrets:sync` and never edited. The lock says which commit of
// confera_be they are and what the sha256 of their bytes is, the way the API contract is
// locked (packages/api-client/openapi/openapi.lock.json).
//
// These tests hold the copies to the lock, and to the checkout of confera_be next to this
// repository when there is one that has the scanner, so that the two repositories cannot
// drift apart without a test saying so.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

interface Lock {
  source: { repository: string; directory: string; commit: string; branch: string | null };
  files: Record<string, string>;
}
const lock = JSON.parse(readFileSync(join(root, 'scripts', 'secret-scan.lock.json'), 'utf8')) as Lock;
const copies = join(root, lock.source.directory);
const sha256 = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

// The checkout of confera_be: the one named by CONFERA_BE_DIR (as for `pnpm api:sync`), else the one next to this repository.
const sibling = resolve(process.env.CONFERA_BE_DIR ?? join(root, '..', 'confera_be'));
const theirs = join(sibling, lock.source.directory);
const siblingHasScanner = Object.keys(lock.files).every((file) => existsSync(join(theirs, file)));

describe('the scanner copied from confera_be', () => {
  it('is three files, and the lock names exactly those', () => {
    expect(Object.keys(lock.files).sort()).toEqual(['secret-assignments.mjs', 'secret-assignments.ordinary.mjs', 'secret-assignments.reported.mjs']);
    expect(readdirSync(copies).sort()).toEqual(Object.keys(lock.files).sort());
  });

  it('comes from a commit of confera_be that the lock names in full', () => {
    expect(lock.source.repository).toBe('confera_be');
    expect(lock.source.directory).toBe('scripts/secret-assignments');
    expect(lock.source.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it.each(Object.entries(lock.files))('%s is, byte for byte, the file the lock records', (file, recorded) => {
    expect(recorded).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256(join(copies, file)), `${file} was changed here. It is never edited in this repository: change it in confera_be and run \`corepack pnpm secrets:sync\`.`).toBe(recorded);
  });

  it.skipIf(!siblingHasScanner).each(Object.entries(lock.files))(`%s is byte-identical to the one in ${sibling}`, (file, recorded) => {
    expect(sha256(join(theirs, file)), `${file} is another file in confera_be than here. Run \`corepack pnpm secrets:sync\` (and \`corepack pnpm secrets\`), or bring that checkout to ${lock.source.commit.slice(0, 7)}.`).toBe(recorded);
    expect(readFileSync(join(theirs, file)).equals(readFileSync(join(copies, file)))).toBe(true);
  });

});
