// The scan for secret-like names is written in confera_be and is the same files in both
// repositories (scripts/secret-assignments/): one rule, set by the lead. Here they are
// copies, taken by `pnpm secrets:sync` and never edited:
//
// - the manifest beside them records the scanner's version and the SHA-256 of each of the
//   three files; the scanner's own `--self-test` fails when a file or the version does not
//   match it (tests/secret-assignments.test.ts runs it);
// - the lock (scripts/secret-scan.lock.json) records the version taken and the SHA-256 of
//   the manifest.
//
// These tests hold the copies to the lock, and compare the manifest with the one of the
// checkout of confera_be next to this repository when there is one, so that the two
// repositories cannot drift apart without a test saying so.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const DIRECTORY = join('scripts', 'secret-assignments');
const MANIFEST = 'secret-assignments.manifest.json';

interface Lock {
  scanner: string;
  version: string;
  manifest: string;
  source: { repository: string; directory: string; branch: string | null; commit: string };
}
interface Manifest {
  scanner: string;
  version: string;
  hash: string;
  files: Record<string, string>;
}
const lock = JSON.parse(readFileSync(join(root, 'scripts', 'secret-scan.lock.json'), 'utf8')) as Lock;
/** The text of a manifest with LF line endings, so that a checkout with CRLF gives the same hash. */
const manifestText = (directory: string) => readFileSync(join(directory, MANIFEST), 'utf8').replace(/\r\n/g, '\n');
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const ours = join(root, DIRECTORY);
const manifest = JSON.parse(manifestText(ours)) as Manifest;

// The checkout of confera_be: the one named by CONFERA_BE_DIR (as for `pnpm api:sync`), else the one next to this repository.
const sibling = resolve(process.env.CONFERA_BE_DIR ?? join(root, '..', 'confera_be'));
const theirs = join(sibling, DIRECTORY);
// A checkout on a branch from before the scanner has nothing to compare; one with the scanner is compared.
const siblingHasScanner = existsSync(theirs);

describe('the scanner copied from confera_be', () => {
  it('is the three files and their manifest, nothing else', () => {
    expect(readdirSync(ours).sort()).toEqual([...Object.keys(manifest.files), MANIFEST].sort());
    expect(Object.keys(manifest.files).sort()).toEqual(['secret-assignments.mjs', 'secret-assignments.ordinary.mjs', 'secret-assignments.reported.mjs']);
    expect(manifest.scanner).toBe('secret-assignments');
    expect(manifest.hash).toBe('sha256, LF line endings');
  });

  it('is the manifest the lock records, and the version the lock records', () => {
    expect(sha256(manifestText(ours)), `the manifest was changed here. It is never edited in this repository: run \`corepack pnpm secrets:sync\`.`).toBe(lock.manifest);
    expect(lock.scanner).toBe(manifest.scanner);
    expect(lock.version).toBe(manifest.version);
    const version = spawnSync(process.execPath, [join(ours, 'secret-assignments.mjs'), '--version'], { encoding: 'utf8' });
    expect(version.stdout.trim()).toBe(lock.version);
  });

  it('passes its own self-test, which compares the three files with the manifest', () => {
    const run = spawnSync(process.execPath, [join(ours, 'secret-assignments.mjs'), '--self-test', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const result = JSON.parse(run.stdout) as { ok: boolean; manifest: { ok: boolean; problems: string[] } };
    expect(result.manifest.problems).toEqual([]);
    expect(result.ok).toBe(true);
    expect(run.status).toBe(0);
  });

  it.skipIf(!siblingHasScanner)(`has the manifest of the checkout of confera_be in ${sibling}`, () => {
    expect(
      existsSync(join(theirs, MANIFEST)),
      `confera_be in ${sibling} has a scanner without a manifest, from before version 1.0.0: bring that checkout up to date, or point CONFERA_BE_DIR at one that is.`,
    ).toBe(true);
    const theirManifest = JSON.parse(manifestText(theirs)) as Manifest;
    expect(
      sha256(manifestText(theirs)),
      `confera_be has version ${theirManifest.version} of the scanner and this repository ${manifest.version}, or the same version with other files. Run \`corepack pnpm secrets:sync\` (and \`corepack pnpm secrets\`), or bring that checkout to the version here.`,
    ).toBe(lock.manifest);
    expect(theirManifest).toEqual(manifest);
  });
});
