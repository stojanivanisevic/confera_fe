// M1-FE-05: the contract pipeline. A stale copy fails the check: the vendored
// documents, the lock and the generated types must agree, and against a
// checkout of confera_be the strict check fails when the contract moved on.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// @ts-expect-error -- plain Node script without type declarations
import { checkContract, checksum, syncContract } from '../scripts/api-lib.mjs';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const client = join(root, 'packages', 'api-client');
type Result = { problems: string[]; notices: string[] };

let work: string;
let backend: string;
const git = (...args: string[]) => execFileSync('git', ['-C', backend, '-c', 'user.name=Test', '-c', 'user.email=test@example.test', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' });

/** A copy of the vendored contract (documents, lock, generated types) that a test may break. */
function copyOfClient(name: string): string {
  const dir = join(work, name);
  cpSync(join(client, 'openapi'), join(dir, 'openapi'), { recursive: true });
  cpSync(join(client, 'src', 'generated'), join(dir, 'src', 'generated'), { recursive: true });
  return dir;
}
const edit = (file: string, change: (text: string) => string) => writeFileSync(file, change(readFileSync(file, 'utf8')));

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), 'confera-api-contract-'));
  // A stand-in for the checkout of confera_be: a git repository with the two documents committed.
  backend = join(work, 'confera_be');
  mkdirSync(join(backend, 'openapi'), { recursive: true });
  cpSync(join(client, 'openapi', 'openapi.json'), join(backend, 'openapi', 'openapi.json'));
  cpSync(join(client, 'openapi', 'openapi.public.json'), join(backend, 'openapi', 'openapi.public.json'));
  execFileSync('git', ['init', '--quiet', backend]);
  git('add', '.');
  git('commit', '--quiet', '-m', 'contract');
});
afterAll(() => rmSync(work, { recursive: true, force: true }));

describe('pnpm api:check', () => {
  it('passes on the contract as vendored', () => {
    expect((checkContract({ backendDir: null }) as Result).problems).toEqual([]);
  });

  it('fails when the generated types are stale', () => {
    const dir = copyOfClient('stale-types');
    edit(join(dir, 'src', 'generated', 'admin.d.ts'), (t) => t.replace('name: string;', 'name: number;'));
    expect((checkContract({ dir, backendDir: null }) as Result).problems.join('\n')).toMatch(/admin\.d\.ts is stale/);
  });

  it('fails when a generated type file is missing', () => {
    const dir = copyOfClient('missing-types');
    rmSync(join(dir, 'src', 'generated', 'public.d.ts'));
    expect((checkContract({ dir, backendDir: null }) as Result).problems.join('\n')).toMatch(/public\.d\.ts is missing/);
  });

  it('fails when a vendored document was edited by hand', () => {
    const dir = copyOfClient('edited');
    edit(join(dir, 'openapi', 'openapi.json'), (t) => t.replace('"getMeta"', '"getMetadata"'));
    const problems = (checkContract({ dir, backendDir: null }) as Result).problems.join('\n');
    expect(problems).toMatch(/openapi\.json is not the file the lock names/);
    expect(problems).toMatch(/admin\.d\.ts is stale/);
  });

  it('fails when the lock is missing, or was written from uncommitted files', () => {
    const noLock = copyOfClient('no-lock');
    rmSync(join(noLock, 'openapi', 'openapi.lock.json'));
    expect((checkContract({ dir: noLock, backendDir: null }) as Result).problems.join('\n')).toMatch(/lock\.json is missing/);

    const dirty = copyOfClient('dirty-lock');
    edit(join(dirty, 'openapi', 'openapi.lock.json'), (t) => t.replace('"committed": true', '"committed": false'));
    expect((checkContract({ dir: dirty, backendDir: null }) as Result).problems.join('\n')).toMatch(/uncommitted files/);
  });

  it('a contract that moved on in confera_be: a notice by default, a failure in the strict check', () => {
    const moved = join(work, 'moved-backend');
    cpSync(backend, moved, { recursive: true });
    edit(join(moved, 'openapi', 'openapi.json'), (t) => t.replace('"version": "0.1.0"', '"version": "0.2.0"'));

    const lenient = checkContract({ backendDir: moved }) as Result;
    expect(lenient.problems).toEqual([]);
    expect(lenient.notices.join('\n')).toMatch(/confera_be has another openapi\.json/);

    const strict = checkContract({ backendDir: moved, strict: true }) as Result;
    expect(strict.problems.join('\n')).toMatch(/confera_be has another openapi\.json/);
  });

  it('the strict check passes against the same contract, and fails without a checkout', () => {
    expect((checkContract({ backendDir: backend, strict: true }) as Result).problems).toEqual([]);
    expect((checkContract({ backendDir: join(work, 'nowhere'), strict: true }) as Result).problems.join('\n')).toMatch(/no checkout of confera_be/);
  });
});

describe('pnpm api:sync', () => {
  it('vendors both documents, writes a lock with commit and checksums, and generates the types', () => {
    const dir = join(work, 'synced');
    mkdirSync(dir, { recursive: true });
    const lock = syncContract({ from: backend, dir }) as { source: { commit: string; committed: boolean; tag: string | null }; files: Record<string, { sha256: string; version: string; commit: string }> };

    expect(lock.source.commit).toBe(git('rev-parse', 'HEAD').trim());
    expect(lock.source.committed).toBe(true);
    for (const file of ['openapi.json', 'openapi.public.json']) {
      const vendored = readFileSync(join(dir, 'openapi', file), 'utf8');
      expect(vendored).toBe(readFileSync(join(backend, 'openapi', file), 'utf8').replace(/\r\n/g, '\n'));
      expect(lock.files[file]!.sha256).toBe(checksum(vendored));
      expect(lock.files[file]!.commit).toMatch(/^[0-9a-f]{40}$/);
    }
    expect(readFileSync(join(dir, 'src', 'generated', 'admin.d.ts'), 'utf8')).toContain('"/api/v1/meta"');
    expect((checkContract({ dir, backendDir: backend, strict: true }) as Result).problems).toEqual([]);
  });

  it('gives the same checksum for a checkout with CRLF line endings', () => {
    const text = readFileSync(join(client, 'openapi', 'openapi.json'), 'utf8');
    expect(checksum(text.replace(/\n/g, '\r\n'))).toBe(checksum(text));
  });

  it('refuses a contract that is not committed', () => {
    const dirty = join(work, 'dirty-backend');
    cpSync(backend, dirty, { recursive: true });
    edit(join(dirty, 'openapi', 'openapi.json'), (t) => t.replace('"getMeta"', '"getMeta2"'));
    expect(() => syncContract({ from: dirty, dir: join(work, 'never') })).toThrow(/uncommitted changes/);
  });

  it('refuses a directory without the contract, and one that is not a checkout', () => {
    expect(() => syncContract({ from: join(work, 'nowhere'), dir: join(work, 'never') })).toThrow(/does not exist/);
    const plain = join(work, 'plain');
    cpSync(join(backend, 'openapi'), join(plain, 'openapi'), { recursive: true });
    // Inside the temp directory there is no repository above it either.
    expect(() => syncContract({ from: plain, dir: join(work, 'never') })).toThrow(/not a git checkout|uncommitted/);
  });
});
